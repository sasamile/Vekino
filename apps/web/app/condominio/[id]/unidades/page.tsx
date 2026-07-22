"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { usePaginatedQuery, useMutation } from "convex/react";
import { Building2, Loader2, Pencil, Trash2 } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { useNuevoQuery } from "@/hooks/use-nuevo-query";
import { SearchInput, Input, Select } from "@/components/ui/input";
import {
  TableCard,
  Table,
  THead,
  TH,
  TBody,
  TR,
  TD,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_SIZE = 30;

const TIPOS = [
  "apartamento",
  "casa",
  "local",
  "parqueadero",
  "deposito",
  "oficina",
  "otro",
] as const;
type TipoUnidad = (typeof TIPOS)[number];

const ESTADOS = ["ocupada", "desocupada", "en_mora", "inactiva"] as const;
type EstadoUnidad = (typeof ESTADOS)[number];

const TIPO_LABEL: Record<TipoUnidad, string> = {
  apartamento: "Apartamento",
  casa: "Casa",
  local: "Local",
  parqueadero: "Parqueadero",
  deposito: "Depósito",
  oficina: "Oficina",
  otro: "Otro",
};

const ESTADO_LABEL: Record<EstadoUnidad, string> = {
  ocupada: "Ocupada",
  desocupada: "Desocupada",
  en_mora: "En mora",
  inactiva: "Inactiva",
};

const ESTADO_TONE: Record<
  EstadoUnidad,
  React.ComponentProps<typeof Badge>["tone"]
> = {
  ocupada: "success",
  desocupada: "neutral",
  en_mora: "warning",
  inactiva: "neutral",
};

type UnidadRow = {
  _id: Id<"unidades">;
  numero: string;
  torre: string | null;
  bloque: string | null;
  tipo: string;
  estado: string;
  coeficiente: number | null;
  residentes: { name: string | null; email: string | null; vinculo: string }[];
};

interface Draft {
  id?: Id<"unidades">;
  numero: string;
  torre: string;
  bloque: string;
  tipo: TipoUnidad;
  estado: EstadoUnidad;
  coeficiente: string;
}

function emptyDraft(): Draft {
  return {
    numero: "",
    torre: "",
    bloque: "",
    tipo: "apartamento",
    estado: "desocupada",
    coeficiente: "",
  };
}

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
  const createUnidad = useMutation(api.unidades.create);
  const updateUnidad = useMutation(api.unidades.update);
  const removeUnidad = useMutation(api.unidades.remove);

  const [search, setSearch] = useState("");
  const deferredQ = useDebounced(search, 280);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<UnidadRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  useNuevoQuery(() => setDraft(emptyDraft()));

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

  function openEdit(u: UnidadRow) {
    setError(null);
    setDraft({
      id: u._id,
      numero: u.numero,
      torre: u.torre ?? "",
      bloque: u.bloque ?? "",
      tipo: (TIPOS.includes(u.tipo as TipoUnidad)
        ? u.tipo
        : "apartamento") as TipoUnidad,
      estado: (ESTADOS.includes(u.estado as EstadoUnidad)
        ? u.estado
        : "desocupada") as EstadoUnidad,
      coeficiente: u.coeficiente != null ? String(u.coeficiente) : "",
    });
  }

  async function saveDraft() {
    if (!draft) return;
    setError(null);
    const numero = draft.numero.trim();
    if (!numero) {
      setError("El número de unidad es obligatorio.");
      return;
    }
    let coeficiente: number | undefined;
    if (draft.coeficiente.trim()) {
      const n = Number(draft.coeficiente.replace(",", "."));
      if (Number.isNaN(n) || n < 0) {
        setError("Coeficiente inválido.");
        return;
      }
      coeficiente = n;
    }

    setBusy(true);
    try {
      if (draft.id) {
        await updateUnidad({
          unidadId: draft.id,
          numero,
          torre: draft.torre,
          bloque: draft.bloque,
          tipo: draft.tipo,
          estado: draft.estado,
          coeficiente,
        });
      } else {
        await createUnidad({
          condominioId,
          numero,
          torre: draft.torre.trim() || undefined,
          bloque: draft.bloque.trim() || undefined,
          tipo: draft.tipo,
          estado: draft.estado,
          coeficiente,
        });
      }
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      await removeUnidad({ unidadId: removing._id });
      setRemoving(null);
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : "No se pudo eliminar.");
    } finally {
      setRemoveBusy(false);
    }
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <PageHeader
            title="Unidades"
            description="Inmuebles del condominio y sus ocupantes"
          />
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSearch("")}
                >
                  Limpiar búsqueda
                </Button>
              ) : (
                <Button size="sm" onClick={() => setDraft(emptyDraft())}>
                  Nueva unidad
                </Button>
              )
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
                    <TH className="text-right">Acciones</TH>
                  </tr>
                </THead>
                <TBody>
                  {results.map((u) => {
                    const row = u as UnidadRow;
                    const nombres = row.residentes
                      .map((r) => r.name)
                      .filter(Boolean) as string[];
                    const label = [row.torre, row.bloque, row.numero]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <TR key={row._id}>
                        <TD className="font-medium text-foreground">{label}</TD>
                        <TD className="text-muted-foreground">
                          {TIPO_LABEL[row.tipo as TipoUnidad] ?? row.tipo}
                        </TD>
                        <TD className="text-right tabular-nums text-muted-foreground">
                          {row.coeficiente != null
                            ? fmtCoef(row.coeficiente)
                            : "—"}
                        </TD>
                        <TD>
                          <Badge
                            tone={
                              ESTADO_TONE[row.estado as EstadoUnidad] ??
                              "neutral"
                            }
                          >
                            {ESTADO_LABEL[row.estado as EstadoUnidad] ??
                              row.estado}
                          </Badge>
                        </TD>
                        <TD className="text-muted-foreground">
                          {nombres.length === 0 ? (
                            <span className="text-muted-foreground/60">—</span>
                          ) : (
                            <span className="line-clamp-1">
                              {nombres.join(", ")}
                            </span>
                          )}
                        </TD>
                        <TD className="text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(row)}
                              aria-label="Editar unidad"
                              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRemoveError(null);
                                setRemoving(row);
                              }}
                              aria-label="Eliminar unidad"
                              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
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

      {draft && (
        <Modal
          open
          onClose={() => !busy && setDraft(null)}
          title={draft.id ? "Editar unidad" : "Nueva unidad"}
          description="Número, tipo, coeficiente y estado"
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => setDraft(null)}
                disabled={busy}
              >
                Cancelar
              </Button>
              <Button onClick={saveDraft} disabled={busy}>
                {busy && (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                )}
                {draft.id ? "Guardar" : "Crear unidad"}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Número
              </label>
              <Input
                value={draft.numero}
                onChange={(e) => setDraft({ ...draft, numero: e.target.value })}
                placeholder="Ej. 101"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Torre
              </label>
              <Input
                value={draft.torre}
                onChange={(e) => setDraft({ ...draft, torre: e.target.value })}
                placeholder="Opcional"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Bloque
              </label>
              <Input
                value={draft.bloque}
                onChange={(e) => setDraft({ ...draft, bloque: e.target.value })}
                placeholder="Opcional"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Tipo
              </label>
              <Select
                value={draft.tipo}
                onChange={(e) =>
                  setDraft({ ...draft, tipo: e.target.value as TipoUnidad })
                }
              >
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {TIPO_LABEL[t]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Estado
              </label>
              <Select
                value={draft.estado}
                onChange={(e) =>
                  setDraft({ ...draft, estado: e.target.value as EstadoUnidad })
                }
              >
                {ESTADOS.map((s) => (
                  <option key={s} value={s}>
                    {ESTADO_LABEL[s]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Coeficiente (%)
              </label>
              <Input
                value={draft.coeficiente}
                onChange={(e) =>
                  setDraft({ ...draft, coeficiente: e.target.value })
                }
                placeholder="Ej. 2.5"
                inputMode="decimal"
              />
            </div>
          </div>
          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        </Modal>
      )}

      {removing && (
        <Modal
          open
          onClose={() => !removeBusy && setRemoving(null)}
          title="Eliminar unidad"
          description={`¿Eliminar la unidad ${[removing.torre, removing.numero].filter(Boolean).join(" ")}? Se quitarán los vínculos con residentes.`}
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => setRemoving(null)}
                disabled={removeBusy}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={confirmRemove}
                disabled={removeBusy}
              >
                {removeBusy && (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                )}
                Eliminar
              </Button>
            </>
          }
        >
          {removeError ? (
            <p className="text-sm text-red-600">{removeError}</p>
          ) : null}
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
