"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import {
  FileText, ExternalLink, TrendingUp, Clock, CheckCircle2, AlertTriangle,
  RefreshCcw, Loader2, PiggyBank,
} from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Doc, Id } from "@vekino/backend/dataModel";
import { UploadFacturas } from "@/components/upload-facturas";
import { CreateFacturaForm } from "@/components/create-factura-form";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { useTopbarActions } from "@/components/layout/admin-topbar-context";
import { PeriodoSelect, formatPeriodoLabel } from "@/components/layout/periodo-select";
import { StatCard } from "@/components/layout/stat-card";
import { SearchInput, Select } from "@/components/ui/input";
import { TableCard, Table, THead, TH, TBody, TR, TD, CellStack } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { usePersistedPeriodo } from "@/hooks/use-persisted-periodo";
import { cop } from "@/lib/utils";

const PAGE_SIZE = 30;

const ESTADO_TONE: Record<string, React.ComponentProps<typeof Badge>["tone"]> = {
  pendiente: "warning",
  pagada: "success",
  vencida: "destructive",
  abonada: "info",
  saldo_a_favor: "violet",
};
const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  pagada: "Pagada",
  vencida: "Vencida",
  abonada: "Abonada",
  saldo_a_favor: "Saldo a favor",
};

type Factura = Doc<"facturas">;

