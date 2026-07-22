"use client";

import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

const MES_LARGO = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function formatPeriodoLabel(periodo: string) {
  const [y, m] = periodo.split("-");
  const mes = MES_LARGO[Number(m) - 1] ?? m;
  return `${mes} ${y}`;
}

export function PeriodoSelect({
  value,
  options,
  onChange,
  className,
  disabled,
}: {
  value: string | null;
  options: string[];
  onChange: (periodo: string) => void;
  className?: string;
  disabled?: boolean;
}) {
  if (options.length === 0) {
    return (
      <span className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-muted/40 px-3 text-[12.5px] text-muted-foreground">
        <CalendarDays className="h-3.5 w-3.5" aria-hidden />
        Sin períodos
      </span>
    );
  }

  return (
    <label
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 text-[12.5px] shadow-soft",
        className,
      )}
    >
      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <select
        value={value ?? options[0]}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-40 cursor-pointer bg-transparent font-medium text-foreground outline-none disabled:opacity-50"
        aria-label="Período"
      >
        {options.map((p) => (
          <option key={p} value={p}>
            {formatPeriodoLabel(p)}
          </option>
        ))}
      </select>
    </label>
  );
}
