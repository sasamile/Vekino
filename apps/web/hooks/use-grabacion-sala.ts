"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";

/**
 * Grabación de la reunión completa (como Meet): captura esta pestaña
 * (video del mosaico + participantes + controles) con audio de la sala,
 * y mezcla el micrófono de la mesa.
 *
 * El navegador pide elegir la pestaña: hay que marcar "Compartir audio de
 * la pestaña" / esta pestaña de Vekino. Al detener, descarga un .webm.
 */
export function useGrabacionSala(
  asambleaId: Id<"asambleas">,
  streams: MediaStream[],
) {
  const iniciar = useMutation(api.salaBitacora.iniciarGrabacion);
  const detener = useMutation(api.salaBitacora.detenerGrabacion);
  const [grabando, setGrabando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const displayRef = useRef<MediaStream | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const streamsRef = useRef(streams);
  streamsRef.current = streams;
  const stoppingRef = useRef(false);

  useEffect(() => {
    if (!grabando || !startedAt) return;
    const t = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(t);
  }, [grabando, startedAt]);

  const stopLocal = useCallback(async () => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      await new Promise<void>((resolve) => {
        rec.onstop = () => resolve();
        try {
          rec.stop();
        } catch {
          resolve();
        }
      });
    }
    recorderRef.current = null;

    displayRef.current?.getTracks().forEach((t) => t.stop());
    displayRef.current = null;
    micRef.current?.getTracks().forEach((t) => t.stop());
    micRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;

    const chunks = chunksRef.current;
    chunksRef.current = [];
    if (chunks.length > 0) {
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      a.href = url;
      a.download = `asamblea-reunion-${stamp}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, []);

  const stop = useCallback(async () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    try {
      await detener({ asambleaId }).catch(() => {});
      await stopLocal();
    } finally {
      setGrabando(false);
      setStartedAt(null);
      stoppingRef.current = false;
    }
  }, [asambleaId, detener, stopLocal]);

  const start = useCallback(async () => {
    setError(null);
    stoppingRef.current = false;
    try {
      /* 1) Captura de ESTA pestaña = lo que se ve en la sala (tiles, gente…). */
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 15, max: 24 },
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
        },
        audio: true,
        // Chrome / Edge: prioriza esta pestaña y el audio del tab.
        ...( {
          preferCurrentTab: true,
          selfBrowserSurface: "include",
          surfaceSwitching: "exclude",
          systemAudio: "include",
        } as DisplayMediaStreamOptions),
      });
      displayRef.current = display;

      const videoTrack = display.getVideoTracks()[0];
      if (!videoTrack) {
        display.getTracks().forEach((t) => t.stop());
        throw new Error("No se obtuvo video de la pestaña.");
      }
      videoTrack.addEventListener("ended", () => {
        void stop();
      });

      await iniciar({ asambleaId });

      /* 2) Mezcla de audio: pestaña + streams remotos + mic de la mesa. */
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      const dest = ctx.createMediaStreamDestination();

      const tabAudio = display.getAudioTracks();
      if (tabAudio.length > 0) {
        try {
          ctx
            .createMediaStreamSource(new MediaStream(tabAudio))
            .connect(dest);
        } catch {
          /* ignore */
        }
      }

      for (const s of streamsRef.current) {
        const tracks = s
          .getAudioTracks()
          .filter((t) => t.enabled && t.readyState === "live");
        if (tracks.length === 0) continue;
        try {
          ctx
            .createMediaStreamSource(new MediaStream(tracks))
            .connect(dest);
        } catch {
          /* ignore */
        }
      }

      try {
        const mic = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
          video: false,
        });
        micRef.current = mic;
        ctx.createMediaStreamSource(mic).connect(dest);
      } catch {
        /* sin mic: sigue con audio de pestaña / remotos */
      }

      /* 3) Stream final = video de la pestaña + audio mezclado. */
      const out = new MediaStream();
      out.addTrack(videoTrack);
      const audioOut = dest.stream.getAudioTracks();
      if (audioOut.length > 0) {
        for (const t of audioOut) out.addTrack(t);
      } else if (tabAudio[0]) {
        out.addTrack(tabAudio[0]);
      }

      const mimeCandidates = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ];
      const mime =
        mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";

      const rec = new MediaRecorder(
        out,
        mime
          ? { mimeType: mime, videoBitsPerSecond: 2_500_000 }
          : { videoBitsPerSecond: 2_500_000 },
      );
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.start(2000);
      recorderRef.current = rec;
      setStartedAt(Date.now());
      setElapsed(0);
      setGrabando(true);
    } catch (e) {
      await detener({ asambleaId }).catch(() => {});
      await stopLocal();
      setGrabando(false);
      setStartedAt(null);
      const name = e instanceof Error ? e.name : "";
      if (name === "NotAllowedError") {
        setError(
          "Permiso denegado. Elige esta pestaña de Vekino y marca «Compartir audio».",
        );
      } else {
        setError(
          e instanceof Error ? e.message : "No se pudo iniciar la grabación.",
        );
      }
    }
  }, [asambleaId, iniciar, detener, stopLocal, stop]);

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      displayRef.current?.getTracks().forEach((t) => t.stop());
      micRef.current?.getTracks().forEach((t) => t.stop());
      void audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  return { grabando, error, elapsed, start, stop, setError };
}

export function formatearElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) {
    return `${hh}:${mm.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`;
  }
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}
