"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Devuelve `true` la primera vez que el elemento entra en pantalla, y ahí se
 * queda: las animaciones de la landing ocurren una sola vez, no se reinician
 * al volver a subir.
 *
 * El observer se desconecta al disparar. La landing tiene decenas de piezas
 * animadas y mantenerlas todas observando cuesta scroll.
 *
 * `threshold: 0` a propósito: basta con que asome UN píxel. Con un umbral
 * por porcentaje del elemento, una pieza alta —la vista del panel del hero,
 * por ejemplo— podía estar ya a la vista al cargar sin llegar al porcentaje,
 * y se quedaba invisible hasta que el usuario bajaba. Un hueco en blanco al
 * recargar.
 *
 * Dos salidas rápidas —sin `IntersectionObserver` y con la pestaña en
 * segundo plano— devuelven `true` de entrada. La regla es la misma en toda
 * la landing: el contenido NUNCA puede quedarse invisible o en cero porque
 * una animación no llegó a correr.
 */
/* El genérico se ata a `Element` y no a `HTMLElement`: varias gráficas
 * observan directamente su `<svg>`, que no es un `HTMLElement`. */
export function useInView<T extends Element>(
  margen = "0px 0px -8% 0px",
  { immediate = false }: { immediate?: boolean } = {},
) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    /* `immediate` es para lo que está sobre la línea de flotación: anima al
     * montar, sin esperar a un scroll que quizá nunca ocurra. */
    if (
      immediate ||
      typeof IntersectionObserver === "undefined" ||
      document.hidden
    ) {
      setInView(true);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setInView(true);
        io.disconnect();
      },
      { rootMargin: margen, threshold: 0 },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [margen, immediate]);

  return [ref, inView] as const;
}

/** `true` si la persona pidió reducir el movimiento del sistema. */
export function prefiereMenosMovimiento() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
