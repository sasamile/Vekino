"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import {
  Gavel, Plus, Trash2, Loader2, X, Calendar, MapPin, Users, Vote,
  Play, CheckCircle2, XCircle, Clock, BarChart3, Lock, Unlock, Settings2,
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

type Tipo = "ordinaria" | "extraordinaria";
type Modalidad = "presencial" | "virtual" | "mixta";
type Estado = "programada" | "en_curso" | "finalizada" | "cancelada";

const ESTADO_META: Record<Estado, { label: string; tone: React.ComponentProps<typeof Badge>["tone"] }> = {
  programada:  { label: "Programada", tone: "info" },
  en_curso:    { label: "En curso",   tone: "warning" },
  finalizada:  { label: "Finalizada", tone: "success" },
  cancelada:   { label: "Cancelada",  tone: "destructive" },
};

const MODALIDAD_LABEL: Record<Modalidad, string> = {
  presencial: "Presencial", virtual: "Virtual", mixta: "Mixta",
};

function fmtFecha(s: string) {
  const parts = s.split("-");
  const y = Number(parts[0] ?? 2026);
  const m = Number(parts[1] ?? 1);
  const d = Number(parts[2] ?? 1);
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}

export default function AsambleaPage() {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;
  const asambleas = useQuery(api.asambleas.listByCondominio, { condominioId });

  const [formOpen, setFormOpen] = useState(false);
  const [votacionesFor, setVotacionesFor] = useState<{ id: Id<"asambleas">; titulo: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Id<"asambleas"> | null>(null);

  const total = asambleas?.length ?? 0;
  const programadas = asambleas?.filter((a) => a.estado === "programada").length ?? 0;
  const enCurso = asambleas?.filter((a) => a.estado === "en_curso").length ?? 0;
  const finalizadas = asambleas?.filter((a) => a.estado === "finalizada").length ?? 0;

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          title="Asamblea"
          description="Convocatorias, quórum y votaciones de propietarios"
          action={
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Nueva asamblea
            </Button>
          }
        />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard icon={Gavel} label="Total" value={total} tone="neutral" />
          <StatCard icon={Clock} label="Programadas" value={programadas} tone="primary" />
          <StatCard icon={Play} label="En curso" value={enCurso} tone="warning" />
          <StatCard icon={CheckCircle2} label="Finalizadas" value={finalizadas} tone="success" />
        </div>

        {asambleas === undefined ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
          </div>
        ) : asambleas.length === 0 ? (
          <EmptyState
            icon={Gavel}
            title="Sin asambleas"
            description="Convoca la primera asamblea de propietarios del conjunto."
            action={<Button size="sm" onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" />Nueva asamblea</Button>}
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {asambleas.map((a) => (
              <AsambleaCard
                key={a._id}
                a={a}
                condominioId={condominioId}
                onVotaciones={() => setVotacionesFor({ id: a._id, titulo: a.titulo })}
                onDelete={() => setDeleteTarget(a._id)}
              />
            ))}
          </div>
        )}
      </div>

      {formOpen && <AsambleaForm condominioId={condominioId} onClose={() => setFormOpen(false)} />}
      {votacionesFor && (
        <VotacionesModal asambleaId={votacionesFor.id} titulo={votacionesFor.titulo} onClose={() => setVotacionesFor(null)} />
      )}
      {deleteTarget && <DeleteDialog id={deleteTarget} onClose={() => setDeleteTarget(null)} />}
    </PageContainer>
  );
}

