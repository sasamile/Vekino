"use client";

import { useQuery } from "convex/react";
import { Radio, WifiOff } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { cn } from "@/lib/utils";

/**
 * Chip de estado de conexión en la ficha de la asamblea.
 *
 * Solo LEE `miSala`: no late. El latido vive únicamente dentro de `/sala`
 * (`useSalaLatido`). Si este chip también latiera, al salir de la sala y
 * volver a esta pantalla se reabrirían las sesiones y seguirías "en la sala"
 * sin estar adentro.
 */
export function IndicadorSala({
  asambleaId,
  className,
}: {
  asambleaId: Id<"asambleas">;
  className?: string;
}) {
  const sala = useQuery(api.asambleaSala.miSala, { asambleaId });

  if (sala === undefined || !sala?.enCurso || !sala.registrado) return null;

  const conectado = sala.unidadesConectadas > 0;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
        conectado
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-700",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      {conectado ? (
        <>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:hidden" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <Radio className="h-3.5 w-3.5" aria-hidden />
          En la sala
          {sala.unidades > 1 ? (
            <span className="text-emerald-600/80">
              · {sala.unidadesConectadas} de {sala.unidades} unidades
            </span>
          ) : null}
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5" aria-hidden />
          Fuera de la sala
        </>
      )}
    </div>
  );
}
