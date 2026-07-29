"use client";

import Link from "next/link";
import { useRef } from "react";
import { gsap, useGSAP, MOTION } from "@/lib/gsap";
import { cn } from "@/lib/utils";

type Props = {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "ghost" | "light";
  className?: string;
  /** Desactiva el imán (móvil / táctil). */
  magnetic?: boolean;
};

const VARIANTS = {
  primary:
    "bg-flame text-white hover:bg-[#e04d06] focus-visible:outline-flame",
  ghost:
    "border border-ink/15 text-ink hover:border-ink/35 hover:bg-ink/[0.03] focus-visible:outline-ink",
  light:
    "border border-white/20 text-white hover:border-white/45 hover:bg-white/10 focus-visible:outline-white",
} as const;

/**
 * Botón con imán de 6 px máximo. El movimiento vive en un span interior para
 * que el área clicable (y el foco de teclado) nunca se desplace.
 */
export function MagneticButton({
  href,
  children,
  variant = "primary",
  className,
  magnetic = true,
}: Props) {
  const root = useRef<HTMLAnchorElement>(null);
  const inner = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      if (!magnetic) return;
      // Sin imán en táctil ni con movimiento reducido.
      const fine = window.matchMedia("(pointer: fine)").matches;
      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (!fine || reduce) return;

      const el = root.current;
      const move = inner.current;
      if (!el || !move) return;

      const setX = gsap.quickTo(move, "x", { duration: 0.4, ease: "power3.out" });
      const setY = gsap.quickTo(move, "y", { duration: 0.4, ease: "power3.out" });

      function onMove(e: PointerEvent) {
        const r = el!.getBoundingClientRect();
        // Desplazamiento acotado a 6 px en cada eje.
        setX(gsap.utils.clamp(-6, 6, (e.clientX - (r.left + r.width / 2)) * 0.3));
        setY(gsap.utils.clamp(-6, 6, (e.clientY - (r.top + r.height / 2)) * 0.3));
      }
      function onLeave() {
        setX(0);
        setY(0);
      }

      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerleave", onLeave);
      return () => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerleave", onLeave);
      };
    },
    { scope: root, dependencies: [magnetic] },
  );

  return (
    <Link
      ref={root}
      href={href}
      className={cn(
        "group inline-flex h-14 items-center justify-center rounded-pill px-8 text-[15px] font-semibold transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        "active:scale-[0.98] motion-reduce:active:scale-100",
        VARIANTS[variant],
        className,
      )}
    >
      <span ref={inner} className="inline-flex items-center gap-2">
        {children}
      </span>
    </Link>
  );
}
