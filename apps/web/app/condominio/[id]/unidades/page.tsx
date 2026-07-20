"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { usePaginatedQuery } from "convex/react";
import { Building2, Loader2 } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { SearchInput } from "@/components/ui/input";
import { TableCard, Table, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_SIZE = 30;

/** Coeficiente de copropiedad como porcentaje (es-CO). */
function fmtCoef(n: number) {
  return `${n.toLocaleString("es-CO", { maximumFractionDigits: 4 })}%`;
}

function useDebounced(value: string, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function UnidadesPage() {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;
  const [search, setSearch] = useState("");
  const deferredQ = useDebounced(search, 280);

  const { results, status, loadMore } = usePaginatedQuery(
    api.unidades.listPage,
    {
      condominioId,
      q: deferredQ.trim() || undefined,
    },
    { initialNumItems: PAGE_SIZE },
  );

  const term = deferredQ.trim();
  const loading = status === "LoadingFirstPage";
  const canLoadMore = status === "CanLoadMore";
  const loadingMore = status === "LoadingMore";

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          title="Unidades"
          description="Inmuebles del condominio y sus ocupantes"
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Cargando…"
              : `${results.length}${status !== "Exhausted" && !term ? "+" : ""} unidades`}
          </p>
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar unidad o residente"
            className="sm:w-72"
          />
        </div>

        {loading ? (
          <TableSkeleton />
        ) : results.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={term ? "Sin resultados" : "Sin unidades"}
            description={
              term
                ? "Ninguna unidad coincide con la búsqueda."
                : "Aún no hay inmuebles registrados en este condominio."
            }
            action={
              term ? (
                <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                  Limpiar búsqueda
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
                    <TH>Unidad</TH>
                    <TH>Tipo</TH>
                    <TH className="text-right">Coeficiente</TH>
                    <TH>Estado</TH>
                    <TH>Residentes</TH>
                  </tr>
                </THead>
                <TBody>
                  {results.map((u) => {
                    const nombres = u.residentes
                      .map((r) => r.name)
                      .filter(Boolean) as string[];
                    return (
                      <TR key={u._id}>
                        <TD className="font-medium text-foreground">
                          {[u.torre, u.numero].filter(Boolean).join(" ")}
                        </TD>
                        <TD className="capitalize text-muted-foreground">{u.tipo}</TD>
                        <TD className="text-right tabular-nums text-muted-foreground">
                          {u.coeficiente != null ? fmtCoef(u.coeficiente) : "—"}
                        </TD>
                        <TD>
                          <Badge tone={u.estado === "ocupada" ? "success" : "neutral"}>
                            <span className="capitalize">{u.estado}</span>
                          </Badge>
                        </TD>
                        <TD className="text-muted-foreground">
                          {nombres.length === 0 ? (
                            <span className="text-muted-foreground/60">—</span>
                          ) : (
                            <span className="line-clamp-1">{nombres.join(", ")}</span>
                          )}
                        </TD>
                      </TR>
                    );
                  })}
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
    </PageContainer>
  );
}

function TableSkeleton() {
  return (
    <TableCard>
      <div className="divide-y divide-border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="ml-auto h-4 w-48" />
          </div>
        ))}
      </div>
    </TableCard>
  );
}