function useDebounced(value: string, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function FinanzasPage() {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;
  const condominioData = useQuery(api.condominios.adminHome, { condominioId });
  const periodos = useQuery(api.facturas.listPeriodos, { condominioId });
  const { periodo, setPeriodo } = usePersistedPeriodo(condominioId, periodos);
  const [uploadKey, setUploadKey] = useState(0);

  const periodoActivo = periodo ?? periodos?.[0] ?? "2026-03";
  const resumen = useQuery(api.facturas.resumenPeriodo, { condominioId, periodo: periodoActivo });

  const [search, setSearch] = useState("");
  const deferredSearch = useDebounced(search, 280);
  const [filtroEstado, setFiltroEstado] = useState<
    "" | "pendiente" | "pagada" | "vencida" | "abonada" | "saldo_a_favor"
  >("");
  const [facturaDetalle, setFacturaDetalle] = useState<Factura | null>(null);

  const { results: facturas, status, loadMore } = usePaginatedQuery(
    api.facturas.listPage,
    {
      condominioId,
      periodo: periodoActivo,
      q: deferredSearch.trim() || undefined,
      estado: filtroEstado || undefined,
    },
    { initialNumItems: PAGE_SIZE },
  );

  const loading = status === "LoadingFirstPage";
  const canLoadMore = status === "CanLoadMore";
  const loadingMore = status === "LoadingMore";

  const reconciliar = useMutation(api.facturas.reconciliar);
  const [conciliando, setConciliando] = useState(false);
  const [conciliacionMsg, setConciliacionMsg] = useState<string | null>(null);

  async function handleReconciliar() {
    setConciliando(true);
    setConciliacionMsg(null);
    try {
      const r = await reconciliar({ condominioId });
      const cambios = r.pagadas + r.abonadas + r.vencidas;
      setConciliacionMsg(
        cambios === 0
          ? `Todo al día: ${r.facturas} facturas de ${r.unidades} unidades ya estaban conciliadas.`
          : `Conciliación lista: ${r.pagadas} pagadas · ${r.abonadas} abonadas · ${r.vencidas} vencidas (${r.unidades} unidades revisadas).`
      );
    } catch (e) {
      setConciliacionMsg(e instanceof Error ? e.message : "Error al conciliar.");
    } finally {
      setConciliando(false);
    }
  }

  const hasFilters = Boolean(deferredSearch.trim() || filtroEstado);
  const totalLabel = resumen?.total;

  useTopbarActions(
    <>
      <Button variant="outline" onClick={handleReconciliar} disabled={conciliando}>
        {conciliando ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <RefreshCcw className="h-4 w-4" aria-hidden />
        )}
        Conciliar
      </Button>
      <CreateFacturaForm
        condominioId={condominioId}
        defaultPeriodo={periodoActivo}
      />
      {condominioData?.allowed && condominioData.condominio.legacyId && (
        <UploadFacturas
          key={uploadKey}
          condominioId={condominioId}
          condominioLegacyId={condominioData.condominio.legacyId}
          currentPeriodo={periodoActivo}
          onDone={() => setUploadKey((k) => k + 1)}
        />
      )}
      <PeriodoSelect
        value={periodoActivo}
        options={periodos ?? []}
        onChange={(p) => {
          setPeriodo(p);
          setFacturaDetalle(null);
        }}
      />
    </>,
    [
      conciliando,
      condominioId,
      periodoActivo,
      uploadKey,
      condominioData?.allowed,
      condominioData?.condominio?.legacyId,
      (periodos ?? []).join("|"),
    ],
  );

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          title="Finanzas"
          description="Cuentas de cobro y estado de cartera"
        />

        {conciliacionMsg && (
          <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-foreground">
            <RefreshCcw className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
            <p>{conciliacionMsg}</p>
            <button
              onClick={() => setConciliacionMsg(null)}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* KPIs */}
        {resumen ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <StatCard icon={TrendingUp} label="Total cartera" value={cop(resumen.sumaTotalAPagar)} hint="Facturado en el período" />
            <StatCard icon={Clock} label="Pendientes" value={resumen.pendientes} hint={`de ${resumen.total} facturas`} tone="warning" />
            <StatCard icon={CheckCircle2} label="Pagadas" value={resumen.pagadas} hint={cop(resumen.sumaPagado)} tone="success" />
            <StatCard icon={PiggyBank} label="Abonadas" value={resumen.abonadas ?? 0} hint="Pago parcial" tone="primary" />
            <StatCard icon={AlertTriangle} label="Vencidas" value={resumen.vencidas} hint="Con mora" tone="destructive" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Cargando…"
              : totalLabel != null
                ? `${facturas.length} de ${totalLabel} facturas`
                : `${facturas.length} facturas`}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value as typeof filtroEstado)}
              className="sm:w-44"
            >
              <option value="">Todos los estados</option>
              <option value="pendiente">Pendiente</option>
              <option value="pagada">Pagada</option>
              <option value="abonada">Abonada</option>
              <option value="vencida">Vencida</option>
              <option value="saldo_a_favor">Saldo a favor</option>
            </Select>
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar residente o apto"
              className="sm:w-72"
            />
          </div>
        </div>

        {/* Tabla */}
        {loading ? (
          <TableSkeleton />
        ) : facturas.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={hasFilters ? "Sin resultados" : "Sin facturas"}
            description={
              hasFilters
                ? "Ninguna factura coincide con los filtros."
                : "Aún no hay facturas para este período. Súbelas desde el botón superior."
            }
            action={
              hasFilters ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setFiltroEstado("");
                  }}
                >
                  Limpiar filtros
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <TableCard>
              <Table>
                <THead>
                  <tr>
                    <TH className="hidden md:table-cell">Factura</TH>
                    <TH>Residente</TH>
                    <TH>Estado</TH>
                    <TH className="text-right">Total</TH>
                    <TH className="text-right">Acciones</TH>
                  </tr>
                </THead>
                <TBody>
                  {facturas.map((f) => (
                    <TR key={f._id}>
                      <TD className="hidden md:table-cell">
                        <CellStack
                          primary={f.numeroFactura}
                          secondary={`ID ${f.numeroInterno}`}
                        />
                      </TD>
                      <TD>
                        <CellStack
                          primary={f.residenteNombre}
                          secondary={f.apto ? `Apto ${f.apto}` : "Sin unidad"}
                        />
                      </TD>
                      <TD>
                        <Badge tone={ESTADO_TONE[f.estado] ?? "neutral"}>
                          {ESTADO_LABEL[f.estado] ?? f.estado}
                        </Badge>
                      </TD>
                      <TD className="text-right font-medium tabular-nums text-foreground">
                        {cop(f.totalAPagar)}
                      </TD>
                      <TD className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setFacturaDetalle(
                                facturaDetalle?._id === f._id ? null : f,
                              )
                            }
                          >
                            Ver detalle
                          </Button>
                          {f.pdfUrl && (
                            <a
                              href={f.pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label="Abrir PDF"
                              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableCard>

            {canLoadMore || loadingMore ? (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingMore}
                  onClick={() => loadMore(PAGE_SIZE)}
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Cargando…
                    </>
                  ) : (
                    "Cargar más"
                  )}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Detalle */}
      {facturaDetalle && (
        <Modal
          open
          onClose={() => setFacturaDetalle(null)}
          title={facturaDetalle.residenteNombre}
          description={`${facturaDetalle.numeroFactura} · Apto ${facturaDetalle.apto ?? "—"} · ${formatPeriodoLabel(facturaDetalle.periodo)}`}
          footer={
            <>
              {facturaDetalle.pdfUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={facturaDetalle.pdfUrl} target="_blank" rel="noopener noreferrer">
                    <FileText className="h-4 w-4" aria-hidden />
                    Ver PDF
                  </a>
                </Button>
              )}
              <Button size="sm" onClick={() => setFacturaDetalle(null)}>Cerrar</Button>
            </>
          }
        >
          <div className="mb-3 flex justify-end">
            <Badge tone={ESTADO_TONE[facturaDetalle.estado] ?? "neutral"}>
              {ESTADO_LABEL[facturaDetalle.estado] ?? facturaDetalle.estado}
            </Badge>
          </div>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-brand/[0.07] text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Concepto</th>
                  <th className="px-4 py-2 text-right font-medium">Ant.</th>
                  <th className="px-4 py-2 text-right font-medium">Actual</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {facturaDetalle.lineas.map((l) => (
                  <tr
                    key={l.codigo}
                    className={`even:bg-brand/[0.035] ${l.total > 0 ? "" : "text-muted-foreground/60"}`}
                  >
                    <td className="px-4 py-2">{l.concepto}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{l.saldoAnterior > 0 ? cop(l.saldoAnterior) : "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{l.actual > 0 ? cop(l.actual) : "—"}</td>
                    <td className={`px-4 py-2 text-right font-medium tabular-nums ${l.total > 0 ? "text-foreground" : ""}`}>
                      {l.total > 0 ? cop(l.total) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {facturaDetalle.totalConDescuento != null && facturaDetalle.totalConDescuento > 0 && (
                  <tr className="border-t border-border bg-emerald-500/5">
                    <td colSpan={3} className="px-4 py-2 text-xs font-medium text-emerald-600">
                      Pague del 1 al 15 (con descuento)
                    </td>
                    <td className="px-4 py-2 text-right text-sm font-bold tabular-nums dark:text-emerald-400">
                      {cop(facturaDetalle.totalConDescuento)}
                    </td>
                  </tr>
                )}
                <tr className="border-t border-border bg-muted/40">
                  <td colSpan={3} className="px-4 py-2.5 text-sm font-semibold text-foreground">
                    {facturaDetalle.totalConDescuento != null && facturaDetalle.totalConDescuento > 0
                      ? "Pague del 16 al 30 (sin descuento)"
                      : "Total a pagar"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm font-bold tabular-nums text-foreground">
                    {cop(facturaDetalle.totalAPagar)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Modal>
      )}
    </PageContainer>
  );
}

function TableSkeleton() {
  return (
    <TableCard>
      <div className="divide-y divide-border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="ml-auto h-4 w-24" />
          </div>
        ))}
      </div>
    </TableCard>
  );
}
