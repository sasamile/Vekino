import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "dark" | "frost";

/**
 * Card estilo iOS liquid glass: translúcida, blur, borde luminoso suave.
 * Respeta light / dark del tema.
 */
export function LiquidGlassCard({
  children,
  className,
  tone = "frost",
  href,
}: {
  children: ReactNode;
  className?: string;
  tone?: Tone;
  href?: string;
}) {
  const surface =
    tone === "dark"
      ? cn(
          "relative overflow-hidden rounded-2xl border border-white/15",
          "bg-linear-to-b from-white/12 to-white/5",
          "backdrop-blur-2xl backdrop-saturate-150",
          "shadow-[0_8px_32px_rgb(0_0_0/0.25)]",
          "text-white",
        )
      : cn(
          "relative overflow-hidden rounded-2xl",
          "border border-border/60",
          "bg-card/90",
          "backdrop-blur-2xl backdrop-saturate-150",
          "shadow-[inset_0_1px_0_0_rgb(255_255_255/0.9),0_4px_16px_rgb(15_23_42/0.04)]",
          "dark:border-white/[0.08] dark:bg-card/70",
          "dark:shadow-[inset_0_1px_0_0_rgb(255_255_255/0.04),0_4px_16px_rgb(0_0_0/0.25)]",
          "supports-backdrop-filter:bg-card/80 dark:supports-backdrop-filter:bg-card/55",
        );

  const shine =
    tone === "frost" ? (
      <>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-0 h-px bg-linear-to-r from-transparent via-white/80 to-transparent dark:via-white/10"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-12 z-0 h-28 w-28 rounded-full bg-white/40 blur-3xl dark:bg-white/[0.04]"
        />
      </>
    ) : null;

  const classes = cn(
    surface,
    href &&
      "transition-[transform,background-color] hover:bg-card dark:hover:bg-card/85",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {shine}
        <div className="relative z-1 contents">{children}</div>
      </Link>
    );
  }

  return (
    <div className={classes}>
      {shine}
      {children}
    </div>
  );
}
