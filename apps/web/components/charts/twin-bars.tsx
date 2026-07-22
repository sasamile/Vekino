"use client";

import { useState } from "react";
import { cn, cop } from "@/lib/utils";

export type TwinBarPoint = {
  label: string;
  recaudo: number;
  vencida: number;
};

/**
 * Barras gemelas: Recaudo = brand · Cartera = lima #B1D459.
 * Tooltip al pasar el cursor sobre cada mes.
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

  return (
    <div
      className={cn("relative mt-4.5", className)}
      onMouseLeave={() => setHover(null)}
    >
      <div className="mb-2 flex min-h-14 items-end justify-center">
        {active ? (
          <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-floating">
            <p className="mb-1.5 text-center font-medium text-foreground">{active.label}</p>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-6">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                  Recaudo
                </span>
                <span className="font-semibold tabular-nums text-foreground">
                  {cop(active.recaudo)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-6">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#B1D459]" />
                  Vencida
                </span>
                <span className="font-semibold tabular-nums text-foreground">
                  {cop(active.vencida)}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="relative flex h-47.5 items-end gap-4.5 px-1">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-1 inset-y-0 bg-[repeating-linear-gradient(to_top,hsl(var(--border)/0.7)_0,hsl(var(--border)/0.7)_1px,transparent_1px,transparent_38px)]"
        />
        {data.map((d, i) => (
          <div
            key={d.label}
            className="relative z-1 flex h-full flex-1 cursor-pointer items-end gap-0.75"
            onMouseEnter={() => setHover(i)}
          >
            <div
              className="flex-1 rounded-t-md rounded-b-sm bg-linear-to-b from-brand/50 to-brand"
              style={{ height: `${Math.max(4, (d.recaudo / max) * 100)}%` }}
            />
            <div
              className="flex-1 rounded-t-md rounded-b-sm bg-linear-to-b from-[#c9e07a] to-[#B1D459]"
              style={{ height: `${Math.max(4, (d.vencida / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-4.5 px-1 pt-2">
        {data.map((d) => (
          <span
            key={d.label}
            className="flex-1 text-center text-[11px] text-muted-foreground"
          >
            {d.label}
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-sm bg-brand" />
          Recaudo
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-sm bg-[#B1D459]" />
          Cartera vencida
        </div>
      </div>
    </div>
  );
}
