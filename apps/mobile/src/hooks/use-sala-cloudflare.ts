import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { useAction, useQuery } from "convex/react";
import {
  RTCPeerConnection,
  mediaDevices,
  MediaStream,
  type MediaStreamTrack,
} from "react-native-webrtc";
import InCallManager from "react-native-incall-manager";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";

/**
 * La sala sobre el SFU de Cloudflare, versión teléfono.
 *
 * Es el mismo protocolo que `apps/web/hooks/use-sala-cloudflare.ts` — misma
 * negociación, mismo catálogo en Convex, mismas actions — pero React Native
 * no es un navegador, y las diferencias no son de matiz:
 *
 *  · No hay elementos `<audio>`: el audio remoto suena solo en cuanto llega
 *    la pista. No existe el bloqueo de reproducción del navegador, así que
 *    todo lo de `audioBloqueado`/`desbloquearAudio` desaparece.
 *  · Nadie fija la salida de audio: sin ayuda, la asamblea sonaría por el
 *    AURICULAR, como una llamada. InCallManager la manda al altavoz.
 *  · `track.stop()` apaga el dispositivo pero no libera el stream nativo:
 *    hay que llamar `stream.release()` o se fugan cámaras y micrófonos.
 *  · Compartir pantalla queda fuera de la v1: en iOS exige una extensión
 *    aparte (sin ella emite NEGRO y encima ignora el límite de fotogramas:
 *    factura sin imagen) y en Android un servicio en primer plano. Ver la
 *    pantalla que otro comparte funciona perfectamente — es una pista de
 *    video como cualquier otra.
 *
 * Lo que NO cambia se dejó idéntico al hook web a propósito, comentarios
 * incluidos: cuando haya que arreglar un bug de negociación, se arregla dos
 * veces pero se razona una.
 */

/**
 * Los eventos de ICE llegan sueltos; se espera a que termine de reunirlos.
 *
 * Con la propiedad `onicegatheringstatechange` y no `addEventListener`: los
 * tipos de react-native-webrtc solo declaran las propiedades, y aquí nadie
 * más escucha este evento, así que pisarla no le quita el sitio a nadie.
 */
async function esperarIce(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    /* Con un tope: si un candidato se atasca es mejor mandar la oferta
     * incompleta que dejar a la persona mirando una pantalla en blanco. */
    const tope = setTimeout(() => {
      (pc as any).onicegatheringstatechange = null;
      resolve();
    }, 3000);
    (pc as any).onicegatheringstatechange = () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(tope);
        (pc as any).onicegatheringstatechange = null;
        resolve();
      }
    };
  });
}

export type EstadoSala =
  | "inactiva"
  | "conectando"
  | "conectada"
  | "reconectando"
  | "error";

export type PistaRemota = {
  trackName: string;
  nombre: string;
  tipo: "audio" | "video" | "pantalla";
  stream: MediaStream;
};

/** Prueba de por dónde viajan los medios. Igual que en la web: el dato sale
 *  del propio WebRTC, no de la aplicación, así que no se puede fingir. */
export type Diagnostico = {
  sessionId: string | null;
  estadoConexion: string;
  ipRemota: string | null;
  esDeCloudflare: boolean | null;
  bytesRecibidos: number;
  bytesEnviados: number;
  pistasPublicadas: number;
  pistasSuscritas: number;
};

/** Rangos IPv4 públicos de Cloudflare (cloudflare.com/ips). */
const RANGOS_CLOUDFLARE = [
  "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "104.16.0.0/13",
  "104.24.0.0/14", "108.162.192.0/18", "131.0.72.0/22", "141.101.64.0/18",
  "162.158.0.0/15", "172.64.0.0/13", "173.245.48.0/20", "188.114.96.0/20",
  "190.93.240.0/20", "197.234.240.0/22", "198.41.128.0/17",
];

