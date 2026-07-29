import Image from "next/image";
import Link from "next/link";
import { Instagram, Linkedin, Mail } from "lucide-react";
import { StoreButton } from "./ui/store-buttons";

const COLUMNAS = [
  {
    titulo: "Producto",
    links: [
      { label: "Funcionalidades", href: "#beneficios" },
      { label: "Aplicación móvil", href: "#aplicacion" },
      { label: "Plataforma web", href: "/login" },
      { label: "Seguridad", href: "#soluciones" },
    ],
  },
  {
    titulo: "Soluciones",
    links: [
      { label: "Para administradores", href: "#soluciones" },
      { label: "Para residentes", href: "#aplicacion" },
      { label: "Para vigilancia", href: "#soluciones" },
      { label: "Para propiedad horizontal", href: "#producto" },
    ],
  },
  {
    titulo: "Empresa",
    links: [
      { label: "Contacto", href: "#contacto" },
      { label: "Soporte", href: "mailto:soporte@vekino.co" },
      { label: "Política de privacidad", href: "/legal/privacidad" },
      { label: "Términos y condiciones", href: "/legal/terminos" },
    ],
  },
];

export function Footer() {
  // Año calculado en el servidor: sin desajuste de hidratación.
  const anio = new Date().getFullYear();

  return (
    <footer className="bg-ink px-6 pb-10 pt-24 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-14 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <Image
                src="/logos/isotipo-vekino.svg"
                alt="Vekino"
                width={32}
                height={32}
                className="h-8 w-8"
              />
              <span className="text-xl font-semibold tracking-tight">
                vekino
              </span>
            </Link>
            <p className="mt-5 max-w-[34ch] text-[15px] leading-relaxed text-white/55">
              La plataforma que centraliza la administración, la comunicación y
              la seguridad de tu conjunto residencial.
            </p>

            <div className="mt-7 flex gap-3">
              {[
                { icon: Instagram, href: "#", label: "Instagram" },
                { icon: Linkedin, href: "#", label: "LinkedIn" },
                { icon: Mail, href: "mailto:hola@vekino.co", label: "Correo" },
              ].map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  className="flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-white/15 transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <s.icon className="h-4 w-4" aria-hidden />
                </a>
              ))}
            </div>
          </div>

          {COLUMNAS.map((c) => (
            <nav key={c.titulo} aria-label={c.titulo}>
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-white/40">
                {c.titulo}
              </h2>
              <ul className="mt-5 space-y-2.5">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-[15px] text-white/70 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-16 flex flex-col gap-4 border-t border-white/10 pt-8 sm:flex-row">
          <StoreButton store="appStore" />
          <StoreButton store="playStore" />
        </div>

        <div className="mt-10 flex flex-col gap-3 text-[13px] text-white/40 sm:flex-row sm:items-center sm:justify-between">
          <span>© {anio} Vekino. Todos los derechos reservados.</span>
          <span>Hecho en Colombia para la propiedad horizontal.</span>
        </div>
      </div>
    </footer>
  );
}
