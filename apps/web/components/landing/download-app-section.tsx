"use client";

import { useRef } from "react";
import {
  CalendarCheck,
  CreditCard,
  Layers,
  Package,
  QrCode,
  Users,
} from "lucide-react";
import { gsap, useGSAP, MOTION, MEDIA, shouldSkipIntro } from "@/lib/gsap";
import { SectionLabel } from "./ui/section-label";
import { StoreButton } from "./ui/store-buttons";
import { CroppedPhone } from "./ui/cropped-phone";
import { DEMO } from "./ui/mockups";
import { cn } from "@/lib/utils";

/** Tarjeta flotante del collage. Se apila en móvil y flota en escritorio. */
function Flotante({
  className,
  children,
  tint,
}: {
  className?: string;
  children: React.ReactNode;
  tint?: "flame" | "sky" | "violet";
}) {
  return (
    <div
      data-flotante
      className={cn(
        "rounded-[20px] p-4 ring-1 ring-inset ring-white/70",
        "shadow-[0_18px_40px_-22px_rgba(4,32,70,0.35)]",
        tint === "flame" && "bg-flame-tint/85",
        tint === "sky" && "bg-sky/10",
        tint === "violet" && "bg-[#8b5cf6]/10",
        !tint && "bg-white/90",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DownloadAppSection() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (shouldSkipIntro()) return;
      const mm = gsap.matchMedia();

      mm.add(`${MEDIA.desktop}, ${MEDIA.tablet}, ${MEDIA.mobile}`, () => {
        gsap.from("[data-app-head] > *", {
          opacity: 0,
          y: 20,
          duration: 0.7,
          stagger: 0.08,
          ease: MOTION.ease.enter,
          scrollTrigger: { trigger: root.current, start: "top 72%" },
        });

        gsap.from("[data-phone-main]", {
          opacity: 0,
          y: 60,
          scale: 0.94,
          duration: 1,
          ease: MOTION.ease.title,
          scrollTrigger: { trigger: "[data-collage]", start: "top 80%" },
        });

        // Las tarjetas salen del teléfono, una por una.
        gsap.from("[data-flotante]", {
          opacity: 0,
          scale: 0.86,
          y: 20,
          duration: 0.6,
          stagger: 0.11,
          ease: MOTION.ease.pop,
          scrollTrigger: { trigger: "[data-collage]", start: "top 78%" },
        });

        /* Las flechas se dibujan con strokeDashoffset — DrawSVGPlugin es de
         * pago y no está disponible. */
        gsap.utils
          .toArray<SVGPathElement>("[data-flecha]")
          .forEach((path, i) => {
            const len = path.getTotalLength();
            gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
            gsap.to(path, {
              strokeDashoffset: 0,
              duration: 0.9,
              delay: 0.35 + i * 0.15,
              ease: MOTION.ease.large,
              scrollTrigger: { trigger: "[data-collage]", start: "top 78%" },
            });
          });
      });

      // Flotación ambiental, desfasada para que no vayan en bloque.
      mm.add(MEDIA.desktop, () => {
        gsap.to("[data-flotante]", {
          y: -8,
          duration: 4.5,
          ease: MOTION.ease.loop,
          repeat: -1,
          yoyo: true,
          stagger: { each: 0.7, from: "random" },
        });
      });
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      id="aplicacion"
      className="relative overflow-hidden bg-mist px-6 py-20 sm:py-24"
    >
      {/* Ambiente cálido detrás del collage */}
      <div
        data-parallax="0.2"
        aria-hidden
        className="pointer-events-none absolute right-[-10%] top-1/4 h-[620px] w-[720px] rounded-full bg-flame/16 blur-[64px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[6%] top-[14%] h-[360px] w-[360px] rounded-full bg-sky/16 blur-[64px]"
      />

      {/* Dos columnas: el mensaje a la izquierda, el producto a la derecha. */}
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-14 lg:flex-row lg:items-center lg:gap-10">
        {/* ── Izquierda: mensaje y descarga ── */}
        <div data-app-head className="lg:w-[380px] lg:shrink-0">
          <SectionLabel>Disponible para residentes</SectionLabel>
          <h2 className="mt-6 text-[clamp(2rem,3.6vw,3.1rem)] font-semibold leading-[1.06] tracking-[-0.03em] text-ink">
            Una sola app. Todo tu conjunto.
          </h2>
          <p className="mt-5 max-w-[42ch] text-[17px] leading-relaxed text-slate-ink">
            Facturas, visitas, reservas y comunicados — en el bolsillo, sin
            llamar a la administración.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <StoreButton store="appStore" />
            <StoreButton store="playStore" />
          </div>

          {/* Los dos datos de apoyo viven aquí, no flotando: en media pantalla
              no cabían seis tarjetas alrededor del teléfono. */}
          <ul className="mt-9 grid gap-4 border-t border-ink/10 pt-7 sm:grid-cols-2">
            <li>
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4 shrink-0 text-sky" aria-hidden />
                <span className="text-[14px] font-semibold text-ink">
                  8 perfiles conectados
                </span>
              </span>
              <span className="mt-1 block text-[13px] leading-snug text-slate-ink">
                Administración, residentes, portería y consejo
              </span>
            </li>
            <li>
              <span className="flex items-center gap-2">
                <Layers className="h-4 w-4 shrink-0 text-flame" aria-hidden />
                <span className="text-[14px] font-semibold text-ink">
                  Información 24/7
                </span>
              </span>
              <span className="mt-1 block text-[13px] leading-snug text-slate-ink">
                Sin esperar el horario de oficina
              </span>
            </li>
          </ul>
        </div>

        {/* ── Derecha: teléfono con las tarjetas flotando ──
            En escritorio las tarjetas van en posición absoluta alrededor del
            teléfono; en móvil se apilan debajo en grilla. */}
        <div
          data-collage
          className="relative w-full flex-1 lg:h-[520px]"
        >
          {/* Flechas: solo escritorio, decorativas */}
          <svg
            aria-hidden
            viewBox="0 0 620 560"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block"
          >
            {[
              "M152 128 C 176 140, 190 156, 200 176",
              "M468 118 C 444 130, 430 148, 420 168",
              "M152 432 C 176 420, 190 404, 200 384",
              "M468 442 C 444 430, 430 412, 420 392",
            ].map((d) => (
              <path
                key={d}
                data-flecha
                d={d}
                fill="none"
                stroke="var(--color-ink)"
                strokeOpacity="0.22"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            ))}
          </svg>

          {/* Teléfonos: el de facturas asoma detrás, ladeado */}
          <div className="relative flex justify-center lg:h-full lg:items-center">
            <CroppedPhone
              name="mobile-facturas"
              className="!absolute left-1/2 top-1/2 hidden w-[172px] -translate-x-[78%] -translate-y-[46%] -rotate-[9deg] opacity-90 drop-shadow-[0_30px_60px_rgba(4,32,70,0.26)] lg:block"
              sizes="172px"
            />
            <span data-phone-main className="relative z-10 block">
              <CroppedPhone
                name="mobile-dashboard"
                className="w-[230px] drop-shadow-[0_40px_70px_rgba(4,32,70,0.35)] sm:w-[248px]"
                sizes="248px"
                priority
              />
            </span>
          </div>

          {/* Tarjetas */}
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:mt-0 lg:block">
            <Flotante
              tint="violet"
              className="lg:absolute lg:left-0 lg:top-[24px] lg:z-20 lg:w-[196px]"
            >
              <span className="block text-[1.7rem] font-semibold leading-none tracking-tight text-ink">
                12 módulos
              </span>
              <span className="mt-2 block text-[12.5px] leading-snug text-slate-ink">
                Cartera, visitas, reservas y más, ya integrados
              </span>
            </Flotante>

            <Flotante className="lg:absolute lg:right-0 lg:top-0 lg:z-20 lg:w-[196px]">
              <span className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-flame-tint">
                  <QrCode className="h-4 w-4 text-flame" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold leading-tight text-ink">
                    Visitante autorizado
                  </span>
                  <span className="block truncate text-[12px] text-slate-ink">
                    {DEMO.visitante}
                  </span>
                </span>
              </span>
              <span className="mt-3 inline-flex rounded-pill bg-[#e8f7ea] px-2.5 py-1 text-[11px] font-medium text-[#1d7a35]">
                Ingreso 7:12 a. m.
              </span>
            </Flotante>

            <Flotante className="lg:absolute lg:left-0 lg:top-[72%] lg:z-20 lg:w-[196px]">
              <span className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky/12">
                  <CalendarCheck className="h-4 w-4 text-sky" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold leading-tight text-ink">
                    {DEMO.zona}
                  </span>
                  <span className="block text-[12px] text-slate-ink">
                    {DEMO.fecha} · 4:00 p. m.
                  </span>
                </span>
              </span>
              <span className="mt-3 flex items-center gap-2 text-[12px] text-slate-ink">
                <Package className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Paquete en portería
              </span>
            </Flotante>

            <Flotante
              tint="flame"
              className="lg:absolute lg:bottom-0 lg:right-0 lg:top-auto lg:z-20 lg:w-[196px]"
            >
              <span className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/70">
                  <CreditCard className="h-4 w-4 text-flame" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold leading-tight text-ink">
                    Paga en línea
                  </span>
                  <span className="block text-[12px] text-slate-ink">
                    PSE y bancos aliados
                  </span>
                </span>
              </span>
              <span className="mt-3 block text-[12px] leading-snug text-slate-ink">
                Descarga el PDF de cada cuenta
              </span>
            </Flotante>
          </div>
        </div>
      </div>
    </section>
  );
}
