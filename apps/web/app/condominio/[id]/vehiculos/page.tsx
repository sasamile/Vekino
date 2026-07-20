"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { Car, Bike, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/layout/stat-card";
import { SearchInput, Input, Select, Textarea } from "@/components/ui/input";
import { TableCard, Table, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Tipo = "carro" | "moto" | "bicicleta" | "otro";

const TIPO_LABEL: Record<Tipo, string> = {
  carro: "Carro", moto: "Moto", bicicleta: "Bicicleta", otro: "Otro",
};
const TIPO_TONE: Record<Tipo, React.ComponentProps<typeof Badge>["tone"]> = {
  carro: "primary", moto: "brand", bicicleta: "success", otro: "neutral",
};

type VehicleRow = NonNullable<ReturnType<typeof useQuery<typeof api.vehiculos.listByCondominio>>>[number];

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
  return { unidadId: "", placa: "", tipo: "carro", marca: "", color: "", observaciones: "" };
}

export default function VehiculosPage() {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;
  const vehiculos = useQuery(api.vehiculos.listByCondominio, { condominioId });
  const unidades = useQuery(api.unidades.listByCondominio, { condominioId });

  const [search, setSearch] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<"" | Tipo>("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Id<"vehiculos"> | null>(null);

  const term = search.trim().toLowerCase();
  const filtered = (vehiculos ?? []).filter((v) => {
    if (tipoFiltro && v.tipo !== tipoFiltro) return false;
    if (!term) return true;
    return (
      v.placa.toLowerCase().includes(term) ||
      (v.marca ?? "").toLowerCase().includes(term) ||
      (v.color ?? "").toLowerCase().includes(term) ||
      v.unidadNumero.toLowerCase().includes(term)
    );
  });

  const total = vehiculos?.length ?? 0;
  const carros = vehiculos?.filter((v) => v.tipo === "carro").length ?? 0;
  const motos = vehiculos?.filter((v) => v.tipo === "moto").length ?? 0;
  const bicis = vehiculos?.filter((v) => v.tipo === "bicicleta").length ?? 0;

  function openNew() { setDraft(emptyDraft()); }
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
        <PageHeader
          title="Vehículos"
          description="Registro vehicular del conjunto"
          action={
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" aria-hidden />
              Registrar vehículo
            </Button>
          }
        />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard icon={Car} label="Total vehículos" value={total} tone="neutral" />
          <StatCard icon={Car} label="Carros" value={carros} tone="primary" />
          <StatCard icon={Bike} label="Motos" value={motos} tone="brand" />
          <StatCard icon={Bike} label="Bicicletas" value={bicis} tone="success" />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {vehiculos === undefined ? "Cargando…" : `${filtered.length} vehículo${filtered.length === 1 ? "" : "s"}`}
          </p>
          <div className="flex gap-2">
            <Select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value as "" | Tipo)} className="w-36">
              <option value="">Todos</option>
              <option value="carro">Carro</option>
              <option value="moto">Moto</option>
              <option value="bicicleta">Bicicleta</option>
              <option value="otro">Otro</option>
            </Select>
            <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Placa, marca, unidad…" className="sm:w-64" />
          </div>
        </div>

        {vehiculos === undefined ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Car}
            title={search || tipoFiltro ? "Sin resultados" : "Sin vehículos registrados"}
            description={search || tipoFiltro ? "Ningún vehículo coincide con el filtro." : "Registra los vehículos de los residentes."}
            action={
              search || tipoFiltro ? (
                <Button variant="outline" size="sm" onClick={() => { setSearch(""); setTipoFiltro(""); }}>Limpiar</Button>
              ) : (
                <Button size="sm" onClick={openNew}><Plus className="h-4 w-4" />Registrar</Button>
              )
            }
          />
        ) : (
          <TableCard>
            <Table>
              <THead>
                <TR>
                  <TH>Placa</TH>
                  <TH>Tipo</TH>
                  <TH>Marca / Color</TH>
                  <TH>Unidad</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((v) => (
                  <TR key={v._id}>
                    <TD>
                      <span className="font-mono text-sm font-semibold tracking-wider">{v.placa}</span>
                    </TD>
                    <TD>
                      <Badge tone={TIPO_TONE[v.tipo as Tipo] ?? "neutral"}>{TIPO_LABEL[v.tipo as Tipo]}</Badge>
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2 text-sm">
                        {v.color && (
                          <span
                            className="h-3 w-3 rounded-full border border-border"
                            style={{ background: v.color }}
                            title={v.color}
                          />
                        )}
                        <span className="text-foreground">{v.marca ?? "—"}</span>
                        {v.color && <span className="text-muted-foreground">· {v.color}</span>}
                      </div>
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

  const valid = form.unidadId.length > 0 && form.placa.trim().length > 0;

  function set<K extends keyof Draft>(key: K, val: Draft[K]) {
    setForm((p) => ({ ...p, [key]: val }));
  }

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      if (editing && draft.id) {
        await update({
          id: draft.id,
          unidadId: form.unidadId as Id<"unidades">,
          placa: form.placa,
          tipo: form.tipo,
          marca: form.marca || undefined,
          color: form.color || undefined,
          observaciones: form.observaciones || undefined,
        });
      } else {
        await create({
          condominioId,
          unidadId: form.unidadId as Id<"unidades">,
          placa: form.placa,
          tipo: form.tipo,
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

  const unidadesOrdenadas = [...unidades].sort((a, b) => a.numero.localeCompare(b.numero, "es", { numeric: true }));

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Editar vehículo" : "Registrar vehículo"}
      description="Datos del vehículo del residente"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button size="sm" onClick={save} disabled={!valid || busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? "Guardar cambios" : "Registrar"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Unidad</label>
          <Select value={form.unidadId} onChange={(e) => set("unidadId", e.target.value)}>
            <option value="">Seleccionar unidad</option>
            {unidadesOrdenadas.map((u) => (
              <option key={u._id} value={u._id}>Unidad {u.numero}</option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Placa</label>
            <Input
              value={form.placa}
              onChange={(e) => set("placa", e.target.value.toUpperCase())}
              placeholder="ABC-123"
              maxLength={10}
              className="font-mono tracking-wider"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Tipo</label>
            <Select value={form.tipo} onChange={(e) => set("tipo", e.target.value as Tipo)}>
              <option value="carro">Carro</option>
              <option value="moto">Moto</option>
              <option value="bicicleta">Bicicleta</option>
              <option value="otro">Otro</option>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Marca / Referencia</label>
            <Input value={form.marca} onChange={(e) => set("marca", e.target.value)} placeholder="Ej. Toyota Corolla" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Color</label>
            <Input value={form.color} onChange={(e) => set("color", e.target.value)} placeholder="Ej. Blanco" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Observaciones</label>
          <Textarea value={form.observaciones} onChange={(e) => set("observaciones", e.target.value)} placeholder="Información adicional…" rows={2} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  );
}

function DeleteDialog({ id, onClose }: { id: Id<"vehiculos">; onClose: () => void }) {
  const remove = useMutation(api.vehiculos.remove);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try { await remove({ id }); onClose(); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title="Eliminar vehículo" className="max-w-sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="destructive" size="sm" onClick={confirm} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}Eliminar
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">El vehículo se eliminará del registro del conjunto.</p>
    </Modal>
  );
}
