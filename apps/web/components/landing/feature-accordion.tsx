"use client";

import { useId, useState } from "react";
import {
  ArrowUpRight,
  CalendarCheck,
  FileText,
  Gavel,
  Megaphone,
  Minus,
  Plus,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { SectionBadge } from "./ui/badge";
import { Gauge, Sparkline } from "./ui/charts";
import { CountUp } from "./ui/count-up";
import { Reveal } from "./ui/reveal";
import { cn } from "@/lib/utils";

/**
 * Módulos, en acordeón.
 *
 * Solo uno abierto a la vez: la columna derecha es un bloque visual fijo y,
 * si se abrieran varios, la izquierda crecería hasta descuadrar la fila.
 * El detalle de cada módulo vive en el DOM siempre (con `hidden`), no se
 * monta al abrir: así el buscador lo indexa y no hay salto de layout.
 */
const MODULOS = [
  {
    icon: Wallet,
    titulo: "Cartera y recaudo",
    detalle:
      "Factura por unidad, registra pagos, genera estados de cuenta y sigue la cartera vencida sin salir del panel.",
  },
  {
    icon: ShieldCheck,
    titulo: "Visitantes y portería",
    detalle:
      "Autorizaciones desde la app, códigos QR con vigencia, minuta digital y registro de paquetería.",
  },
  {
    icon: CalendarCheck,
    titulo: "Reservas de zonas comunes",
    detalle:
      "Calendario por zona, reglas de uso, aprobación de la administración e historial de cada reserva.",
  },
  {
    icon: Megaphone,
    titulo: "Comunicación y PQRS",
    detalle:
      "Comunicados con confirmación de lectura, notificaciones push y peticiones con su responsable y su estado.",
  },
  {
    icon: Gavel,
    titulo: "Asambleas y votaciones",
    detalle:
      "Convocatoria, control de quórum, poderes, votación en vivo y acta con el resultado de cada punto.",
  },
  {
    icon: FileText,
    titulo: "Documentos y contratos",
    detalle:
      "Reglamento, actas, contratos y pólizas en un repositorio con permisos por perfil.",
  },
];

export function FeatureAccordion() {
  const [abierto, setAbierto] = useState(0);
  const baseId = useId();

  return (
    <section id="modulos" className="lp-section">
      <div className="lp-container">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
          {/* ── Columna izquierda ─────────────────────────────────────── */}
          <Reveal>
            <SectionBadge>Módulos</SectionBadge>
            <h2 className="mt-5 max-w-[15ch] text-[clamp(1.95rem,3.6vw,2.85rem)] font-[660] leading-[1.05] tracking-[-0.03em] text-heading">
              Una plataforma,{" "}
              <span className="text-brand-500">doce frentes</span> resueltos
            </h2>
            <p className="mt-4 max-w-[46ch] text-[15px] leading-[1.55] text-body">
              Activa solo lo que tu conjunto necesita. Todos los módulos leen y
              escriben sobre la misma información.
            </p>

            <ul className="mt-8 space-y-2">
              {MODULOS.map((m, i) => {
                const activo = abierto === i;
                const panelId = `${baseId}-panel-${i}`;
                const botonId = `${baseId}-boton-${i}`;

                return (
                  <li key={m.titulo}>
                    <div
                      className={cn(
                        "overflow-hidden rounded-[11px] border transition-colors duration-200",
                        activo
                          ? "border-brand-300 bg-brand-50"
                          : "border-line bg-surface hover:border-line-strong",
                      )}
                    >
                      <h3>
                        <button
                          type="button"
                          id={botonId}
                          aria-expanded={activo}
                          aria-controls={panelId}
                          onClick={() => setAbierto(activo ? -1 : i)}
                          className="flex w-full items-center gap-3 px-4 py-3.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500"
                        >
                          <m.icon
                            className={cn(
                              "h-[18px] w-[18px] shrink-0 transition-colors",
                              activo ? "text-brand-500" : "text-subtle",
                            )}
                            strokeWidth={1.8}
                            aria-hidden
                          />
                          <span
                            className={cn(
                              "flex-1 text-[14.5px] font-semibold tracking-[-0.01em]",
                              activo ? "text-brand-700" : "text-heading",
                            )}
                          >
                            {m.titulo}
                          </span>
                          {activo ? (
                            <Minus
                              className="h-4 w-4 shrink-0 text-brand-500"
                              strokeWidth={2}
                              aria-hidden
                            />
                          ) : (
                            <Plus
                              className="h-4 w-4 shrink-0 text-placeholder"
                              strokeWidth={2}
                              aria-hidden
                            />
                          )}
                        </button>
                      </h3>

                      {/* Alto animado con `grid-template-rows` (ver
                          `.lp-collapse`). `inert` cerrado: el contenido mide
                          cero pero seguiría siendo enfocable sin él. */}
                      <div
                        id={panelId}
                        role="region"
                        aria-labelledby={botonId}
                        data-abierto={activo}
                        inert={!activo}
                        className="lp-collapse"
                      >
                        <div>
                          <p className="max-w-[46ch] px-4 pb-4 pl-[45px] text-[13.5px] leading-[1.55] text-body">
                            {m.detalle}
                          </p>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Reveal>

          {/* ── Columna derecha · bloque visual ───────────────────────── */}
          <Reveal delay={120} className="lg:sticky lg:top-28 lg:self-start">
            <div className="relative overflow-hidden rounded-panel border border-brand-100 bg-surface-warm p-6 sm:p-8">
              {/* Halo durazno, muy contenido */}
              <span
                aria-hidden
                className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-100/60 blur-[60px]"
              />

              <div className="relative">
                <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-subtle">
                  Estado del conjunto
                </span>
                <p className="mt-1 text-[13px] text-body">
                  Parque Central Norte · Agosto 2026
                </p>

                <div className="mt-6 flex justify-center">
                  <Gauge
                    percent={80}
                    center={<CountUp value={80} suffix="%" />}
                    label="cartera al día"
                  />
                </div>

                <div className="mt-7 grid grid-cols-2 gap-3">
                  <div className="rounded-card border border-line bg-surface p-3.5">
                    <span className="text-[11px] font-medium text-subtle">
                      Recaudo del mes
                    </span>
                    <span className="mt-1 flex items-end justify-between gap-2">
                      <span className="text-[17px] font-semibold tracking-[-0.03em] text-heading">
                        $18.4 M
                      </span>
                      <Sparkline values={[30, 36, 33, 44, 41, 52, 58]} />
                    </span>
                  </div>
                  <div className="rounded-card border border-line bg-surface p-3.5">
                    <span className="text-[11px] font-medium text-subtle">
                      Reservas activas
                    </span>
                    <span className="mt-1 flex items-end justify-between gap-2">
                      <span className="text-[17px] font-semibold tracking-[-0.03em] text-heading">
                        48
                      </span>
                      <span className="rounded-pill bg-ok-soft px-1.5 py-0.5 text-[10px] font-semibold text-[#1b8b4d]">
                        ↑ 9%
                      </span>
                    </span>
                  </div>
                </div>

                {/* Tarjetas superpuestas: la profundidad del bloque */}
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-3 shadow-card">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-brand-50">
                      <ShieldCheck
                        className="h-4 w-4 text-brand-500"
                        strokeWidth={1.8}
                        aria-hidden
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-semibold leading-tight text-heading">
                        Andrea Ruiz · QR activo
                      </span>
                      <span className="block text-[11px] leading-tight text-subtle">
                        Torre 2 · Apto 402 — expira 05:30 p. m.
                      </span>
                    </span>
                    <ArrowUpRight
                      className="h-4 w-4 shrink-0 text-placeholder"
                      aria-hidden
                    />
                  </div>

                  <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-3 shadow-card">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-brand-50">
                      <Megaphone
                        className="h-4 w-4 text-brand-500"
                        strokeWidth={1.8}
                        aria-hidden
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-semibold leading-tight text-heading">
                        Mantenimiento de ascensores
                      </span>
                      <span className="block text-[11px] leading-tight text-subtle">
                        Leído por 184 de 206 unidades
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] font-semibold text-ok">
                      89%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
