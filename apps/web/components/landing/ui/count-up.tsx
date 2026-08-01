"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useInView, prefiereMenosMovimiento } from "./use-in-view";

/**
 * Número que cuenta desde 0 hasta su valor cuando entra en pantalla.
 *
 * El HTML renderiza SIEMPRE el valor final. Si no hay JavaScript, si la
 * pestaña está en segundo plano o si la persona pidió menos movimiento, el
 * dato correcto ya está ahí y no pasa nada más. La animación solo baja el
 * texto a 0 en `useLayoutEffect` —antes de pintar, sin parpadeo— y lo sube.
 *
 * El formato va en props sueltas (`prefix`, `suffix`, `grouped`) y no como
 * una función: casi todos los usos viven en componentes de servidor, y una
 * función no se puede pasar a un componente cliente.
 *
 * Escribimos sobre `textContent` en lugar de usar estado de React: son ~60
 * actualizaciones por segundo y un `setState` por frame re-renderiza la
 * tarjeta entera sin necesidad.
 */
export function CountUp({
  value,
  prefix = "",
  suffix = "",
  grouped = false,
  duration = 1300,
  className,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  /** Separador de miles en formato colombiano (18.450.000). */
  grouped?: boolean;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [medidor, inView] = useInView<HTMLSpanElement>();
  const anima = useRef(false);

  const escribir = (n: number) =>
    `${prefix}${grouped ? n.toLocaleString("es-CO") : n}${suffix}`;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || prefiereMenosMovimiento() || document.hidden) return;
    anima.current = true;
    el.textContent = escribir(0);
    // Solo al montar: bajar el texto a 0 antes del primer pintado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !inView || !anima.current) return;

    let raf = 0;
    let inicio = 0;

    function paso(t: number) {
      if (!inicio) inicio = t;
      const p = Math.min(1, (t - inicio) / duration);
      // easeOutCubic: arranca rápido y frena, que es como se lee un contador.
      const e = 1 - Math.pow(1 - p, 3);
      if (el) el.textContent = escribir(Math.round(value * e));
      if (p < 1) raf = requestAnimationFrame(paso);
    }

    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, value, duration, prefix, suffix, grouped]);

  return (
    <span
      ref={(nodo) => {
        ref.current = nodo;
        medidor.current = nodo;
      }}
      className={className}
    >
      {escribir(value)}
    </span>
  );
}
