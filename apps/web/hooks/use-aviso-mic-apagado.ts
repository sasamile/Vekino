"use client";

import { useEffect, useRef, useState } from "react";

/** RMS por encima de esto cuenta como voz. Igual que `use-audio-hablando`. */
const UMBRAL = 0.02;
/** Hay que hablar este rato seguido para que avise: evita el falso positivo
 *  de una tos, una silla o un "ajá". */
const SOSTENIDO_MS = 1200;
/** El aviso se queda visible este rato tras callarse, para dar tiempo a leerlo. */
const VISIBLE_MS = 4000;

/**
 * Avisa a quien está hablando con el micrófono apagado.
 *
 * En la asamblea de Arboleda, cuatro de los cinco miembros de la mesa
 * hablaron con el micrófono en mute. Nadie los oyó y ellos no se enteraron:
 * en su pantalla todo se veía normal. Se perdieron minutos de reunión
 * buscando un fallo del servidor que no existía.
 *
 * Detectar voz con el micrófono apagado obliga a abrir una captura APARTE:
 * una pista silenciada no le entrega nada al analizador. Es un segundo
 * `getUserMedia` de solo audio, que se abre únicamente mientras la persona
 * puede hablar y tiene el micrófono cerrado — o sea, cinco o seis personas,
 * no las ciento setenta.
 */
export function useAvisoMicApagado(activo: boolean): boolean {
  const [avisar, setAvisar] = useState(false);
  const desdeRef = useRef<number | null>(null);
  const hastaRef = useRef<number>(0);

  useEffect(() => {
    if (!activo) {
      setAvisar(false);
      desdeRef.current = null;
      return;
    }

    let vivo = true;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        /* Sin permiso de micrófono no hay nada que avisar. */
        return;
      }
      if (!vivo) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      ctx = new AudioContext();
      const fuente = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      fuente.connect(analyser);
      const datos = new Float32Array(analyser.fftSize);

      const tick = () => {
        if (!vivo) return;
        analyser.getFloatTimeDomainData(datos);
        let suma = 0;
        for (let i = 0; i < datos.length; i++) suma += datos[i]! * datos[i]!;
        const rms = Math.sqrt(suma / datos.length);
        const ahora = Date.now();

        if (rms > UMBRAL) {
          desdeRef.current ??= ahora;
          if (ahora - desdeRef.current > SOSTENIDO_MS) {
            hastaRef.current = ahora + VISIBLE_MS;
          }
        } else {
          desdeRef.current = null;
        }

        setAvisar(ahora < hastaRef.current);
        raf = requestAnimationFrame(tick);
      };
      tick();
    })();

    return () => {
      vivo = false;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => {});
      setAvisar(false);
      desdeRef.current = null;
    };
  }, [activo]);

  return avisar;
}
