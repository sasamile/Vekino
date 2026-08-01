"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Gavel,
  KeyRound,
  Quote,
  ShieldCheck,
  Users,
} from "lucide-react";
import { SectionBadge } from "./ui/badge";
import { Reveal } from "./ui/reveal";
import { cn } from "@/lib/utils";

/* ⚠️ CONTENIDO DE EJEMPLO. No corresponde a personas reales y no debe
 * publicarse como testimonio verificado. Los avatares son íconos del ROL, no
 * retratos: inventar caras para citas ficticias las haría pasar por reales.
 * Reemplazar cuando existan testimonios con autorización de uso. */
const TESTIMONIOS = [
  {
    texto:
      "La información del conjunto dejó de estar repartida entre correos, carpetas y el chat de vecinos. Ahora todo está en un solo sitio.",
    rol: "Administración",
    icon: Building2,
  },
  {
    texto:
      "Autorizar una visita desde el celular y que la portería la vea al instante cambió por completo la entrada al conjunto.",
    rol: "Residente",
    icon: Users,
  },
  {
    texto:
      "Cada ingreso queda con su hora, su unidad y quién lo autorizó. Tenemos trazabilidad real de lo que pasa en portería.",
    rol: "Vigilancia",
    icon: ShieldCheck,
  },
  {
    texto:
      "Los comunicados llegan y se puede ver quién los leyó. Se acabó el 'no me enteré' antes de cada asamblea.",
    rol: "Consejo de administración",
    icon: Gavel,
  },
  {
    texto:
      "Consultar el estado de cuenta y descargar el recibo toma segundos, sin llamar a la administración.",
    rol: "Propietario",
    icon: KeyRound,
  },
];

export function TestimonialsCarousel() {
  const rail = useRef<HTMLUListElement>(null);
  const [alInicio, setAlInicio] = useState(true);
  const [alFinal, setAlFinal] = useState(false);

  /* Los botones se deshabilitan en los extremos. Sin esto, la flecha sigue
   * activa cuando ya no hay a dónde ir y el usuario cree que está rota. */
  const evaluar = useCallback(() => {
    const el = rail.current;
    if (!el) return;
    setAlInicio(el.scrollLeft < 8);
    setAlFinal(el.scrollLeft + el.clientWidth >= el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    evaluar();
    el.addEventListener("scroll", evaluar, { passive: true });
    window.addEventListener("resize", evaluar);
    return () => {
      el.removeEventListener("scroll", evaluar);
      window.removeEventListener("resize", evaluar);
    };
  }, [evaluar]);

  function mover(dir: -1 | 1) {
    const el = rail.current;
    if (!el) return;
    // Un "paso" = el ancho de una tarjeta visible.
    el.scrollBy({ left: dir * (el.clientWidth / 2 + 10), behavior: "smooth" });
  }

  return (
    <section className="lp-section">
      <div className="lp-container">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <SectionBadge>Testimonios</SectionBadge>
              <h2 className="mt-5 max-w-[18ch] text-[clamp(1.95rem,3.6vw,2.85rem)] font-[660] leading-[1.05] tracking-[-0.03em] text-heading">
                Lo que cambia en el{" "}
                <span className="text-brand-500">día a día</span>
              </h2>
            </div>

            <div className="flex gap-2">
              {[
                {
                  dir: -1 as const,
                  Icon: ArrowLeft,
                  label: "Anterior",
                  off: alInicio,
                },
                {
                  dir: 1 as const,
                  Icon: ArrowRight,
                  label: "Siguiente",
                  off: alFinal,
                },
              ].map(({ dir, Icon, label, off }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => mover(dir)}
                  disabled={off}
                  aria-label={`${label} testimonio`}
                  className="flex h-11 w-11 items-center justify-center rounded-btn border border-line bg-surface text-heading transition-colors hover:border-line-strong hover:bg-[#f4f4f1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-surface"
                >
                  <Icon
                    className="h-[17px] w-[17px]"
                    strokeWidth={1.8}
                    aria-hidden
                  />
                </button>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <ul
            ref={rail}
            className="lp-rail mt-10 gap-4"
            tabIndex={0}
            aria-label="Testimonios de ejemplo"
          >
            {TESTIMONIOS.map((t, i) => (
              <li
                key={i}
                className="w-[86%] shrink-0 sm:w-[62%] lg:w-[calc(50%-8px)]"
              >
                <figure className="lp-card-hover relative flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface p-6 shadow-card sm:p-7">
                  {/* Adorno de esquina: cuarto de círculo durazno */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand-50"
                  />

                  <Quote
                    className="relative h-7 w-7 text-brand-200"
                    strokeWidth={1.6}
                    aria-hidden
                  />
                  <blockquote className="relative mt-4 flex-1 text-[16px] leading-[1.55] text-heading">
                    {t.texto}
                  </blockquote>

                  <figcaption className="relative mt-6 flex items-center gap-3 border-t border-dashed border-dash pt-5">
                    <span
                      aria-hidden
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50"
                    >
                      <t.icon
                        className="h-[18px] w-[18px] text-brand-500"
                        strokeWidth={1.8}
                      />
                    </span>
                    <span>
                      <span className="block text-[13.5px] font-semibold text-heading">
                        Testimonio de ejemplo
                      </span>
                      <span className="block text-[12.5px] text-subtle">
                        {t.rol}
                      </span>
                    </span>
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </Reveal>

        <p
          className={cn(
            "mt-6 text-center text-[11.5px] leading-relaxed text-placeholder",
          )}
        >
          Los testimonios mostrados son ejemplos ilustrativos y no se atribuyen
          a personas reales.
        </p>
      </div>
    </section>
  );
}
