import { ArrowUpRight } from "lucide-react";
import { Reveal } from "./ui/reveal";

/**
 * Prueba social bajo el hero.
 *
 * ⚠️ CONTENIDO PENDIENTE DE REEMPLAZO. Ni los nombres ni la cifra
 * corresponden a clientes reales: son marcadores de posición para tener la
 * composición lista. Antes de publicar hay que sustituirlos por conjuntos y
 * administradoras que hayan autorizado el uso de su nombre, o eliminar la
 * sección. Publicar clientes inventados es una afirmación falsa, no un
 * detalle de maquetación.
 *
 * Al reemplazar: los logos van monocromos (gris oscuro), sin color propio,
 * centrados en celdas de 78 px y al 70 % de opacidad.
 */
const TOTAL_CONJUNTOS = "120";

const CLIENTES = [
  "Parque Central",
  "Bosques del Río",
  "Altos de San Juan",
  "Reserva del Prado",
  "Torres del Viento",
  "Ciudadela Verde",
  "Portal de Aragón",
  "Mirador del Lago",
];

export function LogoCloud() {
  return (
    <section className="lp-section py-10 sm:py-12 lg:py-14">
      <div className="lp-container">
        <Reveal>
          <p className="text-center text-[12px] font-medium tracking-[0.02em] text-subtle">
            Con la confianza de más de{" "}
            <span className="font-semibold text-heading">
              {TOTAL_CONJUNTOS} conjuntos
            </span>{" "}
            en Colombia
          </p>
        </Reveal>

        <Reveal delay={80}>
          <ul className="mt-7 grid grid-cols-2 overflow-hidden rounded-card border border-line bg-surface sm:grid-cols-4">
            {CLIENTES.map((nombre) => (
              /* Rejilla interior: filo suave a la derecha y abajo, anulado en
               * la última columna y la última fila de cada breakpoint (2 y 4
               * columnas). Así el borde exterior de la tarjeta queda limpio. */
              <li
                key={nombre}
                className="flex h-[78px] items-center justify-center border-b border-r border-line-soft px-3 transition-colors hover:bg-surface-soft [&:nth-child(2n)]:border-r-0 [&:nth-child(n+7)]:border-b-0 sm:[&:nth-child(2n)]:border-r sm:[&:nth-child(4n)]:border-r-0 sm:[&:nth-child(n+5)]:border-b-0 sm:[&:nth-child(n+7)]:border-b-0"
              >
                {/* Marcador de logo: monograma + palabra, en gris oscuro */}
                <span className="flex items-center gap-2 text-[#3d3d3a] opacity-[0.72] transition-opacity hover:opacity-100">
                  <span
                    aria-hidden
                    className="flex h-[22px] w-[22px] items-center justify-center rounded-[6px] border border-current text-[10px] font-bold"
                  >
                    {nombre.charAt(0)}
                  </span>
                  <span className="truncate text-[12.5px] font-semibold tracking-[-0.01em]">
                    {nombre}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={140}>
          <p className="mt-5 text-center">
            <a
              href="#contacto"
              className="inline-flex items-center gap-1 rounded-btn px-2 py-1 text-[12.5px] font-semibold text-brand-600 transition-colors hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              Ver más casos de uso
              <ArrowUpRight
                className="h-3.5 w-3.5"
                strokeWidth={2}
                aria-hidden
              />
            </a>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
