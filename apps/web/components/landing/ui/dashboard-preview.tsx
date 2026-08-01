import {
  ArrowUpRight,
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  FileText,
  Gavel,
  LayoutDashboard,
  MessageSquare,
  Search,
  ShieldCheck,
  Upload,
  Users,
  Wallet,
} from "lucide-react";
import { StatusBadge } from "./badge";
import { BarChart, CHART_COLORS, Donut, LegendDot } from "./charts";
import { CountUp } from "./count-up";
import { cn } from "@/lib/utils";

/**
 * Vista previa del panel de Vekino, construida con componentes reales.
 *
 * No es una captura: es el mismo panel que ve un administrador, redibujado
 * en DOM con el sistema visual de la landing. Así se lee nítido en cualquier
 * pantalla, escala en responsive y no envejece cuando cambia el producto.
 *
 * ⚠️ TODOS LOS DATOS SON FICTICIOS. El conjunto, las personas y las cifras
 * están inventados. Nunca poner aquí información real de un cliente.
 */

const CONJUNTO = { nombre: "Parque Central Norte", ciudad: "Santa Elena" };
const USUARIA = {
  nombre: "Valentina Botero",
  rol: "Administradora",
  ini: "VB",
};

const NAV = [
  {
    grupo: null,
    items: [{ icon: LayoutDashboard, label: "Panel", activo: true }],
  },
  {
    grupo: "Comunidad",
    items: [
      { icon: Users, label: "Residentes" },
      { icon: Building2, label: "Unidades" },
    ],
  },
  {
    grupo: "Operación",
    items: [
      { icon: CalendarDays, label: "Reservas" },
      { icon: Wallet, label: "Finanzas" },
    ],
  },
  {
    grupo: "Gestión",
    items: [
      { icon: MessageSquare, label: "Comunicación" },
      { icon: ShieldCheck, label: "Visitantes" },
      { icon: FileText, label: "Documentos" },
    ],
  },
  {
    grupo: "Gobernanza",
    items: [{ icon: Gavel, label: "Asamblea" }],
  },
] as const;

const KPIS = [
  {
    label: "Recaudo del mes",
    valor: 18450000,
    prefijo: "$",
    sufijo: "",
    agrupado: true,
    delta: "12%",
    icon: Wallet,
  },
  {
    label: "Cartera pendiente",
    valor: 6320000,
    prefijo: "$",
    sufijo: "",
    agrupado: true,
    delta: "5%",
    icon: FileText,
  },
  {
    label: "Unidades al día",
    valor: 164,
    prefijo: "",
    sufijo: "/206",
    agrupado: false,
    delta: "8%",
    icon: Building2,
  },
];

const RECAUDO = [
  { label: "Mar", a: 4.6, b: 5.9 },
  { label: "Abr", a: 5.4, b: 4.4 },
  { label: "May", a: 6.4, b: 3.1 },
  { label: "Jun", a: 8.2, b: 2.6 },
  { label: "Jul", a: 6.9, b: 3.8 },
  { label: "Ago", a: 7.4, b: 2.9 },
];

const CARTERA = [
  { etiqueta: "Al día", n: 164, pct: "80%", color: CHART_COLORS.brand },
  { etiqueta: "Pendientes", n: 32, pct: "16%", color: CHART_COLORS.peach },
  { etiqueta: "Vencidas", n: 10, pct: "4%", color: CHART_COLORS.gray },
];

const PAGOS = [
  {
    factura: "FAC-2026-0812",
    residente: "Laura Méndez",
    ini: "LM",
    unidad: "Torre 1 · Apto 302",
    valor: "$420.000",
    estado: "ok" as const,
    texto: "Pagado",
  },
  {
    factura: "FAC-2026-0813",
    residente: "Carlos Ruiz",
    ini: "CR",
    unidad: "Torre 2 · Apto 108",
    valor: "$380.000",
    estado: "ok" as const,
    texto: "Pagado",
  },
  {
    factura: "FAC-2026-0814",
    residente: "Andrea Salcedo",
    ini: "AS",
    unidad: "Torre 2 · Apto 504",
    valor: "$560.000",
    estado: "pendiente" as const,
    texto: "Pendiente",
  },
];

