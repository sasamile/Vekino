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
  stream: MediaStream;
};

export function useSalaCloudflare(
  asambleaId: Id<"asambleas">,
  activo: boolean,
) {
  const disponible = useQuery(api.salaCloudflare.disponible, activo ? {} : "skip");
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

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const sesionRef = useRef<string | null>(null);
  const micRef = useRef<MediaStreamTrack | null>(null);
  const misPistasRef = useRef<string[]>([]);
  /** Pistas remotas ya pedidas, para no volver a suscribirse a lo mismo. */
  const suscritasRef = useRef<Set<string>>(new Set());
  /** Streams por `mid`, para casarlos con el nombre cuando llega `ontrack`. */
  const streamsRef = useRef<Map<string, MediaStream>>(new Map());

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
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      const mid = ev.transceiver.mid ?? "";
      streamsRef.current.set(mid, stream);
      /* El nombre lo pone el catálogo de Convex; aquí solo se guarda el
       * medio. Casarlos se hace en el efecto de abajo, que ya tiene los dos. */
      setRemotas((prev) => {
        if (prev.some((p) => p.stream.id === stream.id)) return prev;
        return [...prev, { trackName: mid, nombre: "", stream }];
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
    pcRef.current?.close();
    pcRef.current = null;
    sesionRef.current = null;
    misPistasRef.current = [];
    suscritasRef.current.clear();
    streamsRef.current.clear();
    setRemotas([]);
    setMicOn(false);
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
    })();
  }, [catalogo, estado, asambleaId, suscribirAccion, responderAccion]);

  /** Le pone nombre a cada pista remota cuando el catálogo lo dice. */
  useEffect(() => {
    if (!catalogo) return;
    setRemotas((prev) =>
      prev.map((r) => {
        const meta = catalogo.find((c) => c.trackName === r.trackName);
        return meta && meta.nombre !== r.nombre
          ? { ...r, nombre: meta.nombre }
          : r;
      }),
    );
  }, [catalogo]);

  // ── Micrófono ───────────────────────────────────────────────

  const encenderMic = useCallback(async () => {
    const pc = pcRef.current;
    const sid = sesionRef.current;
    if (!pc || !sid) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const pista = stream.getAudioTracks()[0];
      if (!pista) return;
      micRef.current = pista;

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
        pista.stop();
        micRef.current = null;
        setError(r.error);
        return;
      }
      await pc.setRemoteDescription({ type: "answer", sdp: r.sdp });
      misPistasRef.current = [...misPistasRef.current, trackName];
      setMicOn(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [asambleaId, publicarAccion]);

  const apagarMic = useCallback(async () => {
    const sid = sesionRef.current;
    const mias = misPistasRef.current;
    micRef.current?.stop();
    micRef.current = null;
    setMicOn(false);
    if (!sid || mias.length === 0) return;
    await dejarDePublicarAccion({ sessionId: sid, trackNames: mias }).catch(
      () => {},
    );
    misPistasRef.current = [];
  }, [dejarDePublicarAccion]);

  return {
    /** false mientras no esté configurado el SFU: la sala usa el motor viejo. */
    disponible: disponible === true,
    estado,
    error,
    remotas,
    micOn,
    encenderMic,
    apagarMic,
    reconectar: conectar,
  };
}
