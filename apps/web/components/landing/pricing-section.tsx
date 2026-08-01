import { Check } from "lucide-react";
import { SectionBadge } from "./ui/badge";
import { LpLinkButton } from "./ui/button";
import { Reveal } from "./ui/reveal";
import { cn } from "@/lib/utils";

/**
 * Planes y precios.
 *
 * ⚠️ PRECIOS DE EJEMPLO — NO PUBLICAR SIN CONFIRMAR. Las cifras y los topes
 * de unidades son marcadores de posición para dejar la composición lista.
 * Un precio publicado es una oferta comercial: hay que reemplazarlos por los
 * reales (o quitar la sección y dejar solo "Hablemos") antes de salir a
 * producción.
 *
 * La estructura sí es definitiva: tres columnas, la del medio destacada en
 * naranja y elevada ~14 px sobre las otras dos.
 */
const PLANES = [
  {
    nombre: "Esencial",
    descripcion: "Para conjuntos pequeños que empiezan a digitalizarse.",
    precio: "$2.900",
    periodo: "por unidad / mes",
    nota: "Hasta 60 unidades",
    cta: "Empezar ahora",
    destacado: false,
    incluye: [
      "Residentes, unidades y vehículos",
      "Cartera y estados de cuenta",
      "Comunicados y notificaciones",
      "App móvil para residentes",
      "Soporte por correo",
    ],
  },
  {
    nombre: "Comunidad",
    descripcion: "El plan completo para la operación diaria del conjunto.",
    precio: "$4.500",
    periodo: "por unidad / mes",
    nota: "Sin límite de unidades",
    cta: "Solicitar demostración",
    destacado: true,
    incluye: [
      "Todo lo del plan Esencial",
      "Visitantes con QR y minuta digital",
      "Reservas de zonas comunes",
      "PQRS con responsable y estado",
      "Documentos y contratos",
      "Soporte prioritario en 24 h",
    ],
  },
  {
    nombre: "Integral",
    descripcion: "Para administradoras con varios conjuntos a cargo.",
    precio: "$6.200",
    periodo: "por unidad / mes",
    nota: "Multi-conjunto",
    cta: "Hablar con ventas",
    destacado: false,
    incluye: [
      "Todo lo del plan Comunidad",
      "Asambleas, poderes y votación en vivo",
      "Consolidado de varios conjuntos",
      "Reportes contables exportables",
      "Acompañamiento en la migración",
    ],
  },
];

export function PricingSection() {
  return (
    <section id="planes" className="lp-section">
      <div className="lp-container">
        <Reveal className="text-center">
          <SectionBadge>Planes</SectionBadge>
          <h2 className="mx-auto mt-5 max-w-[18ch] text-[clamp(1.95rem,3.6vw,2.85rem)] font-[660] leading-[1.05] tracking-[-0.03em] text-heading">
            Un precio claro por <span className="text-brand-500">unidad</span>,
            sin sorpresas
          </h2>
          <p className="mx-auto mt-4 max-w-[54ch] text-[15px] leading-[1.55] text-body">
            Se cobra por unidad activa al mes. Sin permanencia mínima, sin costo
            de implementación y con acompañamiento incluido en la migración.
          </p>
        </Reveal>

        <div className="mt-12 grid items-start gap-4 lg:mt-14 lg:grid-cols-3">
          {PLANES.map((p, i) => (
            <Reveal key={p.nombre} delay={i * 90}>
              <article
                className={cn(
                  "lp-card-hover flex h-full flex-col rounded-panel border p-6 sm:p-7",
                  p.destacado
                    ? "border-brand-600 bg-brand-500 text-white shadow-[0_18px_44px_-16px_rgb(255_90_10/0.45)] lg:-mt-3.5 lg:pb-10"
                    : "border-line bg-surface shadow-card",
                )}
              >
                <div className="flex items-center gap-2">
                  <h3
                    className={cn(
                      "text-[16px] font-semibold tracking-[-0.01em]",
                      p.destacado ? "text-white" : "text-heading",
                    )}
                  >
                    {p.nombre}
                  </h3>
                  {p.destacado ? (
                    <span className="rounded-pill bg-white/20 px-2 py-[3px] text-[9.5px] font-bold uppercase tracking-[0.04em] text-white">
                      Recomendado
                    </span>
                  ) : null}
                </div>

                <p
                  className={cn(
                    "mt-2 min-h-[42px] max-w-[34ch] text-[13.5px] leading-[1.5]",
                    p.destacado ? "text-white/80" : "text-body",
                  )}
                >
                  {p.descripcion}
                </p>

                <div className="mt-6 flex items-end gap-2">
                  <span
                    className={cn(
                      "text-[clamp(2.1rem,3.2vw,2.6rem)] font-[680] leading-none tracking-[-0.045em]",
                      p.destacado ? "text-white" : "text-heading",
                    )}
                  >
                    {p.precio}
                  </span>
                  <span
                    className={cn(
                      "pb-1 text-[12px] font-medium",
                      p.destacado ? "text-white/75" : "text-subtle",
                    )}
                  >
                    {p.periodo}
                  </span>
                </div>
                <span
                  className={cn(
                    "mt-1.5 inline-flex w-fit rounded-pill border px-2 py-[3px] text-[10.5px] font-semibold",
                    p.destacado
                      ? "border-white/25 text-white/85"
                      : "border-line text-subtle",
                  )}
                >
                  {p.nota}
                </span>

                <LpLinkButton
                  href="#contacto"
                  variant={p.destacado ? "secondary" : "dark"}
                  size="lg"
                  className={cn(
                    "mt-6 w-full",
                    p.destacado &&
                      "border-transparent bg-white text-brand-700 shadow-none hover:bg-brand-50",
                  )}
                >
                  {p.cta}
                </LpLinkButton>

                <span
                  className={cn(
                    "mt-7 block border-t border-dashed pt-5 text-[10.5px] font-semibold uppercase tracking-[0.04em]",
                    p.destacado
                      ? "border-white/25 text-white/70"
                      : "border-dash text-subtle",
                  )}
                >
                  Incluye
                </span>
                <ul className="mt-3.5 space-y-2.5">
                  {p.incluye.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <Check
                        className={cn(
                          "mt-[3px] h-[15px] w-[15px] shrink-0",
                          p.destacado ? "text-white" : "text-brand-500",
                        )}
                        strokeWidth={2.4}
                        aria-hidden
                      />
                      <span
                        className={cn(
                          "text-[13.5px] leading-[1.45]",
                          p.destacado ? "text-white/90" : "text-body",
                        )}
                      >
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delay={180}>
          <p className="mt-8 text-center text-[12px] text-subtle">
            Valores en pesos colombianos, antes de IVA. ¿Tu conjunto tiene una
            necesidad particular?{" "}
            <a
              href="#contacto"
              className="font-semibold text-brand-600 underline underline-offset-2 hover:text-brand-700"
            >
              Escríbenos y armamos el plan
            </a>
            .
          </p>
        </Reveal>
      </div>
    </section>
  );
}
