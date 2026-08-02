"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";

/**
 * Video propio de la sala: WebRTC punto a punto con Convex de señalización.
 *
 * Cómo fluye:
 *  1. La mesa enciende cámara/pantalla → `registrarEmisor` la anuncia.
 *  2. Cada espectador ve la lista reactiva de `emisores` y, por cada uno,
 *     crea una RTCPeerConnection de solo-recepción y le manda una OFERTA.
 *  3. El emisor responde con sus pistas (RESPUESTA) y ambos intercambian
 *     candidatos ICE. Desde ahí el video viaja directo entre navegadores.
 *
 *  El espectador SIEMPRE inicia. Eso elimina el "glare" (dos ofertas
 *  cruzadas) y deja al emisor como parte pasiva y estable.
 *
 * Límite honesto: es P2P. El emisor sube una copia del stream POR CADA
 * espectador; pasado `TOPE_ESPECTADORES` responde "lleno". Para cientos de
 * personas hace falta un servidor de medios (README de asamblea) — esta
 * señalización no cambia, cambia quién reparte.
 *
 * Sin TURN: pares tras NAT simétrico (~10 % de redes) no logran conectar;
 * se muestra el fallo en vez de un spinner eterno.
 */

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const TOPE_ESPECTADORES = 16;

export type Medio = "camara" | "pantalla";

export type EmisorRemoto = {
  clienteId: string;
  nombre: string;
  medio: Medio;
  /** El emisor deshabilitó su video: pintar avatar, no un cuadro negro. */
  camApagada: boolean;
  micApagado: boolean;
  stream: MediaStream | null;
  estado: "conectando" | "activo" | "lleno" | "fallo";
};

type Conexion = {
  pc: RTCPeerConnection;
  stream: MediaStream;
  estado: EmisorRemoto["estado"];
};

/** uuid estable por pestaña: es la identidad de señalización. */
function useClienteId() {
  return useMemo(() => crypto.randomUUID(), []);
}

