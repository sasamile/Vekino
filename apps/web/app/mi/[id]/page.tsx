"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import {
  PiggyBank,
  CalendarCheck,
  MessageSquareWarning,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Download,
  Clock,
  Megaphone,
  Pin,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { LiquidGlassCard } from "@/components/portal/liquid-glass-card";
import { PortalPayButton } from "@/components/portal/portal-pay-button";
import { cop, cn } from "@/lib/utils";
import {
  ESTADO_FACTURA,
  etiquetaUnidad,
  fechaLarga,
  fechaISO,
  periodoHumano,
  VINCULO_LABEL,
} from "@/components/portal/portal-ui";

const FECHA_MIN = 946684800000;

type Factura = {
  _id: Id<"facturas">;
  unidadId: Id<"unidades">;
  numeroFactura: string;
  periodo: string;
  periodoLabel: string;
  estado: "pendiente" | "pagada" | "vencida" | "abonada" | "saldo_a_favor";
  totalAPagar: number;
  totalConDescuento?: number;
  saldoAFavor: number;
  fechaVencimiento: number;
  pdfUrl?: string;
  unidadNumero?: string;
  unidadTipo?: string;
  unidadTorre?: string | null;
};

/** Una factura pagable por unidad (la más reciente sin pagar consolida el saldo). */
function facturasPagables(conDeuda: Factura[]): Factura[] {
  const byUnit = new Map<string, Factura>();
  for (const f of conDeuda) {
    const key = String(f.unidadId);
    const cur = byUnit.get(key);
    if (!cur || f.fechaVencimiento > cur.fechaVencimiento) {
      byUnit.set(key, f);
    }
  }
  return [...byUnit.values()].sort(
    (a, b) => b.fechaVencimiento - a.fechaVencimiento,
  );
}

function esPendientePago(f: Factura) {
  return (
    f.estado === "pendiente" ||
    f.estado === "vencida" ||
    f.estado === "abonada"
  );
}

/**
 * Monto que aplica HOY: descuento del 1–15 si aún no vence;
 * después, total sin descuento. La última factura ya consolida saldos anteriores.
 */
function montoAPagarHoy(f: Factura, ahora = Date.now()) {
  const conDescuento =
    typeof f.totalConDescuento === "number" &&
    f.totalConDescuento < f.totalAPagar &&
    f.fechaVencimiento > FECHA_MIN &&
    ahora <= f.fechaVencimiento;
  return conDescuento ? f.totalConDescuento! : f.totalAPagar;
}

function tieneProntoPagoVigente(f: Factura, ahora = Date.now()) {
  return (
    typeof f.totalConDescuento === "number" &&
    f.totalConDescuento < f.totalAPagar &&
    f.fechaVencimiento > FECHA_MIN &&
    ahora <= f.fechaVencimiento
  );
}

