"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

/* Registro único de plugins. Importa SIEMPRE gsap desde aquí en la landing
 * para no registrar los plugins varias veces ni arrastrarlos al bundle de la
 * app administrativa. */
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText, useGSAP);
}

/** Duraciones y curvas compartidas: mantienen coherente el ritmo de la landing. */
export const MOTION = {
  micro: 0.3,
  enter: 0.7,
  title: 1,
  product: 1.4,
  ease: {
    enter: "power2.out",
    large: "power3.out",
    cinema: "power4.inOut",
    title: "expo.out",
    pop: "back.out(1.4)",
    loop: "sine.inOut",
  },
  stagger: {
    words: 0.04,
    cards: 0.1,
    icons: 0.06,
  },
} as const;

export const MEDIA = {
  desktop: "(min-width: 1024px)",
  tablet: "(min-width: 768px) and (max-width: 1023px)",
  mobile: "(max-width: 767px)",
  reduceMotion: "(prefers-reduced-motion: reduce)",
} as const;

/**
 * `requestAnimationFrame` no corre en pestañas ocultas, así que una timeline
 * creada ahí se congela en el frame 0 y el contenido queda invisible.
 * Cuando eso pasa, saltamos las animaciones de entrada al estado final.
 */
export function shouldSkipIntro() {
  return typeof document !== "undefined" && document.hidden;
}


/**
 * ScrollTrigger mide alturas al crear los triggers. Si las fuentes web cargan
 * después, todo queda desfasado. Llamar una vez desde el layout de la landing.
 */
export function refreshScrollTriggerWhenReady() {
  if (typeof document === "undefined") return;
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  window.addEventListener("load", () => ScrollTrigger.refresh(), { once: true });
}

export { gsap, ScrollTrigger, ScrollSmoother, SplitText, useGSAP };