function ipEsDeCloudflare(ip: string): boolean {
  const aNumero = (dir: string): number | null => {
    const partes = dir.split(".");
    if (partes.length !== 4) return null;
    let n = 0;
    for (const parte of partes) {
      const octeto = Number(parte);
      if (!Number.isInteger(octeto) || octeto < 0 || octeto > 255) return null;
      n = n * 256 + octeto;
    }
    return n;
  };
  const valor = aNumero(ip);
  if (valor === null) return false;
  return RANGOS_CLOUDFLARE.some((rango) => {
    const [base, bits] = rango.split("/");
    const inicio = aNumero(base!);
    if (inicio === null) return false;
    const mascara = (~0 << (32 - Number(bits))) >>> 0;
    return (valor & mascara) >>> 0 === (inicio & mascara) >>> 0;
  });
}

export function useSalaCloudflare(
  asambleaId: Id<"asambleas">,
  activo: boolean,
) {
  const disponible = useQuery(api.salaCloudflare.disponible, {});
  const catalogo = useQuery(
    api.salaCloudflare.pistas,
    activo ? { asambleaId } : "skip",
  );

  const abrirSesion = useAction(api.salaCloudflare.abrirSesion);
  const publicarAccion = useAction(api.salaCloudflare.publicar);
  const suscribirAccion = useAction(api.salaCloudflare.suscribir);
  const responderAccion = useAction(api.salaCloudflare.responder);
  const dejarDePublicarAccion = useAction(api.salaCloudflare.dejarDePublicar);

  const [estado, setEstado] = useState<EstadoSala>("inactiva");
  const [error, setError] = useState<string | null>(null);
  const [remotas, setRemotas] = useState<PistaRemota[]>([]);
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const sesionRef = useRef<string | null>(null);
  const micRef = useRef<MediaStreamTrack | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const camRef = useRef<MediaStreamTrack | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const camSenderRef = useRef<ReturnType<
    RTCPeerConnection["addTransceiver"]
  > | null>(null);
  const misPistasRef = useRef<string[]>([]);
  const suscritasRef = useRef<Set<string>>(new Set());
  /** `mid` → nombre de pista: la única forma de saber de quién es un medio. */
  const midRef = useRef<Map<string, string>>(new Map());

  /**
   * Cerrojo de negociación. Idéntico a la web: un RTCPeerConnection aguanta
   * UNA negociación a la vez, y publicar el micrófono se cruza con las
   * suscripciones — el catálogo cambia justo cuando alguien empieza a hablar.
   */
  const colaRef = useRef<Promise<unknown>>(Promise.resolve());
  const enFila = useCallback(<T,>(tarea: () => Promise<T>): Promise<T> => {
    const siguiente = colaRef.current.then(tarea, tarea);
    colaRef.current = siguiente.catch(() => undefined);
    return siguiente;
  }, []);

  // ── Conexión ────────────────────────────────────────────────

  const conectar = useCallback(async () => {
    if (pcRef.current) return;
    setEstado("conectando");
    setError(null);

    /* La sesión de audio del sistema, en modo llamada y por el ALTAVOZ.
     * Sin esto la asamblea suena por el auricular de las llamadas, y la
     * persona —con razón— cree que no funciona. Se arranca aquí y no al
     * recibir la primera pista para que iOS configure la sesión antes de
     * que empiece a llegar sonido. */
    InCallManager.start({ media: "audio" });
    InCallManager.setForceSpeakerphoneOn(true);

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
      bundlePolicy: "max-bundle",
    });
    pcRef.current = pc;

    (pc as any).ontrack = (ev: any) => {
      const mid: string = ev.transceiver?.mid ?? "";
      /* Solo se acepta lo que pedimos: el transceptor vacío de la apertura
       * también llega por aquí y no es nadie. */
      const trackName = midRef.current.get(mid);
      if (!trackName) return;

      /* SOLO `ev.streams[0]`. El plan B de la web —envolver la pista en un
       * MediaStream nuevo— aquí crea un stream LOCAL con otro identificador
       * nativo, y la vista lo pinta en negro sin decir por qué. */
      const stream: MediaStream | undefined = ev.streams?.[0];
      if (!stream) {
        setError("Llegó una pista sin stream; avisa de esto.");
        return;
      }
      setRemotas((prev) => {
        if (prev.some((p) => p.trackName === trackName)) return prev;
        const tipo = ev.track.kind === "video" ? "pantalla" : "audio";
        return [...prev, { trackName, nombre: "", tipo, stream }];
      });
    };

    (pc as any).onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "connected") {
        setEstado("conectada");
        /* libwebrtc reinicia la sesión de audio al conectar y puede pisar la
         * ruta: se vuelve a forzar el altavoz cada vez que conecta. */
        InCallManager.setForceSpeakerphoneOn(true);
      } else if (s === "disconnected" || s === "failed" || s === "closed") {
        setEstado("reconectando");
      }
    };

    try {
      pc.addTransceiver("audio", { direction: "recvonly" });

      const oferta = await pc.createOffer({});
      await pc.setLocalDescription(oferta);
      await esperarIce(pc);

      const r = await abrirSesion({
        asambleaId,
        sdp: pc.localDescription!.sdp,
      });
      if ("error" in r) {
        setError(r.error);
        setEstado("error");
        return;
      }
      sesionRef.current = r.sessionId;
      await pc.setRemoteDescription({ type: "answer", sdp: r.sdp });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEstado("error");
    }
  }, [abrirSesion, asambleaId]);

  const desconectar = useCallback(async () => {
    const sid = sesionRef.current;
    const mias = misPistasRef.current;
    if (sid && mias.length > 0) {
      await dejarDePublicarAccion({ sessionId: sid, trackNames: mias }).catch(
        () => {},
      );
    }
    /* `stop()` apaga el dispositivo; `release()` libera el objeto nativo.
     * Sin la segunda, la luz de la cámara se apaga pero el stream queda vivo
     * en memoria — y tras unas cuantas salas el sistema deja de dar micrófono. */
    micRef.current?.stop();
    micRef.current = null;
    micStreamRef.current?.release();
    micStreamRef.current = null;
    camRef.current?.stop();
    camRef.current = null;
    camStreamRef.current?.release();
    camStreamRef.current = null;
    camSenderRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    sesionRef.current = null;
    misPistasRef.current = [];
    suscritasRef.current.clear();
    midRef.current.clear();
    setRemotas([]);
    setLocalStream(null);
    setMicOn(false);
    setCamOn(false);
    setEstado("inactiva");
    InCallManager.stop();
  }, [dejarDePublicarAccion]);

  useEffect(() => {
    if (!activo || disponible !== true) return;
    /* Entrada escalonada, igual que la web: el SFU acepta 50 llamadas por
     * segundo, y una asamblea entra en tropel a la hora en punto. */
    const espera = Math.floor(Math.random() * 4000);
    const id = setTimeout(() => void conectar(), espera);
    return () => {
      clearTimeout(id);
      void desconectar();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, disponible]);

  // ── Reconexión ──────────────────────────────────────────────

  useEffect(() => {
    if (estado !== "reconectando") return;
    /* Se rehace la sesión entera: reconstruir es más fiable que adivinar en
     * qué estado quedó la de Cloudflare. En un teléfono esto pasa cada vez
     * que cambia de wifi a datos; tiene que ser aburrido. */
    const id = setTimeout(() => {
      void (async () => {
        await desconectar();
        await conectar();
      })();
    }, 2000);
    return () => clearTimeout(id);
  }, [estado, conectar, desconectar]);

  // ── Suscripción a lo que publican los demás ─────────────────

  useEffect(() => {
    if (estado !== "conectada" || !catalogo || catalogo.length === 0) return;
    const pc = pcRef.current;
    const sid = sesionRef.current;
    if (!pc || !sid) return;

    const nuevas = catalogo.filter(
      (p) => p.sessionId !== sid && !suscritasRef.current.has(p.trackName),
    );
    if (nuevas.length === 0) return;

    void (async () => {
      nuevas.forEach((p) => suscritasRef.current.add(p.trackName));
      await enFila(async () => {
        const r = await suscribirAccion({
          asambleaId,
          sessionId: sid,
          pistas: nuevas.map((p) => ({
            sessionId: p.sessionId,
            trackName: p.trackName,
          })),
        });
        if ("error" in r) {
          nuevas.forEach((p) => suscritasRef.current.delete(p.trackName));
          setError(r.error);
          return;
        }
        for (const m of r.mapa) midRef.current.set(m.mid, m.trackName);
        if (!r.sdp) return;

        await pc.setRemoteDescription({ type: "offer", sdp: r.sdp });
        const respuesta = await pc.createAnswer();
        await pc.setLocalDescription(respuesta);
        const sdpRespuesta = pc.localDescription?.sdp ?? respuesta.sdp;
        if (!sdpRespuesta) return;
        await responderAccion({ sessionId: sid, sdp: sdpRespuesta });
      });
    })();
  }, [catalogo, estado, asambleaId, suscribirAccion, responderAccion, enFila]);

  /** Le pone nombre a cada pista remota cuando el catálogo lo dice. */
  useEffect(() => {
    if (!catalogo) return;
    setRemotas((prev) => {
      let cambio = false;
      const siguiente = prev.map((r) => {
        const meta = catalogo.find((c) => c.trackName === r.trackName);
        if (!meta || (meta.nombre === r.nombre && meta.tipo === r.tipo)) return r;
        cambio = true;
        return { ...r, nombre: meta.nombre, tipo: meta.tipo };
      });
      return cambio ? siguiente : prev;
    });
  }, [catalogo]);

  // ── Micrófono ───────────────────────────────────────────────

  const encenderMic = useCallback(async () => {
    const pc = pcRef.current;
    const sid = sesionRef.current;
    if (!pc || !sid) return;

    /* Volver a hablar es SOLO cambiar `enabled`: republicar significaría otra
     * negociación, y ahí era donde la gente se quedaba muda. */
    if (micRef.current) {
      micRef.current.enabled = true;
      setMicOn(true);
      return;
    }

    try {
      const stream = await mediaDevices.getUserMedia({ audio: true });
      const pista = stream.getAudioTracks()[0];
      if (!pista) return;
      micRef.current = pista;
      micStreamRef.current = stream;

      const ok = await enFila(async () => {
        const trans = pc.addTransceiver(pista, { direction: "sendonly" });
        const oferta = await pc.createOffer({});
        await pc.setLocalDescription(oferta);
        await esperarIce(pc);

        const trackName = `mic-${sid.slice(0, 8)}`;
        const r = await publicarAccion({
          asambleaId,
          sessionId: sid,
          sdp: pc.localDescription!.sdp,
          pistas: [{ mid: trans.mid ?? "0", trackName, tipo: "audio" as const }],
        });
        if ("error" in r) {
          setError(r.error);
          return false;
        }
        await pc.setRemoteDescription({ type: "answer", sdp: r.sdp });
        misPistasRef.current = [...misPistasRef.current, trackName];
        return true;
      });

      if (!ok) {
        pista.stop();
        micRef.current = null;
        micStreamRef.current?.release();
        micStreamRef.current = null;
        return;
      }
      setMicOn(true);
    } catch (e) {
      micRef.current?.stop();
      micRef.current = null;
      micStreamRef.current?.release();
      micStreamRef.current = null;
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [asambleaId, publicarAccion, enFila]);

  const apagarMic = useCallback(async () => {
    if (micRef.current) micRef.current.enabled = false;
    setMicOn(false);
  }, []);

  // ── Cámara ──────────────────────────────────────────────────

  const encenderCam = useCallback(async () => {
    const pc = pcRef.current;
    const sid = sesionRef.current;
    if (!pc || !sid) return;

    try {
      const stream = await mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { max: 20 },
        },
      });
      const pista = stream.getVideoTracks()[0];
      if (!pista) return;
      camRef.current = pista;
      camStreamRef.current = stream;

      if (camSenderRef.current) {
        await camSenderRef.current.sender.replaceTrack(pista);
        setLocalStream(stream);
        setCamOn(true);
        return;
      }

      const ok = await enFila(async () => {
        const trans = pc.addTransceiver(pista, { direction: "sendonly" });
        const oferta = await pc.createOffer({});
        await pc.setLocalDescription(oferta);
        await esperarIce(pc);

        const trackName = `cam-${sid.slice(0, 8)}`;
        const r = await publicarAccion({
          asambleaId,
          sessionId: sid,
          sdp: pc.localDescription!.sdp,
          pistas: [{ mid: trans.mid ?? "0", trackName, tipo: "video" as const }],
        });
        if ("error" in r) {
          setError(r.error);
          return false;
        }
        await pc.setRemoteDescription({ type: "answer", sdp: r.sdp });
        camSenderRef.current = trans;
        misPistasRef.current = [...misPistasRef.current, trackName];
        return true;
      });

      if (!ok) {
        pista.stop();
        camRef.current = null;
        camStreamRef.current?.release();
        camStreamRef.current = null;
        return;
      }
      setLocalStream(stream);
      setCamOn(true);
    } catch (e) {
      camRef.current?.stop();
      camRef.current = null;
      camStreamRef.current?.release();
      camStreamRef.current = null;
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [asambleaId, publicarAccion, enFila]);

  const apagarCam = useCallback(async () => {
    /* Soltar la pista del emisor —sin renegociar— y apagar el dispositivo:
     * una pista "deshabilitada" seguiría mandando fotogramas negros, y la luz
     * de la cámara encendida con el video apagado no se la cree nadie. */
    await camSenderRef.current?.sender.replaceTrack(null).catch(() => {});
    camRef.current?.stop();
    camRef.current = null;
    camStreamRef.current?.release();
    camStreamRef.current = null;
    setLocalStream(null);
    setCamOn(false);
  }, []);

  // ── Diagnóstico ─────────────────────────────────────────────

  const diagnostico = useCallback(async (): Promise<Diagnostico | null> => {
    const pc = pcRef.current;
    if (!pc) return null;

    const stats = await pc.getStats();
    let pareja: any = null;
    const candidatos = new Map<string, { ip?: string }>();
    stats.forEach((s: any) => {
      if (s.type === "candidate-pair" && s.state === "succeeded") {
        if (s.nominated || !pareja) pareja = s;
      }
      if (s.type === "remote-candidate") {
        candidatos.set(s.id, { ip: s.address ?? s.ip });
      }
    });

    let bytesRecibidos = 0;
    let bytesEnviados = 0;
    stats.forEach((s: any) => {
      if (s.type === "inbound-rtp") bytesRecibidos += s.bytesReceived ?? 0;
      if (s.type === "outbound-rtp") bytesEnviados += s.bytesSent ?? 0;
    });

    const ip = pareja?.remoteCandidateId
      ? (candidatos.get(pareja.remoteCandidateId)?.ip ?? null)
      : null;

    return {
      sessionId: sesionRef.current,
      estadoConexion: pc.connectionState,
      ipRemota: ip,
      esDeCloudflare: ip ? ipEsDeCloudflare(ip) : null,
      bytesRecibidos,
      bytesEnviados,
      pistasPublicadas: misPistasRef.current.length,
      pistasSuscritas: suscritasRef.current.size,
    };
  }, []);

  return {
    disponible: disponible === true,
    estado,
    error,
    remotas,
    localStream,
    micOn,
    encenderMic,
    apagarMic,
    camOn,
    encenderCam,
    apagarCam,
    /** En la v1 del teléfono no se comparte pantalla; ver la de otros, sí. */
    puedeCompartirPantalla: false as const,
    diagnostico,
    reconectar: conectar,
  };
}
