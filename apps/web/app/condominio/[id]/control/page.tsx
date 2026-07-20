"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import {
  ClipboardList, Plus, Trash2, Loader2,
  UserCheck, Package, AlertTriangle, Wrench, FileText,
} from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/layout/stat-card";
import { Select, Input, Textarea } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type Tipo = "visita" | "paquete" | "incidente" | "mantenimiento" | "otro";
type Turno = "mañana" | "tarde" | "noche";

const TIPO_META: Record<Tipo, { label: string; icon: LucideIcon; tone: React.ComponentProps<typeof Badge>["tone"]; dot: string }> = {
  visita:        { label: "Visita",        icon: UserCheck,      tone: "info",        dot: "bg-blue-400 border-blue-200 text-blue-600 dark:text-blue-400" },
  paquete:       { label: "Paquetería",    icon: Package,        tone: "neutral",     dot: "bg-slate-400 border-slate-200 text-slate-600 dark:text-slate-400" },
  incidente:     { label: "Incidente",     icon: AlertTriangle,  tone: "destructive", dot: "bg-red-400 border-red-200 text-red-600 dark:text-red-400" },
  mantenimiento: { label: "Mantenimiento", icon: Wrench,         tone: "warning",     dot: "bg-amber-400 border-amber-200 text-amber-600 dark:text-amber-400" },
  otro:          { label: "Otro",          icon: FileText,       tone: "neutral",     dot: "bg-slate-300 border-slate-100 text-slate-500 dark:text-slate-400" },
};

function fmtFechaCorta(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `Hoy ${time}`;
  if (isYesterday) return `Ayer ${time}`;
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" }) + " " + time;
}

