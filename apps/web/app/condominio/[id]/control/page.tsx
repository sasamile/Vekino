"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import {
  ShieldCheck, BookOpenCheck, Timer, AlertTriangle, Settings2, Search, Plus,
  Loader2, Trash2, Eye, Download, Footprints, ClipboardCheck, Paperclip,
} from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id, Doc } from "@vekino/backend/dataModel";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/layout/stat-card";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Modulo = Doc<"minutaEventos">["modulo"];

const MODULO_META: Record<Modulo, { label: string; tone: React.ComponentProps<typeof Badge>["tone"] }> = {
  visitantes: { label: "Visitantes", tone: "info" },
  paqueteria: { label: "Paquetería", tone: "neutral" },
  reservas:   { label: "Reservas", tone: "brand" },
  novedades:  { label: "Novedades", tone: "destructive" },
  minuta:     { label: "Minuta", tone: "primary" },
};

function fmtFechaHora(ts?: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const TABS = [
  { key: "minuta", label: "Minuta digital", icon: BookOpenCheck },
  { key: "turnos", label: "Turnos", icon: Timer },
  { key: "novedades", label: "Novedades", icon: AlertTriangle },
  { key: "config", label: "Configuración", icon: Settings2 },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function ControlGuardiaPage() {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;
  const [tab, setTab] = useState<TabKey>("minuta");

  const turnoActivo = useQuery(api.guardia.turnoActivo, { condominioId });
  const minuta = useQuery(api.guardia.listMinuta, { condominioId, limit: 200 });

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          title="Control de Guardia"
          description="Minuta digital, turnos y configuración de portería"
        />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            icon={ShieldCheck}
            label="Turno actual"
            value={turnoActivo ? turnoActivo.guardiaNombre.split(" ")[0] ?? "Abierto" : "Sin turno"}
            tone={turnoActivo ? "success" : "neutral"}
          />
          <StatCard icon={BookOpenCheck} label="Eventos en minuta" value={minuta?.length ?? 0} tone="primary" />
          <StatCard icon={Footprints} label="Rondas del turno" value={turnoActivo?.rondasCount ?? 0} tone="brand" />
          <StatCard
            icon={AlertTriangle}
            label="Incidentes (minuta)"
            value={(minuta ?? []).filter((e) => e.modulo === "novedades").length}
            tone="destructive"
          />
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-accent",
                )}
              >
                <Icon className="h-4 w-4" /> {t.label}
              </button>
            );
          })}
        </nav>

        {tab === "minuta" && <MinutaTab minuta={minuta} />}
        {tab === "turnos" && <TurnosTab condominioId={condominioId} />}
        {tab === "novedades" && <NovedadesTab condominioId={condominioId} />}
        {tab === "config" && <ConfigTab condominioId={condominioId} />}
      </div>
    </PageContainer>
  );
}

