"use client";

import { cn } from "@/lib/utils";
import { useInView } from "./use-in-view";

/**
 * Gráficas de la landing, en SVG a mano.
 *
 * No usamos una librería: son piezas decorativas con datos fijos, y una
 * dependencia de charts pesa más que estos 200 kB de nada. Además, así la
 * paleta queda cerrada — naranja, durazno, amarillo cálido y gris; verde
 * solo para indicadores positivos — que es justo lo que pide el sistema.
 *
 * ── Animación ──────────────────────────────────────────────────────────
 * Todas se dibujan cuando entran en pantalla, no al cargar la página: una
 * gráfica que ya terminó su animación antes de que la vieras es una
 * animación desperdiciada. Todo con transiciones CSS sobre propiedades
 * baratas (`transform`, `stroke-dasharray`, `opacity`); el estado inicial y
 * el final salen del mismo render, así que con `prefers-reduced-motion` la
 * transición se anula (globals.css) y el dato aparece completo.
 *
 * Las líneas usan el truco de `pathLength="1"`: normaliza la longitud del
 * trazo a 1 y permite animar el dibujado sin medir el path en JavaScript.
 *
 * Todas son `aria-hidden`: el dato que comunican va siempre escrito al lado
 * en texto real. Una gráfica decorativa que anuncia coordenadas a un lector
 * de pantalla es ruido.
 */

const SERIE = {
  fuerte: "var(--color-brand-500)",
  suave: "var(--color-brand-200)",
} as const;

const AMARILLO = "#ffd79a";
const GRIS = "var(--color-line-strong)";

/** Curva suave de entrada, compartida por todas las gráficas. */
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

/* ── Barras ──────────────────────────────────────────────────────────────
 * Esquinas superiores redondeadas, separación generosa y cuadrícula muy
 * tenue. Dos series como máximo. Cada barra crece desde su base con un
 * retardo escalonado. */