export function useVideoSala(
  asambleaId: Id<"asambleas">,
  activo: boolean,
  opts: { codigoPoder?: string } = {},
) {
  const clienteId = useClienteId();
  const codigoPoder = opts.codigoPoder;

  const emisoresRemotos = useQuery(
    api.salaVideo.emisores,
    activo ? { asambleaId, codigoPoder } : "skip",
  );
  const buzon = useQuery(
    api.salaVideo.senalesParaMi,
    activo ? { asambleaId, clienteId, codigoPoder } : "skip",
  );

  const registrarEmisor = useMutation(api.salaVideo.registrarEmisor);
  const detenerEmisor = useMutation(api.salaVideo.detenerEmisor);
  const latidoEmisor = useMutation(api.salaVideo.latidoEmisor);
  const enviarSenal = useMutation(api.salaVideo.enviarSenal);
  const consumirSenales = useMutation(api.salaVideo.consumirSenales);
  const actualizarEstadoMedios = useMutation(api.salaVideo.actualizarEstadoMedios);

  /* ── Lado emisor (solo mesa) ─────────────────────────────────────────── */
  const streamsLocales = useRef<Map<Medio, MediaStream>>(new Map());
  const pcsComoEmisor = useRef<Map<string, RTCPeerConnection>>(new Map());
  const [locales, setLocales] = useState<{ medio: Medio; stream: MediaStream }[]>([]);
  const [espectadores, setEspectadores] = useState(0);

  /* ── Lado espectador ─────────────────────────────────────────────────── */
  const pcsComoEspectador = useRef<Map<string, Conexion>>(new Map());
  const [remotos, setRemotos] = useState<EmisorRemoto[]>([]);

  const refrescarEspectadores = useCallback(() => {
    setEspectadores(pcsComoEmisor.current.size);
  }, []);

  const senal = useCallback(
    (paraClienteId: string, tipo: "oferta" | "respuesta" | "ice" | "lleno", datos: unknown) =>
      enviarSenal({
        asambleaId,
        deClienteId: clienteId,
        paraClienteId,
        tipo,
        datos: JSON.stringify(datos ?? {}),
        codigoPoder,
      }).catch(() => {}),
    [enviarSenal, asambleaId, clienteId, codigoPoder],
  );

  /* ── Encender / apagar medios (mesa) ─────────────────────────────────── */
  const encender = useCallback(
    async (medio: Medio) => {
      const stream =
        medio === "camara"
          ? await navigator.mediaDevices.getUserMedia({
              video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 },
              },
              audio: { echoCancellation: true, noiseSuppression: true },
            })
          : await navigator.mediaDevices.getDisplayMedia({
              video: { frameRate: { ideal: 30 }, width: { ideal: 1920 } },
              audio: true, // audio de pestaña, si el navegador lo ofrece
            });

      /* Pista al codificador: la pantalla prioriza nitidez del texto, la
       * cámara prioriza fluidez. Sin esto el navegador adivina, y adivina
       * mal justo en pantallas compartidas con letra pequeña. */
      for (const t of stream.getVideoTracks()) {
        t.contentHint = medio === "pantalla" ? "detail" : "motion";
      }

      streamsLocales.current.set(medio, stream);
      setLocales(
        [...streamsLocales.current.entries()].map(([m, s]) => ({ medio: m, stream: s })),
      );
      await registrarEmisor({ asambleaId, clienteId, medio });

      // "Detener compartir" del propio navegador debe apagar el emisor.
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        void apagarRef.current(medio);
      });
    },
    [registrarEmisor, asambleaId, clienteId],
  );

  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);

  /**
   * Micrófono y cámara al estilo Meet: el PRIMER encendido pide ambos
   * permisos y publica el stream; después cada botón solo alterna
   * `track.enabled` — instantáneo, sin renegociar con ningún par. El costo
   * asumido: mientras "cámara apagada" el track vive deshabilitado (frames
   * negros) y la luz de la cámara puede seguir encendida; apagarla del todo
   * exigiría renegociar con cada espectador.
   */
  const asegurarCamara = useCallback(
    async (conMic: boolean, conCam: boolean) => {
      let stream = streamsLocales.current.get("camara");
      if (!stream) {
        await encender("camara");
        stream = streamsLocales.current.get("camara");
      }
      if (!stream) return;
      for (const t of stream.getAudioTracks()) t.enabled = conMic;
      for (const t of stream.getVideoTracks()) t.enabled = conCam;
      setMicOn(conMic);
      setCamOn(conCam);
      /* El espectador no puede saber que un track está deshabilitado (solo
       * ve frames negros): se le avisa por datos para que pinte el avatar. */
      void actualizarEstadoMedios({
        asambleaId,
        clienteId,
        micOn: conMic,
        camOn: conCam,
      }).catch(() => {});
    },
    [encender, actualizarEstadoMedios, asambleaId, clienteId],
  );

  const toggleMic = useCallback(
    () => asegurarCamara(!micOn, camOn),
    [asegurarCamara, micOn, camOn],
  );
  const toggleCam = useCallback(
    () => asegurarCamara(micOn, !camOn),
    [asegurarCamara, micOn, camOn],
  );

  /** Cuelga del todo: tracks detenidos, emisor retirado, luz apagada. */
  const colgar = useCallback(async () => {
    setMicOn(false);
    setCamOn(false);
    await apagarRef.current("camara");
    await apagarRef.current("pantalla");
  }, []);

  const apagar = useCallback(
    async (medio: Medio) => {
      const stream = streamsLocales.current.get(medio);
      if (stream) {
        for (const t of stream.getTracks()) t.stop();
        streamsLocales.current.delete(medio);
        setLocales(
          [...streamsLocales.current.entries()].map(([m, s]) => ({ medio: m, stream: s })),
        );
      }
      /* Las conexiones por medio llevan la clave `${cliente}|${medio}`:
       * cerrar un medio no tumba el otro. */
      for (const [clave, pc] of pcsComoEmisor.current) {
        if (clave.endsWith(`|${medio}`)) {
          pc.close();
          pcsComoEmisor.current.delete(clave);
        }
      }
      refrescarEspectadores();
      await detenerEmisor({ asambleaId, clienteId, medio }).catch(() => {});
    },
    [detenerEmisor, asambleaId, clienteId, refrescarEspectadores],
  );
  const apagarRef = useRef(apagar);
  apagarRef.current = apagar;

  /* Latido del emisor mientras tenga algo encendido. */
  useEffect(() => {
    if (!activo || locales.length === 0) return;
    const id = setInterval(() => {
      void latidoEmisor({ asambleaId, clienteId }).catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, [activo, locales.length, latidoEmisor, asambleaId, clienteId]);

  /* ── Espectador: una conexión por emisor remoto ──────────────────────── */
  useEffect(() => {
    if (!activo || !emisoresRemotos) return;

    const vivos = new Set<string>();
    for (const e of emisoresRemotos) {
      if (e.clienteId === clienteId) continue; // mi propia emisión
      const clave = `${e.clienteId}|${e.medio}`;
      vivos.add(clave);
      if (pcsComoEspectador.current.has(clave)) continue;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const stream = new MediaStream();
      const conx: Conexion = { pc, stream, estado: "conectando" };
      pcsComoEspectador.current.set(clave, conx);

      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver("audio", { direction: "recvonly" });

      pc.ontrack = (ev) => {
        stream.addTrack(ev.track);
        conx.estado = "activo";
        publicarRemotos(emisoresRemotos);
      };
      pc.onicecandidate = (ev) => {
        if (ev.candidate) void senal(e.clienteId, "ice", { medio: e.medio, candidato: ev.candidate });
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          conx.estado = "fallo";
          publicarRemotos(emisoresRemotos);
        }
      };

      void (async () => {
        const oferta = await pc.createOffer();
        await pc.setLocalDescription(oferta);
        void senal(e.clienteId, "oferta", { medio: e.medio, sdp: oferta });
      })();
    }

    // Emisores que se fueron: cerrar y soltar.
    for (const [clave, conx] of pcsComoEspectador.current) {
      if (!vivos.has(clave)) {
        conx.pc.close();
        pcsComoEspectador.current.delete(clave);
      }
    }
    publicarRemotos(emisoresRemotos);

    function publicarRemotos(
      lista: {
        clienteId: string;
        nombre: string;
        medio: Medio;
        camApagada: boolean;
        micApagado: boolean;
      }[],
    ) {
      setRemotos(
        lista
          .filter((e) => e.clienteId !== clienteId)
          .map((e) => {
            const conx = pcsComoEspectador.current.get(`${e.clienteId}|${e.medio}`);
            return {
              clienteId: e.clienteId,
              nombre: e.nombre,
              medio: e.medio,
              camApagada: e.camApagada,
              micApagado: e.micApagado,
              stream: conx?.estado === "activo" ? conx.stream : null,
              estado: conx?.estado ?? "conectando",
            };
          }),
      );
    }
  }, [activo, emisoresRemotos, clienteId, senal]);

  /* ── Buzón de señales: el cartero reparte ────────────────────────────── */
  const procesando = useRef(false);
  useEffect(() => {
    if (!activo || !buzon || buzon.length === 0 || procesando.current) return;
    procesando.current = true;

    void (async () => {
      const consumidas: Id<"salaSenales">[] = [];
      for (const s of buzon) {
        consumidas.push(s._id);
        let datos: { medio?: Medio; sdp?: RTCSessionDescriptionInit; candidato?: RTCIceCandidateInit };
        try {
          datos = JSON.parse(s.datos);
        } catch {
          continue;
        }
        const medio = datos.medio ?? "camara";

        try {
          if (s.tipo === "oferta") {
            /* Soy emisor y un espectador quiere mi stream de `medio`. */
            const stream = streamsLocales.current.get(medio);
            if (!stream || !datos.sdp) continue;
            if (pcsComoEmisor.current.size >= TOPE_ESPECTADORES) {
              void senal(s.deClienteId, "lleno", { medio });
              continue;
            }
            const clave = `${s.deClienteId}|${medio}`;
            pcsComoEmisor.current.get(clave)?.close();

            const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
            pcsComoEmisor.current.set(clave, pc);
            for (const track of stream.getTracks()) pc.addTrack(track, stream);
            /* Techo de bitrate por espectador: sin él, una pantalla 4K
             * intenta megas que la subida no da y TODO se vuelve lento.
             * 2.5 Mbps de pantalla se lee nítido; 1.2 Mbps de cámara sobra. */
            for (const sender of pc.getSenders()) {
              if (sender.track?.kind !== "video") continue;
              const params = sender.getParameters();
              params.degradationPreference =
                medio === "pantalla" ? "maintain-resolution" : "maintain-framerate";
              params.encodings = [
                { maxBitrate: medio === "pantalla" ? 2_500_000 : 1_200_000 },
              ];
              void sender.setParameters(params).catch(() => {});
            }
            pc.onicecandidate = (ev) => {
              if (ev.candidate) void senal(s.deClienteId, "ice", { medio, candidato: ev.candidate });
            };
            pc.onconnectionstatechange = () => {
              if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
                pc.close();
                pcsComoEmisor.current.delete(clave);
                refrescarEspectadores();
              }
            };
            await pc.setRemoteDescription(datos.sdp);
            const respuesta = await pc.createAnswer();
            await pc.setLocalDescription(respuesta);
            void senal(s.deClienteId, "respuesta", { medio, sdp: respuesta });
            refrescarEspectadores();
          } else if (s.tipo === "respuesta") {
            const conx = pcsComoEspectador.current.get(`${s.deClienteId}|${medio}`);
            if (conx && datos.sdp && !conx.pc.currentRemoteDescription) {
              await conx.pc.setRemoteDescription(datos.sdp);
            }
          } else if (s.tipo === "ice") {
            const pc =
              pcsComoEspectador.current.get(`${s.deClienteId}|${medio}`)?.pc ??
              pcsComoEmisor.current.get(`${s.deClienteId}|${medio}`);
            if (pc && datos.candidato) {
              await pc.addIceCandidate(datos.candidato).catch(() => {});
            }
          } else if (s.tipo === "lleno") {
            const conx = pcsComoEspectador.current.get(`${s.deClienteId}|${medio}`);
            if (conx) {
              conx.estado = "lleno";
              conx.pc.close();
              setRemotos((prev) =>
                prev.map((r) =>
                  r.clienteId === s.deClienteId && r.medio === medio
                    ? { ...r, estado: "lleno", stream: null }
                    : r,
                ),
              );
            }
          }
        } catch {
          /* Una señal rota no debe atascar el buzón: se consume igual. */
        }
      }
      procesando.current = false;
      if (consumidas.length > 0) {
        void consumirSenales({ asambleaId, clienteId, ids: consumidas, codigoPoder }).catch(() => {});
      }
    })();
  }, [activo, buzon, senal, consumirSenales, refrescarEspectadores, asambleaId, clienteId, codigoPoder]);

  /* ── Desmontaje: apagar todo ─────────────────────────────────────────── */
  useEffect(() => {
    if (!activo) return;
    const local = streamsLocales.current;
    const comoEmisor = pcsComoEmisor.current;
    const comoEspectador = pcsComoEspectador.current;
    return () => {
      for (const s of local.values()) for (const t of s.getTracks()) t.stop();
      local.clear();
      for (const pc of comoEmisor.values()) pc.close();
      comoEmisor.clear();
      for (const c of comoEspectador.values()) c.pc.close();
      comoEspectador.clear();
      void detenerEmisor({ asambleaId, clienteId }).catch(() => {});
    };
  }, [activo, detenerEmisor, asambleaId, clienteId]);

  return {
    /** Streams que YO emito (para el auto-preview de la mesa). */
    locales,
    /** Emisiones remotas con su estado de conexión. */
    remotos,
    espectadores,
    tope: TOPE_ESPECTADORES,
    encender,
    apagar,
    micOn,
    camOn,
    toggleMic,
    toggleCam,
    colgar,
    transmitiendo: locales.length > 0,
  };
}
