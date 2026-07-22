"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { usePaginatedQuery, useQuery, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Car,
  Bike,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CircleDot,
  type LucideIcon,
} from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { useNuevoQuery } from "@/hooks/use-nuevo-query";
import { StatCard } from "@/components/layout/stat-card";
import { SearchInput, Input, Select, Textarea } from "@/components/ui/input";
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

type Tipo = "carro" | "moto" | "bicicleta" | "otro";

const TIPO_META: Record<
  Tipo,
  {
    label: string;
    tone: React.ComponentProps<typeof Badge>["tone"];
    icon: LucideIcon;
  }
> = {
  carro: { label: "Carro", tone: "primary", icon: Car },
  moto: { label: "Moto", tone: "brand", icon: Bike },
  bicicleta: { label: "Bicicleta", tone: "success", icon: CircleDot },
  otro: { label: "Otro", tone: "neutral", icon: Car },
};

/** Carro: …123 · Moto: …12A (última letra). */
function inferTipoFromPlaca(placa: string): "carro" | "moto" | null {
  const clean = placa.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length < 2) return null;
  const last = clean[clean.length - 1]!;
  if (/[A-Z]/.test(last)) return "moto";
  if (/\d{3}$/.test(clean)) return "carro";
  if (/\d$/.test(last)) return "carro";
  return null;
}

type VehicleRow = FunctionReturnType<
  typeof api.vehiculos.listPage
>["page"][number];

interface Draft {
  id?: Id<"vehiculos">;
  unidadId: string;
  placa: string;
  tipo: Tipo;
  marca: string;
  color: string;
  observaciones: string;
}

function emptyDraft(): Draft {
  return {
    unidadId: "",
    placa: "",
    tipo: "carro",
    marca: "",
    color: "",
    observaciones: "",
  };
}

function useDebounced(value: string, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function TipoBadge({ tipo }: { tipo: string }) {
  const meta = TIPO_META[tipo as Tipo] ?? TIPO_META.otro;
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone} className="inline-flex items-center gap-1.5">
      <Icon className="h-3 w-3" aria-hidden />
      {meta.label}
    </Badge>
  );
}