export default function PortalInicio() {
  const { id } = useParams<{ id: string }>();
  const condominioId = id as Id<"condominios">;

  const home = useQuery(api.portal.home, { condominioId });
  const facturas = useQuery(api.facturas.listMia, { condominioId }) as
    | Factura[]
    | undefined;
  const actividades = useQuery(api.portal.misActividades, { condominioId });
  const avisos = useQuery(api.comunicados.listRecent, {
    condominioId,
    limit: 8,
  });

  if (home === undefined) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }
  if (!home.allowed) return null;

  const base = `/mi/${condominioId}`;
  const firstName =
    home.userName.trim().split(/\s+/)[0] || home.userName.trim() || "";
  const avalPortalUrl = home.condominio.avalPortalUrl;
  const unidad =
    home.unidades.find((u) => u.esPrincipal) ?? home.unidades[0] ?? null;
  const multiUnidad = home.unidades.length > 1;
  const unidadLabel = multiUnidad
    ? `${home.unidades.length} unidades`
    : unidad
      ? etiquetaUnidad(unidad)
      : null;
  const vinculoLabel = unidad
    ? VINCULO_LABEL[unidad.vinculo] ?? null
    : null;

  const lista = facturas ?? [];
  const conDeuda = lista.filter(esPendientePago);
  const vencidas = lista.filter((f) => f.estado === "vencida");
  const estaAlDia = conDeuda.length === 0;

  // Una factura pagable por unidad (cada una consolida su propio saldo).
  const pagables = facturasPagables(conDeuda);
  const totalPendiente = pagables.reduce((s, f) => s + montoAPagarHoy(f), 0);

  const saldoAFavor = lista.reduce((s, f) => Math.max(s, f.saldoAFavor), 0);
  const reservas = actividades?.reservasActivas ?? [];
  const ticketsAbiertos = actividades?.ticketsAbiertos ?? 0;
  const proximaReserva = reservas[0] ?? null;

  const avisoDestacado =
    avisos?.find((a) => a.fijado) ??
    avisos?.find((a) => a.prioridad === "urgente") ??
    avisos?.find((a) => a.prioridad === "importante") ??
    null;

  return (
    <div className="w-full space-y-6 text-[15px] text-foreground">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
          Hola{firstName ? `, ${firstName}` : ""}{" "}
          <span aria-hidden>👋</span>
        </h1>
        <p className="mt-1 text-[15px] text-foreground/70">
          {home.condominio.name}
          {unidadLabel ? <> · {unidadLabel}</> : null}
          {vinculoLabel ? (
            <span className="text-foreground/50"> · {vinculoLabel}</span>
          ) : null}
        </p>
      </header>

      {avisoDestacado ? (
        <AvisoFijado
          base={base}
          titulo={avisoDestacado.titulo}
          cuerpo={avisoDestacado.cuerpo}
          fijado={avisoDestacado.fijado}
          prioridad={avisoDestacado.prioridad}
          fecha={avisoDestacado.createdAt}
        />
      ) : null}

      {facturas === undefined ? (
        <LiquidGlassCard className="p-6">
          <Spinner className="mx-auto h-5 w-5" />
        </LiquidGlassCard>
      ) : (
        <DeudaAlert
          base={base}
          estaAlDia={estaAlDia}
          tieneVencidas={vencidas.length > 0}
          totalPendiente={totalPendiente}
          facturasParaPagar={pagables}
          multiUnidad={multiUnidad}
          avalPortalUrl={avalPortalUrl}
        />
      )}

      {/* Resumen corto */}
      <div className="grid gap-2 sm:grid-cols-3">
        <StatLink
          href={`${base}/cuenta`}
          label="Saldo a favor"
          value={cop(saldoAFavor)}
          icon={PiggyBank}
        />
        <StatLink
          href={`${base}/reservas`}
          label="Próxima reserva"
          value={
            proximaReserva
              ? proximaReserva.zonaNombre
              : "Ninguna"
          }
          sub={proximaReserva ? fechaISO(proximaReserva.fecha) : undefined}
          icon={CalendarCheck}
        />
        <StatLink
          href={`${base}/pqrs`}
          label="Solicitudes"
          value={
            ticketsAbiertos === 0
              ? "Ninguna abierta"
              : ticketsAbiertos === 1
                ? "1 abierta"
                : `${ticketsAbiertos} abiertas`
          }
          icon={MessageSquareWarning}
        />
      </div>

      {/* 5. Facturas (contenido principal) */}
      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Facturas recientes
            </h2>
            <p className="mt-0.5 text-sm text-foreground/65">
              Consulta, descarga o paga
            </p>
          </div>
          <Link
            href={`${base}/cuenta`}
            className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-foreground/70 transition-colors hover:text-foreground"
          >
            Ver todas
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <LiquidGlassCard className="divide-y divide-border overflow-hidden p-0 dark:divide-white/10">
          {facturas === undefined ? (
            <div className="p-6">
              <Spinner className="mx-auto h-5 w-5" />
            </div>
          ) : lista.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-foreground/65">
              Aún no tienes facturas.
            </p>
          ) : (
            lista.slice(0, 4).map((f) => (
              <FacturaRow
                key={f._id}
                factura={f}
                showUnidad={multiUnidad}
              />
            ))
          )}
        </LiquidGlassCard>
      </section>

      {/* 6. Reservas — compacto */}
      <LiquidGlassCard className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
        <div className="min-w-0">
          <p className="font-medium text-foreground">Próximas reservas</p>
          <p className="text-sm text-foreground/65">
            {reservas.length === 0
              ? "No tienes reservas programadas"
              : `${reservas.length} reserva${reservas.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button
          variant={reservas.length === 0 ? "brand" : "outline"}
          size="sm"
          asChild
          className="min-h-10"
        >
          <Link href={`${base}/reservas`}>
            {reservas.length === 0 ? "Reservar zona" : "Ver reservas"}
          </Link>
        </Button>
      </LiquidGlassCard>
    </div>
  );
}

function AvisoFijado({
  base,
  titulo,
  cuerpo,
  fijado,
  prioridad,
  fecha,
}: {
  base: string;
  titulo: string;
  cuerpo: string;
  fijado: boolean;
  prioridad: string;
  fecha: number;
}) {
  const extracto =
    cuerpo.length > 160 ? `${cuerpo.slice(0, 160).trim()}…` : cuerpo;

  return (
    <LiquidGlassCard className="px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-900/5 text-foreground">
            <Megaphone className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-foreground/55">
                Aviso de la administración
              </p>
              {fijado ? (
                <Badge tone="neutral" className="gap-1">
                  <Pin className="h-3 w-3" aria-hidden />
                  Fijado
                </Badge>
              ) : null}
              {prioridad === "urgente" ? (
                <Badge tone="destructive">Urgente</Badge>
              ) : null}
              {prioridad === "importante" ? (
                <Badge tone="warning">Importante</Badge>
              ) : null}
            </div>
            <p className="mt-1 text-[17px] font-semibold leading-snug text-foreground">
              {titulo}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-foreground/70">
              {extracto}
            </p>
            <p className="mt-1.5 text-xs text-foreground/50">
              {fechaLarga(fecha)}
            </p>
          </div>
        </div>
        <Button variant="outline" asChild className="min-h-11 shrink-0">
          <Link href={`${base}/avisos`}>
            Ver avisos
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </LiquidGlassCard>
  );
}

function DeudaAlert({
  base,
  estaAlDia,
  tieneVencidas,
  totalPendiente,
  facturasParaPagar,
  multiUnidad,
  avalPortalUrl,
}: {
  base: string;
  estaAlDia: boolean;
  tieneVencidas: boolean;
  totalPendiente: number;
  facturasParaPagar: Factura[];
  multiUnidad: boolean;
  avalPortalUrl: string | null;
}) {
  if (estaAlDia || facturasParaPagar.length === 0) {
    return (
      <LiquidGlassCard className="flex items-center gap-3 px-4 py-3.5">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
        <div>
          <p className="font-semibold text-foreground">Estás al día</p>
          <p className="text-sm text-foreground/65">
            No tienes facturas pendientes.
          </p>
        </div>
      </LiquidGlassCard>
    );
  }

  const varias = facturasParaPagar.length > 1;
  const f = facturasParaPagar[0]!;
  const periodo = periodoHumano(f.periodo || f.periodoLabel);
  const prontoPago = !varias && tieneProntoPagoVigente(f);
  const vencida =
    tieneVencidas || facturasParaPagar.some((x) => x.estado === "vencida");

  const titulo = `Total pendiente: ${cop(totalPendiente)}`;
  let sub: string;
  if (varias) {
    const unidades = facturasParaPagar
      .map((x) => etiquetaUnidad(x))
      .join(" · ");
    sub = `${facturasParaPagar.length} unidades con saldo · ${unidades}`;
  } else if (vencida && f.estado === "vencida") {
    sub =
      f.fechaVencimiento > FECHA_MIN
        ? `${periodo}${multiUnidad ? ` · ${etiquetaUnidad(f)}` : ""} · Venció el ${fechaLarga(f.fechaVencimiento)}`
        : `${periodo}${multiUnidad ? ` · ${etiquetaUnidad(f)}` : ""} · Factura vencida`;
  } else if (prontoPago) {
    sub = `${periodo}${multiUnidad ? ` · ${etiquetaUnidad(f)}` : ""} · Con descuento hasta el ${fechaLarga(f.fechaVencimiento)} · Después ${cop(f.totalAPagar)}`;
  } else if (
    typeof f.totalConDescuento === "number" &&
    f.totalConDescuento < f.totalAPagar &&
    f.fechaVencimiento > FECHA_MIN &&
    Date.now() > f.fechaVencimiento
  ) {
    sub = `${periodo}${multiUnidad ? ` · ${etiquetaUnidad(f)}` : ""} · Sin descuento (después del ${fechaLarga(f.fechaVencimiento)})`;
  } else {
    sub =
      f.fechaVencimiento > FECHA_MIN
        ? `${periodo}${multiUnidad ? ` · ${etiquetaUnidad(f)}` : ""} · Paga antes del ${fechaLarga(f.fechaVencimiento)}`
        : `${periodo}${multiUnidad ? ` · ${etiquetaUnidad(f)}` : ""}`;
  }

  return (
    <LiquidGlassCard
      className={cn(
        "px-4 py-4",
        vencida && "border-red-200/60 bg-red-50/40",
        !vencida && "border-amber-200/50 bg-amber-50/30",
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {vencida ? (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          ) : (
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          )}
          <div>
            <p
              className={cn(
                "text-[17px] font-semibold leading-snug",
                vencida ? "text-red-800" : "text-amber-950",
              )}
            >
              {titulo}
            </p>
            <p className="mt-0.5 text-sm text-foreground/70">{sub}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {varias ? (
            <Button variant="brand" asChild className="min-h-11">
              <Link href={`${base}/cuenta`}>Ver y pagar</Link>
            </Button>
          ) : (
            <>
              <PortalPayButton
                facturaId={f._id}
                avalPortalUrl={avalPortalUrl}
                label="Pagar ahora"
                variant="brand"
              />
              <Button variant="outline" asChild className="min-h-11 border-border/80">
                <Link href={`${base}/cuenta`}>Ver facturas</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </LiquidGlassCard>
  );
}

function FacturaRow({
  factura: f,
  showUnidad,
}: {
  factura: Factura;
  showUnidad: boolean;
}) {
  const meta = ESTADO_FACTURA[f.estado];
  const Icon = meta?.icon;
  const periodo = periodoHumano(f.periodo || f.periodoLabel);
  const unidadTxt = showUnidad ? etiquetaUnidad(f) : null;

  return (
    <div className="px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{periodo}</p>
          {unidadTxt ? (
            <p className="mt-0.5 text-sm font-medium text-foreground/80">
              {unidadTxt}
            </p>
          ) : null}
          <p className="mt-0.5 text-sm text-foreground/65">
            {f.fechaVencimiento > FECHA_MIN
              ? f.estado === "vencida"
                ? `Venció el ${fechaLarga(f.fechaVencimiento)}`
                : `Vence el ${fechaLarga(f.fechaVencimiento)}`
              : f.numeroFactura}
          </p>
        </div>
        <p className="text-[15px] font-semibold tabular-nums text-foreground">
          {cop(f.totalAPagar)}
        </p>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {meta ? (
          <Badge tone={meta.tone} className="gap-1">
            {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
            {meta.label}
          </Badge>
        ) : null}
        {f.pdfUrl ? (
          <div className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              asChild
              className="min-h-10 border-border/80 gap-1.5"
            >
              <a href={f.pdfUrl} target="_blank" rel="noopener noreferrer">
                <Download className="h-4 w-4" aria-hidden />
                PDF
              </a>
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatLink({
  href,
  label,
  value,
  sub,
  icon: Icon,
}: {
  href: string;
  label: string;
  value: string;
  sub?: string;
  icon: typeof PiggyBank;
}) {
  return (
    <LiquidGlassCard href={href} className="flex min-h-[4.5rem] flex-col justify-center px-3.5 py-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm text-foreground/65">{label}</span>
        <Icon className="h-4 w-4 text-foreground/40" aria-hidden />
      </div>
      <span className="truncate font-semibold text-foreground">{value}</span>
      {sub ? (
        <span className="mt-0.5 truncate text-xs text-foreground/55">{sub}</span>
      ) : null}
    </LiquidGlassCard>
  );
}
