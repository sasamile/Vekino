"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { Building2, Check, ShieldCheck, Smartphone } from "lucide-react";
import {
  gsap,
  useGSAP,
  ScrollTrigger,
  MEDIA,
  shouldSkipIntro,
} from "@/lib/gsap";
import { SectionLabel } from "./ui/section-label";
import { CroppedPhone, type PhoneShot } from "./ui/cropped-phone";

/* Capturas reales del producto con datos ficticios (conjuntos y personas
 * inventados). Ver components/landing/README.md. */
const PERFILES = [
  {
    id: "administracion",
    tab: "Administración",
    icon: Building2,
    titulo: "Controla la operación desde un panel central.",
    copy: "Recaudo, cartera, comunicados y reservas: toda la operación del conjunto en una sola pantalla.",
    features: [
      "Residentes y unidades",
      "Cartera y estados de cuenta",
      "Comunicados y notificaciones",
      "Reservas de zonas comunes",
      "Documentos y contratos",
      "Reportes administrativos",
    ],
    img: {
      src: "/landing/hero.png",
      alt: "Panel de administración de Vekino con recaudo del mes, cartera pendiente y estado de cartera",
    },
  },
  {
    id: "residentes",
    tab: "Residentes",
    icon: Smartphone,
    titulo: "Todo lo que el residente necesita, desde su celular.",
    copy: "Sin llamar a la administración ni buscar en el chat del conjunto.",
    features: [
      "Consultar estados de cuenta",
      "Descargar recibos",
      "Autorizar visitantes",
      "Reservar zonas comunes",
      "Recibir comunicados",
      "Reportar novedades",
    ],
    img: {
      src: "/landing/propietario-dashboard.png",
      alt: "Portal del propietario en Vekino con avisos, total pendiente, saldo a favor y facturas recientes",
    },
    phone: "mobile-dashboard" as PhoneShot,
  },
  {
    id: "vigilancia",
    tab: "Vigilancia",
    icon: ShieldCheck,
    titulo: "Más control en la portería, menos papel.",
    copy: "Cada ingreso queda registrado con su hora, su unidad y quién lo autorizó.",
    features: [
      "Validación de visitantes",
      "Lectura de códigos QR",
      "Registro de paquetes",
      "Minuta digital",
      "Consulta de autorizaciones",
      "Registro de novedades",
    ],
    img: {
      src: "/landing/visitantes-web.png",
      alt: "Listado de visitantes en Vekino con códigos QR, estados de acceso y horas de ingreso",
    },
  },
];

