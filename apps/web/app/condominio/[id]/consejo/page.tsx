"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import {
  Users2, Plus, Trash2, Loader2, Phone, Mail, Home,
  Crown, CalendarClock, FileText, Power,
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
import { cn, initials } from "@/lib/utils";

type Cargo = "presidente" | "vicepresidente" | "secretario" | "tesorero" | "vocal" | "fiscal" | "suplente";
type TipoSesion = "ordinaria" | "extraordinaria";

const CARGO_META: Record<Cargo, { label: string; tone: React.ComponentProps<typeof Badge>["tone"]; rank: number }> = {
  presidente:     { label: "Presidente",      tone: "brand",   rank: 1 },
  vicepresidente: { label: "Vicepresidente",  tone: "primary", rank: 2 },
  secretario:     { label: "Secretario",      tone: "info",    rank: 3 },
  tesorero:       { label: "Tesorero",        tone: "success", rank: 4 },
  fiscal:         { label: "Fiscal",          tone: "warning", rank: 5 },
  vocal:          { label: "Vocal",           tone: "neutral", rank: 6 },
  suplente:       { label: "Suplente",        tone: "neutral", rank: 7 },
};

function fmtFecha(s: string) {
  const parts = s.split("-");
  const y = Number(parts[0] ?? 2026);
  const m = Number(parts[1] ?? 1);
  const d = Number(parts[2] ?? 1);
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
}

export default function ConsejoPage() {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;
  const [tab, setTab] = useState<"miembros" | "sesiones">("miembros");

  const miembros = useQuery(api.consejo.listMiembros, { condominioId });
  const sesiones = useQuery(api.consejo.listSesiones, { condominioId });

  const [miembroForm, setMiembroForm] = useState(false);
  const [sesionForm, setSesionForm] = useState(false);
  const [deleteMiembro, setDeleteMiembro] = useState<Id<"consejoMiembros"> | null>(null);
  const [deleteSesion, setDeleteSesion] = useState<Id<"consejoSesiones"> | null>(null);

  const activos = miembros?.filter((m) => m.activo).length ?? 0;
  const sorted = [...(miembros ?? [])].sort((a, b) => {
    if (a.activo !== b.activo) return a.activo ? -1 : 1;
    return CARGO_META[a.cargo as Cargo].rank - CARGO_META[b.cargo as Cargo].rank;
  });

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          title="Consejo administrativo"
          description="Miembros del consejo y actas de sus sesiones"
          action={
            tab === "miembros" ? (
              <Button onClick={() => setMiembroForm(true)}><Plus className="h-4 w-4" />Nuevo miembro</Button>
            ) : (
              <Button onClick={() => setSesionForm(true)}><Plus className="h-4 w-4" />Nueva sesión</Button>
            )
          }
        />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard icon={Users2} label="Miembros activos" value={activos} tone="primary" />
          <StatCard icon={Crown} label="Total registrados" value={miembros?.length ?? 0} tone="brand" />
          <StatCard icon={CalendarClock} label="Sesiones" value={sesiones?.length ?? 0} tone="success" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl border border-border bg-muted/40 p-1">
          {(["miembros", "sesiones"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 rounded-lg px-3 py-2 text-sm font-medium capitalize transition-colors",
                tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "miembros" ? "Miembros" : "Sesiones"}
            </button>
          ))}
        </div>

        {tab === "miembros" ? (
          miembros === undefined ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
            </div>
          ) : miembros.length === 0 ? (
            <EmptyState
              icon={Users2}
              title="Sin miembros"
              description="Registra a los integrantes del consejo administrativo."
              action={<Button size="sm" onClick={() => setMiembroForm(true)}><Plus className="h-4 w-4" />Nuevo miembro</Button>}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sorted.map((m) => (
                <MiembroCard key={m._id} m={m} onDelete={() => setDeleteMiembro(m._id)} />
              ))}
            </div>
          )
        ) : (
          sesiones === undefined ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
          ) : sesiones.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="Sin sesiones"
              description="Registra las actas de las reuniones del consejo."
              action={<Button size="sm" onClick={() => setSesionForm(true)}><Plus className="h-4 w-4" />Nueva sesión</Button>}
            />
          ) : (
            <div className="space-y-3">
              {sesiones.map((s) => (
                <SesionCard key={s._id} s={s} onDelete={() => setDeleteSesion(s._id)} />
              ))}
            </div>
          )
        )}
      </div>

      {miembroForm && <MiembroForm condominioId={condominioId} onClose={() => setMiembroForm(false)} />}
      {sesionForm && <SesionForm condominioId={condominioId} onClose={() => setSesionForm(false)} />}
      {deleteMiembro && <DeleteMiembroDialog id={deleteMiembro} onClose={() => setDeleteMiembro(null)} />}
      {deleteSesion && <DeleteSesionDialog id={deleteSesion} onClose={() => setDeleteSesion(null)} />}
    </PageContainer>
  );
}

