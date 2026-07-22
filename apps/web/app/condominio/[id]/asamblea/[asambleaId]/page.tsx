"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import {
  ArrowLeft, Calendar, MapPin, Users, Loader2, Check, Play, CheckCircle2,
  XCircle, Vote, ListOrdered, Scale, Save, Plus, Trash2, ChevronUp, ChevronDown,
  Lock, LayoutDashboard, Table2, TrendingUp, UserPlus,
  UserSquare, QrCode, Mail, Search, Download, Wifi, KeyRound, ClipboardList, X,
  FileText, FileArchive,
} from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  descargarActaPDF,
  descargarPoderesCSV,
  descargarPoderesZIP,
} from "@/lib/asamblea-auditoria";
import { VotacionEnVivoTab, DetalleVotosTab } from "./votacion-en-vivo";
import { uploadToS3 } from "@/lib/upload-s3";

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
  { key: "orden", label: "Orden", icon: ListOrdered },
  { key: "votacion", label: "En vivo", icon: Vote },
  { key: "detalle_votos", label: "Detalle", icon: ClipboardList },
  { key: "tabla", label: "Tabla", icon: Table2 },
  { key: "resultados", label: "Resultados", icon: TrendingUp },
  { key: "poderes", label: "Poderes", icon: UserPlus },
  { key: "representantes", label: "Reps", icon: UserSquare },
  { key: "qr", label: "Asistencia", icon: QrCode },
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

      {/* Tabs — full width */}
      <nav className="flex w-full flex-wrap items-stretch gap-1 rounded-xl border border-border bg-card p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-brand text-brand-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{t.label}</span>
            </button>
          );
        })}
      </nav>

      {tab === "dashboard" && <DashboardTab asambleaId={asambleaId} estado={a.estado} />}
      {tab === "orden" && <OrdenDelDia asambleaId={asambleaId} puntos={a.ordenDia ?? a.agenda.map((t) => ({ titulo: t }))} />}
      {tab === "votacion" && <VotacionEnVivoTab asambleaId={asambleaId} agenda={a.agenda} />}
      {tab === "detalle_votos" && <DetalleVotosTab asambleaId={asambleaId} />}
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
        <p className="mt-3 text-xs text-muted-foreground">
          Unidades presentes = solo check-in en sala (QR o código). Aceptar un poder no marca asistencia.
        </p>
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
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground"><Users className="h-5 w-5 text-brand" /> Quiénes asistieron</h2>
          <span className="text-xs text-muted-foreground">
            <Wifi className="mr-1 inline h-3.5 w-3.5" />
            {(det?.filas ?? []).filter((f) => f.presente).length} unidades
          </span>
        </div>
        {det === undefined ? <Spinner className="mx-auto my-4 h-5 w-5" /> : (det.filas.filter((f) => f.presente).length === 0) ? (
          <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">Aún no hay asistentes registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-xl text-sm">
              <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Unidad</th>
                <th className="py-2 pr-4 font-medium">Quién</th>
                <th className="py-2 pr-4 font-medium">Tipo</th>
                <th className="py-2 pr-6 text-right font-medium">Coeficiente</th>
                <th className="py-2 pr-4 font-medium">Hora</th>
                <th className="py-2"></th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {det.filas.filter((f) => f.presente).map((f) => {
                  const asisRow = det.asistentes.find((a) => a.unidadNumero === f.unidadNumero);
                  const esPoder = !!f.porPoder;
                  const tambien = f.tambienRepresenta ?? [];
                  return (
                    <tr key={f.unidadId}>
                      <td className="py-2 pr-4 font-medium text-foreground">{f.unidadNumero}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        <span className="text-foreground">{f.asistente ?? f.propietario ?? "—"}</span>
                        {!esPoder && tambien.length > 0 ? (
                          <span className="mt-0.5 block text-xs text-brand">
                            También representa {tambien.length === 1 ? "la unidad" : "las unidades"}{" "}
                            {tambien.join(", ")}
                          </span>
                        ) : null}
                        {esPoder ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            Propietario: {f.propietario ?? "—"} · Representada por poder
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge tone={esPoder ? "info" : "success"}>{esPoder ? "Por poder" : "Presente"}</Badge>
                      </td>
                      <td className="py-2 pr-6 text-right tabular-nums text-muted-foreground">{f.coeficiente != null ? `${f.coeficiente}` : "—"}</td>
                      <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">{fmtHora(f.horaRegistro)}</td>
                      <td className="py-2 text-right">
                        {asisRow ? (
                          <button onClick={() => quitar({ asistenteId: asisRow._id })} aria-label="Quitar" className="rounded p-1 text-muted-foreground hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
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
type Punto = { titulo: string; descripcion?: string; votacionId?: Id<"votaciones">; hecho?: boolean };

function OrdenDelDia({ asambleaId, puntos }: { asambleaId: Id<"asambleas">; puntos: Punto[] }) {
  const votaciones = useQuery(api.asambleas.listVotaciones, { asambleaId });
  const eliminar = useMutation(api.asambleas.eliminarPunto);
  const mover = useMutation(api.asambleas.moverPunto);
  const toggleHecho = useMutation(api.asambleas.togglePuntoHecho);
  const [modal, setModal] = useState<{ index: number | null } | null>(null);
  const [busyHecho, setBusyHecho] = useState<number | null>(null);

  const votMap = new Map((votaciones ?? []).map((v) => [v._id as string, v]));
  const hechos = puntos.filter((p) => p.hecho).length;

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground"><ListOrdered className="h-5 w-5 text-brand" /> Orden del día</h2>
        <span className="text-xs text-muted-foreground">
          {puntos.length > 0 ? `${hechos}/${puntos.length} realizados` : "Puedes editarlo en cualquier momento"}
        </span>
      </div>

      {puntos.length === 0 ? (
        <p className="mb-3 rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">Aún no hay puntos. Agrega el primero.</p>
      ) : (
        <ol className="space-y-2">
          {puntos.map((p, i) => {
            const vt = p.votacionId ? votMap.get(p.votacionId as string) : null;
            const hecho = !!p.hecho;
            return (
              <li
                key={i}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3 transition-colors",
                  hecho ? "border-emerald-500/30 bg-emerald-500/5" : "border-border",
                )}
              >
                <button
                  type="button"
                  title={hecho ? "Marcar como pendiente" : "Marcar como realizado"}
                  disabled={busyHecho === i}
                  onClick={() => {
                    setBusyHecho(i);
                    toggleHecho({ asambleaId, index: i }).finally(() => setBusyHecho(null));
                  }}
                  className={cn(
                    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors",
                    hecho
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-border bg-background text-muted-foreground hover:border-brand hover:text-brand",
                  )}
                >
                  {busyHecho === i ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : hecho ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span className="text-xs font-semibold tabular-nums">{i + 1}</span>
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={cn("font-medium", hecho ? "text-muted-foreground line-through" : "text-foreground")}>
                      {p.titulo}
                    </p>
                    {hecho && <Badge tone="success">Hecho</Badge>}
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
            <input type="checkbox" checked={habilitar} onChange={(e) => setHabilitar(e.target.checked)} className="h-4 w-4 rounded border-border text-brand accent-brand" />
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

/* ───────── Tabla (registro detallado) ───────── */
function TablaTab({ asambleaId, tituloAsamblea }: { asambleaId: Id<"asambleas">; tituloAsamblea: string }) {
  const det = useQuery(api.asambleas.asistentesDetallado, { asambleaId });
  const votaciones = useQuery(api.asambleas.listVotaciones, { asambleaId });
  const [filtro, setFiltro] = useState<"todos" | "votaron" | "pendientes" | "ausentes">("todos");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 40;

  const filas = det?.filas ?? [];
  const conteos = useMemo(() => {
    const votaron = filas.filter((f) => Object.keys(f.votos).length > 0).length;
    const presentes = filas.filter((f) => f.presente).length;
    return { todos: filas.length, votaron, pendientes: presentes - votaron, ausentes: filas.length - presentes };
  }, [filas]);

  const visibles = useMemo(() => filas.filter((f) => {
    if (search && !f.unidadNumero.toLowerCase().includes(search.toLowerCase()) && !(f.asistente ?? "").toLowerCase().includes(search.toLowerCase()) && !(f.propietario ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    const voto = Object.keys(f.votos).length > 0;
    if (filtro === "votaron") return voto;
    if (filtro === "pendientes") return f.presente && !voto;
    if (filtro === "ausentes") return !f.presente;
    return true;
  }), [filas, search, filtro]);

  const totalPages = Math.max(1, Math.ceil(visibles.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = visibles.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [filtro, search]);

  function exportarCSV() {
    const vs = votaciones ?? [];
    const head = ["Unidad", "Propietario", "Asistencia", "Coeficiente", "Hora", ...vs.map((v, i) => `P${i + 1}`)];
    const rows = filas.map((f) => [
      f.unidadNumero, f.asistente ?? "", f.presente ? (f.porPoder ? "Por poder" : "Presente") : f.tienePoder ? "Poder" : "Ausente",
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
        <>
        <div className="overflow-x-auto">
          <table className="w-full min-w-2xl text-sm">
            <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Unidad</th><th className="py-2 pr-4 font-medium">Propietario</th><th className="py-2 pr-4 font-medium">Asistencia</th>
              <th className="py-2 pr-6 font-medium">Coef.</th><th className="py-2 pr-4 font-medium">Representa</th><th className="py-2 font-medium">Hora</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {pageRows.map((f) => (
                <tr key={f.unidadId}>
                  <td className="py-2 pr-4 font-medium text-foreground">{f.unidadNumero}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{f.propietario ?? "—"}</td>
                  <td className="py-2 pr-4">
                    {f.presente ? (
                      <Badge tone={f.porPoder ? "info" : "success"}>{f.porPoder ? "Por poder" : "Presente"}</Badge>
                    ) : f.tienePoder ? (
                      <Badge tone="neutral">Poder</Badge>
                    ) : (
                      <Badge tone="destructive">Ausente</Badge>
                    )}
                  </td>
                  <td className="py-2 pr-6 tabular-nums text-muted-foreground">{f.coeficiente ?? "—"}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{f.representa ?? "—"}</td>
                  <td className="py-2 text-muted-foreground">{f.horaRegistro ? fmtHora(f.horaRegistro) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-muted-foreground">
            {visibles.length === 0
              ? "Sin registros"
              : `Mostrando ${(pageSafe - 1) * PAGE_SIZE + 1}–${Math.min(pageSafe * PAGE_SIZE, visibles.length)} de ${visibles.length}`}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={pageSafe <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</Button>
            <span className="tabular-nums text-muted-foreground">{pageSafe} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={pageSafe >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Siguiente</Button>
          </div>
        </div>
        </>
      )}
    </Card>
  );
}

/* ───────── Resultados ───────── */
function ResultadosTab({ asambleaId }: { asambleaId: Id<"asambleas"> }) {
  const votaciones = useQuery(api.asambleas.listVotaciones, { asambleaId });
  const paquete = useQuery(api.asambleas.paqueteAuditoria, { asambleaId });
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const conResultados = useMemo(
    () =>
      (votaciones ?? []).filter(
        (vt) =>
          vt.estado === "abierta" ||
          vt.abiertaAlgunaVez === true ||
          vt.opciones.some((o) => o.votos > 0),
      ),
    [votaciones],
  );

  async function descargarActa() {
    if (!paquete) return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      await descargarActaPDF(paquete);
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : "No se pudo generar el PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  if (votaciones === undefined) return <Card className="p-8"><Spinner className="mx-auto h-5 w-5" /></Card>;
  if (conResultados.length === 0) {
    return (
      <Card className="p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Aún no hay votaciones con resultados. Se muestran cuando se abre una pregunta.</p>
          <Button variant="outline" size="sm" disabled={!paquete || pdfBusy} onClick={descargarActa}>
            {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Descargar acta PDF
          </Button>
        </div>
        {pdfError ? <p className="text-sm text-red-600">{pdfError}</p> : null}
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-muted-foreground">
          Documento con las preguntas, conteos por coeficiente y veredicto de cada votación.
        </p>
        <Button variant="outline" size="sm" disabled={!paquete || pdfBusy} onClick={descargarActa}>
          {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Descargar acta PDF
        </Button>
      </Card>
      {pdfError ? <p className="text-sm text-red-600">{pdfError}</p> : null}
      {conResultados.map((vt) => (
        <ResultadoCard key={vt._id} votacionId={vt._id} pregunta={vt.pregunta} />
      ))}
    </div>
  );
}
function ResultadoCard({ votacionId, pregunta }: { votacionId: Id<"votaciones">; pregunta: string }) {
  const res = useQuery(api.asambleas.resultadosVotacion, { votacionId });
  if (!res) return null;
  const totalCoef = res.opciones.reduce((s, o) => s + o.coeficiente, 0);
  const ganadora = [...res.opciones].sort((a, b) => b.coeficiente - a.coeficiente)[0];
  const pctGana = totalCoef > 0 && ganadora ? (ganadora.coeficiente / totalCoef) * 100 : 0;
  const badge = veredictoBadge(res.estado, res.opciones, ganadora?.texto, pctGana);
  return (
    <Card className="p-6">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="font-semibold text-foreground">{pregunta}</h3>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>
      <div className="space-y-2">{res.opciones.map((op, i) => {
        const pct = totalCoef > 0 ? Math.round((op.coeficiente / totalCoef) * 100) : 0;
        return <div key={i}><div className="mb-1 flex items-center justify-between text-sm"><span className="text-foreground">{op.texto}</span><span className="tabular-nums text-muted-foreground">{op.votos} und · {pct}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} /></div></div>;
      })}</div>
    </Card>
  );
}

/** Sí/No → Aprobada/No aprobada. Candidatos u otras → Ganó: X. */
function veredictoBadge(
  estado: string,
  opciones: { texto: string; coeficiente: number }[],
  ganadoraTexto: string | undefined,
  pctGana: number,
): { label: string; tone: React.ComponentProps<typeof Badge>["tone"] } {
  if (estado !== "cerrada") return { label: "En curso", tone: "info" };
  if (!ganadoraTexto || pctGana <= 0) return { label: "Sin votos", tone: "neutral" };

  const textos = opciones.map((o) => o.texto.toLowerCase());
  const esSiNo =
    textos.some((t) => t.includes("favor") || t.includes("sí") || t === "si" || t.includes("aprob")) &&
    textos.some((t) => t.includes("contra") || t === "no" || t.includes("rechaz"));

  const g = ganadoraTexto.toLowerCase();
  if (esSiNo) {
    const aFavor =
      g.includes("favor") || g.includes("sí") || g === "si" || g.includes("aprob");
    if (aFavor && pctGana >= 51) return { label: "Aprobada", tone: "success" };
    return { label: "No aprobada", tone: "destructive" };
  }

  // Elección / lista de opciones: mostrar quién ganó, no “No aprobada”.
  return { label: `Ganó: ${ganadoraTexto}`, tone: "success" };
}

/* ───────── Poderes (admin) ───────── */
const poderInputCls =
  "h-9 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

function PoderesTab({ asambleaId }: { asambleaId: Id<"asambleas"> }) {
  const a = useQuery(api.asambleas.get, { id: asambleaId });
  const poderes = useQuery(api.asambleas.listPoderes, { asambleaId });
  const paquete = useQuery(api.asambleas.paqueteAuditoria, { asambleaId });
  const unidades = useQuery(
    api.unidades.listByCondominio,
    a ? { condominioId: a.condominioId } : "skip",
  );
  const responder = useMutation(api.asambleas.responderPoder);
  const revocar = useMutation(api.asambleas.revocarPoder);
  const otorgar = useMutation(api.asambleas.otorgarPoder);
  const generateUploadUrl = useAction(api.files.generateUploadUrl);
  const [unidadId, setUnidadId] = useState("");
  const [modo, setModo] = useState<"propietario" | "externo">("propietario");
  const [rep, setRep] = useState<{ _id: Id<"users">; name: string } | null>(null);
  const [nombre, setNombre] = useState("");
  const [documento, setDocumento] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState<"csv" | "zip" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const ocupadas = new Set((poderes ?? []).map((p) => p.unidadId as string));
  const disponibles = (unidades ?? [])
    .filter((u) => !ocupadas.has(u._id as string))
    .sort((x, y) => x.numero.localeCompare(y.numero, undefined, { numeric: true }));

  const puedeRegistrar = a?.estado === "programada" || a?.estado === "en_curso";
  const conDocumento = (poderes ?? []).filter((p) => p.documentoUrl).length;

  async function withExport(
    kind: "csv" | "zip" | "pdf",
    fn: () => void | Promise<void>,
  ) {
    if (!paquete) {
      setExportError("Aún se están cargando los datos de auditoría.");
      return;
    }
    setExportBusy(kind);
    setExportError(null);
    try {
      await fn();
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "No se pudo exportar.");
    } finally {
      setExportBusy(null);
    }
  }

  async function registrarManual() {
    if (!unidadId) {
      setError("Elige la unidad.");
      return;
    }
    if (modo === "propietario" && !rep) {
      setError("Busca y selecciona el propietario apoderado.");
      return;
    }
    if (modo === "externo" && !nombre.trim()) {
      setError("Escribe el nombre completo del apoderado.");
      return;
    }
    if (modo === "externo" && !documento.trim()) {
      setError("El documento (cédula / NIP) es obligatorio para externos.");
      return;
    }
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      let documentoUrl: string | undefined;
      if (file) {
        const uploaded = await uploadToS3(
          generateUploadUrl,
          file,
          `condominios/asambleas/${a?.condominioId ?? "unknown"}/poderes`,
        );
        documentoUrl = uploaded.url;
      }
      const r = await otorgar({
        asambleaId,
        unidadId: unidadId as Id<"unidades">,
        documentoUrl,
        ...(modo === "propietario"
          ? { representanteUserId: rep!._id }
          : {
              apoderadoNombre: nombre.trim(),
              apoderadoDocumento: documento.trim(),
            }),
      });
      setOkMsg(
        `Poder registrado para ${r.nombre}. Código: ${r.codigo}${
          r.esPropietario ? " (propietario del conjunto)" : " (externo)"
        }`,
      );
      setUnidadId("");
      setRep(null);
      setNombre("");
      setDocumento("");
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <UserPlus className="h-5 w-5 text-brand" /> Poderes
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!paquete || (poderes?.length ?? 0) === 0 || exportBusy !== null}
            onClick={() => withExport("csv", () => descargarPoderesCSV(paquete!))}
          >
            {exportBusy === "csv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Listado CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!paquete || conDocumento === 0 || exportBusy !== null}
            title={conDocumento === 0 ? "Ningún poder tiene documento adjunto" : undefined}
            onClick={() => withExport("zip", async () => { await descargarPoderesZIP(paquete!); })}
          >
            {exportBusy === "zip" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />}
            Documentos ZIP{conDocumento > 0 ? ` (${conDocumento})` : ""}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!paquete || exportBusy !== null}
            onClick={() => withExport("pdf", () => descargarActaPDF(paquete!))}
          >
            {exportBusy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Acta PDF
          </Button>
        </div>
      </div>
      <p className="mb-4 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        Puedes registrar poderes <strong className="text-foreground">antes o durante</strong> la
        asamblea (cuando llegan con el documento en mano). Al registrar se genera un código para el
        apoderado.
        {a?.estado === "en_curso" ? (
          <> El público ya no puede otorgar poderes por su cuenta.</>
        ) : null}
        {" "}Para auditoría: descarga el <strong className="text-foreground">listado CSV</strong>, el{" "}
        <strong className="text-foreground">ZIP de documentos</strong> y el{" "}
        <strong className="text-foreground">acta PDF</strong> (orden del día, poderes y resultados de votación).
      </p>
      {exportError ? <p className="mb-3 text-sm text-red-600">{exportError}</p> : null}

      {puedeRegistrar ? (
        <div className="mb-5 space-y-3 rounded-xl border border-border bg-muted/20 p-4">
          <p className="text-sm font-semibold text-foreground">Registrar poder (admin)</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setModo("propietario");
                setNombre("");
                setDocumento("");
              }}
              className={cn(
                "flex-1 rounded-lg border py-2 text-sm font-medium",
                modo === "propietario"
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-border text-muted-foreground",
              )}
            >
              Propietario del conjunto
            </button>
            <button
              type="button"
              onClick={() => {
                setModo("externo");
                setRep(null);
              }}
              className={cn(
                "flex-1 rounded-lg border py-2 text-sm font-medium",
                modo === "externo"
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-border text-muted-foreground",
              )}
            >
              Persona externa
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Unidad</span>
              <select
                value={unidadId}
                onChange={(e) => setUnidadId(e.target.value)}
                className={poderInputCls}
              >
                <option value="">Selecciona…</option>
                {disponibles.map((u) => (
                  <option key={u._id} value={u._id}>
                    Unidad {u.numero}
                  </option>
                ))}
              </select>
            </label>
            {modo === "propietario" && a ? (
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Buscar propietario</span>
                <AdminUserSearch
                  condominioId={a.condominioId}
                  value={rep}
                  onChange={setRep}
                />
              </label>
            ) : (
              <>
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">Nombre completo</span>
                  <Input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Nombre del apoderado"
                    className="h-9"
                  />
                </label>
                <label className="block space-y-1 sm:col-span-2">
                  <span className="text-xs text-muted-foreground">Documento (cédula / NIP)</span>
                  <Input
                    value={documento}
                    onChange={(e) => setDocumento(e.target.value)}
                    placeholder="Número de documento"
                    className="h-9"
                  />
                </label>
              </>
            )}
          </div>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">
              Documento del poder (PDF o foto) — recomendado
            </span>
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-brand/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand hover:file:bg-brand/20"
            />
            {file ? <span className="text-xs text-emerald-600">✓ {file.name}</span> : null}
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {okMsg ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
              {okMsg}
            </p>
          ) : null}
          <Button size="sm" onClick={registrarManual} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Registrar
          </Button>
        </div>
      ) : (
        <p className="mb-4 rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
          La asamblea ya no admite nuevos poderes.
        </p>
      )}

      {poderes === undefined ? (
        <Spinner className="mx-auto my-4 h-5 w-5" />
      ) : poderes.length === 0 ? (
        <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
          No hay poderes otorgados en esta asamblea.
        </p>
      ) : (
        <div className="space-y-2">
          {poderes.map((p) => (
            <div
              key={p._id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
            >
              <div>
                <p className="text-sm font-medium text-foreground">
                  Unidad {p.unidadNumero}: {p.otorganteNombre} → {p.representanteNombre}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.validado ? "Validado" : "Pendiente de validación"}
                  {p.codigoAcceso && (
                    <>
                      {" "}
                      · Código{" "}
                      <span className="font-mono font-semibold text-foreground">
                        {p.codigoAcceso}
                      </span>
                    </>
                  )}
                  {" · "}
                  <span className="font-medium text-foreground">
                    {p.representanteTipo === "propietario"
                      ? "Apoderado: propietario"
                      : "Apoderado: persona externa"}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                {p.documentoUrl ? (
                  <a
                    href={p.documentoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <FileText className="h-3.5 w-3.5" /> Ver doc.
                  </a>
                ) : null}
                {!p.validado && (
                  <Button size="sm" onClick={() => responder({ poderId: p._id, aceptar: true })}>
                    <Check className="h-3.5 w-3.5" /> Validar
                  </Button>
                )}
                <button
                  onClick={() => revocar({ poderId: p._id }).catch(() => {})}
                  className="rounded-lg p-1.5 text-muted-foreground hover:text-red-600"
                  aria-label="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function AdminUserSearch({
  condominioId,
  value,
  onChange,
}: {
  condominioId: Id<"condominios">;
  value: { _id: Id<"users">; name: string } | null;
  onChange: (u: { _id: Id<"users">; name: string } | null) => void;
}) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const results = useQuery(
    api.asambleas.buscarUsuarios,
    term.trim().length >= 2 ? { condominioId, search: term } : "skip",
  );
  if (value) {
    return (
      <div className="flex h-9 items-center justify-between gap-2 rounded-lg border border-border bg-background px-2 text-sm">
        <span className="truncate text-foreground">{value.name}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Quitar"
          className="text-muted-foreground hover:text-red-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Nombre o correo…"
        className={cn(poderInputCls, "pl-8")}
      />
      {open && term.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-card p-1 shadow-lg">
          {results === undefined ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Buscando…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados.</p>
          ) : (
            results.map((u) => (
              <button
                key={u._id}
                type="button"
                onClick={() => {
                  onChange({ _id: u._id, name: u.name });
                  setOpen(false);
                  setTerm("");
                }}
                className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span className="font-medium text-foreground">{u.name}</span>{" "}
                <span className="text-xs text-muted-foreground">{u.email}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
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

/* ───────── Registrar asistencia (QR / código / búsqueda) ───────── */
type ModoAsistencia = "qr" | "codigo" | "buscar";

function RegistrarTab({ asambleaId, condominioId }: { asambleaId: Id<"asambleas">; condominioId: Id<"condominios"> }) {
  const det = useQuery(api.asambleas.asistentesDetallado, { asambleaId });
  const quorum = useQuery(api.asambleas.quorum, { asambleaId });
  const quitar = useMutation(api.asambleas.quitarAsistencia);
  const [modo, setModo] = useState<ModoAsistencia>("qr");
  const [msg, setMsg] = useState<string | null>(null);
  const presentes = (det?.filas ?? []).filter((f) => f.presente);

  return (
    <div className="space-y-5">
      {quorum ? (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Quórum</p>
              <p className="text-2xl font-bold tabular-nums text-foreground">
                {quorum.pct.toFixed(2)}% <span className="text-base font-medium text-muted-foreground">/ {quorum.quorumRequerido}%</span>
              </p>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <p>{quorum.unidadesPresentes} de {quorum.totalUnidades} unidades</p>
              <p>{quorum.poderesActivos} poder(es) activos</p>
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="p-6">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-foreground">
          <QrCode className="h-5 w-5 text-brand" /> Registrar asistencia
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Escanea el QR del propietario, ingresa el código del apoderado o búscalo por nombre.
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          {(
            [
              { key: "qr" as const, label: "Escanear QR", icon: QrCode },
              { key: "codigo" as const, label: "Código", icon: KeyRound },
              { key: "buscar" as const, label: "Buscar", icon: Search },
            ] as const
          ).map((m) => {
            const Icon = m.icon;
            const active = modo === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => { setModo(m.key); setMsg(null); }}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" /> {m.label}
              </button>
            );
          })}
        </div>

        {modo === "qr" ? (
          <WebQrScanner
            asambleaId={asambleaId}
            onDone={(text) => setMsg(text)}
          />
        ) : null}
        {modo === "codigo" ? (
          <CodigoAsistenciaForm asambleaId={asambleaId} onDone={(text) => setMsg(text)} />
        ) : null}
        {modo === "buscar" ? (
          <BuscarAsistenciaForm
            asambleaId={asambleaId}
            condominioId={condominioId}
            onDone={(text) => setMsg(text)}
          />
        ) : null}

        {msg ? <p className="mt-4 text-sm font-medium text-emerald-600">{msg}</p> : null}
      </Card>

      <Card className="p-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Users className="h-5 w-5 text-brand" /> Quiénes asistieron
          </h2>
          <span className="text-xs text-muted-foreground">{presentes.length} unidad{presentes.length === 1 ? "" : "es"}</span>
        </div>
        {det === undefined ? (
          <Spinner className="mx-auto my-4 h-5 w-5" />
        ) : presentes.length === 0 ? (
          <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">Nadie registrado todavía.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-xl text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 font-medium">Unidad</th>
                  <th className="py-2 font-medium">Quién</th>
                  <th className="py-2 font-medium">Tipo</th>
                  <th className="py-2 text-right font-medium">Coef.</th>
                  <th className="py-2 font-medium">Hora</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {presentes.map((f) => {
                  const asisRow = det.asistentes.find((a) => a.unidadNumero === f.unidadNumero);
                  const esPoder = !!f.porPoder;
                  const tambien = f.tambienRepresenta ?? [];
                  return (
                    <tr key={f.unidadId}>
                      <td className="py-2 pr-4 font-medium text-foreground">{f.unidadNumero}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        <span className="text-foreground">{f.asistente ?? f.propietario ?? "—"}</span>
                        {!esPoder && tambien.length > 0 ? (
                          <span className="mt-0.5 block text-xs text-brand">
                            También representa {tambien.length === 1 ? "la unidad" : "las unidades"}{" "}
                            {tambien.join(", ")}
                          </span>
                        ) : null}
                        {esPoder ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            Propietario: {f.propietario ?? "—"} · Representada por poder
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-4"><Badge tone={esPoder ? "info" : "success"}>{esPoder ? "Por poder" : "Presente"}</Badge></td>
                      <td className="py-2 pr-6 text-right tabular-nums text-muted-foreground">{f.coeficiente ?? "—"}</td>
                      <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">{fmtHora(f.horaRegistro)}</td>
                      <td className="py-2 text-right">
                        {asisRow ? (
                          <button
                            type="button"
                            onClick={() => quitar({ asistenteId: asisRow._id })}
                            aria-label="Quitar"
                            className="rounded p-1 text-muted-foreground hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function CodigoAsistenciaForm({
  asambleaId,
  onDone,
}: {
  asambleaId: Id<"asambleas">;
  onDone: (msg: string) => void;
}) {
  const registrar = useMutation(api.asambleas.registrarAsistenciaPorCodigo);
  const [codigo, setCodigo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await registrar({ asambleaId, codigo });
      onDone(`✓ ${r.nombre}: ${r.registradas} unidad(es) · ${r.unidades.join(", ")}`);
      setCodigo("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-3">
      <p className="text-sm text-muted-foreground">
        Código de apoderado que te entrega el propietario (el mismo de poderes).
      </p>
      <Input
        value={codigo}
        onChange={(e) => setCodigo(e.target.value.toUpperCase())}
        placeholder="XXXXXX"
        maxLength={8}
        className="h-12 text-center font-mono text-xl tracking-[0.35em]"
        autoComplete="off"
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button type="submit" disabled={busy || codigo.trim().length < 4}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Registrar código
      </Button>
    </form>
  );
}

function BuscarAsistenciaForm({
  asambleaId,
  condominioId,
  onDone,
}: {
  asambleaId: Id<"asambleas">;
  condominioId: Id<"condominios">;
  onDone: (msg: string) => void;
}) {
  const registrar = useMutation(api.asambleas.registrarAsistenciaAdmin);
  const [term, setTerm] = useState("");
  const results = useQuery(
    api.asambleas.buscarUsuarios,
    term.trim().length >= 2 ? { condominioId, search: term } : "skip",
  );

  async function reg(userId: Id<"users">, nombre: string) {
    try {
      const r = await registrar({ asambleaId, userId });
      onDone(`✓ ${nombre}: ${r.registradas} unidad(es) registrada(s).`);
      setTerm("");
    } catch (e) {
      onDone(e instanceof Error ? e.message : "Error.");
    }
  }

  return (
    <div className="max-w-md space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Nombre o correo del propietario…"
          className="pl-9"
        />
      </div>
      {term.trim().length >= 2 ? (
        <div className="space-y-1">
          {results === undefined ? (
            <Spinner className="my-2 h-4 w-4" />
          ) : results.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin resultados.</p>
          ) : (
            results.map((u) => (
              <button
                key={u._id}
                type="button"
                onClick={() => reg(u._id, u.name)}
                className="flex w-full items-center justify-between rounded-lg border border-border p-2.5 text-left text-sm hover:bg-accent"
              >
                <span>
                  <span className="font-medium text-foreground">{u.name}</span>{" "}
                  <span className="text-xs text-muted-foreground">{u.email}</span>
                </span>
                <Check className="h-4 w-4 text-brand" />
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats: string[] }) => {
      detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
    };
  }
}

function WebQrScanner({
  asambleaId,
  onDone,
}: {
  asambleaId: Id<"asambleas">;
  onDone: (msg: string) => void;
}) {
  const registrar = useMutation(api.asambleas.registrarAsistenciaAdmin);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const lock = useRef(false);

  useEffect(() => {
    const ok = typeof window !== "undefined" && typeof window.BarcodeDetector === "function";
    setSupported(ok);
    if (!ok) return;

    let stream: MediaStream | null = null;
    let raf = 0;
    let alive = true;
    const detector = new window.BarcodeDetector!({ formats: ["qr_code"] });

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        const video = videoRef.current;
        if (!video || !alive) return;
        video.srcObject = stream;
        await video.play();

        const tick = async () => {
          if (!alive || !videoRef.current) return;
          if (!lock.current && videoRef.current.readyState >= 2) {
            try {
              const codes = await detector.detect(videoRef.current);
              const raw = codes[0]?.rawValue;
              if (raw) {
                lock.current = true;
                try {
                  const parsed = JSON.parse(raw) as { asambleaId?: string; userId?: string };
                  if (!parsed.userId || !parsed.asambleaId) throw new Error("QR inválido.");
                  if (parsed.asambleaId !== asambleaId) throw new Error("Este QR es de otra asamblea.");
                  const r = await registrar({
                    asambleaId,
                    userId: parsed.userId as Id<"users">,
                  });
                  onDone(`✓ ${r.nombre}: ${r.registradas} unidad(es)`);
                  setError(null);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "No se pudo registrar.");
                } finally {
                  setTimeout(() => { lock.current = false; }, 2000);
                }
              }
            } catch {
              /* frame skip */
            }
          }
          raf = requestAnimationFrame(() => { void tick(); });
        };
        raf = requestAnimationFrame(() => { void tick(); });
      } catch {
        setError("No se pudo abrir la cámara. Revisa permisos del navegador.");
      }
    }

    void start();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [asambleaId, onDone, registrar]);

  if (supported === false) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-300">
        Tu navegador no soporta escaneo QR nativo. Usa <b>Código</b> o <b>Buscar</b>, o abre Chrome/Edge.
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-3">
      <div className="relative aspect-video overflow-hidden rounded-xl border border-border bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-2 border-white/80" />
      </div>
      <p className="text-center text-xs text-muted-foreground">Apunta al QR del propietario en la app móvil</p>
      {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
