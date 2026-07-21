"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { Users, Building2, Wallet, Clock, ArrowRight } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { PageContainer } from "@/components/layout/page-container";
import { StatCard } from "@/components/layout/stat-card";
import { ModuleGrid } from "@/components/dashboard/module-grid";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaChart } from "@/components/charts/area-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { CHART } from "@/components/charts/chart-colors";
import { cop } from "@/lib/utils";

const MES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
function periodoCorto(p: string) {
  const [y, m] = p.split("-");
  return `${MES_CORTO[Number(m) - 1] ?? m} ${String(y).slice(2)}`;
}

function saludo() {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

export default function CondominioHome() {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;
  const home = useQuery(api.condominios.adminHome, { condominioId });
  // Conteos (membresías/unidades) solo aquí, no en el shell → ahorra E/S.
  const detail = useQuery(api.condominios.detail, { condominioId });
  const serie = useQuery(api.facturas.serie, { condominioId });

  const base = `/condominio/${condominioId}`;
  const last = serie && serie.length > 0 ? serie[serie.length - 1] : undefined;

  if (home === undefined || !home.allowed) {
    return <DashboardSkeleton />;
  }

  const firstName = home.userName;

  return (
    <PageContainer>
      <div className="space-y-8">
        {/* Saludo */}
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {saludo()}, {firstName}
          </h1>
          <p className="text-sm text-muted-foreground">
            Resumen de {home.condominio.name}
          </p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon={Users}
            label="Residentes"
            value={detail?.memberCount ?? "—"}
            hint="Personas registradas"
            href={`${base}/residentes`}
          />
          <StatCard
            icon={Building2}
            label="Unidades"
            value={detail?.unidadCount ?? "—"}
            hint="Inmuebles del conjunto"
            href={`${base}/unidades`}
          />
          {last ? (
            <>
              <StatCard
                icon={Wallet}
                label="Cartera"
                value={cop(last.sumaTotalAPagar)}
                hint={periodoCorto(last.periodo)}
                tone="brand"
                href={`${base}/finanzas`}
              />
              <StatCard
                icon={Clock}
                label="Pendientes"
                value={last.pendientes}
                hint={`de ${last.total} facturas`}
                tone="warning"
                href={`${base}/finanzas`}
              />
            </>
          ) : (
            <>
              <KpiSkeleton />
              <KpiSkeleton />
            </>
          )}
        </div>

        {/* Gráficas */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between">
              <div className="space-y-1">
                <CardTitle>Cartera por período</CardTitle>
                <CardDescription>Total facturado en cada mes</CardDescription>
              </div>
              <Link
                href={`${base}/reportes`}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
              >
                Reportes
                <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            </CardHeader>
            <CardContent>
              {serie === undefined ? (
                <Skeleton className="h-55 w-full rounded-xl" />
              ) : serie.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  Aún no hay facturas cargadas.
                </p>
              ) : (
                <AreaChart
                  data={serie.map((p) => ({ label: periodoCorto(p.periodo), value: p.sumaTotalAPagar }))}
                  color={CHART.brand}
                  format={cop}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Estado de facturas</CardTitle>
              <CardDescription>{last ? periodoCorto(last.periodo) : "Último período"}</CardDescription>
            </CardHeader>
            <CardContent>
              {serie === undefined ? (
                <div className="flex flex-col items-center gap-5">
                  <Skeleton className="h-42 w-42 rounded-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : last ? (
                <DonutChart
                  centerValue={last.total}
                  centerLabel="facturas"
                  data={[
                    { label: "Pagadas", value: last.pagadas, color: CHART.emerald },
                    { label: "Pendientes", value: last.pendientes, color: CHART.amber },
                    { label: "Vencidas", value: last.vencidas, color: CHART.red },
                  ]}
                />
              ) : (
                <p className="py-16 text-center text-sm text-muted-foreground">Sin datos.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Módulos */}
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Módulos</h2>
            <p className="text-sm text-muted-foreground">
              Todo lo que puedes gestionar en {home.condominio.name}
            </p>
          </div>
          <ModuleGrid base={base} />
        </div>
      </div>
    </PageContainer>
  );
}

function KpiSkeleton() {
  return (
    <Card className="space-y-3 p-5">
      <Skeleton className="h-9 w-9 rounded-lg" />
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-3 w-20" />
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <PageContainer>
      <div className="space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    </PageContainer>
  );
}