function MiembroCard({
  m,
  onDelete,
}: {
  m: {
    _id: Id<"consejoMiembros">;
    nombre: string; cargo: Cargo; activo: boolean;
    unidadNumero?: string; telefono?: string; email?: string;
    periodoInicio?: string; periodoFin?: string;
  };
  onDelete: () => void;
}) {
  const toggle = useMutation(api.consejo.toggleMiembro);
  const meta = CARGO_META[m.cargo];

  return (
    <Card className={cn("group flex flex-col p-5", !m.activo && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold",
            meta.tone === "brand" && "bg-brand/15 text-brand",
            meta.tone === "primary" && "bg-primary/10 text-primary",
            meta.tone === "info" && "bg-sky-500/10 text-sky-600 dark:text-sky-400",
            meta.tone === "success" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
            meta.tone === "warning" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
            meta.tone === "neutral" && "bg-muted text-muted-foreground",
          )}>
            {initials(m.nombre)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{m.nombre}</p>
            <Badge tone={meta.tone} className="mt-0.5">{m.cargo === "presidente" && <Crown className="h-3 w-3" />}{meta.label}</Badge>
          </div>
        </div>
        <button
          onClick={onDelete}
          aria-label="Eliminar miembro"
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex-1 space-y-1.5 text-sm text-muted-foreground">
        {m.unidadNumero && (
          <div className="flex items-center gap-2"><Home className="h-3.5 w-3.5 shrink-0" />Unidad {m.unidadNumero}</div>
        )}
        {m.telefono && (
          <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 shrink-0" />{m.telefono}</div>
        )}
        {m.email && (
          <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{m.email}</span></div>
        )}
        {(m.periodoInicio || m.periodoFin) && (
          <div className="flex items-center gap-2">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
            {m.periodoInicio ?? "—"} → {m.periodoFin ?? "—"}
          </div>
        )}
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <button
          onClick={() => toggle({ id: m._id })}
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium transition-colors",
            m.activo ? "text-muted-foreground hover:text-red-600" : "text-emerald-600 hover:text-emerald-700",
          )}
        >
          <Power className="h-3.5 w-3.5" />
          {m.activo ? "Desactivar" : "Reactivar"}
        </button>
      </div>
    </Card>
  );
}

