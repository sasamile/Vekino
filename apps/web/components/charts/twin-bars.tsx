"use client";

import { useState } from "react";
import { cn, cop } from "@/lib/utils";

export type TwinBarPoint = {
  label: string;
  recaudo: number;
  vencida: number;
};

function compact(n: number) {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `$${m >= 100 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return cop(n);
}

/**
 * Barras gemelas fáciles de leer: lo cobrado vs lo que falta por mes.
 */
export function TwinBars({
  data,
  className,
}: {
  data: TwinBarPoint[];
  className?: string;
}) {
  const max = Math.max(1, ...data.flatMap((d) => [d.recaudo, d.vencida]));
  const [hover, setHover] = useState<number | null>(null);
  const active = hover != null ? data[hover] : null;

  const ticks = [1, 0.5, 0].map((f) => ({
    f,
    label: compact(max * f),
    top: `${(1 - f) * 100}%`,
  }));

  return (
    <div className={cn("w-full", className)} onMouseLeave={() => setHover(null)}>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-brand" />
          Recaudado
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-muted-foreground/30" />
          Por cobrar
        </span>
      </div>

      {active ? (
        <div className="mb-3 rounded-xl border border-border/70 bg-muted/30 px-3.5 py-2.5 text-sm">
          <p className="mb-1.5 text-[12px] font-medium text-foreground">
            {active.label}
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
            <span className="tabular-nums text-foreground">
              <span className="text-muted-foreground">Recaudado · </span>
              <span className="font-semibold">{cop(active.recaudo)}</span>
            </span>
            <span className="tabular-nums text-foreground">
              <span className="text-muted-foreground">Por cobrar · </span>
              <span className="font-semibold">{cop(active.vencida)}</span>
            </span>
          </div>
        </div>
      ) : (
        <div className="mb-3 rounded-xl border border-transparent px-3.5 py-2.5 text-[12.5px] text-muted-foreground">
          Toca un mes para ver el detalle en pesos
        </div>
      )}

      <div className="relative flex gap-2">
        <div className="relative w-10 shrink-0 self-stretch">
          {ticks.map((t) => (
            <span
              key={t.f}
              className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
              style={{ top: t.top }}
            >
              {t.label}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-0">
            {ticks.map((t) => (
              <div
                key={t.f}
                className="absolute inset-x-0 border-t border-dashed border-border/70"
                style={{ top: t.top }}
              />
            ))}
          </div>

          <div className="relative flex h-48 items-end gap-2 sm:gap-3">
            {data.map((d, i) => {
              const isActive = hover === i;
              return (
                <button
                  key={d.label}
                  type="button"
                  className={cn(
                    "relative z-1 flex h-full min-w-0 flex-1 flex-col justify-end rounded-lg outline-none transition-opacity",
                    hover != null && !isActive && "opacity-45",
                  )}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  aria-label={`${d.label}: recaudado ${cop(d.recaudo)}, por cobrar ${cop(d.vencida)}`}
                >
                  <div className="flex h-full w-full items-end justify-center gap-1">
                    <div
                      className="w-[42%] max-w-8 rounded-t-md bg-brand"
                      style={{
                        height: `${Math.max(6, (d.recaudo / max) * 100)}%`,
                      }}
                    />
                    <div
                      className="w-[42%] max-w-8 rounded-t-md bg-muted-foreground/30"
                      style={{
                        height: `${Math.max(6, (d.vencida / max) * 100)}%`,
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex gap-2 sm:gap-3">
            {data.map((d, i) => (
              <span
                key={d.label}
                className={cn(
                  "min-w-0 flex-1 text-center text-[11px] tabular-nums",
                  hover === i
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {d.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
