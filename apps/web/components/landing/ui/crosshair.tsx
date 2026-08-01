import { cn } from "@/lib/utils";

/**
 * Cruz fina que marca dónde una línea punteada horizontal corta los rieles
 * verticales del marco. Es el detalle que hace que el marco se lea como una
 * retícula técnica y no como dos bordes sueltos.
 *
 * Se centra sola sobre el punto donde se coloca (`left-0 top-0` basta).
 * Puro adorno: siempre `aria-hidden`.
 */
export function Crosshair({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none relative block h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2",
        className,
      )}
    >
      <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-line-strong" />
      <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-line-strong" />
    </span>
  );
}

/**
 * Par de cruces alineadas a los rieles del marco, para colgar del borde
 * inferior (o superior) de un bloque a todo el ancho.
 */
export function CrosshairRow({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-x-0", className)}
    >
      <div className="lp-container relative h-0">
        <Crosshair className="absolute left-0 top-0" />
        <Crosshair className="absolute right-0 top-0" />
      </div>
    </div>
  );
}
