"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useAction } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import {
  ETIQUETA_SIN_VERIFICAR,
  TEXTO_SIN_VERIFICAR,
  descuentoVigente,
  enRevision,
  estadoVisibleDeFactura,
  fechaLimiteDescuentoDe,
  inicioDeMora,
  mensajePagoEnVerificacion,
  montoAPagarHoy as montoDeHoy,
  resumenResidente,
  sinPagar,
} from "@vekino/backend/cartera";
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
  fechaPlazo,
  periodoHumano,
} from "@/components/portal/portal-ui";

const FECHA_MIN = 946684800000;

/**
 * Lo que se cobra hoy: la misma regla del backend de pagos
 * (`lib/cartera.ts`, `montoAPagarHoy`). El descuento vale hasta SU fecha —la
 * del documento, o el 15 del mes del período—, no hasta el vencimiento
 * (Fase 3, F-06): antes la pantalla ofrecía el descuento un mes de más.
 */
function montoAPagarHoy(f: Factura, ahora = Date.now()) {
  return montoDeHoy(f, ahora);
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
  periodo: string;
  periodoLabel: string;
  estado: "pendiente" | "pagada" | "vencida" | "abonada" | "saldo_a_favor";
  totalAPagar: number;
  totalConDescuento?: number;
  /** Hasta cuándo vale el descuento, según el documento (Fase 3). */
  fechaLimiteDescuento?: number;
  saldoAFavor: number;
  fechaVencimiento: number;
  pdfUrl?: string;
  lineas: LineaFactura[];
  /** Lectura dudosa del PDF (Fase 2): en revisión mientras no se confirme. */
  lecturaDudosa?: { motivos: string[]; confirmada?: unknown } | null;
  /** Un pago registrado que la contabilidad aún no refleja (Fase 3). */
  pagoEnVerificacion?: { monto: number } | null;
  unidadNumero?: string;
  unidadTipo?: string;
  unidadTorre?: string | null;
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
  const unidades = home?.allowed ? home.unidades : [];
  const multiUnidad = unidades.length > 1;

  const [unidadFiltro, setUnidadFiltro] = useState<Id<"unidades"> | "">("");

  const listaAll = facturas ?? [];
  const lista =
    unidadFiltro === ""
      ? listaAll
      : listaAll.filter((f) => String(f.unidadId) === String(unidadFiltro));

  /* Estado y botones "Pagar" con la regla de la cartera (`lib/cartera.ts`),
   * la misma de la administración y del backend de pagos: la deuda es la
   * factura vigente de cada unidad, no el historial. Una factura vieja
   * `vencida` ya absorbida por las siguientes no pinta "Vencida" ni se
   * ofrece para pagar; una vigente que venció sin pagarse, sí es mora. */
  const resumen = resumenResidente(lista, Date.now());
  const estaAlDia = resumen.estado === "al_dia" || resumen.estado === "sin_facturas";
  const enMora = resumen.estado === "en_mora";
  const unidadesEnMora = new Set(
    resumen.unidades.filter((u) => u.cartera.estado === "en_mora").map((u) => u.unidadId),
  );
  const pagables = resumen.pagables;
  const pagableIds = new Set(pagables.map((f) => f._id));
  const deudaTotal = pagables.reduce((s, f) => s + montoAPagarHoy(f), 0);
  /* Pagos que Vekino registró y la contabilidad aún no refleja: no se cobran
   * otra vez, y la unidad no está "en mora" por ellos. */
  const enVerificacion = resumen.unidades.reduce(
    (s, u) =>
      s + (u.cartera.motivoRevision === "pago_en_verificacion" ? (u.cartera.montoEnVerificacion ?? 0) : 0),
    0,
  );

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
          enMora={enMora}
          enRevision={resumen.estado === "en_revision"}
          enVerificacion={enVerificacion}
          conteo={pagables.length}
          deuda={deudaTotal}
          multiUnidad={multiUnidad && unidadFiltro === ""}
          onVerDetalle={scrollToFacturas}
        />
        <ProximoPagoCard
          loading={facturas === undefined}
          facturas={pagables}
          estaAlDia={estaAlDia}
          enVerificacion={enVerificacion}
          unidadesEnMora={unidadesEnMora}
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
                cadena={listaAll.filter((x) => String(x.unidadId) === String(f.unidadId))}
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
  enMora,
  enRevision,
  enVerificacion,
  conteo,
  deuda,
  multiUnidad,
  onVerDetalle,
}: {
  loading: boolean;
  estaAlDia: boolean;
  /** Mora ACTUAL según la cartera, no "alguna factura vencida en el historial". */
  enMora: boolean;
  /** La factura vigente tiene una lectura dudosa: ni al día ni en mora. */
  enRevision: boolean;
  /** Pagado y todavía no reflejado por la contabilidad (0 si no hay). */
  enVerificacion: number;
  conteo: number;
  deuda: number;
  multiUnidad: boolean;
  onVerDetalle: () => void;
}) {
  const badgeTone = estaAlDia
    ? ("success" as const)
    : enMora
      ? ("destructive" as const)
      : enRevision
        ? ("info" as const)
        : ("warning" as const);
  const badgeLabel = estaAlDia
    ? "Al día"
    : enMora
      ? "Vencida"
      : enVerificacion > 0
        ? "Pago en verificación"
        : enRevision
          ? "En revisión"
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
        ) : enVerificacion > 0 && conteo === 0 ? (
          <p className="text-sm text-muted-foreground">{mensajePagoEnVerificacion(enVerificacion)}</p>
        ) : conteo === 0 ? (
          /* Debe, pero no hay una factura vigente que se pueda pagar: la
           * unidad tiene dos del mismo período y la administración debe
           * revisarlas. No se adivina cuál cobrar. */
          <p className="text-sm text-muted-foreground">
            Tu factura está en revisión. Comunícate con la administración.
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
  estaAlDia,
  enVerificacion,
  unidadesEnMora,
  avalPortalUrl,
  multiUnidad,
}: {
  loading: boolean;
  /** Las vigentes que se pueden pagar: a lo sumo una por unidad. */
  facturas: Factura[];
  estaAlDia: boolean;
  /** Pagado y todavía no reflejado por la contabilidad (0 si no hay). */
  enVerificacion: number;
  unidadesEnMora: ReadonlySet<string>;
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
        {estaAlDia ? (
          <>
            <CheckCircle2 className="h-9 w-9 text-emerald-600 dark:text-emerald-400" />
            <p className="text-lg font-bold text-foreground">Estás al día</p>
            <p className="text-sm text-muted-foreground">
              No tienes pagos pendientes.
            </p>
          </>
        ) : enVerificacion > 0 ? (
          /* No se cobra en línea: se le cobraría dos veces lo que ya pagó. */
          <>
            <p className="text-lg font-bold text-foreground">Pago en verificación</p>
            <p className="text-sm text-muted-foreground">
              {mensajePagoEnVerificacion(enVerificacion)}
            </p>
          </>
        ) : (
          <>
            <p className="text-lg font-bold text-foreground">Pago en línea no disponible</p>
            <p className="text-sm text-muted-foreground">
              Comunícate con la administración para revisar tu factura.
            </p>
          </>
        )}
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
  /* La vigente de una unidad en mora se rotula como la cartera: puede seguir
   * `pendiente` en la base porque ninguna factura posterior la ha juzgado. */
  const meta = unidadesEnMora.has(factura.unidadId)
    ? ESTADO_FACTURA.vencida
    : ESTADO_FACTURA[factura.estado];
  const venc =
    factura.fechaVencimiento > FECHA_MIN
      ? fechaPlazo(factura.fechaVencimiento)
      : null;
  /* Fase 4, decisión B: el fin de mes es el plazo del precio completo; la
   * mora empieza el 16 del mes siguiente. Las dos fechas, dichas claro. */
  const moraDesde = venc ? fechaPlazo(inicioDeMora(factura)) : null;
  const limiteDescuento = fechaLimiteDescuentoDe(factura);

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
          <p className="mt-1 text-xs text-muted-foreground">
            Precio completo hasta el {venc}
          </p>
        ) : null}
        {moraDesde ? (
          <p className="text-xs text-muted-foreground">En mora desde el {moraDesde}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
        <span className="text-xl font-bold tabular-nums tracking-tight text-foreground sm:text-2xl">
          {cop(montoAPagarHoy(factura))}
        </span>
        {limiteDescuento !== null && descuentoVigente(factura, Date.now()) ? (
          <p className="text-xs text-muted-foreground">
            Con descuento hasta el {fechaPlazo(limiteDescuento)}. Después: {cop(factura.totalAPagar)}
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
  cadena,
  avalPortalUrl,
  pagable,
  showUnidad,
}: {
  factura: Factura;
  /** Las facturas de la misma unidad: dicen si esta es historica. */
  cadena: Factura[];
  avalPortalUrl: string | null;
  pagable: boolean;
  showUnidad: boolean;
}) {
  const [open, setOpen] = useState(false);
  /* Una historica que quedó `pendiente` no se sabe si se pagó: falta el
   * estado de cuenta siguiente (Fase 4). No se rotula "Pendiente". */
  const visible = estadoVisibleDeFactura(factura, cadena);
  const sinVerificar = visible === "sin_verificar";
  const meta = sinVerificar ? null : ESTADO_FACTURA[factura.estado];
  const isPagada = factura.estado === "pagada";
  const venc = factura.fechaVencimiento > FECHA_MIN ? fechaPlazo(factura.fechaVencimiento) : null;
  /* La mora solo se anuncia en la vigente sin pagar (decisión B, Fase 4). */
  const esVigente = !cadena.some((x) => x.periodo > factura.periodo);
  const moraDesde =
    venc && esVigente && sinPagar(factura.estado) ? fechaPlazo(inicioDeMora(factura)) : null;
  const periodo = periodoHumano(factura.periodo || factura.periodoLabel);
  const limiteDescuento = fechaLimiteDescuentoDe(factura);

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
            {sinVerificar && <Badge tone="neutral">{ETIQUETA_SIN_VERIFICAR}</Badge>}
            {enRevision(factura) && <Badge tone="info">En revisión</Badge>}
            {factura.pagoEnVerificacion ? (
              <Badge tone="info">Pago en verificación</Badge>
            ) : null}
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
            <p className="text-xs font-medium text-muted-foreground">
              Precio completo hasta el {venc}
            </p>
          )}
          {moraDesde && (
            <p className="text-xs text-muted-foreground">En mora desde el {moraDesde}</p>
          )}
          {sinVerificar && (
            <p className="mt-1 text-xs text-muted-foreground">{TEXTO_SIN_VERIFICAR}</p>
          )}
          {factura.pagoEnVerificacion ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {mensajePagoEnVerificacion(factura.pagoEnVerificacion.monto)}
            </p>
          ) : null}
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
                limiteDescuento !== null &&
                factura.totalConDescuento < factura.totalAPagar ? (
                  <>
                    <tr>
                      <td
                        colSpan={3}
                        className="pt-3 text-right text-sm font-medium text-emerald-700 dark:text-emerald-400"
                      >
                        Con descuento, hasta el {fechaPlazo(limiteDescuento)}
                      </td>
                      <td className="pt-3 text-right text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {cop(factura.totalConDescuento)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="pt-1 text-right text-sm font-semibold text-foreground">
                        {venc ? `Sin descuento, hasta el ${venc}` : "Sin descuento"}
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
  /* Igual que en portal-pay-button (Fase 4): sin portal del banco, con la
   * pasarela en QA y una unidad real, no se ofrece pagar en línea. */
  const opciones = useQuery(
    api.pagos.opcionesDePago,
    avalPortalUrl ? "skip" : { facturaId: factura._id },
  );
  if (!avalPortalUrl && opciones?.debe && !opciones.pasarela && opciones.motivo) {
    return <span className="max-w-[14rem] text-xs text-muted-foreground">{opciones.motivo}</span>;
  }

  async function pagar() {
    if (avalPortalUrl) {
      window.open(avalPortalUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setLoading(true);
    /* Igual que en portal-pay-button: la pestaña se abre con el clic todavía
     * en curso, o el navegador la bloquea por emergente. Navegar en la misma
     * pestaña dejaba a la persona sin Vekino si la pasarela terminaba en una
     * pantalla sin salida. */
    const pestana = window.open("", "_blank", "noopener,noreferrer");
    try {
      const { redirectUrl } = await crearPago({ facturaId: factura._id });
      if (pestana && !pestana.closed) pestana.location.href = redirectUrl;
      else window.location.href = redirectUrl;
      setLoading(false);
    } catch {
      if (pestana && !pestana.closed) pestana.close();
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