export default function VehiculosPage() {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;
  const unidades = useQuery(api.unidades.listByCondominio, { condominioId });
  const counts = useQuery(api.vehiculos.countsByCondominio, { condominioId });
  const reclassify = useMutation(api.vehiculos.reclassifyByPlaca);

  const [search, setSearch] = useState("");
  const deferredSearch = useDebounced(search, 280);
  const [tipoFiltro, setTipoFiltro] = useState<"" | Tipo>("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Id<"vehiculos"> | null>(
    null,
  );

  // Corrige tipos guardados mal (una vez por condo / sesión).
  useEffect(() => {
    const key = `vekino.vehiculos.reclassified.${condominioId}`;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(key)) return;
    void reclassify({ condominioId })
      .then(() => sessionStorage.setItem(key, "1"))
      .catch(() => {});
  }, [condominioId, reclassify]);

  const { results, status, loadMore } = usePaginatedQuery(
    api.vehiculos.listPage,
    {
      condominioId,
      q: deferredSearch.trim() || undefined,
      tipo: tipoFiltro || undefined,
    },
    { initialNumItems: PAGE_SIZE },
  );

  const hasFilters = Boolean(deferredSearch.trim() || tipoFiltro);
  const loading = status === "LoadingFirstPage";
  const canLoadMore = status === "CanLoadMore";
  const loadingMore = status === "LoadingMore";

  function openNew() {
    setDraft(emptyDraft());
  }
  useNuevoQuery(openNew);

  function openEdit(v: VehicleRow) {
    setDraft({
      id: v._id,
      unidadId: v.unidadId,
      placa: v.placa,
      tipo: v.tipo as Tipo,
      marca: v.marca ?? "",
      color: v.color ?? "",
      observaciones: v.observaciones ?? "",
    });
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <PageHeader
            title="Vehículos"
            description="Registro vehicular del conjunto"
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2">
              <Select
                value={tipoFiltro}
                onChange={(e) => setTipoFiltro(e.target.value as "" | Tipo)}
                className="w-36"
              >
                <option value="">Todos</option>
                <option value="carro">Carro</option>
                <option value="moto">Moto</option>
                <option value="bicicleta">Bicicleta</option>
                <option value="otro">Otro</option>
              </Select>
              <SearchInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Placa, dueño, unidad…"
                className="sm:w-64"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            icon={Car}
            label="Total vehículos"
            value={counts?.total ?? 0}
            tone="neutral"
          />
          <StatCard
            icon={Car}
            label="Carros"
            value={counts?.carro ?? 0}
            tone="primary"
          />
          <StatCard
            icon={Bike}
            label="Motos"
            value={counts?.moto ?? 0}
            tone="brand"
          />
          <StatCard
            icon={CircleDot}
            label="Bicicletas"
            value={counts?.bicicleta ?? 0}
            tone="success"
          />
        </div>

        {loading ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : results.length === 0 ? (
          <EmptyState
            icon={Car}
            title={hasFilters ? "Sin resultados" : "Sin vehículos registrados"}
            description={
              hasFilters
                ? "Ningún vehículo coincide con el filtro."
                : "Registra los vehículos de los residentes."
            }
            action={
              hasFilters ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setTipoFiltro("");
                  }}
                >
                  Limpiar
                </Button>
              ) : (
                <Button size="sm" onClick={openNew}>
                  <Plus className="h-4 w-4" />
                  Registrar
                </Button>
              )
            }
          />
        ) : (
          <>
            <TableCard>
              <Table>
                <THead>
                  <TR>
                    <TH>Placa</TH>
                    <TH>Tipo</TH>
                    <TH>Dueño</TH>
                    <TH>Unidad</TH>
                    <TH></TH>
                  </TR>
                </THead>
                <TBody>
                  {results.map((v) => (
                    <TR key={v._id}>
                      <TD>
                        <span className="font-mono text-sm font-semibold tracking-wider">
                          {v.placa}
                        </span>
                      </TD>
                      <TD>
                        <TipoBadge tipo={v.tipo} />
                      </TD>
                      <TD>
                        <span className="text-sm text-foreground">
                          {v.duenoNombre ?? "—"}
                        </span>
                      </TD>
                      <TD>
                        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                          {v.unidadNumero}
                        </span>
                      </TD>
                      <TD>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(v)}
                            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            aria-label="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(v._id)}
                            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                            aria-label="Eliminar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
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

      {draft !== null && (
        <VehicleForm
          condominioId={condominioId}
          draft={draft}
          unidades={unidades ?? []}
          onClose={() => setDraft(null)}
        />
      )}

      {deleteTarget && (
        <DeleteDialog id={deleteTarget} onClose={() => setDeleteTarget(null)} />
      )}
    </PageContainer>
  );
}

function VehicleForm({
  condominioId,
  draft,
  unidades,
  onClose,
}: {
  condominioId: Id<"condominios">;
  draft: Draft;
  unidades: { _id: Id<"unidades">; numero: string }[];
  onClose: () => void;
}) {
  const create = useMutation(api.vehiculos.create);
  const update = useMutation(api.vehiculos.update);
  const editing = Boolean(draft.id);

  const [form, setForm] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tipoManual, setTipoManual] = useState(
    draft.tipo === "bicicleta" || draft.tipo === "otro",
  );

  const valid = form.unidadId.length > 0 && form.placa.trim().length > 0;
  const inferred = inferTipoFromPlaca(form.placa);

  function set<K extends keyof Draft>(key: K, val: Draft[K]) {
    setForm((p) => {
      const next = { ...p, [key]: val };
      if (key === "placa" && !tipoManual) {
        const inferredTipo = inferTipoFromPlaca(String(val));
        if (inferredTipo) next.tipo = inferredTipo;
      }
      return next;
    });
  }

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const tipo = tipoManual
        ? form.tipo
        : (inferTipoFromPlaca(form.placa) ?? form.tipo);
      if (editing && draft.id) {
        await update({
          id: draft.id,
          unidadId: form.unidadId as Id<"unidades">,
          placa: form.placa,
          tipo,
          marca: form.marca || undefined,
          color: form.color || undefined,
          observaciones: form.observaciones || undefined,
        });
      } else {
        await create({
          condominioId,
          unidadId: form.unidadId as Id<"unidades">,
          placa: form.placa,
          tipo,
          marca: form.marca || undefined,
          color: form.color || undefined,
          observaciones: form.observaciones || undefined,
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar.");
      setBusy(false);
    }
  }

  const unidadesOrdenadas = [...unidades].sort((a, b) =>
    a.numero.localeCompare(b.numero, "es", { numeric: true }),
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Editar vehículo" : "Registrar vehículo"}
      description="La placa define si es carro (…123) o moto (…12A)"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button size="sm" onClick={save} disabled={!valid || busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? "Guardar cambios" : "Registrar"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">
            Unidad
          </label>
          <Select
            value={form.unidadId}
            onChange={(e) => set("unidadId", e.target.value)}
          >
            <option value="">Seleccionar unidad</option>
            {unidadesOrdenadas.map((u) => (
              <option key={u._id} value={u._id}>
                Unidad {u.numero}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">
              Placa
            </label>
            <Input
              value={form.placa}
              onChange={(e) => set("placa", e.target.value.toUpperCase())}
              placeholder="ABC123 o ABC12D"
              className="font-mono uppercase tracking-wider"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">
              Tipo
            </label>
            <Select
              value={form.tipo}
              onChange={(e) => {
                const t = e.target.value as Tipo;
                setTipoManual(
                  t === "bicicleta" ||
                    t === "otro" ||
                    (inferred != null && t !== inferred),
                );
                set("tipo", t);
              }}
            >
              <option value="carro">Carro</option>
              <option value="moto">Moto</option>
              <option value="bicicleta">Bicicleta</option>
              <option value="otro">Otro</option>
            </Select>
            {inferred && !tipoManual ? (
              <p className="text-[11px] text-muted-foreground">
                Detectado por placa: {TIPO_META[inferred].label}
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">
              Marca
            </label>
            <Input
              value={form.marca}
              onChange={(e) => set("marca", e.target.value)}
              placeholder="Opcional"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">
              Color
            </label>
            <Input
              value={form.color}
              onChange={(e) => set("color", e.target.value)}
              placeholder="Opcional"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">
            Observaciones
          </label>
          <Textarea
            value={form.observaciones}
            onChange={(e) => set("observaciones", e.target.value)}
            placeholder="Opcional"
            rows={2}
          />
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </Modal>
  );
}

function DeleteDialog({
  id,
  onClose,
}: {
  id: Id<"vehiculos">;
  onClose: () => void;
}) {
  const remove = useMutation(api.vehiculos.remove);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await remove({ id });
      onClose();
    } catch {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title="Eliminar vehículo"
      description="¿Quitar este vehículo del registro?"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={confirm}
            disabled={busy}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Eliminar
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        Esta acción no se puede deshacer.
      </p>
    </Modal>
  );
}
