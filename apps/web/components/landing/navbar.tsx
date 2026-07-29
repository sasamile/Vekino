"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { gsap, useGSAP, MOTION, shouldSkipIntro } from "@/lib/gsap";
import { MagneticButton } from "./ui/magnetic-button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#producto", label: "Producto" },
  { href: "#soluciones", label: "Soluciones" },
  { href: "#aplicacion", label: "Aplicación" },
  { href: "#beneficios", label: "Beneficios" },
  { href: "#contacto", label: "Contacto" },
];

export function Navbar() {
  const root = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [oculto, setOculto] = useState(false);
  const [open, setOpen] = useState(false);

  /* Estado compacto tras 80 px + auto-ocultar.
   *
   * Bajando se esconde (deja la pantalla libre para el contenido); subiendo
   * reaparece al instante, que es cuando el usuario busca navegar. El umbral
   * de 6 px evita que tiemble con el micro-rebote del trackpad, y por debajo
   * de 120 px siempre se muestra para no tapar el hero.
   *
   * Escuchamos con `passive` para no bloquear el scroll, y leemos la posición
   * dentro de un rAF: `scrollY` en el handler fuerza reflow en cada evento. */
  useEffect(() => {
    let ultimo = window.scrollY;
    let pendiente = false;

    function evaluar() {
      const y = window.scrollY;
      setScrolled(y > 80);

      const delta = y - ultimo;
      if (Math.abs(delta) > 6) {
        setOculto(y > 120 && delta > 0);
        ultimo = y;
      }
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

  /* Bloquea el scroll del body mientras el menú móvil está abierto. */
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Entrada al cargar: logo, enlaces y acciones.
  useGSAP(
    () => {
      const tl = gsap
        .timeline({ defaults: { ease: MOTION.ease.enter } })
        .from("[data-nav-logo]", { opacity: 0, y: -8, duration: 0.6 })
        .from(
          "[data-nav-link]",
          { opacity: 0, y: -6, duration: 0.5, stagger: MOTION.stagger.icons },
          "-=0.35",
        )
        .from("[data-nav-actions]", { opacity: 0, y: -6, duration: 0.5 }, "<");

      if (shouldSkipIntro()) tl.progress(1);
    },
    { scope: root },
  );

  // Menú móvil: stagger de enlaces al abrir.
  useGSAP(
    () => {
      if (!open) return;
      gsap.from("[data-mobile-link]", {
        opacity: 0,
        y: 18,
        duration: 0.5,
        stagger: 0.06,
        ease: MOTION.ease.enter,
      });
    },
    { scope: root, dependencies: [open] },
  );

  return (
    <header
      ref={root}
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[transform,background-color,border-color,backdrop-filter] duration-300 ease-out",
        // Barra a todo el ancho: al bajar gana fondo, desenfoque y filo inferior.
        scrolled
          ? "border-b border-ink/8 bg-white/80 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent",
        // Se retira hacia arriba al bajar; vuelve al subir. El menú móvil
        // abierto la mantiene visible para no dejar el botón de cerrar fuera.
        oculto && !open ? "-translate-y-full" : "translate-y-0",
      )}
    >
      <nav
        aria-label="Principal"
        className={cn(
          "mx-auto flex max-w-[1400px] items-center gap-6 px-6 transition-all duration-300 sm:px-10",
          scrolled ? "h-16" : "h-20",
        )}
      >
        <Link
          href="/"
          data-nav-logo
          className="flex shrink-0 items-center gap-2 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-flame"
        >
          <Image
            src="/logos/isotipo-vekino.svg"
            alt="Vekino"
            width={30}
            height={30}
            className="h-[30px] w-[30px]"
            priority
          />
          <span className="text-lg font-semibold tracking-tight text-ink">
            vekino
          </span>
        </Link>

        <ul className="ml-2 hidden flex-1 items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <li key={l.href} data-nav-link>
              <a
                href={l.href}
                className="group relative rounded-lg px-3 py-2 text-sm font-medium text-slate-ink transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flame"
              >
                {l.label}
                {/* Indicador animado bajo el enlace */}
                <span
                  aria-hidden
                  className="absolute inset-x-3 bottom-1 h-0.5 origin-left scale-x-0 rounded-full bg-flame transition-transform duration-300 group-hover:scale-x-100"
                />
              </a>
            </li>
          ))}
        </ul>

        <div
          data-nav-actions
          className="ml-auto hidden items-center gap-2 lg:flex"
        >
          <Link
            href="/login"
            className="rounded-pill px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-ink/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Ingresar
          </Link>
          <MagneticButton
            href="#contacto"
            className="h-11 px-6 text-sm"
          >
            Solicitar demo
          </MagneticButton>
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          aria-expanded={open}
          className="ml-auto flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-ink/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flame lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
      </nav>

      {/* Menú móvil a pantalla completa */}
      {open ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-ink px-6 pb-10 pt-6 lg:hidden">
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold text-white">vekino</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar menú"
              className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <ul className="mt-12 flex flex-col gap-2">
            {LINKS.map((l) => (
              <li key={l.href} data-mobile-link>
                <a
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block py-3 text-3xl font-semibold tracking-tight text-white/90 transition-colors hover:text-white"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="mt-auto flex flex-col gap-3">
            <MagneticButton
              href="#contacto"
              magnetic={false}
              className="w-full"
            >
              Solicitar demo
            </MagneticButton>
            <MagneticButton
              href="/login"
              variant="light"
              magnetic={false}
              className="w-full"
            >
              Ingresar
            </MagneticButton>
          </div>
        </div>
      ) : null}
    </header>
  );
}
