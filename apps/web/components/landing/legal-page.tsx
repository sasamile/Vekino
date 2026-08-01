import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Footer } from "./footer";
import { Header } from "./header";
import { PageFrame } from "./page-frame";

/**
 * Cascarón de las páginas legales. Mismo marco que la landing —rieles,
 * rayado y separadores punteados— con una columna de lectura más angosta:
 * un documento legal a 1200 px de ancho no se lee, se abandona.
 *
 * El contenido va como hijos, en HTML plano; `.legal-doc` (globals.css) le
 * da la tipografía. Así los textos se editan sin tocar clases de Tailwind
 * en cada párrafo, que es lo que garantiza que nadie los mantenga.
 */
export function LegalPage({
  titulo,
  resumen,
  actualizado,
  children,
}: {
  titulo: string;
  /** Una frase que explique de qué va el documento, en lenguaje llano. */
  resumen: string;
  /** Fecha de la última revisión, escrita (ej. "31 de julio de 2026"). */
  actualizado: string;
  children: React.ReactNode;
}) {
  return (
    <div className="landing-main">
      <PageFrame />
      <Header />

      <main>
        <section className="lp-section border-t-0">
          <div className="lp-container">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-btn text-[13px] font-medium text-body transition-colors hover:text-heading focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden />
              Volver al inicio
            </Link>

            <div className="mt-8 max-w-[720px]">
              <h1 className="text-[clamp(2rem,4vw,2.8rem)] font-[660] leading-[1.05] tracking-[-0.04em] text-heading">
                {titulo}
              </h1>
              <p className="mt-4 text-[15px] leading-[1.55] text-body">
                {resumen}
              </p>
              <p className="mt-5 inline-flex rounded-pill border border-line bg-surface px-2.5 py-[5px] text-[11px] font-medium text-subtle">
                Última actualización: {actualizado}
              </p>
            </div>

            <hr className="lp-divider my-10" />

            <div className="legal-doc max-w-[720px]">{children}</div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
