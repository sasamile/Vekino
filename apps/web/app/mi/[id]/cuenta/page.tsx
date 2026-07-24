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
import { cop, cn } from "@/lib/utils";
import { ESTADO_FACTURA, fechaLarga } from "@/components/portal/portal-ui";

const FECHA_MIN = 946684800000;

type LineaFactura = {
  codigo: number;
  concepto: string;
  saldoAnterior: number;
  actual: number;
  total: number;
};

type Factura = {
  _id: Id<"facturas">;
  numeroFactura: string;
  periodoLabel: string;
  estado: "pendiente" | "pagada" | "vencida" | "abonada" | "saldo_a_favor";
  totalAPagar: number;
  totalConDescuento?: number;
  saldoAFavor: number;
  fechaVencimiento: number;
  pdfUrl?: string;
  lineas: LineaFactura[];
};

export default function MisFacturas() {
  const { id } = useParams<{ id: string }>();
  const condominioId = id as Id<"condominios">;
  const facturas = useQuery(api.facturas.listMia, { condominioId }) as
    | Factura[]
    | undefined;
  const home = useQuery(api.portal.home, { condominioId });
  const avalPortalUrl =
    home && home.allowed ? (home.condominio.avalPortalUrl ?? null) : null;

  const lista = facturas ?? [];
  const conDeuda = lista.filter((f) => f.estado !== "pagada");
  const tieneVencidas = conDeuda.some((f) => f.estado === "vencida");
  const estaAlDia = conDeuda.length === 0;
  // Deuda actual = factura más reciente sin pagar (su total consolida el saldo).
  const proximo = [...conDeuda].sort(
    (a, b) => b.fechaVencimiento - a.fechaVencimiento,
  )[0];

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

      {/* Resumen: estado actual + factura pendiente */}
      <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2">
        <ResumenActual
          loading={facturas === undefined}
          estaAlDia={estaAlDia}
          tieneVencidas={tieneVencidas}
          conteo={conDeuda.length}
          deuda={proximo?.totalAPagar ?? 0}
          onVerDetalle={scrollToFacturas}
        />
        <ProximoPagoCard
          loading={facturas === undefined}
          factura={proximo ?? null}
          avalPortalUrl={avalPortalUrl}
        />
      </div>

      {/* Lista de facturas */}
      <div id="facturas" className="scroll-mt-24">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-foreground sm:text-xl">Facturas</h2>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            {facturas === undefined
              ? "Cargando…"
              : `${lista.length} factura${lista.length !== 1 ? "s" : ""} en total`}
          </p>
        </div>

        {facturas === undefined ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg border border-border bg-muted/40" />
            ))}
          </div>
        ) : lista.length === 0 ? (
          <div className="rounded-lg border border-border py-12 text-center text-sm text-muted-foreground">
            No hay facturas disponibles.
          </div>
        ) : (
          <div className="space-y-3">
            {lista.map((f) => (
              <FacturaRow
                key={f._id}
                factura={f}
                avalPortalUrl={avalPortalUrl}
                pagable={f._id === proximo?._id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Resumen: Estado actual (ámbar) ───────────────────────── */

function ResumenActual({
  loading,
  estaAlDia,
  tieneVencidas,
  conteo,
  deuda,
  onVerDetalle,
}: {
  loading: boolean;
  estaAlDia: boolean;
  tieneVencidas: boolean;
  conteo: number;
  deuda: number;
  onVerDetalle: () => void;
}) {
  const badge = estaAlDia
    ? { label: "Al día", cls: "bg-emerald-100 text-emerald-700" }
    : tieneVencidas
      ? { label: "Vencida", cls: "bg-red-100 text-red-700" }
      : { label: "Pendiente", cls: "bg-amber-100 text-amber-700" };

  return (
    <div className="flex min-h-[180px] w-full flex-col justify-between rounded-xl border border-border bg-linear-to-br from-amber-200/40 via-card to-card p-5 shadow-md sm:p-6">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Estado actual</span>
          <span className={cn("rounded-md px-2 py-1 text-xs font-medium", badge.cls)}>
            {badge.label}
          </span>
        </div>
        {loading ? (
          <div className="h-8 w-40 animate-pulse rounded bg-muted" />
        ) : estaAlDia ? (
          <p className="text-sm text-muted-foreground">
            No tienes facturas pendientes. ¡Estás al día!
          </p>
        ) : (
          <>
            <p className="text-2xl font-bold tabular-nums text-foreground">{cop(deuda)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {conteo} factura{conteo !== 1 ? "s" : ""} por pagar
            </p>
          </>
        )}
      </div>
      {!estaAlDia && (
        <div>
          <button
            onClick={onVerDetalle}
            className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
          >
            Ver detalle
          </button>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Resumen: Factura pendiente (rojo) ───────────────────────── */

function ProximoPagoCard({
  loading,
  factura,
  avalPortalUrl,
}: {
  loading: boolean;
  factura: Factura | null;
  avalPortalUrl: string | null;
}) {
  if (loading) {
    return (
      <div className="flex min-h-[180px] w-full items-center justify-center rounded-xl border border-border bg-linear-to-br from-red-200/40 via-card to-card p-6 shadow-md">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }

  if (!factura) {
    return (
      <div className="flex min-h-[180px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-border bg-linear-to-br from-emerald-200/40 via-card to-card p-6 text-center shadow-md">
        <CheckCircle2 className="h-9 w-9 text-emerald-600" />
        <p className="text-lg font-bold text-emerald-700">Estás al día</p>
        <p className="text-sm text-muted-foreground">No tienes pagos pendientes.</p>
      </div>
    );
  }

  const meta = ESTADO_FACTURA[factura.estado];
  const venc = factura.fechaVencimiento > FECHA_MIN ? fechaLarga(factura.fechaVencimiento) : null;

  return (
    <div className="flex min-h-[180px] w-full flex-col justify-between gap-4 rounded-xl border border-border bg-linear-to-br from-red-200/40 via-card to-card p-5 shadow-md sm:flex-row sm:items-center sm:p-6">
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Factura pendiente</span>
          {meta && <Badge tone={meta.tone}>{meta.label}</Badge>}
        </div>
        <p className="text-sm text-foreground">Cuenta de {factura.periodoLabel}</p>
        <p className="text-xs text-muted-foreground">{factura.numeroFactura}</p>
        {venc && <p className="mt-1 text-xs text-muted-foreground">Vence: {venc}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
        <span className="text-xl font-bold tabular-nums text-foreground sm:text-2xl">
          {cop(factura.totalAPagar)}
        </span>
        <PayButton factura={factura} avalPortalUrl={avalPortalUrl} className="w-full sm:w-auto" />
      </div>
    </div>
  );
}

/* ───────────────────────── Fila de factura ───────────────────────── */

function FacturaRow({
  factura,
  avalPortalUrl,
  pagable,
}: {
  factura: Factura;
  avalPortalUrl: string | null;
  pagable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const meta = ESTADO_FACTURA[factura.estado];
  const isPagada = factura.estado === "pagada";
  const venc = factura.fechaVencimiento > FECHA_MIN ? fechaLarga(factura.fechaVencimiento) : null;

  return (
    <div className="overflow-hidden rounded-lg border border-border transition-colors">
      {/* Cabecera de la fila (clic = expandir) */}
      <div
        onClick={() => setOpen((o) => !o)}
        className="flex cursor-pointer flex-col gap-4 p-4 hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-foreground">{factura.numeroFactura}</span>
            {meta && <Badge tone={meta.tone}>{meta.label}</Badge>}
            {isPagada && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" /> Pagada
              </span>
            )}
          </div>
          <p className="mb-1 text-sm text-muted-foreground">Cuenta de {factura.periodoLabel}</p>
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
        "inline-flex items-center justify-center gap-2 rounded-md bg-red-600 font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60",
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
