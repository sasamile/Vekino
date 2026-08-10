import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, NativeModules } from "react-native";
import { useAction, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { getWebRtc, webrtcDisponible } from "@/lib/webrtc-native";

type MediaStream = import("react-native-webrtc").MediaStream;
type MediaStreamTrack = import("react-native-webrtc").MediaStreamTrack;
type RTCPeerConnection = import("react-native-webrtc").RTCPeerConnection;

function inCallStart() {
  try {
    if (!NativeModules.InCallManager) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("react-native-incall-manager").default.start({ media: "video" });
  } catch {
    /* Expo Go / sin nativo */
  }
}

function inCallStop() {
  try {
    if (!NativeModules.InCallManager) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("react-native-incall-manager").default.stop();
  } catch {
    /* Expo Go / sin nativo */
  }
}

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
  /* Tipado como el PC nativo; en Expo Go este archivo no llega a llamarse. */
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
  /* ¿Sigue montada la sala? Sin esto, un ciclo de reconexión que quedó
   * esperando la red puede despertar DESPUÉS de que la persona colgó:
   * abriría otra sesión en Cloudflare y encendería el modo llamada del
   * teléfono sin que nadie lo vaya a apagar jamás. */
  const vivoRef = useRef(false);
  const sesionRef = useRef<string | null>(null);
  const micRef = useRef<MediaStreamTrack | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const camRef = useRef<MediaStreamTrack | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const camSenderRef = useRef<ReturnType<
    RTCPeerConnection["addTransceiver"]
  > | null>(null);
  /** Streams propios creados para envolver pistas remotas; se liberan al salir. */
  const wrappersRef = useRef<MediaStream[]>([]);
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
    if (pcRef.current || !vivoRef.current) return;
    setEstado("conectando");
    setError(null);

    /* La sesión de audio del sistema, en modo videollamada.
     *
     * `media: "video"` y NO forzar el altavoz a mano: con esto la librería
     * hace lo que cualquier app de llamadas — altavoz por defecto, pero los
     * audífonos (cableados o Bluetooth) tienen prioridad y el sistema maneja
     * conectarlos y desconectarlos a mitad de asamblea. Forzar el altavoz
     * pisaba los AirPods de quien escucha en el bus y le sacaba los estados
     * financieros del conjunto a todo volumen en público. Además "video" no
     * enciende el sensor de proximidad, que con "audio" apaga la pantalla. */
    inCallStart();

    const webrtc = getWebRtc();
    if (!webrtc) {
      setError(
        "La sala de video no está disponible en Expo Go. Abre Vekino con el development build.",
      );
      setEstado("error");
      return;
    }
    const { RTCPeerConnection, MediaStream } = webrtc;

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

      /* CADA pista en su propio MediaStream, sin compartir `ev.streams[0]`.
       *
       * Dos razones. Cloudflare no garantiza el `a=msid` en sus ofertas (su
       * ejemplo oficial ni usa `ev.streams`), así que puede venir vacío. Y
       * peor: si agrupa cámara y pantalla del mismo emisor bajo un solo
       * stream, RTCView —que no tiene forma de elegir pista— pintaría
       * siempre la primera: la cara del presidente donde deberían ir los
       * estados financieros. Envolver cada pista es un camino soportado en
       * react-native-webrtc 124: el nativo resuelve las pistas remotas por
       * su conexión, no por el stream que las envuelve. */
      const stream = new MediaStream([ev.track]);
      wrappersRef.current.push(stream);
      setRemotas((prev) => {
        if (prev.some((p) => p.trackName === trackName)) return prev;
        const tipo = ev.track.kind === "video" ? "pantalla" : "audio";
        return [...prev, { trackName, nombre: "", tipo, stream }];
      });
    };

    (pc as any).onconnectionstatechange = () => {
      /* Un pc viejo que agoniza no puede opinar sobre el estado del nuevo. */
      if (pcRef.current !== pc) return;
      const s = pc.connectionState;
      if (s === "connected") {
        setEstado("conectada");
      } else if (s === "disconnected" || s === "failed" || s === "closed") {
        setEstado("reconectando");
      }
    };

    /* Un solo camino de fallo. Sin esto, un error al entrar dejaba el
     * teléfono en modo llamada (InCallManager encendido sin nadie que lo
     * apague) y `pcRef` ocupado, con lo que hasta reintentar era un no-op. */
    const fallar = (mensaje: string, transitorio: boolean) => {
      pc.close();
      if (pcRef.current !== pc) return; // una conexión más nueva ya manda
      pcRef.current = null;
      sesionRef.current = null;
      inCallStop();
      setError(mensaje);
      /* Una excepción es la red (el ascensor, el cambio de wifi a datos):
       * eso se reintenta solo. "error" queda para cuando el backend dice
       * que no a propósito — ahí reintentar en bucle solo martilla. */
      setEstado(transitorio ? "reconectando" : "error");
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
      if (!vivoRef.current) {
        /* La persona colgó mientras la action viajaba: no dejar la sesión
         * huérfana viva en Cloudflare ni el teléfono en modo llamada. */
        pc.close();
        inCallStop();
        return;
      }
      if ("error" in r) {
        fallar(r.error, false);
        return;
      }
      sesionRef.current = r.sessionId;
      await pc.setRemoteDescription({ type: "answer", sdp: r.sdp });
    } catch (e) {
      fallar(e instanceof Error ? e.message : String(e), true);
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
    /* Silenciar el pc ANTES de cerrarlo. En react-native-webrtc, a diferencia
     * del navegador, un `close()` propio SÍ dispara `connectionstatechange`
     * con 'closed' — la propia librería depende de ese evento para liberar
     * el objeto nativo. Sin quitar el handler, cada desconexión deliberada
     * ponía "reconectando" ~50 ms después y rearmaba un ciclo que en redes
     * lentas no convergía nunca. */
    const pcViejo = pcRef.current;
    if (pcViejo) {
      (pcViejo as any).onconnectionstatechange = null;
      (pcViejo as any).ontrack = null;
      pcViejo.close();
    }
    pcRef.current = null;
    /* Los envoltorios de pistas remotas: liberar el objeto nativo sin tocar
     * las pistas (que son de la conexión, no nuestras). */
    wrappersRef.current.forEach((s) => s.release(false));
    wrappersRef.current = [];
    sesionRef.current = null;
    misPistasRef.current = [];
    suscritasRef.current.clear();
    midRef.current.clear();
    setRemotas([]);
    setLocalStream(null);
    setMicOn(false);
    setCamOn(false);
    setEstado("inactiva");
    inCallStop();
  }, [dejarDePublicarAccion]);

  useEffect(() => {
    if (!activo || disponible !== true) return;
    if (!webrtcDisponible()) {
      setEstado("error");
      setError(
        "La sala de video no está disponible en Expo Go. Abre Vekino con el development build.",
      );
      return;
    }
    vivoRef.current = true;
    /* Entrada escalonada, igual que la web: el SFU acepta 50 llamadas por
     * segundo, y una asamblea entra en tropel a la hora en punto. */
    const espera = Math.floor(Math.random() * 4000);
    const id = setTimeout(() => void conectar(), espera);
    return () => {
      vivoRef.current = false;
      clearTimeout(id);
      void desconectar();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, disponible]);

  // ── Reconexión ──────────────────────────────────────────────

  useEffect(() => {
    /* Con `activo` en la guarda: al terminar la asamblea nada puede volver
     * a conectar, venga el estado de donde venga. */
    if (!activo || estado !== "reconectando") return;
    /* Se rehace la sesión entera: reconstruir es más fiable que adivinar en
     * qué estado quedó la de Cloudflare. En un teléfono esto pasa cada vez
     * que cambia de wifi a datos; tiene que ser aburrido. */
    const id = setTimeout(() => {
      void (async () => {
        await desconectar();
        if (!vivoRef.current) return;
        await conectar();
      })();
    }, 2000);
    return () => clearTimeout(id);
  }, [activo, estado, conectar, desconectar]);

  // ── Volver de una llamada o del segundo plano ───────────────

  useEffect(() => {
    if (estado !== "conectada") return;
    /* Una llamada telefónica interrumpe la sesión de audio pero el RTP sigue
     * "connected": ningún evento de WebRTC avisa. Al volver la app a primer
     * plano se sondea de verdad — dos lecturas de bytes recibidos con dos
     * segundos entre ellas. Si hay pistas suscritas y los bytes no avanzan,
     * el audio murió: se fuerza la reconstrucción, que ya sabe rehacer la
     * sesión de audio completa. */
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") return;
      void (async () => {
        const pc = pcRef.current;
        if (!pc || suscritasRef.current.size === 0) return;
        const leer = async () => {
          let bytes = 0;
          const stats = await pc.getStats();
          stats.forEach((x: any) => {
            if (x.type === "inbound-rtp") bytes += x.bytesReceived ?? 0;
          });
          return bytes;
        };
        const antes = await leer();
        await new Promise((r) => setTimeout(r, 2000));
        if (pcRef.current !== pc || !vivoRef.current) return;
        const despues = await leer();
        if (despues <= antes) setEstado("reconectando");
      })();
    });
    return () => sub.remove();
  }, [estado]);

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

  /** Nombra cada pista remota — y BORRA las que ya nadie anuncia.
   *
   * Sin la poda, dejar de compartir pantalla dejaba el último fotograma
   * clavado como una foto: la pista moría en Cloudflare pero nadie la
   * sacaba de la lista de cosas que pintar. */
  useEffect(() => {
    if (!catalogo) return;
    setRemotas((prev) => {
      let cambio = false;
      const vivas = prev.filter((r) => {
        const sigue = catalogo.some((c) => c.trackName === r.trackName);
        if (!sigue) {
          cambio = true;
          suscritasRef.current.delete(r.trackName);
        }
        return sigue;
      });
      const siguiente = vivas.map((r) => {
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
      const webrtc = getWebRtc();
      if (!webrtc) return;
      const stream = await webrtc.mediaDevices.getUserMedia({ audio: true });
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
      const webrtc = getWebRtc();
      if (!webrtc) return;
      const stream = await webrtc.mediaDevices.getUserMedia({
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
    /* Desde cualquier estado: primero derriba lo que haya. El `conectar`
     * pelado era un no-op si quedaba un pc a medio morir. */
    reconectar: async () => {
      await desconectar();
      await conectar();
    },
  };
}
