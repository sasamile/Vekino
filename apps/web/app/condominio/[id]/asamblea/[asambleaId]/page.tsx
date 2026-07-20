"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import {
  ArrowLeft, Calendar, MapPin, Users, Loader2, Check, Play, CheckCircle2,
  XCircle, Vote, ListOrdered, Scale, Save, Plus, Trash2, ChevronUp, ChevronDown,
  Lock, Unlock, BarChart3, LayoutDashboard, Table2, TrendingUp, UserPlus,
  UserSquare, QrCode, Mail, Search, Download, Wifi, WifiOff,
} from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type Estado = "programada" | "en_curso" | "finalizada" | "cancelada";
const ESTADO_META: Record<Estado, { label: string; tone: React.ComponentProps<typeof Badge>["tone"] }> = {
  programada: { label: "Programada", tone: "info" },
  en_curso: { label: "En curso", tone: "warning" },
  finalizada: { label: "Finalizada", tone: "success" },
  cancelada: { label: "Cancelada", tone: "destructive" },
};

function fmtFecha(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return s;
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function fmtHora(ts: number | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

const TABS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "orden", label: "Orden del día", icon: ListOrdered },
  { key: "votacion", label: "Votación en vivo", icon: Vote },
  { key: "tabla", label: "Tabla", icon: Table2 },
  { key: "resultados", label: "Resultados", icon: TrendingUp },
  { key: "poderes", label: "Poderes", icon: UserPlus },
  { key: "representantes", label: "Representantes", icon: UserSquare },
  { key: "qr", label: "Registrar asistencia", icon: QrCode },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function AsambleaAdmin() {
  const params = useParams<{ id: string; asambleaId: string }>();
  const condominioId = params.id as Id<"condominios">;
  const asambleaId = params.asambleaId as Id<"asambleas">;
  const a = useQuery(api.asambleas.get, { id: asambleaId });
  const setEstado = useMutation(api.asambleas.setEstado);
  const [tab, setTab] = useState<TabKey>("dashboard");

  if (a === undefined) {
    return <PageContainer><div className="flex justify-center py-24"><Spinner className="h-5 w-5" /></div></PageContainer>;
  }
  if (a === null) {
    return <PageContainer><p className="py-24 text-center text-sm text-muted-foreground">Asamblea no encontrada.</p></PageContainer>;
  }
  const meta = ESTADO_META[a.estado as Estado];

  return (
    <PageContainer className="space-y-5">
      <Link href={`/condominio/${condominioId}/asamblea`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a asambleas
      </Link>

      {/* Cabecera */}
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone={meta.tone}>{meta.label}</Badge>
              <Badge tone={a.tipo === "extraordinaria" ? "violet" : "neutral"}>{a.tipo === "extraordinaria" ? "Extraordinaria" : "Ordinaria"}</Badge>
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">{a.modalidad}</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{a.titulo}</h1>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <p className="flex items-center gap-2 capitalize"><Calendar className="h-4 w-4" /> {fmtFecha(a.fecha)} · {a.hora}</p>
              {a.lugar && <p className="flex items-center gap-2"><MapPin className="h-4 w-4" /> {a.lugar}</p>}
              <p className="flex items-center gap-2"><Users className="h-4 w-4" /> Quórum requerido {a.quorumRequerido ?? 51}%</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {a.estado === "programada" && <Button size="sm" onClick={() => setEstado({ id: a._id, estado: "en_curso" })}><Play className="h-4 w-4" /> Iniciar asamblea</Button>}
            {a.estado === "en_curso" && <Button size="sm" onClick={() => setEstado({ id: a._id, estado: "finalizada" })}><CheckCircle2 className="h-4 w-4" /> Finalizar</Button>}
            {(a.estado === "programada" || a.estado === "en_curso") && <Button variant="outline" size="sm" onClick={() => setEstado({ id: a._id, estado: "cancelada" })}><XCircle className="h-4 w-4" /> Cancelar</Button>}
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div className="overflow-x-auto">
        <nav className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={cn("flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
                <Icon className="h-4 w-4" /> {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {tab === "dashboard" && <DashboardTab asambleaId={asambleaId} estado={a.estado} />}
      {tab === "orden" && <OrdenDelDia asambleaId={asambleaId} puntos={a.ordenDia ?? a.agenda.map((t) => ({ titulo: t }))} />}
      {tab === "votacion" && <VotacionTab asambleaId={asambleaId} agenda={a.agenda} />}
      {tab === "tabla" && <TablaTab asambleaId={asambleaId} tituloAsamblea={a.titulo} />}
      {tab === "resultados" && <ResultadosTab asambleaId={asambleaId} />}
      {tab === "poderes" && <PoderesTab asambleaId={asambleaId} />}
      {tab === "representantes" && <RepresentantesTab asambleaId={asambleaId} />}
      {tab === "qr" && <RegistrarTab asambleaId={asambleaId} condominioId={condominioId} />}
    </PageContainer>
  );
}

/* ───────── Dashboard: quórum + asistentes ───────── */
function DashboardTab({ asambleaId, estado }: { asambleaId: Id<"asambleas">; estado: string }) {
  const q = useQuery(api.asambleas.quorum, { asambleaId });
  const det = useQuery(api.asambleas.asistentesDetallado, { asambleaId });
  const setEstado = useMutation(api.asambleas.setEstado);
  const quitar = useMutation(api.asambleas.quitarAsistencia);

  if (q === undefined || q === null) return <Card className="p-8"><Spinner className="mx-auto h-5 w-5" /></Card>;
  const req = q.quorumRequerido;
  const ok = q.pct >= req;

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground"><Scale className="h-5 w-5 text-brand" /> Quórum en tiempo real
            {estado === "en_curso" && <span className="h-2 w-2 rounded-full bg-emerald-500" />}</h2>
          {estado === "en_curso" && (
            <Button variant="destructive" size="sm" onClick={() => { if (confirm("¿Cerrar la asamblea? Se cerrarán las votaciones.")) setEstado({ id: asambleaId, estado: "finalizada" }); }}>
              <Lock className="h-4 w-4" /> Cerrar asamblea
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat value={`${q.pct.toFixed(2)}%`} label="Coeficiente presente" tone={ok ? "text-emerald-600" : "text-brand"} />
          <Stat value={String(q.unidadesPresentes)} label="Unidades presentes" tone="text-sky-600" />
          <Stat value={String(q.poderesActivos ?? 0)} label="Poderes activos" tone="text-emerald-600" />
          <Stat value={String(q.totalUnidades)} label="Total unidades" tone="text-foreground" />
        </div>
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progreso de quórum</span>
            <span className="font-medium tabular-nums text-foreground">{q.pct.toFixed(2)}% / {req}% requerido</span>
          </div>
          <div className="relative h-3 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full transition-all", ok ? "bg-emerald-500" : "bg-brand")} style={{ width: `${Math.min(100, q.pct)}%` }} />
            <div className="absolute inset-y-0 w-0.5 bg-red-500" style={{ left: `${req}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Línea roja = {req}% mínimo deliberatorio</p>
        </div>
      </Card>

      <Card className="p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground"><Users className="h-5 w-5 text-brand" /> Asistentes registrados</h2>
          <span className="text-xs text-muted-foreground"><Wifi className="mr-1 inline h-3.5 w-3.5" />{det?.asistentes.length ?? 0} presentes</span>
        </div>
        {det === undefined ? <Spinner className="mx-auto my-4 h-5 w-5" /> : det.asistentes.length === 0 ? (
          <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">Aún no hay asistentes registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 font-medium">Unidad</th><th className="py-2 font-medium">Propietario</th>
                <th className="py-2 text-right font-medium">Coeficiente</th><th className="py-2 font-medium">Hora</th><th className="py-2"></th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {det.asistentes.map((a) => (
                  <tr key={a._id}>
                    <td className="py-2 font-medium text-foreground">{a.unidadNumero}</td>
                    <td className="py-2 text-muted-foreground">{a.userNombre}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{a.coeficiente != null ? `${a.coeficiente}` : "—"}</td>
                    <td className="py-2 text-muted-foreground">{fmtHora(a.createdAt)}</td>
                    <td className="py-2 text-right">
                      <button onClick={() => quitar({ asistenteId: a._id })} aria-label="Quitar" className="rounded p-1 text-muted-foreground hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
function Stat({ value, label, tone }: { value: string; label: string; tone: string }) {
  return <div className="rounded-xl border border-border bg-muted/20 p-4 text-center"><p className={cn("text-2xl font-bold tabular-nums", tone)}>{value}</p><p className="mt-0.5 text-xs text-muted-foreground">{label}</p></div>;
}

/* ───────── Orden del día (puntos con votación) ───────── */
type Punto = { titulo: string; descripcion?: string; votacionId?: Id<"votaciones"> };

function OrdenDelDia({ asambleaId, puntos }: { asambleaId: Id<"asambleas">; puntos: Punto[] }) {
  const votaciones = useQuery(api.asambleas.listVotaciones, { asambleaId });
  const eliminar = useMutation(api.asambleas.eliminarPunto);
  const mover = useMutation(api.asambleas.moverPunto);
  const [modal, setModal] = useState<{ index: number | null } | null>(null);

  const votMap = new Map((votaciones ?? []).map((v) => [v._id as string, v]));

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground"><ListOrdered className="h-5 w-5 text-brand" /> Orden del día</h2>
        <span className="text-xs text-muted-foreground">Puedes editarlo en cualquier momento</span>
      </div>

      {puntos.length === 0 ? (
        <p className="mb-3 rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">Aún no hay puntos. Agrega el primero.</p>
      ) : (
        <ol className="space-y-2">
          {puntos.map((p, i) => {
            const vt = p.votacionId ? votMap.get(p.votacionId as string) : null;
            return (
              <li key={i} className="flex items-start gap-3 rounded-xl border border-border p-3">
                <span className="mt-0.5 w-6 shrink-0 text-sm font-semibold text-muted-foreground">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">{p.titulo}</p>
                    {p.votacionId && (
                      <Badge tone={vt?.estado === "abierta" ? "success" : "info"}>
                        <Vote className="h-3 w-3" /> Votación {vt?.estado === "abierta" ? "abierta" : "cerrada"}
                      </Badge>
                    )}
                  </div>
                  {p.descripcion && <p className="mt-0.5 text-sm text-muted-foreground">{p.descripcion}</p>}
                </div>
                <div className="flex shrink-0 items-center">
                  <button onClick={() => mover({ asambleaId, index: i, dir: -1 })} disabled={i === 0} className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                  <button onClick={() => mover({ asambleaId, index: i, dir: 1 })} disabled={i === puntos.length - 1} className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                  <button onClick={() => setModal({ index: i })} className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Editar"><Save className="h-4 w-4" /></button>
                  <button onClick={() => { if (confirm("¿Eliminar este punto" + (p.votacionId ? " y su votación?" : "?"))) eliminar({ asambleaId, index: i }); }} className="rounded p-1 text-muted-foreground hover:text-red-600" aria-label="Eliminar"><Trash2 className="h-4 w-4" /></button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-4">
        <Button variant="outline" size="sm" onClick={() => setModal({ index: null })}><Plus className="h-4 w-4" /> Agregar punto</Button>
      </div>

      {modal && (
        <PuntoModal
          asambleaId={asambleaId}
          punto={modal.index != null ? puntos[modal.index] ?? null : null}
          index={modal.index}
          tieneVotacion={modal.index != null ? !!puntos[modal.index]?.votacionId : false}
          onClose={() => setModal(null)}
        />
      )}
    </Card>
  );
}

function PuntoModal({
  asambleaId, punto, index, tieneVotacion, onClose,
}: {
  asambleaId: Id<"asambleas">;
  punto: Punto | null;
  index: number | null;
  tieneVotacion: boolean;
  onClose: () => void;
}) {
  const agregar = useMutation(api.asambleas.agregarPunto);
  const editar = useMutation(api.asambleas.editarPunto);
  const toggleVot = useMutation(api.asambleas.toggleVotacionPunto);
  const esEdicion = index != null;
  const [titulo, setTitulo] = useState(punto?.titulo ?? "");
  const [descripcion, setDescripcion] = useState(punto?.descripcion ?? "");
  const [habilitar, setHabilitar] = useState(!esEdicion ? false : tieneVotacion);
  const [opciones, setOpciones] = useState<string[]>(["A favor", "En contra", "Abstención"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (!titulo.trim()) return setError("El título es obligatorio.");
    setBusy(true); setError(null);
    try {
      if (esEdicion) {
        await editar({ asambleaId, index, titulo, descripcion: descripcion || undefined });
        // Si cambió el switch de votación respecto a como estaba
        if (habilitar !== tieneVotacion) {
          await toggleVot({ asambleaId, index, opciones: opciones.map((o) => o.trim()).filter(Boolean) });
        }
      } else {
        await agregar({
          asambleaId, titulo, descripcion: descripcion || undefined,
          habilitarVotacion: habilitar,
          opciones: opciones.map((o) => o.trim()).filter(Boolean),
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="animate-fade-in absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-slide-up relative z-10 w-full max-w-lg rounded-t-2xl border border-border bg-card p-6 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{esEdicion ? "Editar punto" : "Crear punto del orden del día"}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"><XCircle className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">Pregunta / Título</span>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej: Aprobación del presupuesto 2026" autoFocus />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">Descripción <span className="text-muted-foreground">(opcional)</span></span>
            <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Detalle del punto" />
          </label>

          <label className="flex items-center gap-2.5">
            <input type="checkbox" checked={habilitar} onChange={(e) => setHabilitar(e.target.checked)} className="h-4 w-4 rounded border-border text-brand accent-[hsl(var(--brand))]" />
            <span className="text-sm font-medium text-foreground">Habilitar votación en este punto</span>
          </label>

          {habilitar && (!esEdicion || !tieneVotacion) && (
            <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
              <span className="text-xs font-medium text-muted-foreground">Opciones de la votación</span>
              {opciones.map((op, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={op} onChange={(e) => setOpciones((p) => p.map((x, idx) => idx === i ? e.target.value : x))} placeholder={`Opción ${i + 1}`} />
                  {opciones.length > 2 && <button onClick={() => setOpciones((p) => p.filter((_, idx) => idx !== i))} className="rounded p-1.5 text-muted-foreground hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
                </div>
              ))}
              <button onClick={() => setOpciones((p) => [...p, ""])} className="text-sm font-medium text-brand hover:underline">+ Agregar opción</button>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
            <Button size="sm" onClick={guardar} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} {esEdicion ? "Guardar" : "Crear punto"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────── Votación en vivo ───────── */
function VotacionTab({ asambleaId, agenda }: { asambleaId: Id<"asambleas">; agenda: string[] }) {
  const votaciones = useQuery(api.asambleas.listVotaciones, { asambleaId });
  const createVotacion = useMutation(api.asambleas.createVotacion);
  const [pregunta, setPregunta] = useState("");
  const [opciones, setOpciones] = useState<string[]>(["A favor", "En contra", "Abstención"]);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  async function crear() {
    const ops = opciones.map((o) => o.trim()).filter(Boolean);
    if (!pregunta.trim() || ops.length < 2) return;
    setBusy(true);
    try { await createVotacion({ asambleaId, pregunta, opciones: ops }); setPregunta(""); setOpciones(["A favor", "En contra", "Abstención"]); setShowForm(false); } finally { setBusy(false); }
  }
  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground"><Vote className="h-5 w-5 text-brand" /> Votación en vivo</h2>
        <Button variant="outline" size="sm" onClick={() => setShowForm((s) => !s)}><Plus className="h-4 w-4" /> Nueva pregunta</Button>
      </div>
      {showForm && (
        <div className="mb-4 space-y-3 rounded-xl border border-border bg-muted/30 p-4">
          <Input value={pregunta} onChange={(e) => setPregunta(e.target.value)} placeholder="¿Se aprueba…?" />
          {agenda.length > 0 && <div className="flex flex-wrap gap-1.5">{agenda.map((p, i) => <button key={i} onClick={() => setPregunta(p)} className="rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand hover:bg-brand/20">{i + 1}. {p.length > 30 ? p.slice(0, 30) + "…" : p}</button>)}</div>}
          <div className="space-y-2">{opciones.map((op, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={op} onChange={(e) => setOpciones((p) => p.map((x, idx) => idx === i ? e.target.value : x))} placeholder={`Opción ${i + 1}`} />
              {opciones.length > 2 && <button onClick={() => setOpciones((p) => p.filter((_, idx) => idx !== i))} className="rounded p-1.5 text-muted-foreground hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}</div>
          <button onClick={() => setOpciones((p) => [...p, ""])} className="text-sm font-medium text-brand hover:underline">+ Agregar opción</button>
          <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button><Button size="sm" onClick={crear} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Crear</Button></div>
        </div>
      )}
      {votaciones === undefined ? <Spinner className="mx-auto my-4 h-5 w-5" /> : votaciones.length === 0 ? (
        <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">No hay votaciones. Crea una pregunta.</p>
      ) : <div className="space-y-4">{votaciones.map((vt) => <VotacionAdminCard key={vt._id} votacionId={vt._id} pregunta={vt.pregunta} estado={vt.estado} />)}</div>}
    </Card>
  );
}
function VotacionAdminCard({ votacionId, pregunta, estado }: { votacionId: Id<"votaciones">; pregunta: string; estado: "abierta" | "cerrada" }) {
  const res = useQuery(api.asambleas.resultadosVotacion, { votacionId });
  const toggle = useMutation(api.asambleas.toggleVotacion);
  const remove = useMutation(api.asambleas.removeVotacion);
  const totalCoef = res ? res.opciones.reduce((s, o) => s + o.coeficiente, 0) : 0;
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="font-semibold text-foreground">{pregunta}</p>
        <div className="flex shrink-0 items-center gap-1">
          <Badge tone={estado === "abierta" ? "success" : "neutral"}>{estado === "abierta" ? "Abierta" : "Cerrada"}</Badge>
          <button onClick={() => toggle({ id: votacionId })} className="rounded p-1.5 text-muted-foreground hover:text-foreground" aria-label="Abrir/cerrar">{estado === "abierta" ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}</button>
          <button onClick={() => remove({ id: votacionId })} className="rounded p-1.5 text-muted-foreground hover:text-red-600" aria-label="Eliminar"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
      {res && <div className="space-y-2">{res.opciones.map((op, i) => {
        const pct = totalCoef > 0 ? Math.round((op.coeficiente / totalCoef) * 100) : 0;
        return <div key={i}>
          <div className="mb-1 flex items-center justify-between text-sm"><span className="text-foreground">{op.texto}</span><span className="tabular-nums text-muted-foreground">{op.votos} und · {op.coeficiente} coef · {pct}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} /></div>
        </div>;
      })}</div>}
      <p className="mt-2 text-xs text-muted-foreground">{res?.totalVotos ?? 0} unidades votaron</p>
    </div>
  );
}

/* ───────── Tabla (registro detallado) ───────── */
function TablaTab({ asambleaId, tituloAsamblea }: { asambleaId: Id<"asambleas">; tituloAsamblea: string }) {
  const det = useQuery(api.asambleas.asistentesDetallado, { asambleaId });
  const votaciones = useQuery(api.asambleas.listVotaciones, { asambleaId });
  const [filtro, setFiltro] = useState<"todos" | "votaron" | "pendientes" | "ausentes">("todos");
  const [search, setSearch] = useState("");

  const filas = det?.filas ?? [];
  const conteos = useMemo(() => {
    const votaron = filas.filter((f) => Object.keys(f.votos).length > 0).length;
    const presentes = filas.filter((f) => f.presente).length;
    return { todos: filas.length, votaron, pendientes: presentes - votaron, ausentes: filas.length - presentes };
  }, [filas]);

  const visibles = filas.filter((f) => {
    if (search && !f.unidadNumero.toLowerCase().includes(search.toLowerCase()) && !(f.asistente ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    const voto = Object.keys(f.votos).length > 0;
    if (filtro === "votaron") return voto;
    if (filtro === "pendientes") return f.presente && !voto;
    if (filtro === "ausentes") return !f.presente;
    return true;
  });

  function exportarCSV() {
    const vs = votaciones ?? [];
    const head = ["Unidad", "Propietario", "Asistencia", "Coeficiente", "Hora", ...vs.map((v, i) => `P${i + 1}`)];
    const rows = filas.map((f) => [
      f.unidadNumero, f.asistente ?? "", f.presente ? "Presente" : "Ausente",
      f.coeficiente != null ? String(f.coeficiente) : "", f.horaRegistro ? fmtHora(f.horaRegistro) : "",
      ...vs.map((v) => { const idx = f.votos[v._id as string]; return idx != null ? (v.opciones[idx]?.texto ?? "") : ""; }),
    ]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `Registro_${tituloAsamblea}.csv`; link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground"><Table2 className="h-5 w-5 text-brand" /> Registro detallado</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar unidad…" className="h-9 w-44 pl-8" /></div>
          <Button variant="outline" size="sm" onClick={exportarCSV}><Download className="h-4 w-4" /> Exportar CSV</Button>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {([["todos", `Todos (${conteos.todos})`], ["votaron", `Votaron (${conteos.votaron})`], ["pendientes", `Pendientes (${conteos.pendientes})`], ["ausentes", `Ausentes (${conteos.ausentes})`]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFiltro(k)} className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", filtro === k ? "bg-brand text-brand-foreground" : "border border-border text-muted-foreground hover:bg-accent")}>{l}</button>
        ))}
      </div>
      {det === undefined ? <Spinner className="mx-auto my-6 h-5 w-5" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] text-sm">
            <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 font-medium">Unidad</th><th className="py-2 font-medium">Propietario</th><th className="py-2 font-medium">Asistencia</th>
              <th className="py-2 text-right font-medium">Coef.</th><th className="py-2 font-medium">Representa</th><th className="py-2 font-medium">Hora</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {visibles.slice(0, 300).map((f) => (
                <tr key={f.unidadId}>
                  <td className="py-2 font-medium text-foreground">{f.unidadNumero}</td>
                  <td className="py-2 text-muted-foreground">{f.asistente ?? "—"}</td>
                  <td className="py-2">{f.presente ? <Badge tone="success">Presente</Badge> : <Badge tone="destructive">Ausente</Badge>}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">{f.coeficiente ?? "—"}</td>
                  <td className="py-2 text-muted-foreground">{f.representa ?? "—"}</td>
                  <td className="py-2 text-muted-foreground">{f.horaRegistro ? fmtHora(f.horaRegistro) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibles.length > 300 && <p className="mt-2 text-xs text-muted-foreground">Mostrando 300 de {visibles.length}. Usa el buscador para filtrar.</p>}
        </div>
      )}
    </Card>
  );
}

/* ───────── Resultados ───────── */
function ResultadosTab({ asambleaId }: { asambleaId: Id<"asambleas"> }) {
  const votaciones = useQuery(api.asambleas.listVotaciones, { asambleaId });
  if (votaciones === undefined) return <Card className="p-8"><Spinner className="mx-auto h-5 w-5" /></Card>;
  if (votaciones.length === 0) return <Card className="p-6"><p className="text-sm text-muted-foreground">Aún no hay votaciones con resultados.</p></Card>;
  return <div className="space-y-4">{votaciones.map((vt) => <ResultadoCard key={vt._id} votacionId={vt._id} pregunta={vt.pregunta} />)}</div>;
}
function ResultadoCard({ votacionId, pregunta }: { votacionId: Id<"votaciones">; pregunta: string }) {
  const res = useQuery(api.asambleas.resultadosVotacion, { votacionId });
  if (!res) return null;
  const totalCoef = res.opciones.reduce((s, o) => s + o.coeficiente, 0);
  const ganadora = [...res.opciones].sort((a, b) => b.coeficiente - a.coeficiente)[0];
  const pctGana = totalCoef > 0 && ganadora ? (ganadora.coeficiente / totalCoef) * 100 : 0;
  const aprobada = pctGana >= 51 && (ganadora?.texto.toLowerCase().includes("favor") || ganadora?.texto.toLowerCase().includes("sí") || ganadora?.texto.toLowerCase().includes("si"));
  return (
    <Card className="p-6">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="font-semibold text-foreground">{pregunta}</h3>
        <Badge tone={res.estado === "cerrada" ? (aprobada ? "success" : "destructive") : "info"}>{res.estado === "cerrada" ? (aprobada ? "Aprobada" : "No aprobada") : "En curso"}</Badge>
      </div>
      <div className="space-y-2">{res.opciones.map((op, i) => {
        const pct = totalCoef > 0 ? Math.round((op.coeficiente / totalCoef) * 100) : 0;
        return <div key={i}><div className="mb-1 flex items-center justify-between text-sm"><span className="text-foreground">{op.texto}</span><span className="tabular-nums text-muted-foreground">{op.votos} und · {pct}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} /></div></div>;
      })}</div>
    </Card>
  );
}

/* ───────── Poderes (admin) ───────── */
function PoderesTab({ asambleaId }: { asambleaId: Id<"asambleas"> }) {
  const poderes = useQuery(api.asambleas.listPoderes, { asambleaId });
  const responder = useMutation(api.asambleas.responderPoder);
  const revocar = useMutation(api.asambleas.revocarPoder);
  return (
    <Card className="p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground"><UserPlus className="h-5 w-5 text-brand" /> Poderes</h2>
      {poderes === undefined ? <Spinner className="mx-auto my-4 h-5 w-5" /> : poderes.length === 0 ? (
        <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">No hay poderes otorgados en esta asamblea.</p>
      ) : (
        <div className="space-y-2">{poderes.map((p) => (
          <div key={p._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Unidad {p.unidadNumero}: {p.otorganteNombre} → {p.representanteNombre}</p>
              <p className="text-xs text-muted-foreground">{p.validado ? "Validado" : "Pendiente de validación"}</p>
            </div>
            <div className="flex items-center gap-2">
              {!p.validado && <Button size="sm" onClick={() => responder({ poderId: p._id, aceptar: true })}><Check className="h-3.5 w-3.5" /> Validar</Button>}
              <button onClick={() => revocar({ poderId: p._id }).catch(() => {})} className="rounded-lg p-1.5 text-muted-foreground hover:text-red-600" aria-label="Eliminar"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}</div>
      )}
    </Card>
  );
}

/* ───────── Representantes ───────── */
function RepresentantesTab({ asambleaId }: { asambleaId: Id<"asambleas"> }) {
  const poderes = useQuery(api.asambleas.listPoderes, { asambleaId });
  const reps = useMemo(() => {
    const map = new Map<string, { nombre: string; unidades: string[] }>();
    for (const p of poderes ?? []) {
      if (!p.validado) continue;
      const e = map.get(p.representanteUserId as string) ?? { nombre: p.representanteNombre, unidades: [] };
      e.unidades.push(p.unidadNumero);
      map.set(p.representanteUserId as string, e);
    }
    return [...map.values()];
  }, [poderes]);
  return (
    <Card className="p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground"><UserSquare className="h-5 w-5 text-brand" /> Representantes</h2>
      {poderes === undefined ? <Spinner className="mx-auto my-4 h-5 w-5" /> : reps.length === 0 ? (
        <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">Nadie representa unidades por poder (validado) todavía.</p>
      ) : (
        <div className="space-y-2">{reps.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
            <p className="text-sm font-medium text-foreground">{r.nombre}</p>
            <span className="text-xs text-muted-foreground">Representa {r.unidades.length} unidad{r.unidades.length !== 1 ? "es" : ""}: {r.unidades.join(", ")}</span>
          </div>
        ))}</div>
      )}
    </Card>
  );
}

/* ───────── Registrar asistencia (QR / manual) ───────── */
function RegistrarTab({ asambleaId, condominioId }: { asambleaId: Id<"asambleas">; condominioId: Id<"condominios"> }) {
  const registrar = useMutation(api.asambleas.registrarAsistenciaAdmin);
  const [term, setTerm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const results = useQuery(api.asambleas.buscarUsuarios, term.trim().length >= 2 ? { condominioId, search: term } : "skip");

  async function reg(userId: Id<"users">, nombre: string) {
    try { const r = await registrar({ asambleaId, userId }); setMsg(`✓ ${nombre}: ${r.registradas} unidad(es) registrada(s).`); setTerm(""); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Error."); }
  }
  return (
    <Card className="p-6">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-foreground"><QrCode className="h-5 w-5 text-brand" /> Registrar asistencia</h2>
      <p className="mb-4 text-sm text-muted-foreground">Busca al propietario y regístralo como presente (equivale a escanear su QR).</p>
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={term} onChange={(e) => { setTerm(e.target.value); setMsg(null); }} placeholder="Nombre o correo del propietario…" className="pl-9" />
      </div>
      {term.trim().length >= 2 && (
        <div className="mt-2 max-w-md space-y-1">
          {results === undefined ? <Spinner className="my-2 h-4 w-4" /> : results.length === 0 ? <p className="text-sm text-muted-foreground">Sin resultados.</p> : results.map((u) => (
            <button key={u._id} onClick={() => reg(u._id, u.name)} className="flex w-full items-center justify-between rounded-lg border border-border p-2.5 text-left text-sm hover:bg-accent">
              <span><span className="font-medium text-foreground">{u.name}</span> <span className="text-xs text-muted-foreground">{u.email}</span></span>
              <Check className="h-4 w-4 text-brand" />
            </button>
          ))}
        </div>
      )}
      {msg && <p className="mt-3 text-sm font-medium text-emerald-600">{msg}</p>}
      <p className="mt-4 text-xs text-muted-foreground">Nota: el escaneo con cámara del QR se puede agregar después; por ahora el registro es por búsqueda (misma lógica de asistencia).</p>
    </Card>
  );
}
