import { Blocks, Clock4, Smartphone, Users2 } from "lucide-react";
import { CountUp } from "./ui/count-up";
import { Reveal } from "./ui/reveal";
import { cn } from "@/lib/utils";

/**
 * Fila de indicadores, separados por líneas verticales.
 *
 * Las cifras describen el producto (perfiles, módulos, plataformas) y el
 * compromiso de soporte que ya aparece en la sección de contacto. No hay
 * porcentajes de "mejora de productividad": una afirmación así en la home
 * habría que poder sustentarla, y hoy no hay medición detrás.
 */
const INDICADORES = [
  {
    icon: Users2,
    valor: 6,
    sufijo: "",
    titulo: "perfiles conectados",
    detalle:
      "Administración, residentes, propietarios, portería, consejo y proveedores",
  },
  {
    icon: Blocks,
    valor: 12,
    sufijo: "",
    titulo: "módulos incluidos",
    detalle: "De cartera y reservas a asambleas y minuta digital",
  },
  {
    icon: Smartphone,
    valor: 3,
    sufijo: "",
    titulo: "plataformas",
    detalle: "Web, iOS y Android con la misma información",
  },
  {
    icon: Clock4,
    valor: 24,
    sufijo: " h",
    titulo: "de respuesta",
    detalle: "Soporte en español dentro de la jornada hábil",
  },
];

export function StatsSection() {
  return (
    <section className="lp-section">
      <div className="lp-container">
        <ul className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4 lg:gap-x-0">
          {INDICADORES.map((ind, i) => (
            <Reveal
              as="li"
              key={ind.titulo}
              delay={i * 90}
              /* Divisiones verticales: en móvil (2 columnas) las lleva la
               * columna derecha; en escritorio (4 columnas), todas menos la
               * primera. `cn` resuelve el choque de `pl-*` entre los dos
               * casos — concatenar las clases a mano dejaba el resultado al
               * azar del orden del CSS compilado. */
              className={cn(
                "relative",
                i % 2 === 1 && "border-l border-line pl-6",
                i === 0
                  ? "lg:border-l-0 lg:pl-0"
                  : "lg:border-l lg:border-line lg:pl-8",
                i < INDICADORES.length - 1 && "lg:pr-8",
              )}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-brand-50">
                <ind.icon
                  className="h-[17px] w-[17px] text-brand-500"
                  strokeWidth={1.8}
                  aria-hidden
                />
              </span>
              <span className="mt-4 block text-[clamp(2.1rem,3.6vw,2.9rem)] font-[680] leading-none tracking-[-0.045em] text-heading">
                <CountUp value={ind.valor} suffix={ind.sufijo} />
              </span>
              <span className="mt-2 block text-[14px] font-semibold text-heading">
                {ind.titulo}
              </span>
              <span className="mt-1.5 block max-w-[30ch] text-[12.5px] leading-[1.45] text-subtle">
                {ind.detalle}
              </span>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
