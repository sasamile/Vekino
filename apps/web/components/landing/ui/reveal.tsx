"use client";

import { cn } from "@/lib/utils";
import { useInView } from "./use-in-view";

/**
 * Entrada al viewport: opacidad 0 → 1 y 20 px de recorrido vertical.
 *
 * No usamos librería de animación: un `IntersectionObserver` por instancia
 * (ver `useInView`) y una transición CSS. Con `prefers-reduced-motion` el
 * CSS ya deja el estado final visible (globals.css), así que aquí no hace
 * falta ninguna rama extra.
 */
export function Reveal({
  children,
  delay = 0,
  immediate = false,
  as: Tag = "div",
  className,
}: {
  children: React.ReactNode;
  /** Retardo en milisegundos, para escalonar hermanos. */
  delay?: number;
  /**
   * Anima al montar en vez de esperar al scroll. Para el contenido que ya
   * está a la vista al cargar: si espera a un scroll que nunca llega, deja
   * un hueco en blanco al recargar la página.
   */
  immediate?: boolean;
  as?: "div" | "section" | "li" | "article" | "span" | "header";
  className?: string;
}) {
  const [ref, visible] = useInView<HTMLElement>("0px 0px -8% 0px", {
    immediate,
  });

  return (
    <Tag
      // @ts-expect-error — el ref es genérico sobre la etiqueta elegida.
      ref={ref}
      className={cn("lp-reveal", visible && "is-visible", className)}
      style={{ "--lp-delay": `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </Tag>
  );
}