/* ───────── Minuta (auditoría) ───────── */
function MinutaTab({ minuta }: { minuta: Doc<"minutaEventos">[] | undefined }) {
  const [moduloFiltro, setModuloFiltro] = useState<"" | Modulo>("");
  const [buscar, setBuscar] = useState("");

  const filtrados = (minuta ?? []).filter((e) => {
    if (moduloFiltro && e.modulo !== moduloFiltro) return false;
    if (buscar.trim()) {
      const q = buscar.toLowerCase();
      return `${e.resumen} ${e.unidad} ${e.tipo} ${e.actorNombre}`.toLowerCase().includes(q);
    }
    return true;
  });

  function exportarCSV() {
    const filas = [
      ["Fecha", "Módulo", "Tipo", "Unidad", "Resumen", "Actor", "Estado"],
      ...filtrados.map((e) => [
        new Date(e.createdAt).toLocaleString("es-CO"),
        MODULO_META[e.modulo].label, e.tipo, e.unidad,
        e.resumen.replace(/"/g, '""'), e.actorNombre, e.estado,
      ]),
    ];
    const csv = filas.map((f) => f.map((c) => `"${c}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "minuta-digital.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar en la minuta" className="pl-9" />
        </div>
        <div className="flex gap-2">
          <Select value={moduloFiltro} onChange={(e) => setModuloFiltro(e.target.value as "" | Modulo)} className="w-44">
            <option value="">Todos los módulos</option>
            {(Object.keys(MODULO_META) as Modulo[]).map((m) => (
              <option key={m} value={m}>{MODULO_META[m].label}</option>
            ))}
          </Select>
          <Button variant="outline" onClick={exportarCSV} disabled={filtrados.length === 0}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      </div>

      {minuta === undefined ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : filtrados.length === 0 ? (
        <EmptyState icon={BookOpenCheck} title="Minuta vacía" description="Cada acción de portería queda registrada aquí automáticamente." />
      ) : (
        <Card className="divide-y divide-border p-0">
          {filtrados.map((e) => {
            const meta = MODULO_META[e.modulo];
            return (
              <div key={e._id} className="flex items-start gap-3 px-4 py-3">
                <div className="w-24 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">{fmtFechaHora(e.createdAt)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    <span className="text-xs font-medium text-foreground">{e.tipo}</span>
                    {e.unidad && e.unidad !== "—" && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{e.unidad}</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-foreground">{e.resumen}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{e.actorNombre}</p>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

/* ───────── Turnos (historial + detalle) ───────── */
function TurnosTab({ condominioId }: { condominioId: Id<"condominios"> }) {
  const turnos = useQuery(api.guardia.listTurnos, { condominioId });
  const [detalleId, setDetalleId] = useState<Id<"guardiaTurnos"> | null>(null);

  return (
    <div className="space-y-3">
      {turnos === undefined ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : turnos.length === 0 ? (
        <EmptyState icon={Timer} title="Sin turnos registrados" description="Cuando los guardias inicien turno, quedarán aquí con su checklist y rondas." />
      ) : (
        <Card className="divide-y divide-border p-0">
          {turnos.map((t) => (
            <div key={t._id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">
                    {t.guardiaNombre}
                    {t.guardiaSecundarioNombre && <span className="text-muted-foreground"> + {t.guardiaSecundarioNombre}</span>}
                  </p>
                  <Badge tone={t.estado === "abierto" ? "success" : "neutral"}>{t.estado === "abierto" ? "Abierto" : "Cerrado"}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {fmtFechaHora(t.fechaInicio)} → {t.fechaCierre ? fmtFechaHora(t.fechaCierre) : "en curso"}
                  <span className="ml-2">· {t.checklistCount} checklist · {t.rondasCount} rondas</span>
                  {t.recibe && <span className="ml-2">· Recibió: {t.recibe}</span>}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setDetalleId(t._id)}>
                <Eye className="h-4 w-4" /> Detalle
              </Button>
            </div>
          ))}
        </Card>
      )}

      {detalleId && <TurnoDetalleModal turnoId={detalleId} onClose={() => setDetalleId(null)} />}
    </div>
  );
}

function TurnoDetalleModal({ turnoId, onClose }: { turnoId: Id<"guardiaTurnos">; onClose: () => void }) {
  const turno = useQuery(api.guardia.getTurno, { turnoId });

  function exportarCSV() {
    if (!turno) return;
    const filas: string[][] = [
      ["Sección", "Detalle 1", "Detalle 2", "Detalle 3"],
      ["Turno", turno.guardiaNombre, fmtFechaHora(turno.fechaInicio), turno.fechaCierre ? fmtFechaHora(turno.fechaCierre) : "en curso"],
      ...(turno.guardiaSecundarioNombre ? [["Turno compartido", turno.guardiaSecundarioNombre, "", ""]] : []),
      ...(turno.consignas ? [["Consignas", turno.consignas, `Recibe: ${turno.recibe ?? ""}`, turno.observacionesCierre ?? ""]] : []),
      ...turno.checklist.map((c) => ["Checklist", c.item, `${c.cantidadEncontrada}/${c.cantidadEsperada}`, c.estadoOk ? "OK" : `NOVEDAD ${c.observacion ?? ""}`]),
      ...turno.rondas.map((r) => ["Ronda", r.zona, fmtFechaHora(r.createdAt), r.novedad ?? "Sin novedad"]),
      ...turno.eventos.map((e) => ["Evento", `${MODULO_META[e.modulo].label} / ${e.tipo}`, fmtFechaHora(e.createdAt), e.resumen]),
    ];
    const csv = filas.map((f) => f.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `turno-${turno.guardiaNombre.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Modal
      open onClose={onClose}
      title="Detalle del turno"
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
          <Button variant="outline" size="sm" onClick={exportarCSV} disabled={!turno}>
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
        </>
      }
    >
      {turno === undefined ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : turno === null ? (
        <p className="text-sm text-muted-foreground">Turno no encontrado.</p>
      ) : (
        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          <div className="rounded-xl bg-muted/40 p-3 text-sm">
            <p className="font-semibold text-foreground">
              {turno.guardiaNombre}
              {turno.guardiaSecundarioNombre && <span className="text-muted-foreground"> · compartido con {turno.guardiaSecundarioNombre}</span>}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {fmtFechaHora(turno.fechaInicio)} → {turno.fechaCierre ? fmtFechaHora(turno.fechaCierre) : "en curso"}
            </p>
            {turno.observacionesInicio && <p className="mt-1 text-xs text-muted-foreground">Inicio: {turno.observacionesInicio}</p>}
            {turno.consignas && (
              <div className="mt-2 rounded-lg bg-card p-2 text-xs">
                <p><span className="font-medium text-foreground">Consignas:</span> {turno.consignas}</p>
                <p className="mt-0.5"><span className="font-medium text-foreground">Recibió:</span> {turno.recibe}</p>
                {turno.observacionesCierre && <p className="mt-0.5 text-muted-foreground">{turno.observacionesCierre}</p>}
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <ClipboardCheck className="h-3.5 w-3.5" /> Checklist de dotación
            </p>
            <div className="space-y-1.5">
              {turno.checklist.map((c, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="text-foreground">{c.item}</span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums text-muted-foreground">{c.cantidadEncontrada}/{c.cantidadEsperada}</span>
                    <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", c.estadoOk ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600")}>
                      {c.estadoOk ? "OK" : c.observacion || "Novedad"}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Footprints className="h-3.5 w-3.5" /> Rondas ({turno.rondas.length})
            </p>
            {turno.rondas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin rondas registradas.</p>
            ) : (
              <div className="space-y-2">
                {turno.rondas.map((r) => (
                  <div key={r._id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">{r.zona}</span>
                      <span className="text-xs text-muted-foreground">{fmtFechaHora(r.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{r.novedad ?? "Sin novedad"}</p>
                    {r.fotoUrls.length > 0 && (
                      <div className="mt-2 flex gap-2 overflow-x-auto">
                        {r.fotoUrls.map((u, i) => (
                          <a key={i} href={u} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={u} alt={`Ronda ${r.zona}`} className="h-16 w-16 rounded-lg object-cover ring-1 ring-border" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ───────── Novedades (reportes del guardia) ───────── */
function NovedadesTab({ condominioId }: { condominioId: Id<"condominios"> }) {
  const reportes = useQuery(api.guardia.listNovedadReportes, { condominioId });

  const PRIORIDAD_CLS: Record<string, string> = {
    baja: "bg-slate-500/10 text-slate-600",
    media: "bg-amber-500/10 text-amber-600",
    alta: "bg-red-500/10 text-red-600",
  };

  return reportes === undefined ? (
    <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
  ) : reportes.length === 0 ? (
    <EmptyState icon={AlertTriangle} title="Sin novedades" description="Los incidentes reportados por los guardias aparecerán aquí." />
  ) : (
    <div className="space-y-3">
      {reportes.map((n) => (
        <Card key={n._id} className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-foreground">{n.titulo}</p>
            <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", PRIORIDAD_CLS[n.prioridad])}>
              {n.prioridad.toUpperCase()}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-line text-sm text-foreground">{n.descripcion}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{n.reportadoPorNombre}</span>
            <span>·</span>
            <span>{fmtFechaHora(n.createdAt)}</span>
            {n.archivoUrl && (
              <a href={n.archivoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
                <Paperclip className="h-3 w-3" /> {n.archivoNombre ?? "Adjunto"}
              </a>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ───────── Configuración (catálogos) ───────── */
function ConfigTab({ condominioId }: { condominioId: Id<"condominios"> }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChecklistConfig condominioId={condominioId} />
      <ZonasConfig condominioId={condominioId} />
    </div>
  );
}

function ChecklistConfig({ condominioId }: { condominioId: Id<"condominios"> }) {
  const items = useQuery(api.guardia.listChecklistTemplate, { condominioId });
  const create = useMutation(api.guardia.createChecklistTemplate);
  const update = useMutation(api.guardia.updateChecklistTemplate);
  const remove = useMutation(api.guardia.removeChecklistTemplate);

  const [nombre, setNombre] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [busy, setBusy] = useState(false);

  async function agregar() {
    if (!nombre.trim()) return;
    setBusy(true);
    try {
      await create({ condominioId, nombre, obligatorio: true, cantidadEsperada: Number(cantidad) || 1, orden: (items?.length ?? 0) + 1 });
      setNombre(""); setCantidad("1");
    } finally { setBusy(false); }
  }

  return (
    <Card className="p-5">
      <h3 className="mb-1 flex items-center gap-2 font-semibold text-foreground">
        <ClipboardCheck className="h-4 w-4 text-brand" /> Checklist de inicio de turno
      </h3>
      <p className="mb-3 text-xs text-muted-foreground">Dotación que el guardia verifica al recibir la portería.</p>
      <div className="mb-3 flex gap-2">
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Linterna" className="flex-1" />
        <Input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="w-16 text-center" aria-label="Cantidad" />
        <Button onClick={agregar} disabled={!nombre.trim() || busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>
      {items === undefined ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : items.length === 0 ? (
        <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">Sin ítems. El guardia verá un checklist básico por defecto.</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((it) => (
            <div key={it._id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <span className={cn("flex-1", !it.activo && "text-muted-foreground line-through")}>{it.nombre}</span>
              <span className="tabular-nums text-xs text-muted-foreground">×{it.cantidadEsperada}</span>
              <button
                onClick={() => update({ id: it._id, activo: !it.activo })}
                className={cn("rounded px-2 py-0.5 text-[11px] font-semibold", it.activo ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground")}
              >
                {it.activo ? "Activo" : "Inactivo"}
              </button>
              <button onClick={() => remove({ id: it._id })} aria-label="Eliminar" className="rounded p-1 text-muted-foreground hover:text-red-600">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ZonasConfig({ condominioId }: { condominioId: Id<"condominios"> }) {
  const zonas = useQuery(api.guardia.listRondaZonas, { condominioId });
  const create = useMutation(api.guardia.createRondaZona);
  const update = useMutation(api.guardia.updateRondaZona);
  const remove = useMutation(api.guardia.removeRondaZona);

  const [nombre, setNombre] = useState("");
  const [busy, setBusy] = useState(false);

  async function agregar() {
    if (!nombre.trim()) return;
    setBusy(true);
    try {
      await create({ condominioId, nombre, orden: (zonas?.length ?? 0) + 1 });
      setNombre("");
    } finally { setBusy(false); }
  }

  return (
    <Card className="p-5">
      <h3 className="mb-1 flex items-center gap-2 font-semibold text-foreground">
        <Footprints className="h-4 w-4 text-brand" /> Zonas de ronda
      </h3>
      <p className="mb-3 text-xs text-muted-foreground">Puntos de inspección para las rondas de control.</p>
      <div className="mb-3 flex gap-2">
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Perímetro exterior" className="flex-1" />
        <Button onClick={agregar} disabled={!nombre.trim() || busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>
      {zonas === undefined ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : zonas.length === 0 ? (
        <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">Sin zonas. El guardia podrá escribir la zona manualmente.</p>
      ) : (
        <div className="space-y-1.5">
          {zonas.map((z) => (
            <div key={z._id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <span className={cn("flex-1", !z.activa && "text-muted-foreground line-through")}>{z.nombre}</span>
              <button
                onClick={() => update({ id: z._id, activa: !z.activa })}
                className={cn("rounded px-2 py-0.5 text-[11px] font-semibold", z.activa ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground")}
              >
                {z.activa ? "Activa" : "Inactiva"}
              </button>
              <button onClick={() => remove({ id: z._id })} aria-label="Eliminar" className="rounded p-1 text-muted-foreground hover:text-red-600">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

