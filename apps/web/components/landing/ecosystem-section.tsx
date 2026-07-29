"use client";

import Image from "next/image";
import { useRef } from "react";
import {
  Building2,
  Gavel,
  KeyRound,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react";
import { gsap, useGSAP, MOTION, MEDIA, shouldSkipIntro } from "@/lib/gsap";
import { SectionLabel } from "./ui/section-label";
import { glass } from "./ui/glass";

/* Nodos en órbita. Las posiciones se calculan una vez sobre un círculo de
 * radio 40% y se dejan escritas: nada de trigonometría en cada render. */
const NODOS = [
  {
    icon: Building2,
    titulo: "Administración",
    detalle: "Cartera, comunicados y reportes",
    x: 50,
    y: 10,
  },
  {
    icon: Users,
    titulo: "Residentes",
    detalle: "Facturas, reservas y visitas",
    x: 85,
    y: 30,
  },
  {
    icon: KeyRound,
    titulo: "Propietarios",
    detalle: "Estados de cuenta y documentos",
    x: 85,
    y: 70,
  },
  {
    icon: ShieldCheck,
    titulo: "Vigilancia",
    detalle: "QR, minuta y paquetería",
    x: 50,
    y: 90,
  },
  {
    icon: Gavel,
    titulo: "Consejo",
    detalle: "Actas, votaciones y quórum",
    x: 15,
    y: 70,
  },
  {
    icon: Truck,
    titulo: "Proveedores",
    detalle: "Ingresos autorizados y contratos",
    x: 15,
    y: 30,
  },
];

/** Tarjeta de nodo. Misma pieza en el diagrama y en la lista de móvil. */
function Nodo({
  icon: Icon,
  titulo,
  detalle,
}: {
  icon: typeof Users;
  titulo: string;
  detalle: string;
}) {
  return (
    <div
      data-nodo
      className="flex w-[150px] items-start gap-2 rounded-2xl p-3 ring-1 ring-inset ring-white/70"
      style={glass()}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-flame-tint">
        <Icon className="h-4 w-4 text-flame" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold leading-tight text-ink">
          {titulo}
        </span>
        <span className="mt-0.5 block text-[12px] leading-snug text-slate-ink">
          {detalle}
        </span>
      </span>
    </div>
  );
}

export function EcosystemSection() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (shouldSkipIntro()) return;
      const mm = gsap.matchMedia();

      mm.add(`${MEDIA.desktop}, ${MEDIA.tablet}, ${MEDIA.mobile}`, () => {
        const st = { trigger: "[data-orbita]", start: "top 78%" } as const;

        gsap.from("[data-core]", {
          opacity: 0,
          scale: 0.7,
          duration: 0.8,
          ease: MOTION.ease.pop,
          scrollTrigger: st,
        });

        // Los radios se dibujan desde el centro hacia fuera.
        gsap.utils
          .toArray<SVGLineElement>("[data-radio]")
          .forEach((line, i) => {
            const len = line.getTotalLength();
            gsap.set(line, { strokeDasharray: len, strokeDashoffset: len });
            gsap.to(line, {
              strokeDashoffset: 0,
              duration: 0.7,
              delay: 0.2 + i * 0.08,
              ease: MOTION.ease.large,
              scrollTrigger: st,
            });
          });

        gsap.from("[data-nodo]", {
          opacity: 0,
          scale: 0.85,
          duration: 0.55,
          stagger: 0.09,
          delay: 0.35,
          ease: MOTION.ease.pop,
          scrollTrigger: st,
        });
      });

      // Anillo punteado girando lento: sugiere actividad sin distraer.
      mm.add(`${MEDIA.desktop}, ${MEDIA.tablet}`, () => {
        gsap.to("[data-anillo]", {
          rotation: 360,
          duration: 90,
          ease: "none",
          repeat: -1,
          transformOrigin: "50% 50%",
        });
        gsap.to("[data-core-halo]", {
          scale: 1.12,
          opacity: 0.55,
          duration: 5,
          ease: MOTION.ease.loop,
          repeat: -1,
          yoyo: true,
        });
      });
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      className="relative overflow-hidden bg-white px-6 py-20 sm:py-24"
    >
      {/* Dos columnas: el mensaje a la izquierda, el diagrama a la derecha. */}
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-14 lg:flex-row lg:items-center lg:gap-10">
        <div data-parallax="0.12" className="lg:w-[440px] lg:shrink-0">
          <SectionLabel>Un solo ecosistema</SectionLabel>
          <h2 className="mt-6 max-w-[14ch] text-[clamp(2rem,3.4vw,2.9rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-ink">
            Todos hablando el mismo idioma.
          </h2>
          <p className="mt-6 max-w-[46ch] text-[17px] leading-relaxed text-slate-ink">
            Seis perfiles distintos, una sola fuente de información. Lo que
            registra la portería lo ve la administración, y lo que factura la
            administración lo ve el propietario.
          </p>
        </div>

        {/* ── Diagrama: solo desde tablet ── */}
        <div
          data-orbita
          className="relative mx-auto hidden aspect-square w-full max-w-[620px] flex-1 sm:block"
        >
        {/* Halos del fondo */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-[18%] rounded-full bg-flame/10 blur-[64px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-[26%] rounded-full bg-sky/12 blur-[64px]"
        />

        {/* Anillos y radios */}
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          className="absolute inset-0 h-full w-full"
        >
          <circle
            data-anillo
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="var(--color-ink)"
            strokeOpacity="0.14"
            strokeWidth="0.25"
            strokeDasharray="1.6 1.6"
          />
          <circle
            cx="50"
            cy="50"
            r="27"
            fill="none"
            stroke="var(--color-ink)"
            strokeOpacity="0.07"
            strokeWidth="0.2"
          />
          {NODOS.map((n) => (
            <line
              key={n.titulo}
              data-radio
              x1="50"
              y1="50"
              x2={50 + (n.x - 50) * 0.5}
              y2={50 + (n.y - 50) * 0.5}
              stroke="var(--color-ink)"
              strokeOpacity="0.16"
              strokeWidth="0.25"
            />
          ))}
        </svg>

        {/* Núcleo */}
        <div
          data-core
          className="absolute left-1/2 top-1/2 flex h-[104px] w-[104px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-ink text-center shadow-[0_30px_60px_-25px_rgba(4,32,70,0.6)]"
        >
          <span
            data-core-halo
            aria-hidden
            className="pointer-events-none absolute -inset-6 -z-10 rounded-full bg-flame/25 blur-[40px]"
          />
          <Image
            src="/logos/isotipo-vekino.svg"
            alt=""
            width={24}
            height={24}
            className="h-[24px] w-[24px]"
          />
          <span className="mt-1 text-[14px] font-semibold tracking-tight text-white">
            vekino
          </span>
          <span className="mt-0.5 text-[10px] text-white/45">
            Una sola fuente
          </span>
        </div>

        {/* Nodos sobre la órbita */}
        {NODOS.map((n) => (
          <div
            key={n.titulo}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${n.x}%`, top: `${n.y}%` }}
          >
            <Nodo icon={n.icon} titulo={n.titulo} detalle={n.detalle} />
          </div>
        ))}
      </div>

      </div>

      {/* ── Móvil: la misma información en lista ── */}
      <ul className="mx-auto mt-14 grid max-w-md gap-3 sm:hidden">
        {NODOS.map((n) => (
          <li key={n.titulo}>
            <Nodo icon={n.icon} titulo={n.titulo} detalle={n.detalle} />
          </li>
        ))}
        <li className="mt-2 flex items-center gap-3 rounded-2xl bg-ink p-4">
          <Image
            src="/logos/isotipo-vekino.svg"
            alt=""
            width={26}
            height={26}
            className="h-[26px] w-[26px]"
          />
          <span className="text-[15px] font-semibold text-white">
            Todo conectado en Vekino
          </span>
        </li>
      </ul>
    </section>
  );
}
