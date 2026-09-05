"use client";

import { AlertTriangle, Car, Flag, FlagOff, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

type Hito = {
  en: number;
  tipo: "inicio" | "novedad" | "vehiculo" | "evento" | "cierre";
  titulo: string;
  detalle?: string | null;
  quien?: string | null;
  fotos?: number;
};

const ICONO = {
  inicio: Flag,
  novedad: AlertTriangle,
  vehiculo: Car,
  evento: ListChecks,
  cierre: FlagOff,
} as const;

const COLOR = {
  inicio: "bg-brand text-brand-foreground",
  novedad: "bg-amber-500 text-white",
  vehiculo: "bg-sky-500 text-white",
  evento: "bg-muted text-muted-foreground",
  cierre: "bg-foreground text-background",
} as const;

/**
 * La ronda contada en orden.
 *
 * Cada fila dice qué pasó, quién lo registró y a qué hora, que es exactamente
 * lo que la administración necesita para responder por un turno.
 */
export function LineaDeTiempo({ hitos }: { hitos: Hito[] }) {
  return (
    <ol className="space-y-0">
      {hitos.map((h, i) => {
        const Icono = ICONO[h.tipo];
        const ultimo = i === hitos.length - 1;
        return (
          <li key={`${h.en}-${i}`} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                  COLOR[h.tipo],
                )}
              >
                <Icono className="h-3.5 w-3.5" />
              </span>
              {/* El hilo une un hito con el siguiente; el último no lo lleva
                  para que la línea no quede colgando en el vacío. */}
              {!ultimo && <span className="w-px flex-1 bg-border" />}
            </div>
            <div className={cn("min-w-0 flex-1", ultimo ? "pb-0" : "pb-4")}>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <time className="font-mono text-xs tabular-nums text-muted-foreground">
                  {new Date(h.en).toLocaleTimeString("es-CO", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
                <p className="text-[13px] font-medium text-foreground">{h.titulo}</p>
              </div>
              {h.detalle && (
                <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">
                  {h.detalle}
                </p>
              )}
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                {h.quien && <span>{h.quien}</span>}
                {!!h.fotos && (
                  <span>
                    {h.fotos} {h.fotos === 1 ? "foto" : "fotos"}
                  </span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
