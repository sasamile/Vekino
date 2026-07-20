"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

export interface AreaPoint {
  label: string;
  value: number;
}

/**
 * Area chart SVG con curva suave + gradiente y tooltip al pasar el cursor.
 * Escala al ancho del contenedor vía viewBox. Theme-aware.
 */
export function AreaChart({
  data,
  color = "hsl(var(--brand))",
  height = 220,
  format = (n) => String(n),
  className,
}: {
  data: AreaPoint[];
  color?: string;
  height?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const gradId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const W = 640;
  const H = height;
  const padX = 16;
  const padTop = 24;
  const padBottom = 32;

  const n = data.length;
  const max = Math.max(1, ...data.map((d) => d.value));
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;

  const x = (i: number) => (n <= 1 ? W / 2 : padX + (i / (n - 1)) * innerW);
  const y = (v: number) => padTop + innerH - (v / max) * innerH;

  const points = data.map((d, i) => ({ x: x(i), y: y(d.value), ...d }));

  // Curva suave (Catmull-Rom → Bézier)
  const linePath = smoothPath(points.map((p) => [p.x, p.y]));
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1]!.x} ${padTop + innerH} L ${points[0]!.x} ${padTop + innerH} Z`
      : "";

  const active = hover != null ? points[hover] : null;

  return (
    <div className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height }}
        preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          let nearest = 0;
          let best = Infinity;
          points.forEach((p, i) => {
            const d = Math.abs(p.x - px);
            if (d < best) {
              best = d;
              nearest = i;
            }
          });
          setHover(nearest);
        }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Líneas guía horizontales */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={padX}
            x2={W - padX}
            y1={padTop + innerH * f}
            y2={padTop + innerH * f}
            stroke="hsl(var(--border))"
            strokeWidth={1}
            strokeDasharray="3 4"
          />
        ))}

        {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Guía + punto activo */}
        {active && (
          <>
            <line
              x1={active.x}
              x2={active.x}
              y1={padTop}
              y2={padTop + innerH}
              stroke="hsl(var(--border))"
              strokeWidth={1}
            />
            <circle cx={active.x} cy={active.y} r={5} fill={color} stroke="hsl(var(--card))" strokeWidth={2.5} />
          </>
        )}

        {/* Etiquetas eje X */}
        {points.map((p, i) => (
          <text
            key={i}
            x={p.x}
            y={H - 10}
            textAnchor="middle"
            className="fill-muted-foreground"
            style={{ fontSize: 11 }}
          >
            {p.label}
          </text>
        ))}
      </svg>

      {active && (
        <div className="mt-1 flex items-center justify-center gap-2 text-xs">
          <span className="font-medium text-foreground">{active.label}</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-semibold tabular-nums text-foreground">
            {format(active.value)}
          </span>
        </div>
      )}
    </div>
  );
}

/** Catmull-Rom → curva Bézier suave. Recibe puntos [x,y]. */
function smoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0]![0]} ${pts[0]![1]}`;
  const p = pts;
  let d = `M ${p[0]![0]} ${p[0]![1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i === 0 ? 0 : i - 1]!;
    const p1 = p[i]!;
    const p2 = p[i + 1]!;
    const p3 = p[i + 2 < p.length ? i + 2 : i + 1]!;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}
