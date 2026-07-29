"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useAction } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import {
  Download,
  ArrowRight,
  CheckCircle2,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LiquidGlassCard } from "@/components/portal/liquid-glass-card";
import { PortalPayButton } from "@/components/portal/portal-pay-button";
import { cop, cn } from "@/lib/utils";
import {
  ESTADO_FACTURA,
  etiquetaUnidad,
  fechaLarga,
  periodoHumano,
} from "@/components/portal/portal-ui";

const FECHA_MIN = 946684800000;

function montoAPagarHoy(f: {
  totalAPagar: number;
  totalConDescuento?: number;
  fechaVencimiento: number;
}, ahora = Date.now()) {
  const conDescuento =
    typeof f.totalConDescuento === "number" &&
    f.totalConDescuento < f.totalAPagar &&
    f.fechaVencimiento > FECHA_MIN &&
    ahora <= f.fechaVencimiento;
  return conDescuento ? f.totalConDescuento! : f.totalAPagar;
}

type LineaFactura = {
  codigo: number;
  concepto: string;
  saldoAnterior: number;
  actual: number;
  total: number;
};

type Factura = {
  _id: Id<"facturas">;
  unidadId: Id<"unidades">;
  numeroFactura: string;
  periodo?: string;
  periodoLabel: string;
  estado: "pendiente" | "pagada" | "vencida" | "abonada" | "saldo_a_favor";
  totalAPagar: number;
  totalConDescuento?: number;
  saldoAFavor: number;
  fechaVencimiento: number;
  pdfUrl?: string;
  lineas: LineaFactura[];
  unidadNumero?: string;
  unidadTipo?: string;
  unidadTorre?: string | null;
};

function esPendientePago(f: Factura) {
  return (
    f.estado === "pendiente" ||
    f.estado === "vencida" ||
    f.estado === "abonada"
  );
}

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

