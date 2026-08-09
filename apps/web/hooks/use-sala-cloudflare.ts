"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import type { Diagnostico } from "./sala-tipos";

/**
 * La sala sobre el SFU de Cloudflare.
 *
 * Cloudflare no da SDK: da un repetidor de medios por HTTP. Todo lo que en
 * LiveKit venía hecho —negociación, reconexión, saber quién está publicando—
 * está aquí. Por eso este archivo es largo: es el precio de que la asamblea
 * cueste gigabytes en vez de minutos-participante.
 *
 * Cómo funciona, en corto:
 *  1. Se abre UNA conexión con el SFU y se guarda su `sessionId`.
 *  2. Publicar = añadir la pista, ofertar, y anotar el nombre en Convex.
 *  3. Suscribirse = pedirle a Cloudflare las pistas de los demás; aquí la
 *     negociación va al revés (él ofrece, nosotros respondemos).
 *  4. Convex dice QUÉ pistas existen; Cloudflare las entrega.
 */

/** Los eventos de ICE llegan sueltos; se espera a que termine de reunirlos. */
async function esperarIce(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    /* Con un tope: si un candidato se atasca —pasa detrás de algunos
     * firewalls corporativos— es mejor mandar la oferta incompleta que
     * dejar a la persona mirando una pantalla en blanco. */
    const tope = setTimeout(resolve, 3000);
    const ver = () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(tope);
        pc.removeEventListener("icegatheringstatechange", ver);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", ver);
  });
}

export type EstadoSala =
  | "inactiva"
  | "conectando"
  | "conectada"
  | "reconectando"
  | "error";

/**
 * Rangos IPv4 públicos de Cloudflare (los que publica en cloudflare.com/ips).
 *
 * Se comprueba contra esta lista en vez de preguntarle a un servicio externo
 * porque la respuesta tiene que servir en mitad de una asamblea, sin depender
 * de que otra cosa esté en pie. La lista cambia muy de tanto en tanto; si un
 * día una IP legítima diera "no", sería este array y no el motor.
 */
const RANGOS_CLOUDFLARE = [
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "108.162.192.0/18",
  "131.0.72.0/22",
  "141.101.64.0/18",
  "162.158.0.0/15",
  "172.64.0.0/13",
  "173.245.48.0/20",
  "188.114.96.0/20",
  "190.93.240.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
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
  if (valor === null) return false; // IPv6 o algo raro: no se afirma nada.

  return RANGOS_CLOUDFLARE.some((rango) => {
    const [base, bits] = rango.split("/");
    const inicio = aNumero(base!);
    if (inicio === null) return false;
    /* `>>> 0` mantiene el resultado sin signo: con /13 el desplazamiento
     * produce un negativo en JavaScript y la comparación fallaría. */
    const mascara = (~0 << (32 - Number(bits))) >>> 0;
    return (valor & mascara) >>> 0 === (inicio & mascara) >>> 0;
  });
}

export type PistaRemota = {
  trackName: string;
  nombre: string;
  /** Sin esto no se sabe si pintar un `<audio>` o un `<video>`. */
  tipo: "audio" | "video" | "pantalla";
  stream: MediaStream;
};

