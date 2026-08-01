import Image from "next/image";
import Link from "next/link";
import { Instagram, Linkedin, Mail } from "lucide-react";
import { StoreButton } from "./ui/store-buttons";

const COLUMNAS = [
  {
    titulo: "Producto",
    links: [
      { label: "Funcionalidades", href: "#funcionalidades" },
      { label: "Módulos", href: "#modulos" },
      { label: "Aplicación móvil", href: "#aplicacion" },
      { label: "Planes", href: "#planes" },
    ],
  },
  {
    titulo: "Soluciones",
    links: [
      { label: "Para administradores", href: "#modulos" },
      { label: "Para residentes", href: "#aplicacion" },
      { label: "Para portería", href: "#funcionalidades" },
      { label: "Para administradoras", href: "#planes" },
    ],
  },
  {
    titulo: "Recursos",
    links: [
      { label: "Preguntas frecuentes", href: "#preguntas" },
      { label: "Novedades", href: "#novedades" },
      { label: "Soporte", href: "mailto:soporte@vekino.co" },
      { label: "Iniciar sesión", href: "/login" },
    ],
  },
  {
    titulo: "Legal",
    links: [
      { label: "Política de privacidad", href: "/legal/privacidad" },
      { label: "Términos y condiciones", href: "/legal/terminos" },
      { label: "Tratamiento de datos", href: "/legal/privacidad" },
      { label: "Contacto", href: "#contacto" },
    ],
  },
];

const REDES = [
  { icon: Instagram, href: "#", label: "Instagram" },
  { icon: Linkedin, href: "#", label: "LinkedIn" },
  { icon: Mail, href: "mailto:hola@vekino.co", label: "Correo" },
];

export function Footer() {
  // Año calculado en el servidor: sin desajuste de hidratación.
  const anio = new Date().getFullYear();

  return (
    <footer className="relative border-t border-dashed border-dash">
      <div className="lp-container relative overflow-hidden py-14 lg:py-16">
        {/* Composición abstracta de la esquina: círculos y cuartos de círculo
            en durazno muy claro. Vive DENTRO del contenedor —no del footer—
            para que no se derrame sobre el rayado del margen exterior.
            Es adorno: oculto a lectores de pantalla. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-28 -right-16 h-64 w-64 lg:-bottom-32 lg:-right-10 lg:h-80 lg:w-80"
        >
          <span className="absolute inset-0 rounded-full bg-brand-50" />
          <span className="absolute left-6 top-10 h-32 w-32 rounded-tl-full bg-brand-100/70 lg:h-44 lg:w-44" />
          <span className="absolute bottom-24 left-2 h-12 w-12 rounded-full border border-brand-200" />
          <span className="absolute right-24 top-4 h-6 w-6 rounded-br-full bg-brand-200" />
        </div>

        <div className="relative grid gap-10 lg:grid-cols-[1.5fr_repeat(4,1fr)] lg:gap-8">
          <div>
            <Link
              href="/"
              className="flex w-fit items-center gap-2 rounded-btn focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-brand-500">
                <Image
                  src="/logos/isotipo-vekino.svg"
                  alt=""
                  width={18}
                  height={18}
                  className="h-[18px] w-[18px] brightness-0 invert"
                />
              </span>
              <span className="text-[17px] font-semibold tracking-[-0.02em] text-heading">
                Vekino
              </span>
            </Link>

            <p className="mt-4 max-w-[34ch] text-[13.5px] leading-[1.55] text-body">
              La plataforma que centraliza la administración, la comunicación y
              la seguridad de tu conjunto residencial.
            </p>

            <div className="mt-6 flex gap-2">
              {REDES.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  className="flex h-10 w-10 items-center justify-center rounded-btn border border-line bg-surface text-body transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                >
                  <s.icon className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                </a>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-2.5">
              <StoreButton store="appStore" />
              <StoreButton store="playStore" />
            </div>
          </div>

          {COLUMNAS.map((c) => (
            <nav key={c.titulo} aria-label={c.titulo}>
              <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-placeholder">
                {c.titulo}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-[13.5px] text-body transition-colors hover:text-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <hr className="lp-divider relative mt-12" />

        <div className="relative flex flex-col gap-3 pt-6 text-[12.5px] text-subtle sm:flex-row sm:items-center sm:justify-between">
          <span>© {anio} Vekino. Todos los derechos reservados.</span>
          <span className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link
              href="/legal/privacidad"
              className="transition-colors hover:text-heading"
            >
              Privacidad
            </Link>
            <Link
              href="/legal/terminos"
              className="transition-colors hover:text-heading"
            >
              Términos
            </Link>
            <span className="text-placeholder">
              Hecho en Colombia para la propiedad horizontal
            </span>
          </span>
        </div>
      </div>
    </footer>
  );
}
