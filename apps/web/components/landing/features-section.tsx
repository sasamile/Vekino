"use client";

import { useRef } from "react";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Package,
  QrCode,
  ShieldAlert,
} from "lucide-react";
import { gsap, useGSAP, MOTION, shouldSkipIntro } from "@/lib/gsap";
import { SectionLabel } from "./ui/section-label";
import { DEMO } from "./ui/mockups";
import { cn } from "@/lib/utils";
import { glass } from "./ui/glass";

/**
 * Celda del bento en vidrio (iOS liquid glass).
 *
 * Estructura fija en tres bloques: etiqueta de categoría arriba, el visual
 * ocupando el espacio libre en medio, y título + descripción abajo. Al
 * alinear todos los títulos al pie, la retícula se lee ordenada aunque las
 * celdas tengan alturas distintas.
 *
 * El vidrio necesita tres capas para leerse: `backdrop-filter` (desenfoca los
 * halos que viven detrás de la grilla), un degradado translúcido —no un color
 * plano— que simula el grosor, y cantos `inset` claros. Sin halos detrás no
 * hay nada que desenfocar y el efecto no aparece.
 */
function Cell({
  area,
  categoria,
  icon: Icon,
  title,
  copy,
  children,
  tone = "light",
}: {
  area: string;
  categoria: string;
  icon: typeof QrCode;
  title: string;
  copy: string;
  children?: React.ReactNode;
  tone?: "light" | "dark";
}) {
  const oscuro = tone === "dark";
  return (
    <article
      data-bento-cell
      className={cn(
        "group relative flex min-h-[180px] flex-col overflow-hidden rounded-[26px] p-6 sm:p-7",
        "transition-transform duration-500 hover:-translate-y-1 motion-reduce:hover:translate-y-0",
        area,
      )}
      style={glass(tone)}
    >
      {/* Canto de cristal */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 rounded-[26px] ring-1 ring-inset",
          oscuro ? "ring-white/12" : "ring-white/70",
        )}
      />
      {/* Brillo que barre al pasar el cursor */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -inset-y-10 -left-1/3 w-1/3 -skew-x-12 opacity-0",
          "bg-gradient-to-r from-transparent to-transparent transition-all duration-700",
          "group-hover:left-[115%] group-hover:opacity-100 motion-reduce:hidden",
          oscuro ? "via-white/12" : "via-white/55",
        )}
      />

      {/* 1 · Categoría */}
      <span
        className={cn(
          "relative flex items-center gap-2 text-[13px] font-medium",
          oscuro ? "text-white/45" : "text-slate-ink",
        )}
      >
        <Icon
          className={cn("h-4 w-4", oscuro ? "text-flame-soft" : "text-flame")}
          aria-hidden
        />
        {categoria}
      </span>

      {/* 2 · Visual, empuja el texto al pie */}
      <div className="relative flex flex-1 items-center py-6">{children}</div>

      {/* 3 · Título y descripción, siempre abajo */}
      <h3
        className={cn(
          "relative text-[1.2rem] font-semibold leading-tight tracking-[-0.015em]",
          oscuro ? "text-white" : "text-ink",
        )}
      >
        {title}
      </h3>
      <p
        className={cn(
          "relative mt-1.5 max-w-[34ch] text-[14px] leading-relaxed",
          oscuro ? "text-white/55" : "text-slate-ink",
        )}
      >
        {copy}
      </p>
    </article>
  );
}