function SesionCard({
  s,
  onDelete,
}: {
  s: {
    _id: Id<"consejoSesiones">;
    titulo: string; tipo: TipoSesion; fecha: string;
    asistentes?: number; temas?: string; acuerdos?: string;
  };
  onDelete: () => void;
}) {
  return (
    <Card className="group p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <Badge tone={s.tipo === "extraordinaria" ? "violet" : "neutral"}>
              {s.tipo === "extraordinaria" ? "Extraordinaria" : "Ordinaria"}
            </Badge>
            <span className="text-xs capitalize text-muted-foreground">{fmtFecha(s.fecha)}</span>
            {s.asistentes != null && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Users2 className="h-3 w-3" />{s.asistentes} asistentes
              </span>
            )}
          </div>
          <h3 className="font-semibold text-foreground">{s.titulo}</h3>
        </div>
        <button
          onClick={onDelete}
          aria-label="Eliminar sesión"
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {(s.temas || s.acuerdos) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {s.temas && (
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />Temas tratados
              </p>
              <p className="whitespace-pre-line text-sm text-foreground">{s.temas}</p>
            </div>
          )}
          {s.acuerdos && (
            <div className="rounded-xl bg-emerald-500/5 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                <FileText className="h-3.5 w-3.5" />Acuerdos
              </p>
              <p className="whitespace-pre-line text-sm text-foreground">{s.acuerdos}</p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function MiembroForm({ condominioId, onClose }: { condominioId: Id<"condominios">; onClose: () => void }) {
  const create = useMutation(api.consejo.createMiembro);
  const [nombre, setNombre] = useState("");
  const [cargo, setCargo] = useState<Cargo>("vocal");
  const [unidadNumero, setUnidadNumero] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFin, setPeriodoFin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = nombre.trim().length > 0;

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await create({
        condominioId, nombre, cargo,
        unidadNumero: unidadNumero || undefined,
        telefono: telefono || undefined,
        email: email || undefined,
        periodoInicio: periodoInicio || undefined,
        periodoFin: periodoFin || undefined,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open onClose={onClose} title="Nuevo miembro del consejo"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button size="sm" onClick={save} disabled={!valid || busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Nombre completo</label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellido" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Cargo</label>
            <Select value={cargo} onChange={(e) => setCargo(e.target.value as Cargo)}>
              {(Object.keys(CARGO_META) as Cargo[]).sort((a, b) => CARGO_META[a].rank - CARGO_META[b].rank).map((c) => (
                <option key={c} value={c}>{CARGO_META[c].label}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Unidad <span className="text-muted-foreground">(opc.)</span></label>
            <Input value={unidadNumero} onChange={(e) => setUnidadNumero(e.target.value)} placeholder="Ej. 401" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Teléfono <span className="text-muted-foreground">(opc.)</span></label>
            <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="300 000 0000" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Email <span className="text-muted-foreground">(opc.)</span></label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Periodo inicio <span className="text-muted-foreground">(opc.)</span></label>
            <Input type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Periodo fin <span className="text-muted-foreground">(opc.)</span></label>
            <Input type="date" value={periodoFin} onChange={(e) => setPeriodoFin(e.target.value)} />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  );
}

function SesionForm({ condominioId, onClose }: { condominioId: Id<"condominios">; onClose: () => void }) {
  const create = useMutation(api.consejo.createSesion);
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<TipoSesion>("ordinaria");
  const [fecha, setFecha] = useState("");
  const [asistentes, setAsistentes] = useState("");
  const [temas, setTemas] = useState("");
  const [acuerdos, setAcuerdos] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = titulo.trim().length > 0 && fecha.length > 0;

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await create({
        condominioId, titulo, tipo, fecha,
        asistentes: asistentes ? Number(asistentes) : undefined,
        temas: temas || undefined,
        acuerdos: acuerdos || undefined,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open onClose={onClose} title="Nueva sesión del consejo" description="Registra el acta de la reunión"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button size="sm" onClick={save} disabled={!valid || busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Título</label>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Sesión de marzo" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Tipo</label>
            <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoSesion)}>
              <option value="ordinaria">Ordinaria</option>
              <option value="extraordinaria">Extraordinaria</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Fecha</label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Asistentes</label>
            <Input type="number" min={0} value={asistentes} onChange={(e) => setAsistentes(e.target.value)} placeholder="0" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Temas tratados <span className="text-muted-foreground">(opcional)</span></label>
          <Textarea value={temas} onChange={(e) => setTemas(e.target.value)} rows={3} placeholder="Puntos discutidos…" />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Acuerdos <span className="text-muted-foreground">(opcional)</span></label>
          <Textarea value={acuerdos} onChange={(e) => setAcuerdos(e.target.value)} rows={3} placeholder="Decisiones tomadas…" />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  );
}

function DeleteMiembroDialog({ id, onClose }: { id: Id<"consejoMiembros">; onClose: () => void }) {
  const remove = useMutation(api.consejo.removeMiembro);
  const [busy, setBusy] = useState(false);
  async function confirm() {
    setBusy(true);
    try { await remove({ id }); onClose(); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title="Eliminar miembro" className="max-w-sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="destructive" size="sm" onClick={confirm} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}Eliminar
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">El miembro se eliminará del consejo permanentemente.</p>
    </Modal>
  );
}

function DeleteSesionDialog({ id, onClose }: { id: Id<"consejoSesiones">; onClose: () => void }) {
  const remove = useMutation(api.consejo.removeSesion);
  const [busy, setBusy] = useState(false);
  async function confirm() {
    setBusy(true);
    try { await remove({ id }); onClose(); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title="Eliminar sesión" className="max-w-sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="destructive" size="sm" onClick={confirm} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}Eliminar
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">El acta de la sesión se eliminará permanentemente.</p>
    </Modal>
  );
}