export function BarChart({
  data,
  height = 132,
  className,
}: {
  data: { label: string; a: number; b?: number }[];
  height?: number;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const max = Math.max(...data.flatMap((d) => [d.a, d.b ?? 0])) || 1;
  const doble = data.some((d) => d.b !== undefined);

  function barra(valor: number, delay: number, color: string) {
    return (
      <span
        className="w-full max-w-[14px] rounded-t-[4px] origin-bottom transition-transform duration-[900ms] motion-reduce:transition-none"
        style={{
          height: `${Math.max(4, (valor / max) * 100)}%`,
          background: color,
          transform: inView ? "scaleY(1)" : "scaleY(0)",
          transitionDelay: `${delay}ms`,
          transitionTimingFunction: EASE,
        }}
      />
    );
  }

  return (
    <div ref={ref} className={cn("w-full", className)}>
      <div
        aria-hidden
        className="relative flex items-end justify-between gap-2"
        style={{ height }}
      >
        {/* Cuadrícula: tres líneas apenas visibles */}
        {[0, 0.5, 1].map((p) => (
          <span
            key={p}
            className="absolute inset-x-0 border-t border-dashed border-line"
            style={{ bottom: `${p * 100}%` }}
          />
        ))}

        {data.map((d, i) => (
          <div
            key={d.label}
            className="relative flex h-full flex-1 items-end justify-center gap-[3px]"
          >
            {barra(d.a, i * 70, SERIE.fuerte)}
            {doble ? barra(d.b ?? 0, i * 70 + 40, SERIE.suave) : null}
          </div>
        ))}
      </div>

      <div aria-hidden className="mt-2 flex justify-between gap-2">
        {data.map((d) => (
          <span
            key={d.label}
            className="flex-1 text-center text-[10px] font-medium text-subtle"
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Línea con área ──────────────────────────────────────────────────────
 * Curva suave (Catmull-Rom convertida a Bézier), área inferior degradada y
 * punto activo naranja al final. */
function curva(puntos: { x: number; y: number }[]) {
  if (puntos.length < 2) return "";
  let d = `M ${puntos[0]!.x} ${puntos[0]!.y}`;

  for (let i = 0; i < puntos.length - 1; i++) {
    const p0 = puntos[i - 1] ?? puntos[i]!;
    const p1 = puntos[i]!;
    const p2 = puntos[i + 1]!;
    const p3 = puntos[i + 2] ?? p2;

    // Tensión 1/6: la curva pasa por los puntos sin sobrepasarlos.
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function AreaLine({
  values,
  id,
  height = 96,
  className,
}: {
  values: number[];
  /** Identificador único del degradado dentro del documento. */
  id: string;
  height?: number;
  className?: string;
}) {
  const [ref, inView] = useInView<SVGSVGElement>();
  const W = 300;
  const H = height;
  const pad = 8;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const rango = max - min || 1;

  const puntos = values.map((v, i) => ({
    x: +((i / (values.length - 1)) * (W - pad * 2) + pad).toFixed(2),
    y: +(H - pad - ((v - min) / rango) * (H - pad * 2.4)).toFixed(2),
  }));

  const linea = curva(puntos);
  const area = `${linea} L ${puntos[puntos.length - 1]!.x} ${H} L ${puntos[0]!.x} ${H} Z`;
  const ultimo = puntos[puntos.length - 1]!;

  return (
    <svg
      ref={ref}
      aria-hidden
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cn("w-full", className)}
      style={{ height }}
    >
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            stopColor="var(--color-brand-500)"
            stopOpacity="0.16"
          />
          <stop
            offset="100%"
            stopColor="var(--color-brand-500)"
            stopOpacity="0"
          />
        </linearGradient>
      </defs>

      {/* Cuadrícula horizontal muy suave */}
      {[0.25, 0.6].map((p) => (
        <line
          key={p}
          x1="0"
          x2={W}
          y1={H * p}
          y2={H * p}
          stroke="var(--color-line)"
          strokeWidth="1"
          strokeDasharray="3 4"
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {/* El área aparece detrás, ya dibujado el trazo */}
      <path
        d={area}
        fill={`url(#${id}-fill)`}
        className="transition-opacity duration-700 motion-reduce:transition-none"
        style={{ opacity: inView ? 1 : 0, transitionDelay: "320ms" }}
      />

      {/* pathLength=1 normaliza el trazo: el dibujado no depende de su largo real */}
      <path
        d={linea}
        fill="none"
        stroke="var(--color-brand-500)"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        pathLength={1}
        strokeDasharray={1}
        className="transition-[stroke-dashoffset] duration-[1100ms] motion-reduce:transition-none"
        style={{
          strokeDashoffset: inView ? 0 : 1,
          transitionTimingFunction: EASE,
        }}
      />

      {/* Punto activo */}
      <g
        className="transition-opacity duration-300 motion-reduce:transition-none"
        style={{ opacity: inView ? 1 : 0, transitionDelay: "900ms" }}
      >
        <circle cx={ultimo.x} cy={ultimo.y} r="6" fill="white" />
        <circle
          cx={ultimo.x}
          cy={ultimo.y}
          r="3.4"
          fill="var(--color-brand-500)"
        />
      </g>
    </svg>
  );
}

/* ── Donut ───────────────────────────────────────────────────────────────
 * Segmento principal naranja, secundarios en durazno y gris. Número grande
 * en el centro. Los segmentos se dibujan en orden, uno tras otro. */
export function Donut({
  segments,
  center,
  label,
  size = 148,
  className,
}: {
  segments: { valor: number; color: string }[];
  center: React.ReactNode;
  label?: string;
  size?: number;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const R = 42;
  const C = 2 * Math.PI * R;
  const total = segments.reduce((s, x) => s + x.valor, 0) || 1;

  let acumulado = 0;

  return (
    <div
      ref={ref}
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        className="h-full w-full -rotate-90"
      >
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke="var(--color-line-soft)"
          strokeWidth="11"
        />
        {segments.map((s, i) => {
          const largo = (s.valor / total) * C;
          const offset = -(acumulado / total) * C;
          const retardo = (acumulado / total) * 700;
          acumulado += s.valor;
          return (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth="11"
              strokeLinecap="butt"
              strokeDashoffset={offset.toFixed(2)}
              className="transition-[stroke-dasharray] duration-700 motion-reduce:transition-none"
              style={{
                strokeDasharray: inView
                  ? `${largo.toFixed(2)} ${(C - largo).toFixed(2)}`
                  : `0 ${C.toFixed(2)}`,
                transitionDelay: `${Math.round(retardo)}ms`,
                transitionTimingFunction: EASE,
              }}
            />
          );
        })}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[26px] font-semibold leading-none tracking-[-0.03em] text-heading">
          {center}
        </span>
        {label ? (
          <span className="mt-1 text-[11px] font-medium text-subtle">
            {label}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ── Gauge semicircular ──────────────────────────────────────────────────
 * Para el bloque visual de la sección de acordeón. */
export function Gauge({
  percent,
  center,
  label,
  className,
}: {
  percent: number;
  center: React.ReactNode;
  label?: string;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const R = 44;
  const semi = Math.PI * R;
  const avance = (Math.min(100, Math.max(0, percent)) / 100) * semi;

  return (
    <div ref={ref} className={cn("relative w-full max-w-[260px]", className)}>
      <svg aria-hidden viewBox="0 0 100 56" className="w-full">
        <path
          d={`M 6 50 A ${R} ${R} 0 0 1 94 50`}
          fill="none"
          stroke="var(--color-line-soft)"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <path
          d={`M 6 50 A ${R} ${R} 0 0 1 94 50`}
          fill="none"
          stroke="var(--color-brand-500)"
          strokeWidth="9"
          strokeLinecap="round"
          className="transition-[stroke-dasharray] duration-[1200ms] motion-reduce:transition-none"
          style={{
            strokeDasharray: inView
              ? `${avance.toFixed(2)} ${semi.toFixed(2)}`
              : `0 ${semi.toFixed(2)}`,
            transitionTimingFunction: EASE,
          }}
        />
      </svg>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <span className="text-[30px] font-semibold leading-none tracking-[-0.035em] text-heading">
          {center}
        </span>
        {label ? (
          <span className="mt-1 text-[11px] font-medium text-subtle">
            {label}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ── Sparkline ───────────────────────────────────────────────────────────
 * Micro-tendencia dentro de una tarjeta de métrica. */
export function Sparkline({
  values,
  color = "var(--color-brand-500)",
  className,
}: {
  values: number[];
  color?: string;
  className?: string;
}) {
  const [ref, inView] = useInView<SVGSVGElement>();
  const W = 72;
  const H = 24;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const rango = max - min || 1;

  const d = curva(
    values.map((v, i) => ({
      x: +((i / (values.length - 1)) * W).toFixed(2),
      y: +(H - 2 - ((v - min) / rango) * (H - 4)).toFixed(2),
    })),
  );

  return (
    <svg
      ref={ref}
      aria-hidden
      viewBox={`0 0 ${W} ${H}`}
      className={cn("h-6 w-[72px]", className)}
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        className="transition-[stroke-dashoffset] duration-[900ms] motion-reduce:transition-none"
        style={{
          strokeDashoffset: inView ? 0 : 1,
          transitionTimingFunction: EASE,
        }}
      />
    </svg>
  );
}

/* ── Leyenda ─────────────────────────────────────────────────────────────*/
export function LegendDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="h-2 w-2 shrink-0 rounded-full"
      style={{ background: color }}
    />
  );
}

export const CHART_COLORS = {
  brand: "var(--color-brand-500)",
  peach: "var(--color-brand-200)",
  amber: AMARILLO,
  gray: GRIS,
  green: "var(--color-ok)",
} as const;
