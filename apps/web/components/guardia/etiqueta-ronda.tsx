import { Footprints } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * DURANTE QUÉ RONDA PASÓ ESTE EVENTO.
 *
 * La minuta guarda `rondaId` desde que `logMinuta` lo engancha solo, y
 * `guardia.listMinuta` ya resuelve el número y la zona por ronda distinta.
 * Lo único que hacía falta era pintarlo igual en todas partes: la portería lo
 * mostraba y la supervisión no, así que el supervisor leía la misma minuta
 * sin saber en qué recorrido ocurrió cada cosa.
 *
 * `zona` es opcional a propósito. La portería está dentro de UN conjunto y con
 * el número le basta; quien supervisa varios necesita que la ronda se nombre
 * entera —"Ronda #2 · Perimetral"— para saber de cuál se habla.
 *
 * Sin ronda no pinta nada: la mayoría de los eventos de portería ocurren fuera
 * de un recorrido y ausencia no es error.
 */
export function EtiquetaRonda({
  numero,
  zona,
  className,
}: {
  numero?: number | null;
  zona?: string | null;
  className?: string;
}) {
  if (numero == null && !zona) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded bg-brand/10 px-1.5 py-0.5 text-[11px] font-medium text-brand",
        className,
      )}
    >
      <Footprints className="h-3 w-3" aria-hidden />
      Ronda
      {numero != null && ` #${numero}`}
      {zona && ` · ${zona}`}
    </span>
  );
}
