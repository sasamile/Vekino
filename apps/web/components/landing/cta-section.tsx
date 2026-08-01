import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { SectionBadge } from "./ui/badge";
import { LpLinkButton } from "./ui/button";
import { Reveal } from "./ui/reveal";

/**
 * CTA visual: bloque partido en dos.
 *
 * A la izquierda, fondo durazno muy suave con el llamado. A la derecha, el
 * producto entrando desde el borde: la captura se desborda del contenedor y
 * se recorta, que es lo que le da profundidad. En móvil el desborde se
 * recoge —una captura cortada por la mitad en 375 px no comunica nada— pero
 * se mantiene la pieza completa, no se elimina.
 */
export function CtaSection() {
  return (
    <section className="lp-section">
      <div className="lp-container">
        <Reveal>
          <div className="relative overflow-hidden rounded-panel border border-brand-100 bg-surface-warm">
            {/* Degradado durazno extremadamente suave, sin saltos de color */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(115deg, var(--color-brand-50) 0%, #fffdfb 52%, var(--color-surface) 100%)",
              }}
            />

            <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-6">
              <div className="p-7 sm:p-10 lg:py-14 lg:pl-12 lg:pr-0">
                <SectionBadge>Empieza hoy</SectionBadge>
                <h2 className="mt-5 max-w-[15ch] text-[clamp(1.9rem,3.4vw,2.7rem)] font-[660] leading-[1.05] tracking-[-0.03em] text-heading">
                  Administrar tu conjunto puede ser mucho más{" "}
                  <span className="text-brand-500">simple</span>
                </h2>
                <p className="mt-4 max-w-[44ch] text-[15px] leading-[1.55] text-body">
                  Te mostramos la plataforma con la información de tu comunidad
                  y te acompañamos en la migración desde el primer mes.
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <LpLinkButton href="#contacto" size="lg">
                    Solicitar una demostración
                    <ArrowRight
                      className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                      strokeWidth={2}
                      aria-hidden
                    />
                  </LpLinkButton>
                  <LpLinkButton href="#planes" variant="secondary" size="lg">
                    Ver los planes
                  </LpLinkButton>
                </div>
              </div>

              {/* Producto entrando desde el borde derecho */}
              <div className="relative min-h-[240px] px-7 pb-7 sm:px-10 sm:pb-10 lg:px-0 lg:pb-0 lg:pt-12">
                <div className="relative lg:-mr-24 xl:-mr-32">
                  <Image
                    src="/landing/propietario-dashboard.png"
                    alt="Portal del propietario en Vekino con avisos, total pendiente, saldo a favor y facturas recientes"
                    width={1672}
                    height={941}
                    className="h-auto w-full rounded-[14px] border border-line shadow-[0_30px_70px_-30px_rgb(20_20_20/0.35)]"
                    sizes="(min-width: 1024px) 720px, 100vw"
                  />
                  {/* Velo hacia el borde: evita el corte seco de la captura */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 right-0 hidden w-24 lg:block"
                    style={{
                      background:
                        "linear-gradient(to right, transparent, var(--color-surface))",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