export default function ControlPage() {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;
  const novedades = useQuery(api.novedades.listByCondominio, { condominioId });

  const [tipoFiltro, setTipoFiltro] = useState<"" | Tipo>("");
  const [turnoFiltro, setTurnoFiltro] = useState<"" | Turno>("");
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Id<"novedades"> | null>(null);

  const filtered = (novedades ?? []).filter((n) => {
    if (tipoFiltro && n.tipo !== tipoFiltro) return false;
    if (turnoFiltro && n.turno !== turnoFiltro) return false;
    return true;
  });

  const total = novedades?.length ?? 0;
  const incidentes = novedades?.filter((n) => n.tipo === "incidente").length ?? 0;
  const visitas = novedades?.filter((n) => n.tipo === "visita").length ?? 0;
  const paquetes = novedades?.filter((n) => n.tipo === "paquete").length ?? 0;

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          title="Control"
          description="Minuta de novedades y bitácora del conjunto"
          action={
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Nueva novedad
            </Button>
          }
        />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard icon={ClipboardList} label="Total novedades" value={total} tone="neutral" />
          <StatCard icon={AlertTriangle} label="Incidentes" value={incidentes} tone="destructive" />
          <StatCard icon={UserCheck} label="Visitas" value={visitas} tone="primary" />
          <StatCard icon={Package} label="Paquetería" value={paquetes} tone="brand" />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {novedades === undefined ? "Cargando…" : `${filtered.length} novedad${filtered.length === 1 ? "" : "es"}`}
          </p>
          <div className="flex gap-2">
            <Select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value as "" | Tipo)} className="w-40">
              <option value="">Todos los tipos</option>
              {(Object.keys(TIPO_META) as Tipo[]).map((t) => (
                <option key={t} value={t}>{TIPO_META[t].label}</option>
              ))}
            </Select>
            <Select value={turnoFiltro} onChange={(e) => setTurnoFiltro(e.target.value as "" | Turno)} className="w-36">
              <option value="">Todos los turnos</option>
              <option value="mañana">Mañana</option>
              <option value="tarde">Tarde</option>
              <option value="noche">Noche</option>
            </Select>
          </div>
        </div>

        {novedades === undefined ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={tipoFiltro || turnoFiltro ? "Sin resultados" : "Minuta vacía"}
            description={tipoFiltro || turnoFiltro ? "Ninguna novedad coincide con los filtros." : "Registra la primera novedad del turno."}
            action={
              tipoFiltro || turnoFiltro ? (
                <Button variant="outline" size="sm" onClick={() => { setTipoFiltro(""); setTurnoFiltro(""); }}>
                  Limpiar filtros
                </Button>
              ) : (
                <Button size="sm" onClick={() => setFormOpen(true)}>
                  <Plus className="h-4 w-4" />Nueva novedad
                </Button>
              )
            }
          />
        ) : (
          <div className="relative">
            <div className="absolute left-5 top-3 bottom-3 w-px bg-border" aria-hidden />
            <div className="space-y-3 pl-14">
              {filtered.map((n) => {
                const meta = TIPO_META[n.tipo as Tipo] ?? TIPO_META.otro;
                const Icon = meta.icon;
                return (
                  <div key={n._id} className="relative">
                    <div className={cn(
                      "absolute -left-9 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background shadow-sm",
                      meta.dot,
                    )}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <Card className="group p-4 transition-colors hover:border-border/60">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="mb-1.5 flex flex-wrap items-center gap-2">
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                            <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground capitalize">
                              Turno {n.turno}
                            </span>
                            {n.unidadNumero && (
                              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                                Unidad {n.unidadNumero}
                              </span>
                            )}
                          </div>
                          <p className="whitespace-pre-line text-sm text-foreground">{n.descripcion}</p>
                          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span>{n.autorNombre}</span>
                            <span>·</span>
                            <span>{fmtFechaCorta(n.createdAt)}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => setDeleteTarget(n._id)}
                          aria-label="Eliminar novedad"
                          className="shrink-0 rounded-lg p-1.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {formOpen && <NovedadForm condominioId={condominioId} onClose={() => setFormOpen(false)} />}
      {deleteTarget && <DeleteDialog id={deleteTarget} onClose={() => setDeleteTarget(null)} />}
    </PageContainer>
  );
}

function NovedadForm({ condominioId, onClose }: { condominioId: Id<"condominios">; onClose: () => void }) {
  const create = useMutation(api.novedades.create);
  const [tipo, setTipo] = useState<Tipo>("visita");
  const [turno, setTurno] = useState<Turno>("mañana");
  const [unidadNumero, setUnidadNumero] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = descripcion.trim().length > 0;

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await create({ condominioId, tipo, turno, descripcion, unidadNumero: unidadNumero || undefined });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Registrar novedad"
      description="Entrada en la bitácora del turno actual"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button size="sm" onClick={save} disabled={!valid || busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Registrar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Tipo</label>
            <Select value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}>
              {(Object.keys(TIPO_META) as Tipo[]).map((t) => (
                <option key={t} value={t}>{TIPO_META[t].label}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Turno</label>
            <Select value={turno} onChange={(e) => setTurno(e.target.value as Turno)}>
              <option value="mañana">Mañana (6am–2pm)</option>
              <option value="tarde">Tarde (2pm–10pm)</option>
              <option value="noche">Noche (10pm–6am)</option>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">
            Unidad relacionada <span className="text-muted-foreground">(opcional)</span>
          </label>
          <Input
            value={unidadNumero}
            onChange={(e) => setUnidadNumero(e.target.value)}
            placeholder="Ej. 401"
            maxLength={10}
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Descripción</label>
          <Textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Detalle de la novedad…"
            rows={4}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  );
}

function DeleteDialog({ id, onClose }: { id: Id<"novedades">; onClose: () => void }) {
  const remove = useMutation(api.novedades.remove);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try { await remove({ id }); onClose(); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title="Eliminar novedad" className="max-w-sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="destructive" size="sm" onClick={confirm} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}Eliminar
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">La novedad se eliminará permanentemente de la minuta.</p>
    </Modal>
  );
}
