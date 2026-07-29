import {
  Bell,
  CalendarCheck,
  ClipboardList,
  Grid2x2,
  Home,
  Megaphone,
  Package,
  QrCode,
  ScanLine,
  Send,
  ShieldCheck,
  UserRound,
  UserRoundPlus,
  Wallet,
} from "lucide-react";
import { DEMO } from "./mockups";

/* Réplicas de las pantallas reales de Vekino con DATOS FICTICIOS.
 * El producto usa azul como color de acción; el naranja es solo del logo.
 * Cuando existan capturas reales, estos componentes se reemplazan por
 * <Image> sin tocar el resto de la landing. */

/* ── App móvil ─────────────────────────────────────────────────────────── */

function MobileHeader() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="h-9 w-9 shrink-0 rounded-full bg-sky/20" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold leading-tight text-ink">
          Hola, Camilo 👋
        </span>
        <span className="mt-0.5 inline-block rounded-pill bg-sky px-2 py-0.5 text-[9px] font-medium text-white">
          {DEMO.conjunto}
        </span>
      </span>
      <span className="flex h-8 w-8 items-center justify-center rounded-full ring-1 ring-ink/10">
        <Bell className="h-3.5 w-3.5 text-ink" aria-hidden />
      </span>
    </div>
  );
}