export default function MisFacturas() {
  const { id } = useParams<{ id: string }>();
  const condominioId = id as Id<"condominios">;
  const facturas = useQuery(api.facturas.listMia, { condominioId }) as
    | Factura[]
    | undefined;
  const home = useQuery(api.portal.home, { condominioId });
  const avalPortalUrl =
    home && home.allowed ? (home.condominio.avalPortalUrl ?? null) : null;
  const unidades = home?.allowed ? home.unidades : [];
  const multiUnidad = unidades.length > 1;

  const [unidadFiltro, setUnidadFiltro] = useState<Id<"unidades"> | "">("");

  const listaAll = facturas ?? [];
  const lista =
    unidadFiltro === ""
      ? listaAll
      : listaAll.filter((f) => String(f.unidadId) === String(unidadFiltro));

  const conDeuda = lista.filter(esPendientePago);
  const tieneVencidas = conDeuda.some((f) => f.estado === "vencida");
  const estaAlDia = conDeuda.length === 0;
  const pagables = facturasPagables(conDeuda);
  const pagableIds = new Set(pagables.map((f) => f._id));
  const deudaTotal = pagables.reduce((s, f) => s + montoAPagarHoy(f), 0);

  function scrollToFacturas() {
    document.getElementById("facturas")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="space-y-6 py-2 sm:space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Mis facturas
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Gestiona tus facturas y pagos de administración.
        </p>
      </div>

      {multiUnidad ? (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
          <button
            type="button"
            onClick={() => setUnidadFiltro("")}
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors",
              unidadFiltro === ""
                ? "border-foreground/20 bg-foreground text-background"
                : "border-border bg-card text-foreground hover:bg-accent/50",
            )}
          >
            Todas
            <span
              className={cn(
                "tabular-nums text-xs",
                unidadFiltro === ""
                  ? "text-background/70"
                  : "text-muted-foreground",
              )}
            >
              {listaAll.length}
            </span>
          </button>
          {unidades.map((u) => {
            const uid = u._id as Id<"unidades">;
            const active = String(unidadFiltro) === String(uid);
            const count = listaAll.filter(
              (f) => String(f.unidadId) === String(uid),
            ).length;
            return (
              <button
                key={u._id}
                type="button"
                onClick={() => setUnidadFiltro(uid)}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors",
                  active
                    ? "border-brand/40 bg-brand/10 text-foreground"
                    : "border-border bg-card text-foreground hover:bg-accent/50",
                )}
                aria-pressed={active}
              >
                <span className="max-w-[11rem] truncate">
                  {etiquetaUnidad(u)}
                </span>
                <span className="tabular-nums text-xs text-muted-foreground">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Resumen: estado actual + factura pendiente */}
      <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2">
        <ResumenActual
          loading={facturas === undefined}
          estaAlDia={estaAlDia}
          tieneVencidas={tieneVencidas}
          conteo={pagables.length}
          deuda={deudaTotal}
          multiUnidad={multiUnidad && unidadFiltro === ""}
          onVerDetalle={scrollToFacturas}
        />
        <ProximoPagoCard
          loading={facturas === undefined}
          facturas={pagables}
          avalPortalUrl={avalPortalUrl}
          multiUnidad={multiUnidad}
        />
      </div>

      {/* Lista de facturas */}
      <div id="facturas" className="scroll-mt-24">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-foreground sm:text-xl">
            Facturas
          </h2>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            {facturas === undefined
              ? "Cargando…"
              : unidadFiltro
                ? `${lista.length} factura${lista.length !== 1 ? "s" : ""} de esta unidad`
                : `${lista.length} factura${lista.length !== 1 ? "s" : ""} en total`}
          </p>
        </div>

        {facturas === undefined ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-lg border border-border bg-muted/40"
              />
            ))}
          </div>
        ) : lista.length === 0 ? (
          <div className="rounded-lg border border-border py-12 text-center text-sm text-muted-foreground">
            {unidadFiltro
              ? "No hay facturas para esta unidad."
              : "No hay facturas disponibles."}
          </div>
        ) : (
          <div className="space-y-3">
            {lista.map((f) => (
              <FacturaRow
                key={f._id}
                factura={f}
                avalPortalUrl={avalPortalUrl}
                pagable={pagableIds.has(f._id)}
                showUnidad={multiUnidad && unidadFiltro === ""}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Resumen: Estado actual ───────────────────────── */

function ResumenActual({
  loading,
  estaAlDia,
  tieneVencidas,
  conteo,
  deuda,
  multiUnidad,
  onVerDetalle,
}: {
  loading: boolean;
  estaAlDia: boolean;
  tieneVencidas: boolean;
  conteo: number;
  deuda: number;
  multiUnidad: boolean;
  onVerDetalle: () => void;
}) {
  const badgeTone = estaAlDia
    ? ("success" as const)
    : tieneVencidas
      ? ("destructive" as const)
      : ("warning" as const);
  const badgeLabel = estaAlDia
    ? "Al día"
    : tieneVencidas
      ? "Vencida"
      : "Pendiente";

  return (
    <LiquidGlassCard className="relative flex min-h-[180px] w-full flex-col justify-between overflow-hidden p-5 sm:p-6">
      <div className="relative z-1">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-foreground">
            Estado actual
          </span>
          <Badge tone={badgeTone}>{badgeLabel}</Badge>
        </div>
        {loading ? (
          <div className="h-8 w-40 animate-pulse rounded bg-muted" />
        ) : estaAlDia ? (
          <p className="text-sm text-muted-foreground">
            No tienes facturas pendientes. ¡Estás al día!
          </p>
        ) : (
          <>
            <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
              {cop(deuda)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {multiUnidad
                ? `${conteo} unidad${conteo !== 1 ? "es" : ""} con saldo`
                : `${conteo} factura${conteo !== 1 ? "s" : ""} por pagar`}
            </p>
          </>
        )}
      </div>
      {!estaAlDia ? (
        <div className="relative z-1 mt-4">
          <Button variant="outline" onClick={onVerDetalle} className="min-h-10">
            Ver detalle
          </Button>
        </div>
      ) : null}
    </LiquidGlassCard>
  );
}

/* ───────────────────────── Resumen: Factura pendiente ───────────────────────── */

function ProximoPagoCard({
  loading,
  facturas,
  avalPortalUrl,
  multiUnidad,
}: {
  loading: boolean;
  facturas: Factura[];
  avalPortalUrl: string | null;
  multiUnidad: boolean;
}) {
  if (loading) {
    return (
      <LiquidGlassCard className="flex min-h-[180px] w-full items-center justify-center p-6">
        <Spinner className="h-5 w-5" />
      </LiquidGlassCard>
    );
  }

  if (facturas.length === 0) {
    return (
      <LiquidGlassCard className="flex min-h-[180px] w-full flex-col items-center justify-center gap-2 p-6 text-center">
        <CheckCircle2 className="h-9 w-9 text-emerald-600 dark:text-emerald-400" />
        <p className="text-lg font-bold text-foreground">Estás al día</p>
        <p className="text-sm text-muted-foreground">
          No tienes pagos pendientes.
        </p>
      </LiquidGlassCard>
    );
  }

  if (facturas.length > 1) {
    return (
      <LiquidGlassCard className="flex min-h-[180px] w-full flex-col justify-between gap-3 p-5 sm:p-6">
        <div>
          <span className="text-sm font-semibold text-foreground">
            Pagos pendientes
          </span>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada unidad se paga por separado.
          </p>
        </div>
        <ul className="space-y-2">
          {facturas.map((f) => (
            <li
              key={f._id}
              className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2 first:border-0 first:pt-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {etiquetaUnidad(f)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {periodoHumano(f.periodo || f.periodoLabel)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tabular-nums text-foreground">
                  {cop(montoAPagarHoy(f))}
                </span>
                <PortalPayButton
                  facturaId={f._id}
                  avalPortalUrl={avalPortalUrl}
                  label="Pagar"
                  size="sm"
                />
              </div>
            </li>
          ))}
        </ul>
      </LiquidGlassCard>
    );
  }

  const factura = facturas[0]!;
  const meta = ESTADO_FACTURA[factura.estado];
  const venc =
    factura.fechaVencimiento > FECHA_MIN
      ? fechaLarga(factura.fechaVencimiento)
      : null;

  return (
    <LiquidGlassCard className="flex min-h-[180px] w-full flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            Factura pendiente
          </span>
          {meta ? <Badge tone={meta.tone}>{meta.label}</Badge> : null}
        </div>
        {multiUnidad ? (
          <p className="text-sm font-medium text-foreground">
            {etiquetaUnidad(factura)}
          </p>
        ) : null}
        <p className="text-sm text-foreground">
          Cuenta de {periodoHumano(factura.periodo || factura.periodoLabel)}
        </p>
        <p className="text-xs text-muted-foreground">{factura.numeroFactura}</p>
        {venc ? (
          <p className="mt-1 text-xs text-muted-foreground">Vence: {venc}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
        <span className="text-xl font-bold tabular-nums tracking-tight text-foreground sm:text-2xl">
          {cop(montoAPagarHoy(factura))}
        </span>
        {typeof factura.totalConDescuento === "number" &&
        factura.totalConDescuento < factura.totalAPagar &&
        factura.fechaVencimiento > FECHA_MIN &&
        Date.now() <= factura.fechaVencimiento ? (
          <p className="text-xs text-muted-foreground">
            Sin descuento después: {cop(factura.totalAPagar)}
          </p>
        ) : null}
        <PortalPayButton
          facturaId={factura._id}
          avalPortalUrl={avalPortalUrl}
          label="Pagar"
          showArrow
          className="w-full sm:w-auto"
        />
      </div>
    </LiquidGlassCard>
  );
}

/* ───────────────────────── Fila de factura ───────────────────────── */

function FacturaRow({
  factura,
  avalPortalUrl,
  pagable,
  showUnidad,
}: {
  factura: Factura;
  avalPortalUrl: string | null;
  pagable: boolean;
  showUnidad: boolean;
}) {
  const [open, setOpen] = useState(false);
  const meta = ESTADO_FACTURA[factura.estado];
  const isPagada = factura.estado === "pagada";
  const venc = factura.fechaVencimiento > FECHA_MIN ? fechaLarga(factura.fechaVencimiento) : null;
  const periodo = periodoHumano(factura.periodo || factura.periodoLabel);

  return (
    <div className="overflow-hidden rounded-lg border border-border transition-colors">
      {/* Cabecera de la fila (clic = expandir) */}
      <div
        onClick={() => setOpen((o) => !o)}
        className="flex cursor-pointer flex-col gap-4 p-4 hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-foreground">
              {periodo}
            </span>
            {meta && <Badge tone={meta.tone}>{meta.label}</Badge>}
            {isPagada && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" /> Pagada
              </span>
            )}
          </div>
          {showUnidad ? (
            <p className="mb-1 text-sm font-medium text-foreground">
              {etiquetaUnidad(factura)}
            </p>
          ) : null}
          <p className="mb-1 text-sm text-muted-foreground">
            {factura.numeroFactura}
          </p>
          {venc && (
            <p className="text-xs font-medium text-muted-foreground">Vence: {venc}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
          <span className="text-lg font-bold tabular-nums text-foreground">
            {cop(factura.totalAPagar)}
          </span>
          {!isPagada && pagable && (
            <div onClick={(e) => e.stopPropagation()}>
              <PayButton factura={factura} avalPortalUrl={avalPortalUrl} size="sm" />
            </div>
          )}
          {factura.pdfUrl && (
            <a
              href={factura.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-medium text-brand hover:underline"
            >
              Descargar
            </a>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </div>
      </div>

      {/* Desglose (acordeón) */}
      {open && (
        <div className="border-t border-border bg-muted/20 px-4 py-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[24rem] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 font-medium">Concepto</th>
                  <th className="pb-2 text-right font-medium">Saldo ant.</th>
                  <th className="pb-2 text-right font-medium">Mes</th>
                  <th className="pb-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {factura.lineas.map((l, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-3 text-foreground">{l.concepto}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {l.saldoAnterior ? cop(l.saldoAnterior) : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {l.actual ? cop(l.actual) : "—"}
                    </td>
                    <td className="py-2 text-right font-medium tabular-nums text-foreground">
                      {cop(l.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {factura.saldoAFavor > 0 && (
                  <tr>
                    <td colSpan={3} className="pt-3 text-right text-muted-foreground">
                      Saldo a favor
                    </td>
                    <td className="pt-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                      −{cop(factura.saldoAFavor)}
                    </td>
                  </tr>
                )}
                {factura.totalConDescuento != null &&
                factura.totalConDescuento < factura.totalAPagar ? (
                  <>
                    <tr>
                      <td
                        colSpan={3}
                        className="pt-3 text-right text-sm font-medium text-emerald-700 dark:text-emerald-400"
                      >
                        Pague del 1 al 15 (con descuento)
                      </td>
                      <td className="pt-3 text-right text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {cop(factura.totalConDescuento)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="pt-1 text-right text-sm font-semibold text-foreground">
                        Pague del 16 al 30 (sin descuento)
                      </td>
                      <td className="pt-1 text-right text-base font-bold tabular-nums text-foreground">
                        {cop(factura.totalAPagar)}
                      </td>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <td colSpan={3} className="pt-2 text-right font-semibold text-foreground">
                      Total a pagar
                    </td>
                    <td className="pt-2 text-right text-base font-semibold tabular-nums text-foreground">
                      {cop(factura.totalAPagar)}
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Botón de pago (deep-link Aval o API) ───────────────────────── */

function PayButton({
  factura,
  avalPortalUrl,
  size = "default",
  className,
}: {
  factura: Factura;
  avalPortalUrl: string | null;
  size?: "default" | "sm";
  className?: string;
}) {
  const crearPago = useAction(api.pagos.crearPagoFactura);
  const [loading, setLoading] = useState(false);

  async function pagar() {
    if (avalPortalUrl) {
      window.open(avalPortalUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setLoading(true);
    try {
      const { redirectUrl } = await crearPago({ facturaId: factura._id });
      window.location.href = redirectUrl;
    } catch {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={pagar}
      disabled={loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md bg-brand font-semibold text-brand-foreground shadow-[0_4px_10px_hsl(var(--brand)/0.28)] transition-colors hover:bg-brand/90 disabled:opacity-60",
        size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-5 text-sm",
        className,
      )}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          Pagar
          {size !== "sm" && <ArrowRight className="h-4 w-4" />}
        </>
      )}
    </button>
  );
}
