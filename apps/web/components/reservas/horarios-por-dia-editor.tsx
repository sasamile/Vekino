"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  DIAS_SEMANA,
  porDiaStateToHorarios,
  type DiaHorarioEstado,
} from "./horarios-por-dia-utils";

export function HorariosPorDiaEditor({
  value,
  onChange,
  disabled,
  errorMessage,
}: {
  value: Record<number, DiaHorarioEstado>;
  onChange: (next: Record<number, DiaHorarioEstado>) => void;
  disabled?: boolean;
  errorMessage?: string;
}) {
  function setDia(dia: number, patch: Partial<DiaHorarioEstado>) {
    onChange({
      ...value,
      [dia]: { ...value[dia]!, ...patch },
    });
  }

  function activarRango(dias: number[], horaInicio: string, horaFin: string) {
    const next = { ...value };
    for (const d of dias) {
      next[d] = { activo: true, horaInicio, horaFin };
    }
    onChange(next);
  }

  const slots = porDiaStateToHorarios(value);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-xs"
          disabled={disabled}
          onClick={() => activarRango([0, 1, 2, 3, 4, 5, 6], "09:00", "22:00")}
        >
          Todos (9:00–22:00)
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-xs"
          disabled={disabled}
          onClick={() => activarRango([1, 2, 3, 4, 5], "08:00", "22:00")}
        >
          Lun–Vie ejemplo
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-xs"
          disabled={disabled}
          onClick={() => activarRango([6], "10:00", "22:00")}
        >
          Solo sábado ejemplo
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-xs"
          disabled={disabled}
          onClick={() => {
            const next = { ...value };
            for (let d = 0; d <= 6; d++) {
              next[d] = { ...next[d]!, activo: false };
            }
            onChange(next);
          }}
        >
          Limpiar días
        </Button>
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {DIAS_SEMANA.map(({ value: dia, label }) => {
          const row = value[dia]!;
          return (
            <div
              key={dia}
              className={cn(
                "flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4",
                !row.activo && "bg-muted/30",
              )}
            >
              <label className="flex min-w-36 cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={row.activo}
                  onChange={(e) => setDia(dia, { activo: e.target.checked })}
                  disabled={disabled}
                  className="size-4 rounded border-border accent-brand"
                />
                <span className="text-sm font-medium text-foreground">{label}</span>
              </label>
              <div className="grid flex-1 grid-cols-2 gap-3 sm:max-w-xs">
                <div className="space-y-1">
                  <span className="block text-[11px] text-muted-foreground">
                    Inicio
                  </span>
                  <Input
                    type="time"
                    value={row.horaInicio}
                    onChange={(e) => setDia(dia, { horaInicio: e.target.value })}
                    disabled={disabled || !row.activo}
                  />
                </div>
                <div className="space-y-1">
                  <span className="block text-[11px] text-muted-foreground">Fin</span>
                  <Input
                    type="time"
                    value={row.horaFin}
                    onChange={(e) => setDia(dia, { horaFin: e.target.value })}
                    disabled={disabled || !row.activo}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {errorMessage && (
        <p className="text-sm text-destructive">{errorMessage}</p>
      )}

      {slots.length > 0 && (
        <div className="rounded-xl bg-muted/60 p-3 text-sm">
          <p className="mb-2 font-medium text-foreground">Resumen</p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {slots.map((s) => (
              <li key={s.dia}>
                {DIAS_SEMANA.find((d) => d.value === s.dia)?.label}:{" "}
                {s.horaInicio} – {s.horaFin}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
