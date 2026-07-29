"use client";

import { useRef } from "react";
import { HeartHandshake, LayoutGrid, MessagesSquare } from "lucide-react";
import {
  gsap,
  useGSAP,
  SplitText,
  MOTION,
  MEDIA,
  shouldSkipIntro,
} from "@/lib/gsap";

const PILARES = [
  {
    icon: LayoutGrid,
    title: "Más organización",
    copy: "La información de cada unidad, en un solo sistema.",
  },
  {
    icon: MessagesSquare,
    title: "Más comunicación",
    copy: "Comunicados y notificaciones que sí llegan a la comunidad.",
  },
  {
    icon: HeartHandshake,
    title: "Más tranquilidad",
    copy: "Cada ingreso, pago y novedad queda registrado.",
  },
];

export function ManifestoSection() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(MEDIA.reduceMotion, () => {
        gsap.set("[data-manifesto-word]", { clearProps: "all", opacity: 1 });
        gsap.set("[data-pilar]", { clearProps: "all", opacity: 1 });
      });

      // Pestaña oculta: sin rAF no hay scrub, así que no atenuamos nada.
      if (shouldSkipIntro()) return;

      mm.add(`${MEDIA.desktop}, ${MEDIA.tablet}, ${MEDIA.mobile}`, () => {
        /* Lectura guiada: las palabras nacen atenuadas y se encienden a medida
         * que el usuario avanza. El scrub las ata al scroll, no al tiempo. */
        const split = new SplitText("[data-manifesto-text]", {
          type: "words",
          wordsClass: "manifesto-word",
        });
        split.words.forEach((w) => w.setAttribute("data-manifesto-word", ""));

        gsap.set(split.words, { opacity: 0.18 });
        gsap.to(split.words, {
          opacity: 1,
          ease: "none",
          stagger: 0.35,
          scrollTrigger: {
            trigger: "[data-manifesto-text]",
            start: "top 78%",
            end: "bottom 55%",
            scrub: 0.9,
          },
        });

        /* Las tarjetas de vidrio entran flotando. Sin animar `filter`: estas
         * tarjetas ya llevan `backdrop-filter`, y encadenar los dos obliga a
         * repintar en cada frame. */
        gsap.from("[data-pilar]", {
          opacity: 0,
          y: 30,
          scale: 0.96,
          duration: 0.85,
          stagger: MOTION.stagger.cards,
          ease: MOTION.ease.large,
          scrollTrigger: { trigger: "[data-pilares]", start: "top 82%" },
        });

        return () => split.revert();
      });
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      id="producto"
      className="bg-white px-6 py-20 sm:py-24"
    >
      <div className="mx-auto max-w-4xl">
        <p
          data-manifesto-text
          className="text-[clamp(1.9rem,4.2vw,3.25rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-ink"
        >
          Administrar una comunidad no debería depender de mensajes dispersos,
          archivos sueltos y procesos manuales. Con Vekino, cada persona
          encuentra lo que necesita, cuando lo necesita.
        </p>
      </div>

      {/* Los halos viven detrás de las tarjetas: sin algo que difuminar,
          el vidrio no se lee. */}
      <div className="relative mx-auto mt-20 max-w-5xl">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-10 left-[6%] h-64 w-64 rounded-full bg-flame/20 blur-[64px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-8 right-[10%] h-72 w-72 rounded-full bg-sky/22 blur-[64px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-[#8b5cf6]/12 blur-[64px]"
        />

        <ul data-pilares className="relative grid gap-5 sm:grid-cols-3">
          {PILARES.map((p) => (
            <li
              key={p.title}
              data-pilar
              className="group relative overflow-hidden rounded-[28px] p-7 transition-transform duration-500 hover:-translate-y-1 motion-reduce:hover:translate-y-0"
              style={{
                // Vidrio: capa translúcida + desenfoque del fondo.
                background:
                  "linear-gradient(150deg, rgba(255,255,255,0.75), rgba(255,255,255,0.45))",
                boxShadow:
                  "0 1px 0 0 rgba(255,255,255,0.9) inset, 0 -1px 0 0 rgba(255,255,255,0.35) inset, 0 18px 40px -20px rgba(4,32,70,0.28)",
              }}
            >
              {/* Borde de vidrio: más claro arriba, casi nulo abajo */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-[28px] ring-1 ring-inset ring-white/70"
              />
              {/* Brillo que barre la tarjeta al pasar el cursor */}
              <span
                data-pilar-sheen
                aria-hidden
                className="pointer-events-none absolute -inset-y-8 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/55 to-transparent opacity-0 transition-all duration-700 group-hover:left-[110%] group-hover:opacity-100 motion-reduce:hidden"
              />

              <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-white/70 ring-1 ring-inset ring-white/80 shadow-[0_6px_16px_-8px_rgba(4,32,70,0.35)]">
                <p.icon className="h-5 w-5 text-flame" aria-hidden />
              </span>

              <h3 className="relative mt-5 text-xl font-semibold tracking-tight text-ink">
                {p.title}
              </h3>
              <p className="relative mt-2 text-[15px] leading-relaxed text-slate-ink">
                {p.copy}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