function AsambleaCard({
  a,
  condominioId,
  onVotaciones,
  onDelete,
}: {
  a: {
    _id: Id<"asambleas">;
    titulo: string; tipo: Tipo; modalidad: Modalidad; estado: Estado;
    fecha: string; hora: string; lugar?: string;
    quorumRequerido?: number; quorumAlcanzado?: number;
    agenda: string[]; descripcion?: string; votacionesCount: number;
  };
  condominioId: Id<"condominios">;
  onVotaciones: () => void;
  onDelete: () => void;
}) {
  const setEstado = useMutation(api.asambleas.setEstado);
  const meta = ESTADO_META[a.estado];
  const quorumOk = a.quorumRequerido != null && a.quorumAlcanzado != null && a.quorumAlcanzado >= a.quorumRequerido;

  return (
    <Card className="group flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <Badge tone={meta.tone}>{meta.label}</Badge>
            <Badge tone={a.tipo === "extraordinaria" ? "violet" : "neutral"}>
              {a.tipo === "extraordinaria" ? "Extraordinaria" : "Ordinaria"}
            </Badge>
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {MODALIDAD_LABEL[a.modalidad]}
            </span>
          </div>
          <h3 className="truncate text-base font-semibold text-foreground">{a.titulo}</h3>
        </div>
        <button
          onClick={onDelete}
          aria-label="Eliminar asamblea"
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          <span className="capitalize">{fmtFecha(a.fecha)} · {a.hora}</span>
        </div>
        {a.lugar && (
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{a.lugar}</span>
          </div>
        )}
        {a.quorumRequerido != null && (
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span>
              Quórum: requerido {a.quorumRequerido}%
              {a.quorumAlcanzado != null && (
                <span className={cn("ml-1 font-medium", quorumOk ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                  · alcanzado {a.quorumAlcanzado}%
                </span>
              )}
            </span>
          </div>
        )}
      </div>

      {a.agenda.length > 0 && (
        <div className="mt-3 rounded-xl bg-muted/50 p-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Orden del día</p>
          <ol className="space-y-1 text-sm text-foreground">
            {a.agenda.map((item, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-muted-foreground">{i + 1}.</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {a.descripcion && <p className="mt-3 text-sm text-muted-foreground">{a.descripcion}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button asChild size="sm">
          <Link href={`/condominio/${condominioId}/asamblea/${a._id}`}>
            <Settings2 className="h-4 w-4" />
            Gestionar
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={onVotaciones}>
          <Vote className="h-4 w-4" />
          Votaciones {a.votacionesCount > 0 && <span className="ml-0.5 rounded-full bg-brand/15 px-1.5 text-xs text-brand">{a.votacionesCount}</span>}
        </Button>
        {a.estado === "programada" && (
          <Button variant="ghost" size="sm" onClick={() => setEstado({ id: a._id, estado: "en_curso" })}>
            <Play className="h-4 w-4" />Iniciar
          </Button>
        )}
        {a.estado === "en_curso" && (
          <Button variant="ghost" size="sm" onClick={() => setEstado({ id: a._id, estado: "finalizada" })}>
            <CheckCircle2 className="h-4 w-4" />Finalizar
          </Button>
        )}
        {(a.estado === "programada" || a.estado === "en_curso") && (
          <Button variant="ghost" size="sm" onClick={() => setEstado({ id: a._id, estado: "cancelada" })}>
            <XCircle className="h-4 w-4" />Cancelar
          </Button>
        )}
      </div>
    </Card>
  );
}

function AsambleaForm({ condominioId, onClose }: { condominioId: Id<"condominios">; onClose: () => void }) {
  const create = useMutation(api.asambleas.create);
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<Tipo>("ordinaria");
  const [modalidad, setModalidad] = useState<Modalidad>("presencial");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("18:00");
  const [lugar, setLugar] = useState("");
  const [quorum, setQuorum] = useState("51");
  const [descripcion, setDescripcion] = useState("");
  const [agenda, setAgenda] = useState<string[]>([""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = titulo.trim().length > 0 && fecha.length > 0;

  function setAgendaItem(i: number, val: string) {
    setAgenda((prev) => prev.map((a, idx) => (idx === i ? val : a)));
  }
  function addAgendaItem() { setAgenda((prev) => [...prev, ""]); }
  function removeAgendaItem(i: number) { setAgenda((prev) => prev.filter((_, idx) => idx !== i)); }

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await create({
        condominioId,
        titulo,
        tipo,
        modalidad,
        fecha,
        hora,
        lugar: lugar || undefined,
        quorumRequerido: quorum ? Number(quorum) : undefined,
        agenda: agenda.filter((a) => a.trim().length > 0),
        descripcion: descripcion || undefined,
      });
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
      title="Convocar asamblea"
      description="Programa una nueva asamblea de propietarios"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button size="sm" onClick={save} disabled={!valid || busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}Convocar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Título</label>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Asamblea ordinaria 2026" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Tipo</label>
            <Select value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}>
              <option value="ordinaria">Ordinaria</option>
              <option value="extraordinaria">Extraordinaria</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Modalidad</label>
            <Select value={modalidad} onChange={(e) => setModalidad(e.target.value as Modalidad)}>
              <option value="presencial">Presencial</option>
              <option value="virtual">Virtual</option>
              <option value="mixta">Mixta</option>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Fecha</label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Hora</label>
            <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Lugar <span className="text-muted-foreground">(opcional)</span></label>
            <Input value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="Salón social / enlace" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Quórum %</label>
            <Input type="number" min={0} max={100} value={quorum} onChange={(e) => setQuorum(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-foreground">Orden del día</label>
            <button onClick={addAgendaItem} className="text-xs font-medium text-brand hover:underline">+ Agregar punto</button>
          </div>
          <div className="space-y-2">
            {agenda.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 text-center text-xs text-muted-foreground">{i + 1}.</span>
                <Input value={item} onChange={(e) => setAgendaItem(i, e.target.value)} placeholder={`Punto ${i + 1}`} className="flex-1" />
                {agenda.length > 1 && (
                  <button onClick={() => removeAgendaItem(i)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Descripción <span className="text-muted-foreground">(opcional)</span></label>
          <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} placeholder="Notas de la convocatoria…" />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  );
}

function VotacionesModal({ asambleaId, titulo, onClose }: { asambleaId: Id<"asambleas">; titulo: string; onClose: () => void }) {
  const votaciones = useQuery(api.asambleas.listVotaciones, { asambleaId });
  const createVotacion = useMutation(api.asambleas.createVotacion);
  const setVotos = useMutation(api.asambleas.setVotos);
  const toggleVotacion = useMutation(api.asambleas.toggleVotacion);
  const removeVotacion = useMutation(api.asambleas.removeVotacion);

  const [pregunta, setPregunta] = useState("");
  const [opciones, setOpciones] = useState<string[]>(["A favor", "En contra", "Abstención"]);
  const [busy, setBusy] = useState(false);

  async function addVotacion() {
    if (!pregunta.trim()) return;
    setBusy(true);
    try {
      await createVotacion({ asambleaId, pregunta, opciones: opciones.filter((o) => o.trim()) });
      setPregunta("");
      setOpciones(["A favor", "En contra", "Abstención"]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Votaciones" description={titulo} className="max-w-2xl">
      <div className="space-y-5">
        {/* Nueva votación */}
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nueva votación</p>
          <div className="space-y-2">
            <Input value={pregunta} onChange={(e) => setPregunta(e.target.value)} placeholder="¿Se aprueba el presupuesto 2026?" />
            <div className="flex flex-wrap gap-2">
              {opciones.map((o, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-xs">
                  {o}
                  <button onClick={() => setOpciones((prev) => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-red-600">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <AddOpcion onAdd={(val) => setOpciones((prev) => [...prev, val])} />
            </div>
            <Button size="sm" onClick={addVotacion} disabled={busy || !pregunta.trim()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}<Plus className="h-4 w-4" />Crear votación
            </Button>
          </div>
        </div>

        {/* Lista de votaciones */}
        {votaciones === undefined ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : votaciones.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Aún no hay votaciones registradas.</p>
        ) : (
          <div className="space-y-3">
            {votaciones.map((vt) => (
              <VotacionCard
                key={vt._id}
                vt={vt}
                onSetVotos={(opciones) => setVotos({ id: vt._id, opciones })}
                onToggle={() => toggleVotacion({ id: vt._id })}
                onRemove={() => removeVotacion({ id: vt._id })}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function AddOpcion({ onAdd }: { onAdd: (val: string) => void }) {
  const [val, setVal] = useState("");
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">
        + Opción
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && val.trim()) { onAdd(val.trim()); setVal(""); setOpen(false); } }}
        placeholder="Opción"
        className="h-7 w-28 text-xs"
      />
      <button onClick={() => { if (val.trim()) onAdd(val.trim()); setVal(""); setOpen(false); }} className="text-brand"><CheckCircle2 className="h-4 w-4" /></button>
    </span>
  );
}

function VotacionCard({
  vt,
  onSetVotos,
  onToggle,
  onRemove,
}: {
  vt: {
    _id: Id<"votaciones">;
    pregunta: string;
    opciones: { texto: string; votos: number }[];
    estado: "abierta" | "cerrada";
  };
  onSetVotos: (opciones: { texto: string; votos: number }[]) => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const totalVotos = vt.opciones.reduce((s, o) => s + o.votos, 0);

  function updateVoto(i: number, delta: number) {
    const next = vt.opciones.map((o, idx) => (idx === i ? { ...o, votos: Math.max(0, o.votos + delta) } : o));
    onSetVotos(next);
  }
  function setVoto(i: number, val: number) {
    const next = vt.opciones.map((o, idx) => (idx === i ? { ...o, votos: Math.max(0, val) } : o));
    onSetVotos(next);
  }

  const winner = totalVotos > 0 ? Math.max(...vt.opciones.map((o) => o.votos)) : -1;

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-brand" />
          <p className="text-sm font-medium text-foreground">{vt.pregunta}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Badge tone={vt.estado === "abierta" ? "warning" : "success"}>{vt.estado === "abierta" ? "Abierta" : "Cerrada"}</Badge>
          <button onClick={onToggle} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent" aria-label="Abrir/cerrar votación">
            {vt.estado === "abierta" ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
          </button>
          <button onClick={onRemove} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600" aria-label="Eliminar votación">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-2.5">
        {vt.opciones.map((o, i) => {
          const pct = totalVotos > 0 ? Math.round((o.votos / totalVotos) * 100) : 0;
          const isWinner = totalVotos > 0 && o.votos === winner;
          return (
            <div key={i}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className={cn("font-medium", isWinner ? "text-foreground" : "text-muted-foreground")}>{o.texto}</span>
                <div className="flex items-center gap-1.5">
                  <span className="tabular-nums text-xs text-muted-foreground">{pct}%</span>
                  {vt.estado === "abierta" && (
                    <>
                      <button onClick={() => updateVoto(i, -1)} className="flex h-5 w-5 items-center justify-center rounded border border-border text-muted-foreground hover:bg-accent">−</button>
                      <Input
                        type="number"
                        min={0}
                        value={o.votos}
                        onChange={(e) => setVoto(i, Number(e.target.value))}
                        className="h-6 w-14 text-center text-xs tabular-nums"
                      />
                      <button onClick={() => updateVoto(i, 1)} className="flex h-5 w-5 items-center justify-center rounded border border-border text-muted-foreground hover:bg-accent">+</button>
                    </>
                  )}
                  {vt.estado === "cerrada" && <span className="w-14 text-right text-xs font-semibold tabular-nums text-foreground">{o.votos} votos</span>}
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full transition-all", isWinner ? "bg-brand" : "bg-muted-foreground/40")} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2.5 text-right text-xs text-muted-foreground">Total: {totalVotos} voto{totalVotos === 1 ? "" : "s"}</p>
    </div>
  );
}

function DeleteDialog({ id, onClose }: { id: Id<"asambleas">; onClose: () => void }) {
  const remove = useMutation(api.asambleas.remove);
  const [busy, setBusy] = useState(false);
  async function confirm() {
    setBusy(true);
    try { await remove({ id }); onClose(); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title="Eliminar asamblea" className="max-w-sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="destructive" size="sm" onClick={confirm} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}Eliminar
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">La asamblea y todas sus votaciones se eliminarán permanentemente.</p>
    </Modal>
  );
}
