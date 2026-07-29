"use client";

import { useRef } from "react";
import { useGSAP, ScrollSmoother } from "@/lib/gsap";

/**
 * Scroll suave con ScrollSmoother — NO con Lenis.
 *
 * La diferencia es clave y ya nos quemó tres veces: Lenis intercepta la rueda
 * y anula la aceleración del trackpad de macOS, así que todo se siente lento
 * sin importar la configuración. ScrollSmoother no toca la rueda: el scroll
 * del navegador sigue siendo 100% nativo (misma velocidad, misma barra), y lo
 * que suaviza es el DIBUJO — traslada el contenido con `transform` hacia la
 * posición real con un pequeño retraso (`smooth` segundos de alcance).
 *
 * Resultado: velocidad nativa + la estética "líquida" de Lenis.
 *
 * Reglas del contenedor:
 * - Todo lo que scrollea vive dentro de #smooth-content.
 * - Los elementos `position: fixed` (navbar) van FUERA, porque dentro de un
 *   contenedor transformado `fixed` deja de funcionar.
 * - Nada de `position: sticky` dentro (hoy no usamos).
 */
export function SmoothViewport({ children }: { children: React.ReactNode }) {
  const wrapper = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!wrapper.current || !content.current) return;

    const smoother = ScrollSmoother.create({
      wrapper: wrapper.current,
      content: content.current,
      // Segundos que tarda el dibujo en alcanzar el scroll real.
      // 0.8 se nota claramente; subir a 1.2 lo hace más "líquido".
      smooth: 0.8,
      // Táctil: inercia nativa del sistema, sin doble suavizado.
      smoothTouch: false,
      // CRÍTICO: false = no interceptar la rueda. Aquí vive la diferencia
      // con Lenis; si esto se pone en true, vuelve la lentitud.
      normalizeScroll: false,
      effects: false,
    });

    return () => smoother.kill();
  });

  return (
    <div ref={wrapper}>
      <div ref={content}>{children}</div>
    </div>
  );
}
