"use client";

import { Radio, WifiOff } from "lucide-react";
import type { Id } from "@vekino/backend/dataModel";
import { useSalaLatido } from "@/hooks/use-sala-latido";
import { cn } from "@/lib/utils";

/**
 * Chip de estado de conexión para el residente, y el que enciende el latido.
 *
 * Va montado en la pantalla de la asamblea: mientras esté en pantalla, la
 * persona cuenta como presente. El indicador no es decoración — cuando la
 * asamblea exige conexión para votar, es lo único que le dice a alguien por
 * qué el botón de votar dejó de funcionar.
 */
export function IndicadorSala({
  asambleaId,
  className,
}: {
  asambleaId: Id<"asambleas">;
  className?: string;
}) {
  const sala = useSalaLatido(asambleaId);

  // Fuera de asamblea en curso, o sin asistencia marcada, no hay nada que decir.
  if (sala.cargando || !sala.enCurso || !sala.registrado) return null;

  const conectado = sala.conectado;

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
          Reconectando…
        </>
      )}
    </div>
  );
}
