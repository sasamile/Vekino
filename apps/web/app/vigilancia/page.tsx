"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Building2, ShieldCheck, Users, ArrowUpRight } from "lucide-react";
import { api } from "@vekino/backend/api";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

function fmt(ms: number | null): string {
  if (ms == null) return "indefinida";
  return new Date(ms).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Panel del supervisor: sus conjuntos y, dentro de cada uno, sus guardas.
 *
 * Todo lo que se ve aquí sale de UNA consulta —`asignaciones.miEquipo`— que
 * ya resuelve el alcance en el servidor: los conjuntos donde tiene asignación
 * vigente con rol supervisor, y en cada uno solo el personal de su propia
 * compañía que cubre hoy. La pantalla no filtra nada; si filtrara, el filtro
 * sería la seguridad y viviría en el cliente.
 */
export default function VigilanciaHome() {
  const equipo = useQuery(api.asignaciones.miEquipo);

  const totalGuardas = (equipo ?? []).reduce(
    (n, c) => n + c.guardas.length,
    0,
  );

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          title="Mis conjuntos"
          description={
            equipo === undefined
              ? "Cargando tu operación…"
              : `${equipo.length} conjunto${equipo.length === 1 ? "" : "s"} a tu cargo · ${totalGuardas} guarda${totalGuardas === 1 ? "" : "s"}`
          }
        />

        {equipo === undefined ? (
          <div className="space-y-3">
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
          </div>
        ) : equipo.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Todavía no supervisas ningún conjunto"
            description="Cuando la compañía te asigne a un conjunto aparecerá aquí con su personal. Si crees que ya deberías tener uno, pídeselo al administrador de tu compañía."
          />
        ) : (
          <div className="space-y-4">
            {equipo.map((c) => (
              <Card key={c.asignacionId} className="overflow-hidden p-0">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
                      <Building2 className="h-4.5 w-4.5" aria-hidden />
                    </span>
                    <div>
                      <p className="text-[14.5px] font-medium text-foreground">
                        {c.condominioNombre}
                      </p>
                      <p className="text-[11.5px] text-muted-foreground">
                        {c.companiaNombre} · vigencia hasta{" "}
                        {fmt(c.vigenciaHasta)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="info">
                      <Users className="h-3 w-3" aria-hidden />
                      {c.guardas.length} guarda
                      {c.guardas.length === 1 ? "" : "s"}
                    </Badge>
                    {/* Al panel de supervisión del conjunto, NO a la app de
                        portería: `/guardia/:id` es donde el guarda opera su
                        turno y sigue siendo suya. El supervisor mira desde su
                        propio lado. */}
                    <Link
                      href={`/vigilancia/${c.condominioId}`}
                      className="inline-flex items-center gap-1 text-[12.5px] text-brand hover:underline"
                    >
                      Supervisar
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </div>
                </div>

                {c.guardas.length === 0 ? (
                  <p className="px-5 py-6 text-center text-[13px] text-muted-foreground">
                    Sin guardas asignados a este conjunto todavía.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="px-5 py-2.5 font-medium">Guarda</th>
                        <th className="px-5 py-2.5 font-medium">Contacto</th>
                        <th className="px-5 py-2.5 font-medium">Desde</th>
                        <th className="px-5 py-2.5 font-medium">Hasta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {c.guardas.map((g) => (
                        <tr key={g.asignacionId}>
                          <td className="px-5 py-3 text-foreground">
                            {g.nombre}
                          </td>
                          <td className="px-5 py-3 text-muted-foreground">
                            {g.telefono ?? g.email}
                          </td>
                          <td className="px-5 py-3 text-muted-foreground">
                            {fmt(g.vigenciaDesde)}
                          </td>
                          <td className="px-5 py-3 text-muted-foreground">
                            {fmt(g.vigenciaHasta)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
