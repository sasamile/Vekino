import { CalendarCheck, Map, QrCode, TrendingUp } from "lucide-react";
import { SectionBadge, StatusBadge } from "./ui/badge";
import { AreaLine, BarChart, LegendDot, CHART_COLORS } from "./ui/charts";
import { Reveal } from "./ui/reveal";
import { cn } from "@/lib/utils";

/**
 * Retícula 2 × 2 de funcionalidades.
 *
 * Cada tarjeta tiene una demostración visual distinta —plano, línea, barras
 * y tabla— para que la sección no se lea como cuatro copias del mismo
 * bloque. La estructura interna sí es idéntica en las cuatro: visual arriba,
 * título, descripción y métricas auxiliares al pie. Eso mantiene el ritmo
 * aunque el contenido cambie.
 *
 * ⚠️ Datos de demostración: conjuntos, personas y cifras ficticias.
 */

function Card({
  icon: Icon,
  categoria,
  titulo,
  copy,
  metricas,
  children,
}: {
  icon: typeof Map;
  categoria: string;
  titulo: string;
  copy: string;
  metricas: { valor: string; label: string }[];
  children: React.ReactNode;
}) {
  return (
    <article className="lp-card-hover group flex h-full flex-col rounded-card border border-line bg-surface p-6 shadow-card sm:p-7">
      <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-subtle">
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-brand-50">
          <Icon
            className="h-4 w-4 text-brand-500"
            strokeWidth={1.8}
            aria-hidden
          />
        </span>
        {categoria}
      </span>

      {/* Demostración visual: altura fija para igualar el ritmo de la fila */}
      <div className="mt-5 flex min-h-[176px] flex-1 items-center rounded-[12px] border border-line-soft bg-surface-soft p-4">
        {children}
      </div>

      <h3 className="mt-5 text-[17px] font-semibold leading-[1.25] tracking-[-0.015em] text-heading">
        {titulo}
      </h3>
      <p className="mt-2 max-w-[42ch] text-[14px] leading-[1.55] text-body">
        {copy}
      </p>

      <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 border-t border-dashed border-dash pt-4">
        {metricas.map((m) => (
          <div key={m.label}>
            <dt className="text-[11px] font-medium text-subtle">{m.label}</dt>
            <dd className="mt-0.5 text-[16px] font-semibold tracking-[-0.02em] text-heading">
              {m.valor}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

/* ── Visual 1 · Plano del conjunto con indicadores ─────────────────────── */
const TORRES = [
  { id: "T1", x: 14, y: 22, estado: "ok" },
  { id: "T2", x: 44, y: 14, estado: "ok" },
  { id: "T3", x: 74, y: 26, estado: "pendiente" },
  { id: "T4", x: 22, y: 62, estado: "ok" },
  { id: "T5", x: 54, y: 70, estado: "ok" },
  { id: "T6", x: 82, y: 60, estado: "aviso" },
] as const;

const PUNTO = {
  ok: "bg-ok",
  pendiente: "bg-brand-500",
  aviso: "bg-warn",
} as const;

function PlanoConjunto() {
  return (
    <div className="relative h-[152px] w-full overflow-hidden rounded-[9px] border border-line-soft bg-surface">
      {/* Cuadrícula del plano */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--color-line-soft) 1px, transparent 1px), linear-gradient(to bottom, var(--color-line-soft) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
        }}
      />
      {/* Vía interna */}
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
      >
        <path
          d="M 4 46 C 30 34, 56 60, 96 44"
          fill="none"
          stroke="var(--color-brand-100)"
          strokeWidth="5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {TORRES.map((t) => (
        <span
          key={t.id}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${t.x}%`, top: `${t.y}%` }}
        >
          <span className="flex items-center gap-1 rounded-pill border border-line bg-surface px-1.5 py-[3px] text-[9.5px] font-semibold text-heading shadow-[0_2px_6px_rgb(20_20_20/0.06)]">
            <span
              aria-hidden
              className={cn("h-1.5 w-1.5 rounded-full", PUNTO[t.estado])}
            />
            {t.id}
          </span>
        </span>
      ))}

      <span className="absolute bottom-2 left-2 flex items-center gap-2.5 rounded-pill border border-line bg-surface/90 px-2 py-1 text-[9px] font-medium text-subtle backdrop-blur-sm">
        <span className="flex items-center gap-1">
          <LegendDot color="var(--color-ok)" /> Al día
        </span>
        <span className="flex items-center gap-1">
          <LegendDot color="var(--color-brand-500)" /> Pendiente
        </span>
      </span>
    </div>
  );
}

/* ── Visual 4 · Tabla de visitantes ────────────────────────────────────── */
const VISITAS = [
  {
    ini: "AR",
    nombre: "Andrea Ruiz",
    unidad: "T2 · Apto 402",
    hora: "02:30 p. m.",
    estado: "ok" as const,
    texto: "Activo",
  },
  {
    ini: "JL",
    nombre: "Juan Pablo León",
    unidad: "T1 · Apto 101",
    hora: "04:00 p. m.",
    estado: "pendiente" as const,
    texto: "Programado",
  },
  {
    ini: "CM",
    nombre: "Carolina Mejía",
    unidad: "T2 · Apto 402",
    hora: "06:15 p. m.",
    estado: "ok" as const,
    texto: "Activo",
  },
  {
    ini: "SR",
    nombre: "Samuel Rojas",
    unidad: "T1 · Apto 101",
    hora: "11:20 a. m.",
    estado: "inactivo" as const,
    texto: "Finalizado",
  },
];

export function FeaturesGrid() {
  return (
    <section id="funcionalidades" className="lp-section">
      <div className="lp-container">
        {/* Encabezado en dos columnas */}
        <Reveal>
          <div className="grid gap-6 lg:grid-cols-2 lg:items-end lg:gap-16">
            <div>
              <SectionBadge>Funcionalidades</SectionBadge>
              <h2 className="mt-5 max-w-[16ch] text-[clamp(1.95rem,3.6vw,2.85rem)] font-[660] leading-[1.05] tracking-[-0.03em] text-heading">
                Herramientas para la vida real de una{" "}
                <span className="text-brand-500">comunidad</span>
              </h2>
            </div>
            <p className="max-w-[52ch] text-[15px] leading-[1.55] text-body lg:pb-2">
              Cada módulo resuelve una tarea concreta del día a día: cobrar,
              autorizar, reservar, comunicar y dejar registro. Todo sobre la
              misma información, sin duplicarla en hojas de cálculo ni en el
              chat del conjunto.
            </p>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-4 lg:mt-14 lg:grid-cols-2">
          <Reveal>
            <Card
              icon={Map}
              categoria="Unidades"
              titulo="Todo el conjunto, torre por torre"
              copy="Consulta el estado de cada torre y unidad: quién está al día, quién tiene saldo pendiente y qué novedades hay abiertas."
              metricas={[
                { valor: "206", label: "Unidades" },
                { valor: "6", label: "Torres" },
                { valor: "164", label: "Al día" },
              ]}
            >
              <PlanoConjunto />
            </Card>
          </Reveal>

          <Reveal delay={90}>
            <Card
              icon={TrendingUp}
              categoria="Cartera"
              titulo="El recaudo, siempre a la vista"
              copy="Estados de cuenta, pagos registrados y cartera vencida en un solo tablero, con el histórico de los últimos meses."
              metricas={[
                { valor: "$18.4 M", label: "Recaudo de agosto" },
                { valor: "80%", label: "Cartera al día" },
              ]}
            >
              <div className="w-full">
                <div className="flex items-baseline gap-2">
                  <span className="text-[26px] font-semibold leading-none tracking-[-0.035em] text-heading">
                    $18.450.000
                  </span>
                  <span className="rounded-pill bg-ok-soft px-1.5 py-0.5 text-[10px] font-semibold text-[#1b8b4d]">
                    ↑ 12%
                  </span>
                </div>
                <span className="mt-1 block text-[11px] text-subtle">
                  Recaudado en agosto 2026
                </span>
                <AreaLine
                  id="cartera"
                  values={[38, 44, 41, 52, 49, 61, 58, 74]}
                  height={92}
                  className="mt-3"
                />
              </div>
            </Card>
          </Reveal>

          <Reveal delay={40}>
            <Card
              icon={CalendarCheck}
              categoria="Zonas comunes"
              titulo="Reservas sin listas de WhatsApp"
              copy="Cada zona con su calendario, sus reglas y su histórico. El residente reserva desde la app y la administración aprueba o bloquea."
              metricas={[
                { valor: "48", label: "Reservas del mes" },
                { valor: "5", label: "Zonas activas" },
              ]}
            >
              <div className="w-full">
                <div className="mb-3 flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[10px] text-subtle">
                    <LegendDot color={CHART_COLORS.brand} /> Reservadas
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-subtle">
                    <LegendDot color={CHART_COLORS.peach} /> Disponibles
                  </span>
                </div>
                <BarChart
                  height={104}
                  data={[
                    { label: "Salón", a: 18, b: 6 },
                    { label: "BBQ", a: 12, b: 12 },
                    { label: "Gym", a: 9, b: 15 },
                    { label: "Piscina", a: 15, b: 9 },
                    { label: "Coworking", a: 7, b: 17 },
                  ]}
                />
              </div>
            </Card>
          </Reveal>

          <Reveal delay={130}>
            <Card
              icon={QrCode}
              categoria="Accesos"
              titulo="Portería con registro, no con cuaderno"
              copy="El residente autoriza desde el celular, la portería valida el QR y cada ingreso queda con su hora, su unidad y quién lo autorizó."
              metricas={[
                { valor: "3", label: "Autorizados hoy" },
                { valor: "1", label: "Programado" },
                { valor: "2", label: "Finalizados" },
              ]}
            >
              <div className="w-full overflow-hidden rounded-[9px] border border-line-soft bg-surface">
                <div className="flex items-center justify-between border-b border-line-soft bg-[#fafaf7] px-3 py-2">
                  <span className="text-[10.5px] font-semibold text-heading">
                    Visitantes de hoy
                  </span>
                  <span className="text-[9.5px] text-subtle">4 de 4</span>
                </div>
                <ul>
                  {VISITAS.map((v) => (
                    <li
                      key={v.ini}
                      className="flex items-center gap-2.5 border-b border-line-soft px-3 py-[9px] last:border-0"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[9px] font-semibold text-brand-600">
                        {v.ini}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-medium leading-tight text-heading">
                          {v.nombre}
                        </span>
                        <span className="block truncate text-[9.5px] leading-tight text-subtle">
                          {v.unidad} · {v.hora}
                        </span>
                      </span>
                      <StatusBadge estado={v.estado}>{v.texto}</StatusBadge>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