function MobileTabBar({ active }: { active: string }) {
  const tabs = [
    { i: Home, l: "Inicio" },
    { i: ClipboardList, l: "Facturas" },
    { i: Megaphone, l: "Avisos" },
    { i: Grid2x2, l: "Más" },
    { i: UserRound, l: "Perfil" },
  ];
  return (
    <div className="mt-auto flex items-center justify-between rounded-2xl bg-sky/10 px-2 py-2">
      {tabs.map((t) => (
        <span
          key={t.l}
          className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1 ${
            t.l === active ? "bg-white text-sky" : "text-slate-ink"
          }`}
        >
          <t.i className="h-3.5 w-3.5" aria-hidden />
          <span className="text-[7px] font-medium">{t.l}</span>
        </span>
      ))}
    </div>
  );
}

export function ScreenInicio() {
  return (
    <div className="flex h-[430px] flex-col bg-mist px-3 pb-3 pt-10">
      <MobileHeader />

      <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-white p-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky">
          <Wallet className="h-4 w-4 text-white" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-semibold leading-tight text-ink">
            1 factura pendiente
          </span>
          <span className="block text-[10px] text-slate-ink">
            {DEMO.valor} por pagar
          </span>
        </span>
        <span className="rounded-pill bg-ink px-3 py-1.5 text-[10px] font-semibold text-white">
          Ver
        </span>
      </div>

      {/* Aviso destacado: aquí va la foto del conjunto cuando la tengamos */}
      <div className="relative mt-2.5 h-[92px] overflow-hidden rounded-2xl bg-gradient-to-br from-sky to-ink">
        <span className="absolute left-2.5 top-2.5 rounded-pill bg-white/90 px-2 py-0.5 text-[8px] font-bold text-ink">
          AVISO
        </span>
        <span className="absolute inset-x-2.5 bottom-2.5">
          <span className="block text-[12px] font-semibold leading-tight text-white">
            Mantenimiento de zonas comunes
          </span>
          <span className="mt-0.5 block text-[8px] text-white/70">
            {DEMO.fecha}
          </span>
        </span>
      </div>

      <span className="mt-3 block text-[13px] font-semibold text-ink">
        Planea tu día
      </span>

      <div className="mt-2 flex items-center gap-2 rounded-2xl bg-sky p-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold leading-tight text-white">
            Reserva un espacio
          </span>
          <span className="block text-[9px] text-white/80">
            Salón · piscina · BBQ
          </span>
        </span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white">
          <Send className="h-3.5 w-3.5 text-sky" aria-hidden />
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2.5 rounded-2xl bg-white p-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky/10">
          <UserRoundPlus className="h-4 w-4 text-sky" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-[12px] font-semibold leading-tight text-ink">
            Visitas
          </span>
          <span className="block text-[9px] text-slate-ink">
            Autoriza y comparte el acceso
          </span>
        </span>
      </div>

      <MobileTabBar active="Inicio" />
    </div>
  );
}

const FACTURAS = [
  { mes: "Junio 2026", valor: "$ 638.600", estado: "Pendiente", tone: "warn" },
  { mes: "Mayo 2026", valor: "$ 837.800", estado: "Abonada", tone: "info" },
  { mes: "Abril 2026", valor: "$ 400.800", estado: "Vencida", tone: "bad" },
  { mes: "Marzo 2026", valor: "$ 321.200", estado: "Pagada", tone: "good" },
];

const TONES: Record<string, string> = {
  warn: "bg-[#fff5e0] text-[#9a6b00]",
  info: "bg-sky/10 text-sky",
  bad: "bg-[#fdeaea] text-[#b3261e]",
  good: "bg-[#e8f7ea] text-[#1d7a35]",
};

export function ScreenFacturas() {
  return (
    <div className="flex h-[430px] flex-col bg-mist px-3 pb-3 pt-10">
      <MobileHeader />

      <div className="mt-3 flex gap-1.5">
        {["Todas", "Pendiente", "Pagada"].map((c, i) => (
          <span
            key={c}
            className={`rounded-pill px-2.5 py-1 text-[9px] font-medium ${
              i === 0 ? "bg-sky text-white" : "bg-white text-slate-ink"
            }`}
          >
            {c}
          </span>
        ))}
      </div>

      <span className="mt-3 block text-[15px] font-semibold text-ink">
        6 facturas
      </span>

      <div className="mt-2 space-y-2">
        {FACTURAS.map((f) => (
          <div key={f.mes} className="rounded-2xl bg-white p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-ink">{f.mes}</span>
              <span className="text-[12px] font-semibold text-ink">
                {f.valor}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`rounded-pill px-2 py-0.5 text-[8px] font-medium ${TONES[f.tone]}`}
              >
                {f.estado}
              </span>
              <span className="text-[8px] text-slate-ink">
                {DEMO.unidad}
              </span>
            </div>
          </div>
        ))}
      </div>

      <MobileTabBar active="Facturas" />
    </div>
  );
}

export function ScreenVisitantes() {
  return (
    <div className="flex h-[430px] flex-col bg-mist px-3 pb-3 pt-10">
      <MobileHeader />

      <span className="mt-3 block text-[15px] font-semibold text-ink">
        Visitantes
      </span>
      <span className="block text-[9px] text-slate-ink">
        Autoriza visitas del día con QR
      </span>

      <div className="mt-3 rounded-2xl bg-white p-3 text-center">
        <span className="mx-auto flex h-24 w-24 items-center justify-center rounded-xl bg-ink">
          <QrCode className="h-16 w-16 text-white" aria-hidden />
        </span>
        <span className="mt-2.5 block text-[12px] font-semibold text-ink">
          {DEMO.visitante}
        </span>
        <span className="block text-[9px] text-slate-ink">
          {DEMO.unidad} · {DEMO.fecha}
        </span>
        <span className="mt-2 inline-block rounded-pill bg-[#e8f7ea] px-2.5 py-1 text-[9px] font-medium text-[#1d7a35]">
          Autorizado
        </span>
      </div>

      <div className="mt-2 rounded-2xl bg-sky p-3">
        <span className="text-[12px] font-semibold text-white">
          Autorizar visitante
        </span>
      </div>

      <MobileTabBar active="Más" />
    </div>
  );
}

export function ScreenAvisos() {
  return (
    <div className="flex h-[430px] flex-col bg-mist px-3 pb-3 pt-10">
      <MobileHeader />

      <span className="mt-3 block text-[15px] font-semibold text-ink">
        Avisos
      </span>

      <div className="mt-2.5 space-y-2">
        {[
          { t: "Mantenimiento de zonas comunes", d: "24 de julio", p: true },
          { t: "Corte de agua programado", d: "20 de julio", p: false },
          { t: "Asamblea ordinaria 2026", d: "12 de julio", p: false },
        ].map((a) => (
          <div key={a.t} className="rounded-2xl bg-white p-3">
            <div className="flex items-center gap-1.5">
              <Megaphone className="h-3 w-3 text-sky" aria-hidden />
              <span className="text-[8px] font-bold uppercase tracking-wide text-slate-ink">
                Administración
              </span>
              {a.p ? (
                <span className="rounded-pill bg-sky/10 px-1.5 py-0.5 text-[7px] font-medium text-sky">
                  Fijado
                </span>
              ) : null}
            </div>
            <span className="mt-1 block text-[12px] font-semibold leading-tight text-ink">
              {a.t}
            </span>
            <span className="mt-0.5 block text-[9px] text-slate-ink">{a.d}</span>
          </div>
        ))}
      </div>

      <MobileTabBar active="Avisos" />
    </div>
  );
}

/* ── Panel administrativo (navegador) ──────────────────────────────────── */

const NAV_ADMIN = [
  { g: "COMUNIDAD", items: ["Residentes", "Unidades", "Vehículos"] },
  { g: "OPERACIÓN", items: ["Reservas", "Finanzas"] },
  { g: "GESTIÓN", items: ["Comunicación", "PQRS", "Documentos"] },
];

export function ScreenPanelAdmin() {
  return (
    <div className="flex h-[420px] bg-white text-[11px]">
      <aside className="hidden w-40 shrink-0 flex-col border-r border-ink/8 bg-mist p-3 sm:flex">
        <div className="flex items-center gap-2 pb-3">
          <span className="h-6 w-6 rounded-lg bg-sky/20" />
          <span className="min-w-0">
            <span className="block truncate text-[10px] font-semibold text-ink">
              {DEMO.conjunto}
            </span>
            <span className="block text-[8px] text-slate-ink">Villavicencio</span>
          </span>
        </div>
        <span className="rounded-lg bg-white px-2 py-1.5 text-[10px] font-medium text-ink ring-1 ring-ink/8">
          Panel
        </span>
        {NAV_ADMIN.map((s) => (
          <div key={s.g} className="mt-2.5">
            <span className="px-2 text-[7px] font-bold tracking-wider text-slate-ink">
              {s.g}
            </span>
            {s.items.map((it) => (
              <span
                key={it}
                className="mt-0.5 block rounded-lg px-2 py-1 text-[10px] text-slate-ink"
              >
                {it}
              </span>
            ))}
          </div>
        ))}
      </aside>

      <div className="flex-1 overflow-hidden p-4">
        <span className="block text-[17px] font-semibold text-ink">
          Hola, Andrés 👋
        </span>
        <span className="block text-[10px] text-slate-ink">
          Resumen de {DEMO.conjunto} · Junio 2026
        </span>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { l: "Recaudo del mes", v: "$ 28,4M", d: "↑ 12%", good: true },
            { l: "Cartera pendiente", v: "$ 3,1M", d: "↓ 8%", good: true },
            { l: "Unidades al día", v: "190/206", d: "92%", good: true },
          ].map((s) => (
            <div key={s.l} className="rounded-xl p-2.5 ring-1 ring-ink/8">
              <span className="block text-[9px] text-slate-ink">{s.l}</span>
              <span className="mt-0.5 block text-[15px] font-semibold leading-none text-ink">
                {s.v}
              </span>
              <span className="mt-1 inline-block rounded-pill bg-[#e8f7ea] px-1.5 py-0.5 text-[8px] font-medium text-[#1d7a35]">
                {s.d}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-2.5 grid grid-cols-[1.6fr_1fr] gap-2">
          <div className="rounded-xl p-3 ring-1 ring-ink/8">
            <span className="block text-[10px] font-semibold text-ink">
              Cobrado vs. por cobrar
            </span>
            <div className="mt-3 flex h-[110px] items-end gap-2.5">
              {[
                [55, 80],
                [48, 70],
                [72, 30],
                [68, 34],
                [80, 26],
                [40, 92],
              ].map((pair, i) => (
                <div key={i} className="flex flex-1 items-end gap-1">
                  <span
                    className="w-full rounded-t bg-sky"
                    style={{ height: `${pair[0]}%` }}
                  />
                  <span
                    className="w-full rounded-t bg-ink/12"
                    style={{ height: `${pair[1]}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-[7px] text-slate-ink">
              {["Ene", "Feb", "Mar", "Abr", "May", "Jun"].map((m) => (
                <span key={m}>{m}</span>
              ))}
            </div>
          </div>

          <div className="rounded-xl p-3 ring-1 ring-ink/8">
            <span className="block text-[10px] font-semibold text-ink">
              Estado de cartera
            </span>
            <div className="mt-2 flex justify-center">
              <span
                className="flex h-[74px] w-[74px] items-center justify-center rounded-full"
                style={{
                  background:
                    "conic-gradient(var(--color-sky) 0 92%, rgba(4,32,70,0.1) 92% 100%)",
                }}
              >
                <span className="flex h-[54px] w-[54px] items-center justify-center rounded-full bg-white text-[13px] font-semibold text-ink">
                  92%
                </span>
              </span>
            </div>
            <div className="mt-2 space-y-1">
              {[
                { l: "Al día", v: "190", c: "bg-sky" },
                { l: "Pendientes", v: "14", c: "bg-ink/20" },
                { l: "Vencidas", v: "2", c: "bg-[#e04d06]" },
              ].map((r) => (
                <div key={r.l} className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${r.c}`} />
                  <span className="flex-1 text-[8px] text-slate-ink">{r.l}</span>
                  <span className="text-[8px] font-semibold text-ink">
                    {r.v}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Vista de vigilancia ───────────────────────────────────────────────── */

export function ScreenVigilancia() {
  return (
    <div className="h-[420px] bg-white p-5 text-[11px]">
      <div className="flex items-center justify-between">
        <span>
          <span className="block text-[17px] font-semibold text-ink">
            Portería
          </span>
          <span className="block text-[10px] text-slate-ink">
            {DEMO.conjunto} · Turno 6:00 a. m. – 2:00 p. m.
          </span>
        </span>
        <span className="flex items-center gap-2 rounded-pill bg-sky px-4 py-2 text-[11px] font-semibold text-white">
          <ScanLine className="h-4 w-4" aria-hidden />
          Escanear QR
        </span>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {[
          { l: "Ingresos hoy", v: "38", i: UserRoundPlus },
          { l: "En el conjunto", v: "6", i: ShieldCheck },
          { l: "Paquetes", v: "7", i: Package },
          { l: "Reservas", v: "3", i: CalendarCheck },
        ].map((s) => (
          <div key={s.l} className="rounded-xl p-3 ring-1 ring-ink/8">
            <s.i className="h-4 w-4 text-sky" aria-hidden />
            <span className="mt-1.5 block text-[18px] font-semibold leading-none text-ink">
              {s.v}
            </span>
            <span className="mt-1 block text-[9px] text-slate-ink">{s.l}</span>
          </div>
        ))}
      </div>

      <span className="mt-4 block text-[12px] font-semibold text-ink">
        Minuta del turno
      </span>
      <div className="mt-2 space-y-1.5">
        {[
          { h: "07:12", n: DEMO.visitante, u: DEMO.unidad, e: "Autorizado" },
          { h: "08:40", n: "Carolina Peña", u: "Apto. 302", e: "Autorizado" },
          { h: "09:05", n: "Servientrega", u: "Apto. 504", e: "Paquete" },
          { h: "10:20", n: "Andrés Gómez", u: "Apto. 704", e: "En portería" },
        ].map((r) => (
          <div
            key={r.h}
            className="flex items-center gap-3 rounded-xl px-3 py-2 ring-1 ring-ink/6"
          >
            <span className="text-[10px] font-medium text-slate-ink">{r.h}</span>
            <span className="h-6 w-6 shrink-0 rounded-full bg-sky/15" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-medium text-ink">
                {r.n}
              </span>
              <span className="block text-[9px] text-slate-ink">{r.u}</span>
            </span>
            <span
              className={`rounded-pill px-2 py-0.5 text-[9px] font-medium ${
                r.e === "Autorizado"
                  ? "bg-[#e8f7ea] text-[#1d7a35]"
                  : r.e === "Paquete"
                    ? "bg-sky/10 text-sky"
                    : "bg-[#fff5e0] text-[#9a6b00]"
              }`}
            >
              {r.e}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
