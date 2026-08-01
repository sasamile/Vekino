import {
  ArrowRight,
  CheckCircle2,
  MousePointer2,
  Sparkles,
} from "lucide-react";
import { LpLinkButton } from "./ui/button";
import { FloatingTag } from "./ui/badge";
import { DashboardPreview } from "./ui/dashboard-preview";
import { Reveal } from "./ui/reveal";

/**
 * Hero editorial y centrado.
 *
 * Orden fijo: badge → titular → descripción → dos botones → vista del
 * producto. Las etiquetas de colores que flotan alrededor del titular son
 * decorativas (`aria-hidden` desde FloatingTag) y desaparecen por debajo de
 * `lg`, donde robarían espacio al texto en lugar de acompañarlo.
 */
export function HeroSection() {
  return (
    <section className="lp-section border-t-0 pt-10 sm:pt-14 lg:pt-16">
      <div className="lp-container">
        <div className="relative">
          {/* Adornos flotantes: solo escritorio */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 hidden lg:block"
          >
            <FloatingTag tint="lime" delay={0} className="left-[3%] top-[16%]">
              <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
              Visita autorizada
            </FloatingTag>
            <FloatingTag
              tint="violet"
              delay={900}
              className="right-[2%] top-[9%]"
            >
              Comunicado enviado
            </FloatingTag>
            <FloatingTag
              tint="brand"
              delay={1800}
              className="right-[6%] top-[52%]"
            >
              Pago registrado · $420.000
            </FloatingTag>
            <FloatingTag
              tint="magenta"
              delay={2600}
              className="left-[6%] top-[58%]"
            >
              <MousePointer2 className="h-3 w-3" strokeWidth={2} />
              Salón social reservado
            </FloatingTag>
          </div>

          {/* `immediate` en todo el hero: está sobre la línea de flotación,
              así que anima al cargar y no espera un scroll. */}
          <Reveal immediate className="relative text-center">
            <span className="inline-flex items-center gap-2 rounded-pill border border-line bg-surface px-2.5 py-[5px] text-[11px] font-medium text-body shadow-[0_1px_2px_rgb(20_20_20/0.03)]">
              <span className="inline-flex items-center gap-1 rounded-pill bg-brand-500 px-1.5 py-[1px] text-[9.5px] font-bold uppercase tracking-[0.04em] text-white">
                <Sparkles
                  className="h-2.5 w-2.5"
                  strokeWidth={2.4}
                  aria-hidden
                />
                Nuevo
              </span>
              Asambleas digitales con quórum y votación en vivo
            </span>

            <h1 className="mx-auto mt-6 max-w-[15ch] text-[clamp(2.4rem,6vw,4.5rem)] font-[650] leading-[1.0] tracking-[-0.045em] text-heading">
              Todo tu conjunto,
              <br className="hidden sm:block" /> por fin en{" "}
              <span className="text-brand-500">un solo lugar</span>
            </h1>

            <p className="mx-auto mt-5 max-w-[62ch] text-[clamp(0.98rem,1.2vw,1.06rem)] leading-[1.55] text-body">
              Vekino centraliza la administración, los pagos, las visitas, las
              reservas, la comunicación y la seguridad de tu comunidad. Una sola
              plataforma para administradores, residentes y portería.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <LpLinkButton
                href="#contacto"
                size="lg"
                className="w-full sm:w-auto"
              >
                Solicitar una demostración
                <ArrowRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  strokeWidth={2}
                  aria-hidden
                />
              </LpLinkButton>
              <LpLinkButton
                href="#funcionalidades"
                variant="secondary"
                size="lg"
                className="w-full sm:w-auto"
              >
                Ver funcionalidades
              </LpLinkButton>
            </div>

            <p className="mt-4 text-[12.5px] text-subtle">
              Implementación acompañada · Sin permanencia · Soporte en español
            </p>
          </Reveal>
        </div>

        {/* Vista del producto: contenedor blanco con canto naranja muy suave */}
        <Reveal immediate delay={220} className="mt-12 sm:mt-14">
          <div className="rounded-[22px] border border-brand-100 bg-surface p-1.5 shadow-[0_24px_60px_-28px_rgb(20_20_20/0.22)] sm:p-2">
            <DashboardPreview className="shadow-none" />
          </div>
          <p className="mt-3 text-center text-[11.5px] text-placeholder">
            Vista del panel de administración. Los datos mostrados son de
            demostración.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
