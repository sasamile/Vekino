import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Botón de la landing. Cuatro variantes y nada más: cualquier CTA nuevo se
 * resuelve con una de estas.
 *
 * Radio medio a propósito (10 px). El sistema no usa botones pastilla salvo
 * en badges: la esquina redonda pero recta es parte de la identidad.
 */

type Variante = "primary" | "secondary" | "dark" | "ghost";
type Tamano = "md" | "lg";

const BASE = cn(
  "group inline-flex items-center justify-center gap-2 rounded-btn",
  "font-semibold whitespace-nowrap",
  "transition-[transform,background-color,border-color,box-shadow] duration-200 ease-out",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
  "focus-visible:outline-brand-500",
  "active:translate-y-0 active:scale-[0.985]",
  "motion-reduce:transform-none motion-reduce:transition-none",
  "disabled:pointer-events-none disabled:opacity-60",
);

const VARIANTES: Record<Variante, string> = {
  primary: cn(
    "bg-brand-500 text-white shadow-brand",
    "hover:-translate-y-0.5 hover:bg-brand-600 hover:shadow-[0_12px_26px_rgb(255_90_10/0.34)]",
  ),
  secondary: cn(
    "border border-line-strong bg-surface text-heading shadow-[0_1px_2px_rgb(20_20_20/0.04)]",
    "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card",
  ),
  dark: cn(
    "bg-heading text-white",
    "hover:-translate-y-0.5 hover:bg-carbon hover:shadow-[0_10px_24px_rgb(20_20_20/0.18)]",
  ),
  ghost: "text-body hover:bg-[#f4f4f1] hover:text-heading",
};

const TAMANOS: Record<Tamano, string> = {
  // 44 px de alto: el mínimo táctil accesible.
  md: "h-11 px-5 text-[14px]",
  lg: "h-12 px-7 text-[15px]",
};

type Comun = {
  variant?: Variante;
  size?: Tamano;
  className?: string;
  children: React.ReactNode;
};

export function LpButton({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: Comun & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(BASE, VARIANTES[variant], TAMANOS[size], className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export function LpLinkButton({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: Comun & { href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const clases = cn(BASE, VARIANTES[variant], TAMANOS[size], className);

  /* Anclas y enlaces externos van con <a>: `next/link` solo aporta en rutas
   * internas y prefetch sobre `#seccion` no significa nada. */
  if (
    href.startsWith("#") ||
    href.startsWith("mailto:") ||
    href.startsWith("http")
  ) {
    return (
      <a href={href} className={clases} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={clases} {...rest}>
      {children}
    </Link>
  );
}