export function useSalaCloudflare(
  asambleaId: Id<"asambleas">,
  activo: boolean,
) {
  /* Se pregunta SIEMPRE, no solo al entrar. Es una comprobación de
   * configuración —dos líneas de `process.env`— y saltarla mientras la
   * persona no ha entrado hacía que la pantalla dijera "el SFU no está
   * configurado" cuando lo único que pasaba es que aún no se había
   * preguntado. */
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
  const [compartiendo, setCompartiendo] = useState(false);
  /** Lo que uno mismo emite, para verse en pantalla. */
  const [locales, setLocales] = useState<
    { medio: "camara" | "pantalla"; stream: MediaStream }[]
  >([]);
  /* El navegador no deja sonar nada hasta que la persona toque algo. Sin
   * esto la asamblea entera se ve pero no se oye, y nadie sabe por qué. */
  const [audioBloqueado, setAudioBloqueado] = useState(false);
  /* Safari en iPhone/iPad no tiene `getDisplayMedia`: en el móvil no se puede
   * compartir pantalla, punto. Enseñar el botón allí solo produce un error
   * incomprensible ("getDisplayMedia is not a function") a quien lo pulsa. */
  const [puedeCompartirPantalla, setPuedeCompartir] = useState(false);
  useEffect(() => {
    setPuedeCompartir(
      typeof navigator !== "undefined" &&
        typeof navigator.mediaDevices?.getDisplayMedia === "function",
    );
  }, []);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const sesionRef = useRef<string | null>(null);
  const micRef = useRef<MediaStreamTrack | null>(null);
  const pantallaRef = useRef<MediaStreamTrack | null>(null);
  const camRef = useRef<MediaStreamTrack | null>(null);
  /* El emisor de la cámara se guarda aparte porque apagar vídeo NO es como
   * silenciar: una pista de vídeo «deshabilitada» sigue mandando fotogramas
   * negros, y con 173 personas eso es ancho de banda tirado. Con
   * `replaceTrack(null)` deja de mandar de verdad y —esto importa— sin
   * renegociar, que es lo que rompía el micrófono. */
  const camSenderRef = useRef<RTCRtpSender | null>(null);
  const misPistasRef = useRef<string[]>([]);
  /** Pistas remotas ya pedidas, para no volver a suscribirse a lo mismo. */
  const suscritasRef = useRef<Set<string>>(new Set());
  /** `mid` → nombre de pista. Lo llena `suscribir`: es la única forma de
   *  saber de quién es un medio, porque el evento `track` solo trae el mid. */
  const midRef = useRef<Map<string, string>>(new Map());

  /**
   * Cerrojo de negociación.
   *
   * Un `RTCPeerConnection` solo aguanta UNA negociación a la vez. Si mientras
   * se publica el micrófono llega una suscripción —y llega, porque el
   * catálogo cambia justo cuando alguien empieza a hablar— la segunda se
   * estrella con "Called in wrong state: stable" y la persona se queda sin
   * audio hasta salir y volver a entrar.
   *
   * Todo lo que toque SDP pasa por aquí, en fila.
   */
  const colaRef = useRef<Promise<unknown>>(Promise.resolve());
  const enFila = useCallback(<T,>(tarea: () => Promise<T>): Promise<T> => {
    const siguiente = colaRef.current.then(tarea, tarea);
    // Un fallo no puede romper la fila: la siguiente tarea tiene que correr.
    colaRef.current = siguiente.catch(() => undefined);
    return siguiente;
  }, []);

  // ── Conexión ────────────────────────────────────────────────

  const conectar = useCallback(async () => {
    if (pcRef.current) return;
    setEstado("conectando");
    setError(null);

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
      bundlePolicy: "max-bundle",
    });
    pcRef.current = pc;

    pc.addEventListener("track", (ev) => {
      const mid = ev.transceiver.mid ?? "";
      /* Solo se acepta lo que pedimos. Al abrir la sesión se manda un
       * transceptor vacío —hace falta para que la oferta sea válida— y
       * Cloudflare responde por él: eso llegaba aquí y se pintaba como una
       * persona llamada "0" que nadie sabía quién era. */
      const trackName = midRef.current.get(mid);
      if (!trackName) return;

      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      setRemotas((prev) => {
        if (prev.some((p) => p.trackName === trackName)) return prev;
        const tipo = ev.track.kind === "video" ? "pantalla" : "audio";
        return [...prev, { trackName, nombre: "", tipo, stream }];
      });
    });

    pc.addEventListener("connectionstatechange", () => {
      const s = pc.connectionState;
      if (s === "connected") setEstado("conectada");
      else if (s === "disconnected") setEstado("reconectando");
      else if (s === "failed" || s === "closed") setEstado("reconectando");
    });

    try {
      /* Hace falta al menos un transceptor para que la oferta sea válida:
       * una oferta sin `m=` no tiene ice-ufrag y Cloudflare la rechaza. */
      pc.addTransceiver("audio", { direction: "recvonly" });

      const oferta = await pc.createOffer();
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
    micRef.current?.stop();
    micRef.current = null;
    pantallaRef.current?.stop();
    pantallaRef.current = null;
    camRef.current?.stop();
    camRef.current = null;
    camSenderRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    sesionRef.current = null;
    misPistasRef.current = [];
    suscritasRef.current.clear();
    midRef.current.clear();
    setRemotas([]);
    setLocales([]);
    setMicOn(false);
    setCamOn(false);
    setCompartiendo(false);
    setEstado("inactiva");
  }, [dejarDePublicarAccion]);

  useEffect(() => {
    if (!activo || disponible !== true) return;

    /* Entrada escalonada. El SFU acepta 50 llamadas por segundo y por sesión;
     * 173 personas abriendo la sala a las 8:00 en punto topan ese límite en
     * el primer segundo y la mitad se queda fuera sin saber por qué. */
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
    /* Se rehace la sesión entera en vez de intentar un ICE restart: la sesión
     * de Cloudflare puede haber caducado del otro lado, y reconstruirla es
     * más fiable que adivinar en qué estado quedó. En ocho horas y 173
     * navegadores esto se ejecuta cientos de veces; tiene que ser aburrido. */
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
      (p) =>
        p.sessionId !== sid && !suscritasRef.current.has(p.trackName),
    );
    if (nuevas.length === 0) return;

    void (async () => {
      // Se piden todas de una vez: una llamada por pista multiplica el
      // tráfico de señalización justo cuando la mesa abre el micrófono.
      nuevas.forEach((p) => suscritasRef.current.add(p.trackName));
      /* En la fila: si esto se cruza con una publicación, la segunda
       * negociación se estrella con "Called in wrong state". Y se cruzan
       * seguido — el catálogo cambia justo cuando alguien abre el micrófono. */
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
      /* Se usa el SDP de `localDescription`, no el de `createAnswer`: el
       * primero ya trae los candidatos ICE que el navegador añadió al
       * aplicarlo, y es el que Cloudflare necesita para poder responder. */
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
      /* Devolver `prev` cuando nada cambió no es un detalle: `.map` siempre
       * crea un array nuevo, y con el catálogo llegando cada pocos segundos
       * eso repintaba la sala entera —y volvía a probar el audio— sin que
       * hubiera pasado nada. */
      return cambio ? siguiente : prev;
    });
  }, [catalogo]);

  // ── Micrófono ───────────────────────────────────────────────

  const encenderMic = useCallback(async () => {
    const pc = pcRef.current;
    const sid = sesionRef.current;
    if (!pc || !sid) return;

    /* Si ya se publicó una vez, volver a hablar es SOLO cambiar `enabled`.
     *
     * Antes se despublicaba y se volvía a publicar, o sea dos negociaciones
     * por cada vez que alguien se callaba — y ahí se rompía: la segunda
     * llegaba en mal estado y la persona se quedaba muda hasta salir y
     * volver a entrar. Con Opus el silencio no cuesta ancho de banda, así
     * que mantener la pista publicada no encarece nada. */
    if (micRef.current) {
      micRef.current.enabled = true;
      setMicOn(true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const pista = stream.getAudioTracks()[0];
      if (!pista) return;
      micRef.current = pista;

      const ok = await enFila(async () => {
        const trans = pc.addTransceiver(pista, { direction: "sendonly" });
        const oferta = await pc.createOffer();
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
        return;
      }
      setMicOn(true);
    } catch (e) {
      micRef.current?.stop();
      micRef.current = null;
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [asambleaId, publicarAccion, enFila]);

  /**
   * Comparte la pantalla.
   *
   * Es lo único que puede reventar la factura: el audio de una asamblea son
   * ~50 GB, pero la misma asamblea con la pantalla en 720p a 30 fps se va a
   * ~980 GB — el mes entero de capa gratis en una sola reunión. Por eso se
   * pide expresamente modesta: un orden del día y unos estados financieros
   * son texto casi estático y a 5 fps se leen igual.
   */
  const compartirPantalla = useCallback(async () => {
    const pc = pcRef.current;
    const sid = sesionRef.current;
    if (!pc || !sid) return;
    if (typeof navigator.mediaDevices?.getDisplayMedia !== "function") {
      setError(
        "Este dispositivo no puede compartir pantalla. En iPhone y iPad el navegador no lo permite: usa un computador.",
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { max: 1280 }, height: { max: 720 }, frameRate: { max: 5 } },
        audio: false,
      });
      const pista = stream.getVideoTracks()[0];
      if (!pista) return;
      pantallaRef.current = pista;

      /* Si se corta la compartición desde el aviso del navegador —y no desde
       * nuestro botón—, hay que enterarse o la pista queda anunciada en
       * Convex sin que nadie la emita, y los demás se suscriben al vacío. */
      pista.addEventListener("ended", () => void dejarDeCompartirRef.current());

      const ok = await enFila(async () => {
        const trans = pc.addTransceiver(pista, { direction: "sendonly" });
        const oferta = await pc.createOffer();
        await pc.setLocalDescription(oferta);
        await esperarIce(pc);

        const trackName = `pantalla-${sid.slice(0, 8)}`;
        const r = await publicarAccion({
          asambleaId,
          sessionId: sid,
          sdp: pc.localDescription!.sdp,
          pistas: [
            { mid: trans.mid ?? "0", trackName, tipo: "pantalla" as const },
          ],
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
        pantallaRef.current = null;
        return;
      }
      setLocales((prev) => [
        ...prev.filter((l) => l.medio !== "pantalla"),
        { medio: "pantalla", stream },
      ]);
      setCompartiendo(true);
    } catch (e) {
      /* Cancelar el diálogo del navegador lanza aquí y no es un error. */
      const msg = e instanceof Error ? e.message : String(e);
      if (!/denied|dismissed|Permission/i.test(msg)) setError(msg);
    }
  }, [asambleaId, publicarAccion, enFila]);

  const dejarDeCompartir = useCallback(async () => {
    const sid = sesionRef.current;
    pantallaRef.current?.stop();
    pantallaRef.current = null;
    setLocales((prev) => prev.filter((l) => l.medio !== "pantalla"));
    setCompartiendo(false);
    if (!sid) return;
    const nombres = misPistasRef.current.filter((n) => n.startsWith("pantalla-"));
    if (nombres.length === 0) return;
    await dejarDePublicarAccion({ sessionId: sid, trackNames: nombres }).catch(
      () => {},
    );
    misPistasRef.current = misPistasRef.current.filter(
      (n) => !n.startsWith("pantalla-"),
    );
  }, [dejarDePublicarAccion]);

  /* El listener de `ended` se registra cuando aún no existe la versión final
   * de la función; el ref lo mantiene apuntando a la vigente. */
  const dejarDeCompartirRef = useRef(dejarDeCompartir);
  dejarDeCompartirRef.current = dejarDeCompartir;

  const apagarMic = useCallback(async () => {
    /* Silenciar, no despublicar. La pista se cierra de verdad al salir de la
     * sala (`desconectar`); aquí solo deja de mandar voz. */
    if (micRef.current) micRef.current.enabled = false;
    setMicOn(false);
  }, []);

  // ── Cámara ──────────────────────────────────────────────────

  /**
   * Enciende la cámara.
   *
   * La primera vez negocia; a partir de ahí encender y apagar es cambiar la
   * pista del emisor, sin tocar el SDP. Se pide 640×360 a 20 fps a propósito:
   * en una asamblea las caras viven en un mosaico pequeño y la diferencia con
   * 720p no se ve, pero sí se paga.
   */
  const encenderCam = useCallback(async () => {
    const pc = pcRef.current;
    const sid = sesionRef.current;
    if (!pc || !sid) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { max: 20 },
        },
      });
      const pista = stream.getVideoTracks()[0];
      if (!pista) return;
      camRef.current = pista;

      // Ya se publicó antes: basta con volver a colgar una pista del emisor.
      if (camSenderRef.current) {
        await camSenderRef.current.replaceTrack(pista);
        setLocales((prev) => [
          ...prev.filter((l) => l.medio !== "camara"),
          { medio: "camara", stream },
        ]);
        setCamOn(true);
        return;
      }

      const ok = await enFila(async () => {
        const trans = pc.addTransceiver(pista, { direction: "sendonly" });
        const oferta = await pc.createOffer();
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
        camSenderRef.current = trans.sender;
        misPistasRef.current = [...misPistasRef.current, trackName];
        return true;
      });

      if (!ok) {
        pista.stop();
        camRef.current = null;
        return;
      }
      setLocales((prev) => [
        ...prev.filter((l) => l.medio !== "camara"),
        { medio: "camara", stream },
      ]);
      setCamOn(true);
    } catch (e) {
      camRef.current?.stop();
      camRef.current = null;
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [asambleaId, publicarAccion, enFila]);

  const apagarCam = useCallback(async () => {
    /* Se para el dispositivo además de soltar la pista: si no, la luz de la
     * cámara sigue encendida y la persona cree —con razón— que la estamos
     * grabando con el vídeo «apagado». */
    await camSenderRef.current?.replaceTrack(null).catch(() => {});
    camRef.current?.stop();
    camRef.current = null;
    setLocales((prev) => prev.filter((l) => l.medio !== "camara"));
    setCamOn(false);
  }, []);

  /**
   * Prueba de por dónde está viajando el audio de verdad.
   *
   * Que la aplicación diga "Cloudflare" solo demuestra qué motor eligió, no
   * que los medios pasen por ahí. Esto lo saca del propio navegador: la
   * pareja de candidatos ICE en uso trae la dirección del otro extremo y los
   * bytes que han cruzado. Si esa dirección es de Cloudflare y los bytes
   * suben, el audio va por Cloudflare. No hay forma de fingirlo.
   */
  const diagnostico = useCallback(async (): Promise<Diagnostico | null> => {
    const pc = pcRef.current;
    if (!pc) return null;

    const stats = await pc.getStats();
    let pareja: RTCIceCandidatePairStats | null = null;
    const candidatos = new Map<string, { ip?: string; puerto?: number }>();

    stats.forEach((s) => {
      if (s.type === "candidate-pair" && s.state === "succeeded" && s.nominated) {
        pareja = s as RTCIceCandidatePairStats;
      }
      if (s.type === "remote-candidate") {
        /* `address` es el nombre actual y `ip` el heredado; los navegadores no
         * coinciden en cuál mandan, así que se aceptan los dos. */
        const c = s as { address?: string; ip?: string; port?: number };
        candidatos.set(s.id, { ip: c.address ?? c.ip, puerto: c.port });
      }
    });

    /* Algunos navegadores no marcan `nominated`: si no hubo suerte, vale
     * cualquier pareja que haya llegado a "succeeded". */
    if (!pareja) {
      stats.forEach((s) => {
        if (!pareja && s.type === "candidate-pair" && s.state === "succeeded") {
          pareja = s as RTCIceCandidatePairStats;
        }
      });
    }

    let bytesRecibidos = 0;
    let bytesEnviados = 0;
    stats.forEach((s) => {
      if (s.type === "inbound-rtp") bytesRecibidos += (s as RTCInboundRtpStreamStats).bytesReceived ?? 0;
      if (s.type === "outbound-rtp") bytesEnviados += (s as RTCOutboundRtpStreamStats).bytesSent ?? 0;
    });

    const p = pareja as RTCIceCandidatePairStats | null;
    const remoto = p?.remoteCandidateId
      ? candidatos.get(p.remoteCandidateId)
      : undefined;
    const ip = remoto?.ip ?? null;

    return {
      sessionId: sesionRef.current,
      estadoConexion: pc.connectionState,
      ipRemota: ip,
      puertoRemoto: remoto?.puerto ?? null,
      esDeCloudflare: ip ? ipEsDeCloudflare(ip) : null,
      bytesRecibidos,
      bytesEnviados,
      pistasPublicadas: misPistasRef.current.length,
      pistasSuscritas: suscritasRef.current.size,
    };
  }, []);

  /**
   * Deja sonar el audio.
   *
   * Se llama desde el botón que pinta la sala cuando el navegador bloquea la
   * reproducción. Reproducir un elemento con gesto del usuario levanta el
   * bloqueo para todos los demás de la página.
   */
  const desbloquearAudio = useCallback(async () => {
    const audios = document.querySelectorAll("audio");
    await Promise.all(
      Array.from(audios).map((a) => a.play().catch(() => {})),
    );
    setAudioBloqueado(false);
  }, []);

  /* Se prueba con la primera pista que llega: si el navegador la rechaza,
   * hay que pedirle a la persona que toque el botón.
   *
   * La prueba va SIN silenciar y con el volumen a cero. Silenciada no sirve
   * de nada: el navegador siempre deja reproducir lo que no suena, así que
   * daría permitido incluso cuando la asamblea se está oyendo en mudo. */
  useEffect(() => {
    const primera = remotas[0];
    if (!primera) return;
    const sonido = new Audio();
    sonido.srcObject = primera.stream;
    sonido.volume = 0;
    sonido
      .play()
      .then(() => setAudioBloqueado(false))
      .catch(() => setAudioBloqueado(true))
      .finally(() => {
        sonido.pause();
        sonido.srcObject = null;
      });
  }, [remotas]);


  return {
    /** false mientras no esté configurado el SFU: la sala usa el motor viejo. */
    disponible: disponible === true,
    estado,
    error,
    remotas,
    locales,
    micOn,
    encenderMic,
    apagarMic,
    camOn,
    encenderCam,
    apagarCam,
    audioBloqueado,
    desbloquearAudio,
    puedeCompartirPantalla,
    compartiendo,
    compartirPantalla,
    dejarDeCompartir,
    reconectar: conectar,
    diagnostico,
  };
}
