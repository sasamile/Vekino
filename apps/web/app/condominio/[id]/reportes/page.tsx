"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { TrendingUp, Wallet, Building2, Users, PieChart } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/layout/stat-card";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { AreaChart } from "@/components/charts/area-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { HBars } from "@/components/charts/h-bars";
import { CHART } from "@/components/charts/chart-colors";
import { cop, num } from "@/lib/utils";

const MES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
function periodoCorto(p: string) {
  const [y, m] = p.split("-");
  return `${MES_CORTO[Number(m) - 1] ?? m} ${String(y).slice(2)}`;
}

const ROLE_LABEL: Record<string, string> = {
  administrador: "Administrador", propietario: "Propietario", apoderado: "Apoderado",
  arrendatario: "Arrendatario", residente: "Residente", contadora: "Contadora",
  guardia: "Guardia", junta_directiva: "Junta directiva", representante_asamblea: "Rep. asamblea",
};

export default function ReportesPage() {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;
  const serie = useQuery(api.facturas.serie, { condominioId });
  const unidades = useQuery(api.unidades.listDetailed, { condominioId });
  const members = useQuery(api.memberships.listByCondominio, { condominioId });

  const loading = serie === undefined || unidades === undefined || members === undefined;

  return (
    <PageContainer>
      <div className="space-y-8">
        <PageHeader
          title="Reportes"
          description="Indicadores de cartera, ocupación y comunidad"
        />

        {loading ? (
          <ReportesSkeleton />
        ) : serie.length === 0 && unidades.length === 0 ? (
          <EmptyState
            icon={PieChart}
            title="Aún no hay datos para reportar"
            description="Cuando cargues facturas y unidades, aquí verás los indicadores del conjunto."
          />
        ) : (
          <ReportesContent serie={serie} unidades={unidades} members={members} />
        )}
      </div>
    </PageContainer>
  );
}

type Serie = FunctionReturnType<typeof api.facturas.serie>;
type Unidades = FunctionReturnType<typeof api.unidades.listDetailed>;
type Members = FunctionReturnType<typeof api.memberships.listByCondominio>;

function ReportesContent({
  serie,
  unidades,
  members,
}: {
  serie: Serie;
  unidades: Unidades;
  members: Members;
}) {
  const last = serie[serie.length - 1];
  const totalRecaudo = serie.reduce((s, p) => s + p.sumaPagado, 0);
  const recaudoPct = last && last.total > 0 ? Math.round((last.pagadas / last.total) * 100) : 0;

  const ocupadas = unidades.filter((u) => u.estado === "ocupada").length;
  const desocupadas = unidades.length - ocupadas;
  const ocupacionPct = unidades.length > 0 ? Math.round((ocupadas / unidades.length) * 100) : 0;

  // Distribución por tipo de unidad
  const tipoMap = new Map<string, number>();
  for (const u of unidades) tipoMap.set(u.tipo, (tipoMap.get(u.tipo) ?? 0) + 1);
  const tipoColors = [CHART.primary, CHART.brand, CHART.violet, CHART.sky];
  const tipoData = [...tipoMap.entries()].map(([tipo, value], i) => ({
    label: tipo.charAt(0).toUpperCase() + tipo.slice(1),
    value,
    color: tipoColors[i % tipoColors.length]!,
  }));

  // Residentes por rol
  const rolMap = new Map<string, number>();
  for (const m of members) for (const r of m.roles) rolMap.set(r, (rolMap.get(r) ?? 0) + 1);
  const rolData = [...rolMap.entries()].map(([r, value]) => ({
    label: ROLE_LABEL[r] ?? r,
    value,
  }));

  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={Wallet}
          label="Cartera actual"
          value={last ? cop(last.sumaTotalAPagar) : "—"}
          hint={last ? periodoCorto(last.periodo) : undefined}
          tone="brand"
        />
        <StatCard
          icon={TrendingUp}
          label="Recaudo acumulado"
          value={cop(totalRecaudo)}
          hint={`${recaudoPct}% del período`}
          tone="success"
        />
        <StatCard
          icon={Building2}
          label="Ocupación"
          value={`${ocupacionPct}%`}
          hint={`${ocupadas} de ${unidades.length} unidades`}
        />
        <StatCard
          icon={Users}
          label="Comunidad"
          value={num(members.length)}
          hint="Residentes registrados"
        />
      </div>

      {/* Tendencia de cartera */}
      <Card>
        <CardHeader>
          <CardTitle>Cartera por período</CardTitle>
          <CardDescription>Total facturado en cada mes</CardDescription>
        </CardHeader>
        <CardContent>
          {serie.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sin períodos facturados.</p>
          ) : (
            <AreaChart
              data={serie.map((p) => ({ label: periodoCorto(p.periodo), value: p.sumaTotalAPagar }))}
              color={CHART.brand}
              format={cop}
            />
          )}
        </CardContent>
      </Card>

      {/* Distribuciones */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Estado de facturas</CardTitle>
            <CardDescription>{last ? periodoCorto(last.periodo) : "Último período"}</CardDescription>
          </CardHeader>
          <CardContent>
            {last ? (
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
              <p className="py-8 text-center text-sm text-muted-foreground">Sin datos.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ocupación</CardTitle>
            <CardDescription>Estado de las unidades</CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart
              centerValue={`${ocupacionPct}%`}
              centerLabel="ocupadas"
              data={[
                { label: "Ocupadas", value: ocupadas, color: CHART.emerald },
                { label: "Desocupadas", value: desocupadas, color: CHART.slate },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tipo de unidad</CardTitle>
            <CardDescription>Distribución del inventario</CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart centerValue={unidades.length} centerLabel="unidades" data={tipoData} />
          </CardContent>
        </Card>
      </div>

      {/* Residentes por rol */}
      <Card>
        <CardHeader>
          <CardTitle>Residentes por rol</CardTitle>
          <CardDescription>Composición de la comunidad</CardDescription>
        </CardHeader>
        <CardContent>
          {rolData.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Sin roles asignados.</p>
          ) : (
            <HBars data={rolData} color={CHART.primary} />
          )}
        </CardContent>
      </Card>
    </>
  );
}

function ReportesSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-2xl" />
        ))}
      </div>
    </>
  );
}