export function FeaturesSection() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (shouldSkipIntro()) return;

      gsap.from("[data-bento-cell]", {
        opacity: 0,
        y: 32,
        scale: 0.97,
        duration: 0.8,
        stagger: MOTION.stagger.cards,
        ease: MOTION.ease.large,
        scrollTrigger: { trigger: "[data-bento]", start: "top 82%" },
      });

      gsap.from("[data-qr-cell]", {
        opacity: 0,
        scale: 0.4,
        duration: 0.5,
        stagger: { each: 0.012, from: "random" },
        ease: MOTION.ease.pop,
        scrollTrigger: { trigger: "[data-qr]", start: "top 88%" },
      });

      const counter = { v: 0 };
      gsap.fromTo(
        counter,
        { v: 0 },
        {
          v: 92,
          duration: 1.6,
          ease: "power2.out",
          scrollTrigger: { trigger: "[data-counter]", start: "top 88%" },
          onUpdate() {
            const el = root.current?.querySelector("[data-counter]");
            if (el) el.textContent = `${Math.round(counter.v)}%`;
          },
        },
      );
      gsap.from("[data-bar]", {
        scaleX: 0,
        transformOrigin: "left center",
        duration: 1.4,
        ease: "power3.out",
        scrollTrigger: { trigger: "[data-counter]", start: "top 88%" },
      });

      gsap.from("[data-notif-row]", {
        opacity: 0,
        x: 24,
        duration: 0.5,
        stagger: 0.09,
        ease: MOTION.ease.enter,
        scrollTrigger: { trigger: "[data-notifs]", start: "top 88%" },
      });

      gsap.fromTo(
        "[data-parcel]",
        { yPercent: 0 },
        {
          yPercent: 220,
          duration: 1.5,
          ease: "power2.inOut",
          scrollTrigger: { trigger: "[data-parcel-track]", start: "top 86%" },
        },
      );

      gsap.from("[data-timeline-line]", {
        scaleY: 0,
        transformOrigin: "top center",
        duration: 1.1,
        ease: "power2.out",
        scrollTrigger: { trigger: "[data-timeline]", start: "top 88%" },
      });
      gsap.from("[data-timeline-item]", {
        opacity: 0,
        x: 14,
        duration: 0.5,
        stagger: 0.13,
        ease: MOTION.ease.enter,
        scrollTrigger: { trigger: "[data-timeline]", start: "top 88%" },
      });
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      id="beneficios"
      className="relative overflow-hidden bg-mist px-6 py-20 sm:py-24"
    >
      <div data-parallax="0.1" className="relative mx-auto max-w-6xl">
        <SectionLabel>Todo bajo control</SectionLabel>
        <h2 className="mt-6 max-w-[20ch] text-[clamp(2rem,4.4vw,3.4rem)] font-semibold leading-[1.08] tracking-[-0.025em] text-ink">
          Herramientas creadas para la vida real de una comunidad.
        </h2>
      </div>

      {/* Los halos van DETRÁS de la grilla: son lo que el `backdrop-filter`
          de cada celda desenfoca. */}
      <div className="relative mx-auto mt-8 max-w-6xl">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-16 top-10 h-[380px] w-[380px] rounded-full bg-flame/22 blur-[64px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute right-0 top-1/3 h-[420px] w-[420px] rounded-full bg-sky/25 blur-[64px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-1/3 h-[340px] w-[340px] rounded-full bg-[#8b5cf6]/16 blur-[64px]"
        />

        {/* Retícula 4×5 con celdas escalonadas: dos pequeñas arriba a la
            izquierda, una alta a la derecha, una ancha abajo a la izquierda
            y dos que cierran. */}
        <div
          data-bento
          className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-[repeat(5,minmax(72px,auto))]"
        >
          {/* Comunicados — pequeña, arriba izquierda */}
          <Cell
            area="lg:col-start-1 lg:col-end-2 lg:row-start-1 lg:row-end-3"
            categoria="Comunicación"
            icon={Bell}
            title="Información que sí llega"
            copy="Publica comunicados y notifica a toda la comunidad."
          >
            <div data-notifs className="w-full space-y-2">
              {["Mantenimiento", "Corte de agua", "Asamblea 2026"].map((t) => (
                <div
                  key={t}
                  data-notif-row
                  className="flex items-center gap-2 rounded-xl bg-white/55 px-3 py-2 ring-1 ring-inset ring-white/70"
                >
                  <Bell className="h-3 w-3 shrink-0 text-sky" aria-hidden />
                  <span className="truncate text-[12px] text-ink">{t}</span>
                </div>
              ))}
            </div>
          </Cell>

          {/* Paquetería — pequeña, arriba */}
          <Cell
            area="lg:col-start-2 lg:col-end-3 lg:row-start-1 lg:row-end-3"
            categoria="Entregas"
            icon={Package}
            title="Tus paquetes, ubicados"
            copy="Registra entregas en portería y avisa al residente."
          >
            <div
              data-parcel-track
              className="relative mx-auto flex h-[104px] w-full max-w-[150px] flex-col justify-between rounded-2xl bg-white/55 px-4 py-3 ring-1 ring-inset ring-white/70"
            >
              <span className="text-[11px] font-medium text-slate-ink">
                Portería
              </span>
              <span
                aria-hidden
                className="absolute left-1/2 top-8 h-12 w-px -translate-x-1/2 border-l border-dashed border-ink/20"
              />
              <span
                data-parcel
                className="absolute left-1/2 top-7 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-xl bg-flame"
              >
                <Package className="h-4 w-4 text-white" aria-hidden />
              </span>
              <span className="text-right text-[11px] font-medium text-slate-ink">
                {DEMO.residente.split(" ")[0]}
              </span>
            </div>
          </Cell>

          {/* Visitantes — alta, derecha */}
          <Cell
            area="lg:col-start-3 lg:col-end-5 lg:row-start-1 lg:row-end-4"
            categoria="Accesos"
            icon={QrCode}
            title="Visitas más rápidas y seguras"
            copy="Autoriza visitantes desde la aplicación y facilita su ingreso mediante códigos QR."
          >
            <div className="flex w-full flex-wrap items-center gap-7">
              <div
                data-qr
                className="grid h-28 w-28 shrink-0 grid-cols-9 gap-[2px] rounded-2xl bg-ink p-3.5"
              >
                {Array.from({ length: 81 }).map((_, i) => (
                  <span
                    key={i}
                    data-qr-cell
                    className={`rounded-[1px] ${
                      // Patrón determinista: mismo QR en servidor y cliente.
                      (i * 7 + Math.floor(i / 9) * 3) % 5 < 2
                        ? "bg-white"
                        : "bg-transparent"
                    }`}
                  />
                ))}
              </div>
              <div>
                <span className="block text-[15px] font-semibold text-ink">
                  {DEMO.visitante}
                </span>
                <span className="block text-[13px] text-slate-ink">
                  {DEMO.unidad} · {DEMO.fecha}
                </span>
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-pill bg-[#e8f7ea] px-3 py-1.5 text-[13px] font-medium text-[#1d7a35]">
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  Acceso autorizado
                </span>
              </div>
            </div>
          </Cell>

          {/* Cartera — ancha y alta, abajo izquierda, vidrio oscuro */}
          <Cell
            area="lg:col-start-1 lg:col-end-3 lg:row-start-3 lg:row-end-6"
            categoria="Finanzas"
            icon={CreditCard}
            title="Información financiera más clara"
            copy="Consulta estados de cuenta, registra pagos y mantén organizada la información de cada unidad."
            tone="dark"
          >
            <div className="w-full">
              <span className="block text-[clamp(3rem,6vw,4.5rem)] font-semibold leading-none tracking-tight text-white">
                {/* Valor final en el HTML; la animación lo lleva de 0 a 92. */}
                <span data-counter>92%</span>
              </span>
              <span className="mt-2 block text-[13px] text-white/50">
                cartera al día
              </span>
              <span className="mt-6 block h-2 w-full overflow-hidden rounded-full bg-white/15">
                <span
                  data-bar
                  className="block h-full w-[92%] rounded-full bg-flame"
                />
              </span>
              <div className="mt-5 flex gap-6 text-[12px] text-white/45">
                <span>190 al día</span>
                <span>14 pendientes</span>
                <span>2 vencidas</span>
              </div>
            </div>
          </Cell>

          {/* Reservas */}
          <Cell
            area="lg:col-start-3 lg:col-end-4 lg:row-start-4 lg:row-end-6"
            categoria="Zonas comunes"
            icon={CalendarDays}
            title="Reserva sin complicaciones"
            copy="Consulta disponibilidad y reserva desde la app."
          >
            <div className="w-full rounded-2xl bg-white/55 p-3.5 ring-1 ring-inset ring-white/70">
              <div className="grid grid-cols-7 gap-1 text-center">
                {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
                  <span key={i} className="text-[9px] text-slate-ink">
                    {d}
                  </span>
                ))}
                {Array.from({ length: 21 }).map((_, i) => (
                  <span
                    key={i}
                    className={`flex h-5 items-center justify-center rounded-md text-[10px] ${
                      i === 11
                        ? "bg-sky font-semibold text-white"
                        : "text-slate-ink"
                    }`}
                  >
                    {i + 1}
                  </span>
                ))}
              </div>
            </div>
          </Cell>

          {/* Novedades */}
          <Cell
            area="lg:col-start-4 lg:col-end-5 lg:row-start-4 lg:row-end-6"
            categoria="Seguridad"
            icon={ShieldAlert}
            title="Cada novedad registrada"
            copy="Centraliza reportes e incidencias con su trazabilidad."
          >
            <div data-timeline className="relative w-full pl-6">
              <span
                data-timeline-line
                aria-hidden
                className="absolute left-[5px] top-1.5 h-[calc(100%-12px)] w-px bg-ink/15"
              />
              {[
                { h: "07:12", t: "Ingreso autorizado" },
                { h: "09:05", t: "Paquete recibido" },
                { h: "14:30", t: "Reporte de ruido" },
              ].map((n) => (
                <div
                  key={n.h}
                  data-timeline-item
                  className="relative pb-3 last:pb-0"
                >
                  <span
                    aria-hidden
                    className="absolute -left-6 top-1.5 h-2.5 w-2.5 rounded-full bg-sky ring-4 ring-white/70"
                  />
                  <span className="block text-[10px] font-medium text-slate-ink">
                    {n.h}
                  </span>
                  <span className="block text-[13px] text-ink">{n.t}</span>
                </div>
              ))}
            </div>
          </Cell>
        </div>
      </div>
    </section>
  );
}
