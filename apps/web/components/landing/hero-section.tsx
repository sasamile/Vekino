"use client";

import Image from "next/image";
import { useRef } from "react";
import { ArrowRight } from "lucide-react";
import {
  gsap,
  useGSAP,
  SplitText,
  MOTION,
  MEDIA,
  shouldSkipIntro,
} from "@/lib/gsap";
import { MagneticButton } from "./ui/magnetic-button";

export function HeroSection() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(MEDIA.reduceMotion, () => {
        gsap.set("[data-hero-anim]", { clearProps: "all", opacity: 1 });
        gsap.set("[data-hero-media]", { clearProps: "all", opacity: 1 });
      });

      mm.add(
        {
          desktop: MEDIA.desktop,
          tablet: MEDIA.tablet,
          mobile: MEDIA.mobile,
        },
        (ctx) => {
          const { desktop } = ctx.conditions as { desktop: boolean };

          // Título por líneas dentro de una máscara.
          const split = new SplitText("[data-hero-title]", {
            type: "lines",
            linesClass: "hero-line",
            mask: "lines",
          });

          const tl = gsap.timeline({ defaults: { ease: MOTION.ease.enter } });

          tl.from("[data-hero-label]", { opacity: 0, y: 14, duration: 0.6 })
            .from(
              split.lines,
              {
                yPercent: 110,
                duration: MOTION.title,
                stagger: 0.09,
                ease: MOTION.ease.title,
              },
              "-=0.3",
            )
            .from("[data-hero-copy]", { opacity: 0, y: 16, duration: 0.7 }, "-=0.65")
            .from("[data-hero-cta]", { opacity: 0, y: 14, duration: 0.6 }, "-=0.45")
            .from("[data-hero-note]", { opacity: 0, duration: 0.5 }, "-=0.35")
            /* La imagen sube desde abajo ya inclinada: el "enderezado" lo hace
             * el scroll, no la entrada. */
            .from(
              "[data-hero-media]",
              {
                opacity: 0,
                y: 90,
                duration: 1.2,
                ease: MOTION.ease.title,
              },
              "-=0.85",
            );

          if (shouldSkipIntro()) tl.progress(1);

          /* Parallax de mouse muy contenido: solo escritorio, máx. 14 px. */
          if (desktop) {
            const setX = gsap.quickTo("[data-hero-media]", "x", {
              duration: 1,
              ease: "power3.out",
            });
            const setY = gsap.quickTo("[data-tilt]", "rotateY", {
              duration: 1,
              ease: "power3.out",
            });

            function onMove(e: PointerEvent) {
              const nx = e.clientX / window.innerWidth - 0.5;
              setX(nx * 14);
              setY(nx * 2.5);
            }
            window.addEventListener("pointermove", onMove);
            return () => window.removeEventListener("pointermove", onMove);
          }
        },
      );

      /* Parallax de scroll: la imagen entra inclinada hacia atrás y se
       * endereza a medida que el usuario baja — el gesto que "abre" el
       * producto. Después sigue subiendo más lento que la página. */
      mm.add(`${MEDIA.desktop}, ${MEDIA.tablet}`, () => {
        /* 1. Enderezado: la imagen entra muy inclinada y pequeña, y se abre
         * hasta quedar plana cuando llega a la mitad de la pantalla. */
        gsap.fromTo(
          "[data-tilt]",
          { rotateX: 34, scale: 0.8, y: 20 },
          {
            rotateX: 0,
            scale: 1,
            y: 0,
            ease: "none",
            scrollTrigger: {
              trigger: "[data-hero-media]",
              start: "top bottom",
              end: "top 26%",
              scrub: 0.7,
              invalidateOnRefresh: true,
            },
          },
        );

        /* 2. Parallax real: el texto sube MÁS RÁPIDO que la página y la
         * imagen MÁS LENTO. Esa diferencia de velocidad es lo que se lee
         * como profundidad. */
        gsap.to("[data-hero-text]", {
          yPercent: -55,
          opacity: 0.2,
          ease: "none",
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: "bottom top",
            scrub: 0.5,
          },
        });

        gsap.to("[data-hero-media]", {
          yPercent: 22,
          ease: "none",
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: "bottom top",
            scrub: 0.9,
          },
        });

        // 3. Los halos se mueven en sentido contrario: tercera capa de profundidad.
        gsap.to("[data-glow]", {
          yPercent: -40,
          ease: "none",
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: "bottom top",
            scrub: 1.2,
          },
        });
      });

      // Halos que respiran, muy lentos.
      gsap.to("[data-glow]", {
        scale: 1.15,
        opacity: 0.8,
        duration: 9,
        ease: MOTION.ease.loop,
        repeat: -1,
        yoyo: true,
        stagger: 1.5,
      });
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      className="relative overflow-hidden bg-mist pb-0 pt-24 sm:pt-28"
    >
      {/* Ambiente: halos de marca muy difusos sobre el fondo claro */}
      <div
        data-glow
        aria-hidden
        className="pointer-events-none absolute left-[8%] top-[10%] h-[460px] w-[460px] rounded-full bg-flame/12 blur-[64px]"
      />
      <div
        data-glow
        aria-hidden
        className="pointer-events-none absolute right-[6%] top-[4%] h-[420px] w-[420px] rounded-full bg-sky/14 blur-[64px]"
      />

      <div
        data-hero-text
        className="relative mx-auto max-w-5xl px-6 text-center"
      >
        <span
          data-hero-anim
          data-hero-label
          className="inline-flex items-center gap-2 rounded-pill border border-ink/10 bg-flame-tint px-4 py-1.5 text-xs font-medium tracking-wide text-flame"
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-flame" />
          La comunidad digital de tu conjunto
        </span>

        <h1
          data-hero-anim
          data-hero-title
          className="mx-auto mt-6 max-w-[16ch] text-[clamp(2.6rem,6.4vw,5.2rem)] font-semibold leading-[0.98] tracking-[-0.035em] text-ink"
        >
          Todo tu conjunto. Por fin en un solo lugar.
        </h1>

        <p
          data-hero-anim
          data-hero-copy
          className="mx-auto mt-6 max-w-[54ch] text-[clamp(1rem,1.4vw,1.19rem)] leading-relaxed text-slate-ink"
        >
          Vekino centraliza la administración, la comunicación, los pagos, las
          visitas, las reservas y la seguridad de tu comunidad en una plataforma
          fácil de usar.
        </p>

        <div data-hero-anim data-hero-cta className="mt-8">
          <MagneticButton href="#contacto">
            Solicitar una demostración
            <ArrowRight
              className="h-4 w-4 transition-transform group-hover:translate-x-1"
              aria-hidden
            />
          </MagneticButton>
        </div>

        <p
          data-hero-anim
          data-hero-note
          className="mt-5 text-sm text-slate-ink/70"
        >
          Para administradores, residentes y personal de vigilancia.
        </p>
      </div>

      {/* Producto: la imagen ya trae su propio marco de navegador */}
      <div
        data-hero-media
        className="relative mx-auto mt-6 max-w-6xl px-6 pb-20 sm:mt-8 sm:pb-24"
        style={{ perspective: "1600px" }}
      >
        <div
          data-tilt
          className="origin-top will-change-transform"
          style={{ transformStyle: "preserve-3d" }}
        >
          <div className="overflow-hidden rounded-[18px] shadow-[0_50px_100px_-40px_rgba(4,32,70,0.5)] ring-1 ring-ink/8">
            <Image
              src="/landing/hero.png"
              alt="Panel de administración de Vekino con el resumen mensual de un conjunto residencial"
              width={1672}
              height={941}
              className="h-auto w-full"
              priority
              sizes="(min-width: 1200px) 1104px, 100vw"
            />
          </div>
        </div>
      </div>

      <p className="sr-only">
        La pantalla mostrada contiene datos de demostración.
      </p>
    </section>
  );
}
