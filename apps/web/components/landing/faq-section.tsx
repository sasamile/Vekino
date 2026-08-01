"use client";

import { useId, useState } from "react";
import { ArrowRight, Minus, Plus } from "lucide-react";
import { SectionBadge } from "./ui/badge";
import { LpLinkButton } from "./ui/button";
import { Reveal } from "./ui/reveal";
import { cn } from "@/lib/utils";

const PREGUNTAS = [
  {
    q: "¿Cuánto toma poner el conjunto en marcha?",
    a: "Entre una y dos semanas. Cargamos las unidades, los residentes y la cartera a partir de tus archivos actuales, y acompañamos la primera facturación dentro de la plataforma.",
  },
  {
    q: "¿Sirve si ya llevamos la contabilidad en otro sistema?",
    a: "Sí. Vekino gestiona la operación del conjunto —cartera, accesos, reservas, comunicación— y exporta los movimientos para que tu contador los concilie en su software.",
  },
  {
    q: "¿Los residentes tienen que pagar algo?",
    a: "No. La aplicación para residentes y propietarios es gratuita, tanto en iOS como en Android. El plan lo contrata la administración.",
  },
  {
    q: "¿Qué pasa con los datos de los residentes?",
    a: "Cada conjunto es un espacio aislado, y el acceso depende del perfil de cada persona. Tratamos los datos personales conforme a la Ley 1581 de 2012 y su política de privacidad.",
  },
  {
    q: "¿La portería necesita equipos especiales?",
    a: "No. Funciona en el computador de la portería o en un celular con cámara: el QR del visitante se valida desde el navegador, sin instalar nada.",
  },
  {
    q: "¿Se puede administrar más de un conjunto?",
    a: "Sí. Una administradora puede tener varios conjuntos bajo la misma cuenta, cambiar entre ellos y ver un consolidado con el plan Integral.",
  },
  {
    q: "¿Hay permanencia mínima?",
    a: "No hay cláusula de permanencia. El plan es mensual y se puede cancelar avisando con un mes de anticipación.",
  },
  {
    q: "¿Qué soporte incluye?",
    a: "Soporte en español por correo y chat, con respuesta dentro de las 24 horas hábiles, más capacitación inicial para el equipo administrativo.",
  },
];

export function FaqSection() {
  const [abiertas, setAbiertas] = useState<number[]>([0]);
  const baseId = useId();

  function alternar(i: number) {
    setAbiertas((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i],
    );
  }

  return (
    <section id="preguntas" className="lp-section">
      <div className="lp-container">
        <Reveal className="text-center">
          <SectionBadge>Preguntas frecuentes</SectionBadge>
          <h2 className="mx-auto mt-5 max-w-[18ch] text-[clamp(1.95rem,3.6vw,2.85rem)] font-[660] leading-[1.05] tracking-[-0.03em] text-heading">
            Lo que suelen preguntarnos
          </h2>
        </Reveal>

        {/* `items-start`: cada tarjeta conserva su altura natural. Sin esto,
            abrir una pregunta estira a la de al lado y deja un hueco blanco
            dentro de su borde. */}
        <ul className="mt-10 grid items-start gap-2.5 lg:mt-12 lg:grid-cols-2 lg:gap-x-4">
          {PREGUNTAS.map((p, i) => {
            const abierta = abiertas.includes(i);
            const panelId = `${baseId}-r-${i}`;
            const botonId = `${baseId}-p-${i}`;

            return (
              <Reveal as="li" key={p.q} delay={Math.min(i, 4) * 60}>
                <div
                  className={cn(
                    "h-full overflow-hidden rounded-[11px] border transition-colors duration-200",
                    abierta
                      ? "border-brand-200 bg-surface-warm"
                      : "border-line bg-surface hover:border-line-strong",
                  )}
                >
                  <h3>
                    <button
                      type="button"
                      id={botonId}
                      aria-expanded={abierta}
                      aria-controls={panelId}
                      onClick={() => alternar(i)}
                      className="flex w-full items-start gap-3 px-4 py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 sm:px-[18px]"
                    >
                      <span className="flex-1 text-[14px] font-semibold leading-snug tracking-[-0.01em] text-heading">
                        {p.q}
                      </span>
                      {abierta ? (
                        <Minus
                          className="mt-0.5 h-4 w-4 shrink-0 text-brand-500"
                          strokeWidth={2}
                          aria-hidden
                        />
                      ) : (
                        <Plus
                          className="mt-0.5 h-4 w-4 shrink-0 text-placeholder"
                          strokeWidth={2}
                          aria-hidden
                        />
                      )}
                    </button>
                  </h3>

                  {/* Alto animado con `grid-template-rows` (ver
                      `.lp-collapse`). `inert` cerrado: el contenido mide cero
                      pero seguiría siendo enfocable sin él. */}
                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={botonId}
                    data-abierto={abierta}
                    inert={!abierta}
                    className="lp-collapse"
                  >
                    <div>
                      <p className="max-w-[52ch] px-4 pb-4 text-[13.5px] leading-[1.55] text-body sm:px-[18px]">
                        {p.a}
                      </p>
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </ul>

        {/* Barra CTA oscura */}
        <Reveal delay={120}>
          <div className="mt-10 flex flex-col gap-5 rounded-panel bg-night p-6 sm:flex-row sm:items-center sm:justify-between sm:p-[26px] lg:mt-12">
            <div>
              <p className="text-[17px] font-semibold tracking-[-0.02em] text-white">
                ¿Te quedó alguna duda sobre tu conjunto?
              </p>
              <p className="mt-1.5 max-w-[52ch] text-[13.5px] leading-[1.5] text-night-muted">
                Cuéntanos cuántas unidades administras y te mostramos cómo
                quedaría Vekino con la información de tu comunidad.
              </p>
            </div>
            <LpLinkButton
              href="#contacto"
              variant="secondary"
              size="lg"
              className="shrink-0 border-transparent"
            >
              Hablar con el equipo
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                strokeWidth={2}
                aria-hidden
              />
            </LpLinkButton>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
