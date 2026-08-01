"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { LpLinkButton } from "./ui/button";
import { CrosshairRow } from "./ui/crosshair";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#funcionalidades", label: "Funcionalidades" },
  { href: "#modulos", label: "Módulos" },
  { href: "#aplicacion", label: "Aplicación" },
  { href: "#planes", label: "Planes" },
  { href: "#preguntas", label: "Preguntas" },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  /* Al bajar 12 px la barra gana fondo y filo. Leemos la posición dentro de
   * un rAF: consultar `scrollY` en cada evento fuerza reflow. */
  useEffect(() => {
    let pendiente = false;

    function evaluar() {
      setScrolled(window.scrollY > 12);
      pendiente = false;
    }

    function onScroll() {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(evaluar);
    }

    evaluar();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // El menú desplegable bloquea el scroll del documento mientras está abierto.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Cerrar con Escape: el panel es un diálogo de pantalla completa.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={cn(
        // El filo punteado está SIEMPRE: es parte del marco, no un efecto de
        // scroll. Lo que aparece al bajar es el fondo con desenfoque.
        "sticky top-0 z-40 border-b border-dashed border-dash transition-colors duration-200",
        scrolled
          ? "bg-surface/85 backdrop-blur-md supports-[backdrop-filter]:bg-surface/75"
          : "bg-transparent",
      )}
    >
      {/* Cruces donde el filo corta los rieles verticales del marco */}
      <CrosshairRow className="bottom-0" />

      <div className="lp-container">
        <nav
          aria-label="Principal"
          className="flex h-[68px] items-center gap-6 lg:h-[72px]"
        >
          {/* Izquierda: isotipo dentro de forma naranja + nombre */}
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 rounded-btn focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-brand-500 shadow-[0_4px_12px_rgb(255_90_10/0.24)]">
              <Image
                src="/logos/isotipo-vekino.svg"
                alt=""
                width={18}
                height={18}
                className="h-[18px] w-[18px] brightness-0 invert"
                priority
              />
            </span>
            <span className="text-[17px] font-semibold tracking-[-0.02em] text-heading">
              Vekino
            </span>
          </Link>

          {/* Centro: navegación */}
          <ul className="mx-auto hidden items-center gap-1 lg:flex">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  className="lp-navlink relative block rounded-btn px-3 py-2 text-[13.5px] font-medium text-body transition-colors hover:text-heading focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>

          {/* Derecha: acciones */}
          <div className="ml-auto hidden items-center gap-2 lg:ml-0 lg:flex">
            <LpLinkButton href="/login" variant="secondary">
              Iniciar sesión
            </LpLinkButton>
            <LpLinkButton href="#contacto">Solicitar demo</LpLinkButton>
          </div>

          {/* Móvil: CTA compacto + botón de menú */}
          <div className="ml-auto flex items-center gap-2 lg:hidden">
            <LpLinkButton href="#contacto" className="h-10 px-4 text-[13px]">
              Solicitar demo
            </LpLinkButton>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Abrir menú"
              aria-expanded={open}
              aria-controls="menu-movil"
              className="flex h-11 w-11 items-center justify-center rounded-btn border border-line bg-surface text-heading transition-colors hover:bg-[#f4f4f1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              <Menu
                className="h-[18px] w-[18px]"
                strokeWidth={1.8}
                aria-hidden
              />
            </button>
          </div>
        </nav>
      </div>

      {/* Panel desplegable */}
      {open ? (
        <div
          id="menu-movil"
          className="fixed inset-0 z-50 flex flex-col bg-surface-soft lg:hidden"
        >
          <div className="lp-container flex h-[68px] items-center">
            <span className="flex items-center gap-2">
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
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar menú"
              autoFocus
              className="ml-auto flex h-11 w-11 items-center justify-center rounded-btn border border-line bg-surface text-heading transition-colors hover:bg-[#f4f4f1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              <X className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden />
            </button>
          </div>

          <hr className="lp-divider" />

          <nav aria-label="Menú móvil" className="lp-container flex-1 py-6">
            <ul className="space-y-1.5">
              {LINKS.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center rounded-card border border-line bg-surface px-4 py-3.5 text-[15px] font-semibold text-heading transition-colors hover:border-brand-200 hover:bg-brand-50"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="lp-container flex flex-col gap-2.5 pb-8">
            <LpLinkButton href="#contacto" size="lg" className="w-full">
              Solicitar demo
            </LpLinkButton>
            <LpLinkButton
              href="/login"
              variant="secondary"
              size="lg"
              className="w-full"
            >
              Iniciar sesión
            </LpLinkButton>
          </div>
        </div>
      ) : null}
    </header>
  );
}
