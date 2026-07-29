"use client";

import { Building2, Gavel, KeyRound, Quote, ShieldCheck, Users } from "lucide-react";
import { SectionLabel } from "./ui/section-label";
import { glass } from "./ui/glass";
import { cn } from "@/lib/utils";

/* ⚠️ CONTENIDO DE EJEMPLO. No corresponde a personas reales y no debe
 * publicarse como testimonio verificado. Los avatares son íconos del ROL, no
 * retratos: inventar caras para citas ficticias las haría pasar por reales.
 * Reemplazar cuando existan testimonios con autorización de uso. */
const TESTIMONIOS = [
  {
    texto:
      "Ahora la información del conjunto está organizada y disponible para todos.",
    rol: "Administración",
    icon: Building2,
    tint: "flame",
  },
  {
    texto:
      "Autorizar una visita desde el celular hace que el proceso sea mucho más sencillo.",
    rol: "Residente",
    icon: Users,
    tint: "sky",
  },
  {
    texto:
      "Tenemos mayor trazabilidad sobre los procesos que ocurren en portería.",
    rol: "Vigilancia",
    icon: ShieldCheck,
    tint: "violet",
  },
  {
    texto:
      "Los comunicados dejaron de perderse entre los mensajes del chat del conjunto.",
    rol: "Consejo de administración",
    icon: Gavel,
    tint: "flame",
  },
  {
    texto: "Consultar el estado de cuenta y descargar el recibo toma segundos.",
    rol: "Propietario",
    icon: KeyRound,
    tint: "sky",
  },
] as const;

const TINTS = {
  flame: "bg-flame-tint text-flame",
  sky: "bg-sky/12 text-sky",
  violet: "bg-[#8b5cf6]/12 text-[#7c4ddb]",
} as const;

function Card({ t }: { t: (typeof TESTIMONIOS)[number] }) {
  return (
    <figure
      className="flex w-[340px] shrink-0 flex-col rounded-[26px] p-7 ring-1 ring-inset ring-white/70 sm:w-[400px]"
      style={glass()}
    >
      <Quote className="h-6 w-6 text-flame/40" aria-hidden />
      <blockquote className="mt-4 flex-1 text-[17px] leading-relaxed text-ink">
        {t.texto}
      </blockquote>
      <figcaption className="mt-6 flex items-center gap-3">
        <span
          aria-hidden
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
            TINTS[t.tint],
          )}
        >
          <t.icon className="h-5 w-5" />
        </span>
        <span>
          <span className="block text-[14px] font-medium text-ink">
            Testimonio de ejemplo
          </span>
          <span className="block text-[13px] text-slate-ink">{t.rol}</span>
        </span>
      </figcaption>
    </figure>
  );
}

export function TestimonialsSection() {
  return (
    <section className="overflow-hidden bg-mist py-20 sm:py-24">
      <div data-parallax="0.12" className="mx-auto max-w-6xl px-6">
        <SectionLabel>Cerca de la gente</SectionLabel>
        <h2 className="mt-6 max-w-[18ch] text-[clamp(2rem,4.4vw,3.4rem)] font-semibold leading-[1.08] tracking-[-0.025em] text-ink">
          Tecnología que se siente en la vida diaria.
        </h2>
      </div>

      {/* Marquee: se pausa al pasar el cursor, al enfocar con teclado y con
       * prefers-reduced-motion (ver globals.css). `scrollbar-none` oculta la
       * barra horizontal — el contenedor sigue siendo scrolleable, que es lo
       * que permite recorrerlo con teclado o gesto táctil. */}
      <div
        className="marquee-root scrollbar-none mt-14 overflow-x-auto"
        role="region"
        aria-label="Testimonios de ejemplo"
        tabIndex={0}
      >
        <div className="marquee-track flex w-max gap-5 px-6">
          {[...TESTIMONIOS, ...TESTIMONIOS].map((t, i) => (
            <Card key={i} t={t} />
          ))}
        </div>
      </div>

      <p className="mx-auto mt-10 max-w-[54ch] px-6 text-center text-xs leading-relaxed text-slate-ink">
        Los testimonios mostrados son ejemplos ilustrativos y no se atribuyen a
        personas reales.
      </p>
    </section>
  );
}
