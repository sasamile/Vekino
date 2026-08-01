import { cn } from "@/lib/utils";

/**
 * Etiqueta que antecede a cada título de sección: punto naranja, texto en
 * mayúsculas, borde gris fino sobre blanco. Formato pastilla.
 */
export function SectionBadge({
  children,
  className,
  tone = "light",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "light" | "dark";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-pill border px-[9px] py-[5px]",
        "text-[10px] font-semibold uppercase tracking-[0.04em]",
        tone === "dark"
          ? "border-white/15 bg-white/5 text-night-muted"
          : "border-line bg-surface text-subtle",
        className,
      )}
    >
      <span
        aria-hidden
        className="h-[7px] w-[7px] shrink-0 rounded-full bg-brand-500"
      />
      {children}
    </span>
  );
}

/**
 * Estado en tablas y tarjetas. Badge pequeño, nunca un bloque de color:
 * el punto acompaña al texto para no depender solo del color (WCAG 1.4.1).
 */
const ESTADOS = {
  ok: { punto: "bg-ok", caja: "bg-ok-soft text-[#1b8b4d] border-[#cdeedc]" },
  pendiente: {
    punto: "bg-brand-500",
    caja: "bg-brand-50 text-brand-700 border-brand-100",
  },
  aviso: {
    punto: "bg-warn",
    caja: "bg-warn-soft text-[#a56a10] border-[#f7e3c4]",
  },
  inactivo: {
    punto: "bg-placeholder",
    caja: "bg-[#f4f4f1] text-subtle border-line",
  },
  error: {
    punto: "bg-bad",
    caja: "bg-bad-soft text-[#a83f3f] border-[#f2d4d4]",
  },
} as const;

export type EstadoBadge = keyof typeof ESTADOS;

export function StatusBadge({
  estado,
  children,
  className,
}: {
  estado: EstadoBadge;
  children: React.ReactNode;
  className?: string;
}) {
  const e = ESTADOS[estado];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border px-2 py-[3px]",
        "text-[11px] font-semibold leading-none",
        e.caja,
        className,
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", e.punto)} />
      {children}
    </span>
  );
}

/**
 * Etiqueta decorativa que flota alrededor del titular del hero. Es adorno:
 * va oculta a lectores de pantalla y solo aparece cuando hay espacio.
 */
const TINTES = {
  brand: "text-brand-600 border-brand-200 bg-brand-50",
  violet: "text-[#6f52d6] border-[#ded4fb] bg-[#f6f3ff]",
  magenta: "text-[#c04bbf] border-[#f6d3f5] bg-[#fdf3fd]",
  lime: "text-[#1f8f4c] border-[#c9ecd6] bg-[#f0faf4]",
  indigo: "text-[#4a56cf] border-[#d4d8f8] bg-[#f3f4fe]",
} as const;

export function FloatingTag({
  children,
  tint = "brand",
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  tint?: keyof typeof TINTES;
  delay?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "lp-float pointer-events-none absolute z-10 inline-flex items-center gap-1.5",
        "rounded-pill border px-2.5 py-1 text-[11px] font-semibold",
        "shadow-[0_6px_18px_rgb(20_20_20/0.06)]",
        TINTES[tint],
        className,
      )}
      style={{ "--lp-delay": `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </span>
  );
}