export function DashboardPreview({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex overflow-hidden rounded-panel border border-line bg-surface",
        className,
      )}
    >
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="hidden w-[212px] shrink-0 flex-col border-r border-line bg-[#fafaf8] p-3 md:flex lg:w-[232px]">
        <div className="flex items-center gap-2 rounded-btn px-2 py-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-brand-500 text-[11px] font-bold text-white">
            V
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-semibold leading-tight text-heading">
              {CONJUNTO.nombre}
            </span>
            <span className="block text-[10px] leading-tight text-subtle">
              {CONJUNTO.ciudad}
            </span>
          </span>
          <ChevronDown
            className="ml-auto h-3.5 w-3.5 text-placeholder"
            aria-hidden
          />
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-btn border border-line bg-surface px-2.5 py-2">
          <Search className="h-3.5 w-3.5 text-placeholder" aria-hidden />
          <span className="text-[11px] text-placeholder">Buscar o ir a…</span>
          <span className="ml-auto rounded-[5px] border border-line px-1 text-[9px] font-medium text-placeholder">
            ⌘K
          </span>
        </div>

        <nav className="mt-4 flex-1 space-y-3.5">
          {NAV.map((seccion, i) => (
            <div key={seccion.grupo ?? i}>
              {seccion.grupo ? (
                <span className="mb-1 block px-2 text-[9px] font-semibold uppercase tracking-[0.06em] text-placeholder">
                  {seccion.grupo}
                </span>
              ) : null}
              <ul className="space-y-0.5">
                {seccion.items.map((item) => {
                  const activo = "activo" in item && item.activo;
                  return (
                    <li key={item.label}>
                      <span
                        className={cn(
                          "relative flex items-center gap-2 rounded-[8px] px-2 py-[7px] text-[12px]",
                          activo
                            ? "bg-brand-50 font-semibold text-brand-600"
                            : "font-medium text-body",
                        )}
                      >
                        {activo ? (
                          <span
                            aria-hidden
                            className="absolute left-0 top-1/2 h-4 w-[2.5px] -translate-y-1/2 rounded-r-full bg-brand-500"
                          />
                        ) : null}
                        <item.icon
                          className={cn(
                            "h-[15px] w-[15px] shrink-0",
                            activo ? "text-brand-500" : "text-subtle",
                          )}
                          strokeWidth={1.8}
                          aria-hidden
                        />
                        {item.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-heading text-[10px] font-semibold text-white">
            {USUARIA.ini}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[11px] font-semibold leading-tight text-heading">
              {USUARIA.nombre}
            </span>
            <span className="block text-[10px] leading-tight text-subtle">
              {USUARIA.rol}
            </span>
          </span>
        </div>
      </aside>

      {/* ── Contenido ───────────────────────────────────────────────────── */}
      <div className="min-w-0 flex-1 bg-surface">
        {/* Barra superior */}
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <span className="flex items-center gap-1.5 text-[11px] text-subtle">
            <span className="hidden sm:inline">Inicio</span>
            <span aria-hidden className="hidden sm:inline text-placeholder">
              /
            </span>
            <span className="font-semibold text-heading">Panel</span>
          </span>

          <span className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-btn border border-line px-2.5 py-1.5 text-[11px] font-medium text-body sm:inline-flex">
              <CalendarDays
                className="h-3.5 w-3.5 text-subtle"
                strokeWidth={1.8}
                aria-hidden
              />
              Agosto 2026
              <ChevronDown className="h-3 w-3 text-placeholder" aria-hidden />
            </span>
            <span className="relative flex h-7 w-7 items-center justify-center rounded-btn border border-line">
              <Bell
                className="h-3.5 w-3.5 text-subtle"
                strokeWidth={1.8}
                aria-hidden
              />
              <span
                aria-hidden
                className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-brand-500"
              />
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-btn bg-brand-500 px-2.5 py-1.5 text-[11px] font-semibold text-white">
              <Upload className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              <span className="hidden sm:inline">Cargar facturas</span>
            </span>
          </span>
        </div>

        <div className="space-y-4 p-4">
          <div>
            <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-heading">
              Hola, Valentina
            </h3>
            <p className="mt-0.5 text-[11px] text-subtle">
              Resumen de {CONJUNTO.nombre} · Agosto 2026
            </p>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {KPIS.map((k) => (
              <div
                key={k.label}
                className="rounded-card border border-line bg-surface-soft p-3"
              >
                <div className="flex items-start justify-between">
                  <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-brand-50">
                    <k.icon
                      className="h-4 w-4 text-brand-500"
                      strokeWidth={1.8}
                      aria-hidden
                    />
                  </span>
                  <ArrowUpRight
                    className="h-3.5 w-3.5 text-placeholder"
                    aria-hidden
                  />
                </div>
                <span className="mt-2.5 block text-[11px] font-medium text-subtle">
                  {k.label}
                </span>
                <span className="mt-0.5 block text-[19px] font-semibold tracking-[-0.03em] text-heading">
                  <CountUp
                    value={k.valor}
                    prefix={k.prefijo}
                    suffix={k.sufijo}
                    grouped={k.agrupado}
                  />
                </span>
                <span className="mt-1.5 inline-flex items-center gap-1 rounded-pill bg-ok-soft px-1.5 py-0.5 text-[10px] font-semibold text-[#1b8b4d]">
                  ↑ {k.delta}
                </span>
              </div>
            ))}
          </div>

          {/* Gráfica + donut */}
          <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
            <div className="rounded-card border border-line bg-surface p-3.5">
              <div className="flex items-start justify-between">
                <div>
                  <span className="block text-[12px] font-semibold text-heading">
                    Cobrado vs. por cobrar
                  </span>
                  <span className="mt-0.5 block text-[10px] text-subtle">
                    Hasta agosto 2026 · últimos 6 meses
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[10px] text-subtle">
                    <LegendDot color={CHART_COLORS.brand} />
                    Recaudado
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-subtle">
                    <LegendDot color={CHART_COLORS.peach} />
                    Por cobrar
                  </span>
                </div>
              </div>
              <BarChart data={RECAUDO} height={118} className="mt-4" />
            </div>

            <div className="rounded-card border border-line bg-surface p-3.5">
              <span className="block text-[12px] font-semibold text-heading">
                Estado de cartera
              </span>
              <span className="mt-0.5 block text-[10px] text-subtle">
                Agosto 2026
              </span>

              <div className="mt-2 flex items-center justify-center">
                <Donut
                  size={112}
                  center={<CountUp value={80} suffix="%" />}
                  label="al día"
                  segments={CARTERA.map((c) => ({
                    valor: c.n,
                    color: c.color,
                  }))}
                />
              </div>

              <ul className="mt-2.5 space-y-1.5">
                {CARTERA.map((c) => (
                  <li
                    key={c.etiqueta}
                    className="flex items-center gap-2 text-[10.5px]"
                  >
                    <LegendDot color={c.color} />
                    <span className="text-body">{c.etiqueta}</span>
                    <span className="ml-auto font-semibold text-heading">
                      {c.n}
                    </span>
                    <span className="w-8 text-right text-subtle">{c.pct}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Tabla */}
          <div className="overflow-hidden rounded-card border border-line">
            <div className="flex items-center justify-between border-b border-line bg-[#fafaf7] px-3.5 py-2.5">
              <span className="text-[12px] font-semibold text-heading">
                Pagos recientes
              </span>
              <span className="text-[10.5px] font-semibold text-brand-600">
                Ver todos
              </span>
            </div>

            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-[#fafaf7]">
                  {["Factura", "Residente", "Valor", "Estado"].map((h) => (
                    <th
                      key={h}
                      className={cn(
                        "px-3.5 py-2 text-[9.5px] font-medium uppercase tracking-[0.04em] text-subtle",
                        h === "Valor" && "text-right",
                        h === "Residente" && "hidden sm:table-cell",
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PAGOS.map((p) => (
                  <tr
                    key={p.factura}
                    className="border-b border-line-soft last:border-0"
                  >
                    <td className="px-3.5 py-2.5 text-[11px] font-medium text-heading">
                      {p.factura}
                    </td>
                    <td className="hidden px-3.5 py-2.5 sm:table-cell">
                      <span className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-[9px] font-semibold text-brand-600">
                          {p.ini}
                        </span>
                        <span>
                          <span className="block text-[11px] font-medium leading-tight text-heading">
                            {p.residente}
                          </span>
                          <span className="block text-[9.5px] leading-tight text-subtle">
                            {p.unidad}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-right text-[11px] font-semibold text-heading">
                      {p.valor}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <StatusBadge estado={p.estado}>{p.texto}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
