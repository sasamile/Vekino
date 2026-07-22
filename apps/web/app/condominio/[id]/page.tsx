"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import {
  CircleDollarSign,
  Wallet,
  DoorOpen,
  UsersRound,
  Download,
  Upload,
} from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { PageContainer } from "@/components/layout/page-container";
import { StatCard } from "@/components/layout/stat-card";
import { useTopbarActions } from "@/components/layout/admin-topbar-context";
import {
  PeriodoSelect,
  formatPeriodoLabel,
} from "@/components/layout/periodo-select";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DonutChart } from "@/components/charts/donut-chart";
import { TwinBars } from "@/components/charts/twin-bars";
import { CHART } from "@/components/charts/chart-colors";
import { usePersistedPeriodo } from "@/hooks/use-persisted-periodo";
import { cop, initials } from "@/lib/utils";

const MES_CORTO = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

function periodoCorto(p: string) {
  const [y, m] = p.split("-");
  return `${MES_CORTO[Number(m) - 1] ?? m}`;
}

function compactCop(n: number) {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `$${m >= 100 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return cop(n);
}

const AVATAR_COLORS = [
  "bg-brand",
  "bg-brand/80",
  "bg-foreground/70",
  "bg-muted-foreground/60",
  "bg-foreground/50",
];

const ESTADO_TONE: Record<
  string,
  "success" | "warning" | "destructive" | "info" | "neutral"
> = {
  pagada: "success",
  pendiente: "warning",
  vencida: "destructive",
  abonada: "info",
};
const ESTADO_LABEL: Record<string, string> = {
  pagada: "Pagado",
  pendiente: "Pendiente",
  vencida: "Vencida",
  abonada: "Abonada",
};

export default function CondominioHome() {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;
  const home = useQuery(api.condominios.adminHome, { condominioId });
  const detail = useQuery(api.condominios.detail, { condominioId });
  const serie = useQuery(api.facturas.serie, { condominioId });
  const periodos = useQuery(api.facturas.listPeriodos, { condominioId });
  const { periodo, setPeriodo } = usePersistedPeriodo(condominioId, periodos);

  const base = `/condominio/${condominioId}`;

  const selectedIdx = useMemo(() => {
    if (!serie || !periodo) return -1;
    return serie.findIndex((p: { periodo: string }) => p.periodo === periodo);
  }, [serie, periodo]);

  const current = selectedIdx >= 0 ? serie![selectedIdx] : undefined;
  const prev = selectedIdx > 0 ? serie![selectedIdx - 1] : undefined;

  const pagosRecientes = useQuery(
    api.facturas.listRecentByPeriodo,
    periodo ? { condominioId, periodo, limit: 5 } : "skip",
  );

  const periodosKey = (periodos ?? []).join("|");

  useTopbarActions(
    <>
      <PeriodoSelect
        value={periodo}
        options={periodos ?? []}
        onChange={setPeriodo}
      />
      <Button variant="secondary" className="hidden sm:inline-flex" asChild>
        <Link href={`${base}/reportes`}>
          <Download className="h-3.75 w-3.75" aria-hidden />
          Exportar
        </Link>
      </Button>
      <Button variant="brand" asChild>
        <Link href={`${base}/finanzas`}>
          <Upload className="h-3.75 w-3.75" aria-hidden />
          Cargar facturas
        </Link>
      </Button>
    </>,
    [periodo, periodosKey, base],
  );

  if (home === undefined || !home.allowed) {
    return <DashboardSkeleton />;
  }

  const recaudo = current?.sumaPagado ?? 0;
  const carteraPendiente = current
    ? Math.max(0, current.sumaTotalAPagar - current.sumaPagado)
    : 0;
  const alDia = current ? current.pagadas : 0;
  const totalFacturas = current?.total ?? 0;
  const pctAlDia =
    totalFacturas > 0 ? Math.round((alDia / totalFacturas) * 100) : 0;

  const recaudoDelta =
    prev && prev.sumaPagado > 0
      ? Math.round(((recaudo - prev.sumaPagado) / prev.sumaPagado) * 100)
      : null;
  const carteraDelta =
    prev && prev.sumaTotalAPagar - prev.sumaPagado > 0
      ? Math.round(
          ((carteraPendiente - (prev.sumaTotalAPagar - prev.sumaPagado)) /
            (prev.sumaTotalAPagar - prev.sumaPagado)) *
            100,
        )
      : null;

  const barSlice =
    selectedIdx >= 0 && serie
      ? serie.slice(0, selectedIdx + 1).slice(-6)
      : (serie ?? []).slice(-6);
  const barData = barSlice.map(
    (p: { periodo: string; sumaPagado: number; sumaTotalAPagar: number }) => ({
      label: periodoCorto(p.periodo),
      recaudo: p.sumaPagado,
      vencida: Math.max(0, p.sumaTotalAPagar - p.sumaPagado),
    }),
  );

  const actividad = (pagosRecientes ?? []).map((f) => ({
    text:
      f.estado === "pagada"
        ? `${f.apto ? `Apto ${f.apto}` : f.residenteNombre} pagó su factura`
        : f.estado === "vencida"
          ? `${f.apto ? `Apto ${f.apto}` : f.residenteNombre} quedó en mora`
          : `Factura de ${f.residenteNombre} · ${ESTADO_LABEL[f.estado] ?? f.estado}`,
    ts: f.updatedAt,
    color:
      f.estado === "pagada"
        ? "bg-brand"
        : f.estado === "vencida"
          ? "bg-[#B1D459]"
          : "bg-[#c9e07a]",
  }));

  const periodoLabelTxt = periodo ? formatPeriodoLabel(periodo) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageContainer>
        <div className="grid grid-cols-12 gap-4">
          {/* KPIs */}
          <div className="col-span-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              icon={CircleDollarSign}
              tone="brand"
              label="Recaudo del mes"
              value={current ? compactCop(recaudo) : "—"}
              badge={
                recaudoDelta != null
                  ? `${recaudoDelta >= 0 ? "↑" : "↓"} ${Math.abs(recaudoDelta)}%`
                  : undefined
              }
              badgeTone={
                recaudoDelta != null && recaudoDelta < 0
                  ? "negative"
                  : "positive"
              }
              href={`${base}/finanzas`}
            />
            <StatCard
              icon={Wallet}
              tone="warning"
              label="Cartera pendiente"
              value={current ? compactCop(carteraPendiente) : "—"}
              badge={
                carteraDelta != null
                  ? `${carteraDelta >= 0 ? "↑" : "↓"} ${Math.abs(carteraDelta)}%`
                  : undefined
              }
              badgeTone={
                carteraDelta != null && carteraDelta > 0
                  ? "negative"
                  : "positive"
              }
              href={`${base}/finanzas`}
            />
            <StatCard
              icon={DoorOpen}
              tone="brand"
              label="Unidades al día"
              value={
                current && detail
                  ? `${alDia}/${detail.unidadCount || totalFacturas}`
                  : current
                    ? `${alDia}/${totalFacturas}`
                    : "—"
              }
              badge={current ? `${pctAlDia}%` : undefined}
              badgeTone="positive"
              href={`${base}/unidades`}
            />
            <StatCard
              icon={UsersRound}
              tone="neutral"
              label="Residentes"
              value={detail?.memberCount ?? "—"}
              badge="registrados"
              badgeTone="positive"
              href={`${base}/residentes`}
            />
          </div>

          {/* Barras */}
          <Card className="col-span-12 lg:col-span-8">
            <CardHeader className="mb-0 flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Recaudo vs. cartera vencida</CardTitle>
                <CardDescription>
                  {periodoLabelTxt
                    ? `Hasta ${periodoLabelTxt} · últimos ${barData.length || 6} meses`
                    : "Últimos 6 meses"}
                </CardDescription>
              </div>
              <div className="inline-flex h-8 items-center gap-0.5 rounded-full border border-border/60 bg-muted p-0.75">
                <span className="inline-flex h-6.5 items-center gap-1.5 rounded-full bg-card px-2.5 text-[11.5px] font-medium text-foreground shadow-soft">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                  Recaudo
                </span>
                <span className="inline-flex h-6.5 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-medium text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#B1D459]" />
                  Vencida
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {serie === undefined ? (
                <Skeleton className="mt-4 h-57.5 w-full rounded-xl" />
              ) : barData.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  Aún no hay facturas cargadas.
                </p>
              ) : (
                <TwinBars data={barData} />
              )}
            </CardContent>
          </Card>

          {/* Donut */}
          <Card className="col-span-12 lg:col-span-4">
            <CardHeader className="mb-0 flex-row items-center justify-between">
              <CardTitle>Estado de cartera</CardTitle>
            </CardHeader>
            <CardContent>
              {serie === undefined ? (
                <div className="mt-2 flex flex-col items-center gap-4">
                  <Skeleton className="h-37.5 w-37.5 rounded-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : current ? (
                <DonutChart
                  size={150}
                  thickness={18}
                  centerValue={`${pctAlDia}%`}
                  centerLabel="al día"
                  data={[
                    {
                      label: "Al día",
                      value: current.pagadas,
                      color: CHART.brand,
                    },
                    {
                      label: "Pendientes",
                      value: current.pendientes + current.abonadas,
                      color: CHART.pending,
                    },
                    {
                      label: "Vencidas",
                      value: current.vencidas,
                      color: CHART.debt,
                    },
                  ]}
                />
              ) : (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  Sin datos.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Tabla pagos */}
          <Card className="col-span-12 lg:col-span-8">
            <CardHeader className="mb-3 flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>Pagos recientes</CardTitle>
                <CardDescription>
                  {pagosRecientes
                    ? `${pagosRecientes.length} recientes${periodoLabelTxt ? ` · ${periodoLabelTxt}` : ""}`
                    : "…"}
                </CardDescription>
              </div>
              <Button variant="secondary" size="sm" asChild>
                <Link href={`${base}/finanzas`}>Ver todos</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {pagosRecientes === undefined ? (
                <Skeleton className="h-48 w-full rounded-xl" />
              ) : pagosRecientes.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No hay facturas en este período.
                </p>
              ) : (
                <div className="overflow-hidden">
                  <table className="w-full table-fixed border-collapse text-[12px]">
                    <thead className="bg-brand/[0.07]">
                      <tr>
                        <th className="w-[28%] px-2 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Factura
                        </th>
                        <th className="w-[36%] px-2 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Residente
                        </th>
                        <th className="w-[16%] px-2 py-2.5 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Valor
                        </th>
                        <th className="w-[20%] px-2 py-2.5 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Estado
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagosRecientes.map((f, i) => (
                        <tr
                          key={f._id}
                          className="border-b border-border/60 last:border-b-0 even:bg-brand/[0.035]"
                        >
                          <td className="max-w-0 px-2 py-2.5 align-middle">
                            <p
                              className="truncate font-medium text-foreground"
                              title={f.numeroFactura}
                            >
                              {f.numeroFactura.replace(/^FAC-/, "")}
                            </p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {f.apto ? `Apto ${f.apto}` : f.numeroInterno}
                            </p>
                          </td>
                          <td className="max-w-0 px-2 py-2.5 align-middle">
                            <div className="flex min-w-0 items-center gap-2">
                              <div
                                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[9px] font-semibold text-white ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}
                              >
                                {initials(f.residenteNombre)}
                              </div>
                              <p
                                className="truncate font-medium capitalize text-foreground"
                                title={f.residenteNombre}
                              >
                                {f.residenteNombre.toLowerCase()}
                              </p>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-2 py-2.5 text-right font-medium tabular-nums text-foreground">
                            {cop(f.totalAPagar)}
                          </td>
                          <td className="px-2 py-2.5 align-middle">
                            <Badge
                              tone={ESTADO_TONE[f.estado] ?? "neutral"}
                              className="max-w-full truncate text-[10px]"
                            >
                              {ESTADO_LABEL[f.estado] ?? f.estado}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actividad */}
          <Card className="col-span-12 lg:col-span-4">
            <CardHeader className="mb-3">
              <CardTitle>Actividad reciente</CardTitle>
            </CardHeader>
            <CardContent>
              {actividad.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Sin actividad reciente.
                </p>
              ) : (
                <ul className="flex flex-col gap-3.5">
                  {actividad.map((a, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.color}`}
                      />
                      <div>
                        <p className="text-[12.5px] leading-4.25 text-foreground">
                          {a.text}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          <RelativeTime ts={a.ts} />
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    </div>
  );
}

function formatFechaCorta(ts: number) {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Bogota",
  }).format(new Date(ts));
}

function formatRelativo(ts: number, now: number) {
  const mins = Math.round((now - ts) / 60_000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `Hace ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.round(h / 24);
  return `Hace ${d} d`;
}

function RelativeTime({ ts }: { ts: number }) {
  const [label, setLabel] = useState(() => formatFechaCorta(ts));
  useEffect(() => {
    setLabel(formatRelativo(ts, Date.now()));
  }, [ts]);
  return <span suppressHydrationWarning>{label}</span>;
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="flex h-18 items-center border-b border-border px-7">
        <Skeleton className="h-8 w-64" />
      </div>
      <PageContainer>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-19 rounded-[14px]" />
          ))}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-[14px] lg:col-span-2" />
          <Skeleton className="h-80 rounded-[14px]" />
        </div>
      </PageContainer>
    </div>
  );
}
