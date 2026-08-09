"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";

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
  const [compartiendo, setCompartiendo] = useState(false);
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
    pcRef.current?.close();
    pcRef.current = null;
    sesionRef.current = null;
    misPistasRef.current = [];
    suscritasRef.current.clear();
    midRef.current.clear();
    setRemotas([]);
    setMicOn(false);
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
    setRemotas((prev) =>
      prev.map((r) => {
        const meta = catalogo.find((c) => c.trackName === r.trackName);
        if (!meta) return r;
        return meta.nombre !== r.nombre || meta.tipo !== r.tipo
          ? { ...r, nombre: meta.nombre, tipo: meta.tipo }
          : r;
      }),
    );
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


  return {
    /** false mientras no esté configurado el SFU: la sala usa el motor viejo. */
    disponible: disponible === true,
    estado,
    error,
    remotas,
    micOn,
    encenderMic,
    apagarMic,
    puedeCompartirPantalla,
    compartiendo,
    compartirPantalla,
    dejarDeCompartir,
    reconectar: conectar,
  };
}
