"use client";

import { useEffect, useState } from "react";

/** RMS por encima de esto cuenta como voz (afinable). */
const UMBRAL = 0.02;
/** Mantener el borde un instante tras el silencio, como Meet. */
const HOLD_MS = 350;

/**
 * Detecta si hay voz en un MediaStream (local o remoto).
 * No reproduce audio: solo analiza con AnalyserNode.
 */
export function useAudioHablando(
  stream: MediaStream | null | undefined,
  activo = true,
): boolean {
  const [hablando, setHablando] = useState(false);

  useEffect(() => {
    if (!stream || !activo) {
      setHablando(false);
      return;
    }

    const pistas = stream
      .getAudioTracks()
      .filter((t) => t.enabled && t.readyState === "live");
    if (pistas.length === 0) {
      setHablando(false);
      return;
    }

    const ctx = new AudioContext();
    const fuente = ctx.createMediaStreamSource(new MediaStream(pistas));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.4;
    fuente.connect(analyser);

    const datos = new Uint8Array(analyser.fftSize);
    let raf = 0;
    let ultimoHabla = 0;

    const tick = (ahora: number) => {
      analyser.getByteTimeDomainData(datos);
      let suma = 0;
      for (let i = 0; i < datos.length; i++) {
        const v = (datos[i]! - 128) / 128;
        suma += v * v;
      }
      const rms = Math.sqrt(suma / datos.length);
      if (rms > UMBRAL) {
        ultimoHabla = ahora;
        setHablando(true);
      } else if (ahora - ultimoHabla > HOLD_MS) {
        setHablando(false);
      }
      raf = requestAnimationFrame(tick);
    };

    void ctx.resume().catch(() => {});
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      fuente.disconnect();
      void ctx.close();
      setHablando(false);
    };
  }, [stream, activo]);

  return hablando;
}
