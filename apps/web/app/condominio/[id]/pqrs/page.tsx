"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { usePaginatedQuery, useQuery, useMutation } from "convex/react";
import {
  MessageSquareWarning, Plus, Trash2, Loader2, Send,
  FileQuestion, Frown, AlertOctagon, Lightbulb, Heart, Clock,
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

const PAGE_SIZE = 30;

type Tipo = "peticion" | "queja" | "reclamo" | "sugerencia" | "felicitacion";
type Estado = "abierto" | "en_gestion" | "resuelto" | "cerrado";
type Prioridad = "baja" | "media" | "alta";

const TIPO_META: Record<Tipo, { label: string; icon: LucideIcon; tone: React.ComponentProps<typeof Badge>["tone"] }> = {
  peticion:     { label: "Petición",     icon: FileQuestion,  tone: "info" },
  queja:        { label: "Queja",        icon: Frown,         tone: "warning" },
  reclamo:      { label: "Reclamo",      icon: AlertOctagon,  tone: "destructive" },
  sugerencia:   { label: "Sugerencia",   icon: Lightbulb,     tone: "primary" },
  felicitacion: { label: "Felicitación", icon: Heart,         tone: "success" },
};

const ESTADO_META: Record<Estado, { label: string; tone: React.ComponentProps<typeof Badge>["tone"] }> = {
  abierto:    { label: "Abierto",     tone: "info" },
  en_gestion: { label: "En gestión",  tone: "warning" },
  resuelto:   { label: "Resuelto",    tone: "success" },
  cerrado:    { label: "Cerrado",     tone: "neutral" },
};

const PRIORIDAD_META: Record<Prioridad, { label: string; tone: React.ComponentProps<typeof Badge>["tone"] }> = {
  baja:  { label: "Baja",  tone: "neutral" },
  media: { label: "Media", tone: "info" },
  alta:  { label: "Alta",  tone: "destructive" },
};

const ESTADO_ORDER: Estado[] = ["abierto", "en_gestion", "resuelto", "cerrado"];

type PqrsRow = {
  _id: Id<"pqrs">;
  radicado: string;
  tipo: Tipo;
  asunto: string;
  descripcion: string;
  solicitanteNombre: string;
  unidadNumero?: string;
  estado: Estado;
  prioridad: Prioridad;
  respuesta?: string;
  respondidoPor?: string;
  createdAt: number;
  updatedAt: number;
  mensajes?: { autorNombre: string; esAdmin: boolean; texto: string; createdAt: number }[];
};

function fmtFechaCorta(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `Hoy ${time}`;
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" }) + " " + time;
}

export default function PqrsPage() {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;

  const [estadoFiltro, setEstadoFiltro] = useState<"" | Estado>("");
  const [tipoFiltro, setTipoFiltro] = useState<"" | Tipo>("");
  const [formOpen, setFormOpen] = useState(false);
  const [detalleId, setDetalleId] = useState<Id<"pqrs"> | null>(null);

  const counts = useQuery(api.pqrs.countsByCondominio, { condominioId });
  const { results, status, loadMore } = usePaginatedQuery(
    api.pqrs.listPage,
    {
      condominioId,
      estado: estadoFiltro || undefined,
      tipo: tipoFiltro || undefined,
    },
    { initialNumItems: PAGE_SIZE },
  );
  const selected = useQuery(api.pqrs.get, detalleId ? { id: detalleId } : "skip");

  const loading = status === "LoadingFirstPage";
  const canLoadMore = status === "CanLoadMore";
  const loadingMore = status === "LoadingMore";
  const items = results as PqrsRow[];
  const hasFilters = Boolean(estadoFiltro || tipoFiltro);

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          title="PQRS"
          description="Peticiones, quejas, reclamos y sugerencias de la comunidad"
          action={
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Radicar PQRS
            </Button>
          }
        />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard icon={MessageSquareWarning} label="Total" value={counts?.total ?? 0} tone="neutral" />
          <StatCard icon={Clock} label="Abiertos" value={counts?.abierto ?? 0} tone="primary" />
          <StatCard icon={Loader2} label="En gestión" value={counts?.en_gestion ?? 0} tone="warning" />
          <StatCard icon={Heart} label="Resueltos" value={counts?.resuelto ?? 0} tone="success" />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {loading ? "Cargando…" : `${items.length} registro${items.length === 1 ? "" : "s"}`}
          </p>
          <div className="flex gap-2">
            <Select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value as "" | Tipo)} className="w-40">
              <option value="">Todos los tipos</option>
              {(Object.keys(TIPO_META) as Tipo[]).map((t) => (
                <option key={t} value={t}>{TIPO_META[t].label}</option>
              ))}
            </Select>
            <Select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value as "" | Estado)} className="w-36">
              <option value="">Todos los estados</option>
              {ESTADO_ORDER.map((e) => (
                <option key={e} value={e}>{ESTADO_META[e].label}</option>
              ))}
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={MessageSquareWarning}
            title={hasFilters ? "Sin resultados" : "Sin PQRS"}
            description={hasFilters ? "Ningún registro coincide con los filtros." : "Radica la primera petición, queja, reclamo o sugerencia."}
            action={
              hasFilters ? (
                <Button variant="outline" size="sm" onClick={() => { setEstadoFiltro(""); setTipoFiltro(""); }}>Limpiar filtros</Button>
              ) : (
                <Button size="sm" onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" />Radicar PQRS</Button>
              )
            }
          />
        ) : (
          <>
            <div className="space-y-2.5">
              {items.map((p) => {
                const tipoMeta = TIPO_META[p.tipo as Tipo] ?? TIPO_META.peticion;
                const Icon = tipoMeta.icon;
                return (
                  <Card
                    key={p._id}
                    className="group cursor-pointer p-4 transition-colors hover:border-border/60"
                    onClick={() => setDetalleId(p._id)}
                  >
                    <div className="flex items-start gap-3">
                      <span className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                        tipoMeta.tone === "destructive" && "bg-red-500/10 text-red-600 dark:text-red-400",
                        tipoMeta.tone === "warning" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                        tipoMeta.tone === "info" && "bg-sky-500/10 text-sky-600 dark:text-sky-400",
                        tipoMeta.tone === "primary" && "bg-primary/10 text-primary",
                        tipoMeta.tone === "success" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                      )}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{p.radicado}</span>
                          <Badge tone={ESTADO_META[p.estado as Estado].tone}>{ESTADO_META[p.estado as Estado].label}</Badge>
                          {p.prioridad === "alta" && <Badge tone="destructive">Prioridad alta</Badge>}
                        </div>
                        <p className="truncate text-sm font-medium text-foreground">{p.asunto}</p>
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{p.descripcion}</p>
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span>{p.solicitanteNombre}</span>
                          {p.unidadNumero && <><span>·</span><span>Unidad {p.unidadNumero}</span></>}
                          <span>·</span>
                          <span>{fmtFechaCorta(p.createdAt)}</span>
                        </div>
                      </div>
                      {(p.mensajes?.some((m) => m.esAdmin) || p.respuesta) && (
                        <Badge tone="success" className="shrink-0"><Send className="h-3 w-3" />Respondido</Badge>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
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

      {formOpen && <PqrsForm condominioId={condominioId} onClose={() => setFormOpen(false)} />}
      {detalleId && selected && (
        <PqrsDetalle p={selected as PqrsRow} onClose={() => setDetalleId(null)} />
      )}
      {detalleId && selected === undefined && (
        <Modal open onClose={() => setDetalleId(null)} title="Cargando…" className="max-w-sm">
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </Modal>
      )}
      {detalleId && selected === null && (
        <Modal open onClose={() => setDetalleId(null)} title="No encontrado" className="max-w-sm"
          footer={<Button variant="ghost" size="sm" onClick={() => setDetalleId(null)}>Cerrar</Button>}
        >
          <p className="text-sm text-muted-foreground">Este PQRS ya no existe.</p>
        </Modal>
      )}
    </PageContainer>
  );
}

function PqrsForm({ condominioId, onClose }: { condominioId: Id<"condominios">; onClose: () => void }) {
  const create = useMutation(api.pqrs.create);
  const [tipo, setTipo] = useState<Tipo>("peticion");
  const [prioridad, setPrioridad] = useState<Prioridad>("media");
  const [asunto, setAsunto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [unidadNumero, setUnidadNumero] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = asunto.trim().length > 0 && descripcion.trim().length > 0;

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await create({ condominioId, tipo, prioridad, asunto, descripcion, unidadNumero: unidadNumero || undefined });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al radicar.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Radicar PQRS"
      description="Se generará un número de radicado automático"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button size="sm" onClick={save} disabled={!valid || busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}Radicar
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
            <label className="block text-xs font-medium text-foreground">Prioridad</label>
            <Select value={prioridad} onChange={(e) => setPrioridad(e.target.value as Prioridad)}>
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Asunto</label>
          <Input value={asunto} onChange={(e) => setAsunto(e.target.value)} placeholder="Resumen breve" />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Descripción</label>
          <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={4} placeholder="Detalle completo de la solicitud…" />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Unidad <span className="text-muted-foreground">(opcional)</span></label>
          <Input value={unidadNumero} onChange={(e) => setUnidadNumero(e.target.value)} placeholder="Ej. 401" maxLength={10} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  );
}

function PqrsDetalle({
  p,
  onClose,
}: {
  p: PqrsRow;
  onClose: () => void;
}) {
  const setEstado = useMutation(api.pqrs.setEstado);
  const setPrioridad = useMutation(api.pqrs.setPrioridad);
  const responder = useMutation(api.pqrs.responder);
  const remove = useMutation(api.pqrs.remove);
  const [respuesta, setRespuesta] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const tipoMeta = TIPO_META[p.tipo];
  const Icon = tipoMeta.icon;

  const hilo =
    p.mensajes && p.mensajes.length > 0
      ? p.mensajes
      : p.respuesta
        ? [{ autorNombre: p.respondidoPor ?? "Administración", esAdmin: true, texto: p.respuesta, createdAt: p.updatedAt }]
        : [];

  async function enviarRespuesta() {
    if (!respuesta.trim()) return;
    setBusy(true);
    try {
      await responder({ id: p._id, respuesta });
      setRespuesta("");
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    setBusy(true);
    try { await remove({ id: p._id }); onClose(); } finally { setBusy(false); }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-brand" />
          <span className="font-mono text-sm">{p.radicado}</span>
        </span>
      }
      className="max-w-xl"
      footer={
        confirmDelete ? (
          <>
            <span className="mr-auto text-sm text-muted-foreground">¿Eliminar definitivamente?</span>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} disabled={busy}>No</Button>
            <Button variant="destructive" size="sm" onClick={doDelete} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}Sí, eliminar
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} className="mr-auto text-red-600 hover:text-red-700">
              <Trash2 className="h-4 w-4" />Eliminar
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone={tipoMeta.tone}>{tipoMeta.label}</Badge>
            <Badge tone={PRIORIDAD_META[p.prioridad].tone}>Prioridad {PRIORIDAD_META[p.prioridad].label.toLowerCase()}</Badge>
          </div>
          <h3 className="text-base font-semibold text-foreground">{p.asunto}</h3>
          <p className="mt-1.5 whitespace-pre-line text-sm text-muted-foreground">{p.descripcion}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {p.solicitanteNombre}{p.unidadNumero ? ` · Unidad ${p.unidadNumero}` : ""} · {fmtFechaCorta(p.createdAt)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-muted/30 p-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Estado</label>
            <Select value={p.estado} onChange={(e) => setEstado({ id: p._id, estado: e.target.value as Estado })}>
              {ESTADO_ORDER.map((e) => <option key={e} value={e}>{ESTADO_META[e].label}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Prioridad</label>
            <Select value={p.prioridad} onChange={(e) => setPrioridad({ id: p._id, prioridad: e.target.value as Prioridad })}>
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-foreground">Conversación</label>
          {hilo.length > 0 ? (
            <div className="space-y-2">
              {hilo.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-lg border p-2.5",
                    m.esAdmin
                      ? "border-emerald-500/20 bg-emerald-500/5"
                      : "border-border bg-muted/30",
                  )}
                >
                  <p className="whitespace-pre-line text-sm text-foreground">{m.texto}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {m.esAdmin ? "Administración" : "Residente"} ·{" "}
                    <span className="font-medium text-foreground">{m.autorNombre}</span> ·{" "}
                    {fmtFechaCorta(m.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg bg-muted/30 p-2.5 text-xs text-muted-foreground">
              Aún no hay respuestas. Escribe la primera.
            </p>
          )}

          <Textarea
            value={respuesta}
            onChange={(e) => setRespuesta(e.target.value)}
            rows={3}
            placeholder="Escribe una respuesta…"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={enviarRespuesta} disabled={busy || !respuesta.trim()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}<Send className="h-4 w-4" />Enviar respuesta
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