export function ConnectedExperience() {
  const root = useRef<HTMLElement>(null);
  const [activo, setActivo] = useState(0);

  useGSAP(
    () => {
      if (shouldSkipIntro()) return;
      const mm = gsap.matchMedia();

      /* Escritorio: la sección se queda fija y las pestañas avanzan solas
       * con el scroll. Damos una pantalla completa de recorrido por rol, y
       * `setActivo` solo se llama cuando el índice cambia de verdad — si se
       * llamara en cada frame, React re-renderizaría la sección entera (con
       * sus capturas) decenas de veces por segundo y trabaría el scroll. */
      mm.add(MEDIA.desktop, () => {
        let ultimo = -1;

        ScrollTrigger.create({
          trigger: "[data-pin-wrap]",
          start: "top top",
          // ~0.55 pantallas por rol: suficiente para que el cambio se lea
          // sin obligar a scrollear tres pantallas completas.
          end: () => `+=${window.innerHeight * 0.55 * PERFILES.length}`,
          pin: "[data-pin-inner]",
          anticipatePin: 1,
          invalidateOnRefresh: true,
          fastScrollEnd: true,
          onUpdate: (self) => {
            const i = Math.min(
              PERFILES.length - 1,
              Math.floor(self.progress * PERFILES.length),
            );
            if (i === ultimo) return;
            ultimo = i;
            setActivo(i);
          },
        });
      });

      mm.add(`${MEDIA.desktop}, ${MEDIA.tablet}, ${MEDIA.mobile}`, () => {
        gsap.from("[data-tabs-bar]", {
          opacity: 0,
          y: 20,
          duration: 0.7,
          ease: "power2.out",
          scrollTrigger: { trigger: root.current, start: "top 72%" },
        });
        gsap.from("[data-panel-shell]", {
          opacity: 0,
          y: 44,
          scale: 0.97,
          duration: 0.9,
          ease: "power3.out",
          scrollTrigger: { trigger: root.current, start: "top 68%" },
        });
      });
    },
    { scope: root },
  );

  // Cambio de pestaña: el contenido nuevo entra con un swap corto.
  useGSAP(
    () => {
      if (shouldSkipIntro()) return;
      gsap.fromTo(
        "[data-panel-swap]",
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" },
      );
      gsap.fromTo(
        "[data-panel-shot]",
        { opacity: 0, scale: 0.985 },
        { opacity: 1, scale: 1, duration: 0.5, ease: "power2.out" },
      );
    },
    { scope: root, dependencies: [activo] },
  );

  const p = PERFILES[activo]!;

  return (
    <section ref={root} id="soluciones" className="bg-mist py-16 lg:py-0">
      {/* El wrapper aporta la altura del recorrido; el inner es lo que se
          queda fijo. En escritorio ocupa exactamente una pantalla y centra su
          contenido, para que el panel nunca quede cortado al fijarse. */}
      <div data-pin-wrap>
        <div
          data-pin-inner
          className="flex flex-col justify-center lg:h-screen lg:py-6"
        >
          <div className="mx-auto max-w-6xl px-6 text-center">
            <SectionLabel>Una plataforma. Toda la comunidad.</SectionLabel>
            <h2 className="mx-auto mt-5 max-w-[22ch] text-[clamp(1.9rem,3.4vw,2.75rem)] font-semibold leading-[1.08] tracking-[-0.025em] text-ink">
              Cada rol, su propia experiencia.
            </h2>
          </div>

          {/* Selector de rol */}
          <div
            data-tabs-bar
            role="tablist"
            aria-label="Perfiles de la plataforma"
            className="mx-auto mt-6 flex w-fit max-w-full flex-wrap justify-center gap-1.5 rounded-pill bg-white p-1.5 ring-1 ring-ink/8 shadow-[0_10px_30px_-18px_rgba(4,32,70,0.35)]"
          >
            {PERFILES.map((perfil, i) => (
              <button
                key={perfil.id}
                type="button"
                role="tab"
                aria-selected={activo === i}
                onClick={() => setActivo(i)}
                className={`flex items-center gap-2 rounded-pill px-5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flame ${
                  activo === i
                    ? "bg-ink text-white"
                    : "text-slate-ink hover:bg-mist hover:text-ink"
                }`}
              >
                <perfil.icon className="h-4 w-4" aria-hidden />
                {perfil.tab}
              </button>
            ))}
          </div>

          {/* Panel: texto a la izquierda, captura saliéndose por la derecha */}
          <div
            data-panel-shell
            className="mx-auto mt-8 w-full max-w-[1400px] overflow-hidden px-6"
          >
            <div className="relative overflow-hidden rounded-[32px] bg-ink px-7 py-8 sm:px-11 sm:py-10">
              {/* Halos del panel */}
              <div
                aria-hidden
                className="pointer-events-none absolute -left-24 -top-24 h-[380px] w-[380px] rounded-full bg-sky/25 blur-[64px]"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute -bottom-32 right-1/3 h-[360px] w-[360px] rounded-full bg-flame/18 blur-[64px]"
              />

              <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] lg:gap-14">
                <div data-panel-swap>
                  <h3 className="max-w-[18ch] text-[clamp(1.45rem,2.1vw,1.95rem)] font-semibold leading-[1.12] tracking-[-0.02em] text-white">
                    {p.titulo}
                  </h3>
                  <p className="mt-3 max-w-[40ch] text-[15px] leading-relaxed text-white/55">
                    {p.copy}
                  </p>
                  <ul className="mt-5 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-1">
                    {p.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-2.5 text-[14px] leading-snug text-white/75"
                      >
                        <Check
                          className="mt-0.5 h-4 w-4 shrink-0 text-flame-soft"
                          aria-hidden
                        />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>

                <div data-panel-shot className="relative">
                  {/* La captura se desborda por la derecha del panel: da
                  profundidad y le quita lo "plano" a la sección. */}
                  <div className="lg:-mr-24 xl:-mr-32">
                    <Image
                      src={p.img.src}
                      alt={p.img.alt}
                      width={1672}
                      height={941}
                      className="h-auto w-full rounded-[16px] ring-1 ring-white/15 shadow-[0_40px_90px_-35px_rgba(0,0,0,0.7)]"
                      sizes="(min-width: 1024px) 860px, 100vw"
                    />
                  </div>

                  {p.phone ? (
                    <CroppedPhone
                      name={p.phone}
                      className="!absolute -bottom-6 -left-4 hidden w-[21%] max-w-[150px] drop-shadow-[0_24px_48px_rgba(0,0,0,0.55)] sm:block"
                      sizes="150px"
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
