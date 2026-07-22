"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { Scanner } from "@yudiel/react-qr-scanner";
import {
  UserCheck, LogIn, LogOut, Loader2, Car, Search, DoorOpen, Clock,
  QrCode, UserPlus, ListChecks, CheckCircle2, Phone,
} from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id, Doc } from "@vekino/backend/dataModel";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Vis = Doc<"visitantes">;
type FiltroActividad = "activo" | "esperando_aprobacion" | "finalizado";

const TIPO_LABEL: Record<Vis["tipo"], string> = {
  visitante: "Visitante", empresa: "Empresa", domicilio: "Domicilio",
};

function fmtHora(ts?: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Extrae el id del visitante del contenido del QR (JSON {id} o id crudo). */
function parseQr(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const data = JSON.parse(text) as { id?: string };
    if (data && typeof data.id === "string") return data.id;
  } catch { /* id crudo */ }
  return text;
}

export default function GuardiaVisitantesPage() {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;
  const visitantes = useQuery(api.guardia.listVisitantes, { condominioId });

  const [tab, setTab] = useState<"escanear" | "registrar" | "actividad">("escanear");

  const adentro = visitantes?.filter((v) => v.estado === "activo").length ?? 0;
  const porAprobar = visitantes?.filter((v) => v.estado === "esperando_aprobacion").length ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
            <UserCheck className="h-5 w-5 text-brand" /> Control de acceso
          </h1>
          <p className="text-sm text-muted-foreground">
            Escanea el QR al llegar. Si no trae QR, registra y espera la aceptación del residente.
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 font-medium text-emerald-600">
            <DoorOpen className="h-3.5 w-3.5" /> {adentro} adentro
          </span>
          {porAprobar > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 font-medium text-amber-600">
              <Clock className="h-3.5 w-3.5" /> {porAprobar} por aprobar
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
        {([
          ["escanear", "Escanear QR", QrCode],
          ["registrar", "Sin QR", UserPlus],
          ["actividad", "En el conjunto", ListChecks],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors",
              tab === key ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-accent",
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "escanear" && <EscanearTab />}
      {tab === "registrar" && <RegistrarTab condominioId={condominioId} />}
      {tab === "actividad" && <ActividadTab visitantes={visitantes} />}
    </div>
  );
}

/* ───────── En el conjunto (adentro / por aprobar / historial) ───────── */
function ActividadTab({ visitantes }: { visitantes: Vis[] | undefined }) {
  const [filtro, setFiltro] = useState<FiltroActividad>("activo");
  const [buscar, setBuscar] = useState("");

  const filtrados = (visitantes ?? [])
    .filter((v) => v.estado === filtro)
    .filter((v) => {
      if (!buscar.trim()) return true;
      const q = buscar.toLowerCase();
      return `${v.nombre} ${v.documento} ${v.unidadNumero ?? ""} ${v.placa ?? ""}`.toLowerCase().includes(q);
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex gap-1 rounded-xl bg-muted p-1">
          {([
            ["activo", "Adentro"],
            ["esperando_aprobacion", "Por aprobar"],
            ["finalizado", "Historial"],
          ] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFiltro(val)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                filtro === val ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Nombre, documento, unidad o placa" className="pl-9" />
        </div>
      </div>

      {visitantes === undefined ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title={
            filtro === "activo"
              ? "Nadie adentro"
              : filtro === "esperando_aprobacion"
                ? "Sin solicitudes pendientes"
                : "Sin historial"
          }
          description={
            filtro === "esperando_aprobacion"
              ? "Los walk-in esperan la aceptación del residente en la app."
              : "Los ingresos quedan en la minuta digital."
          }
        />
      ) : (
        <div className="space-y-3">
          {filtrados.map((v) => <VisitanteCard key={v._id} v={v} />)}
        </div>
      )}
    </div>
  );
}

function VisitanteCard({ v }: { v: Vis }) {
  const salida = useMutation(api.guardia.registrarSalida);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function marcarSalida() {
    setBusy(true); setError(null);
    try { await salida({ id: v._id }); }
    catch (e) { setError(e instanceof Error ? e.message : "Error"); }
    finally { setBusy(false); }
  }

  const badge =
    v.estado === "activo"
      ? { tone: "success" as const, label: "Adentro" }
      : v.estado === "esperando_aprobacion"
        ? { tone: "warning" as const, label: "Esperando residente" }
        : { tone: "neutral" as const, label: "Salió" };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-foreground">{v.nombre}</p>
            <Badge tone={badge.tone}>{badge.label}</Badge>
            <Badge tone="info">{TIPO_LABEL[v.tipo]}</Badge>
            {v.registradoPorGuardia && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">Portería</span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{v.tipoDocumento} {v.documento}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {v.unidadNumero && (
              <span className="rounded-md bg-muted px-2 py-0.5 font-medium text-foreground">
                Unidad {v.unidadNumero}
              </span>
            )}
            {v.placa && (
              <span className="inline-flex items-center gap-1">
                <Car className="h-3 w-3" /> {v.placa}
              </span>
            )}
            {v.fechaIngreso && <span>Entró: {fmtHora(v.fechaIngreso)}</span>}
            {v.fechaSalida && <span>Salió: {fmtHora(v.fechaSalida)}</span>}
          </div>
          {v.estado === "esperando_aprobacion" && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <Phone className="h-3.5 w-3.5" />
              Llama o avisa al residente para que acepte el ingreso en la app.
            </p>
          )}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>

        {v.estado === "activo" && (
          <Button size="sm" variant="outline" onClick={marcarSalida} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} Salida
          </Button>
        )}
      </div>
    </Card>
  );
}

/* ───────── Registrar walk-in (requiere aceptación del dueño) ───────── */
function RegistrarTab({ condominioId }: { condominioId: Id<"condominios"> }) {
  const registrar = useMutation(api.guardia.registrarDirecto);
  const [unidadNumero, setUnidadNumero] = useState("");
  const [nombre, setNombre] = useState("");
  const [documento, setDocumento] = useState("");
  const [tipoDocumento, setTipoDocumento] = useState<Vis["tipoDocumento"]>("CC");
  const [tipo, setTipo] = useState<Vis["tipo"]>("visitante");
  const [placa, setPlaca] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const valid = nombre.trim() && documento.trim() && unidadNumero.trim();

  async function save() {
    if (!valid) return;
    setBusy(true); setError(null); setOk(false);
    try {
      await registrar({
        condominioId, unidadNumero, nombre, documento, tipoDocumento, tipo,
        placa: placa || undefined, observaciones: observaciones || undefined,
      });
      setOk(true);
      setUnidadNumero(""); setNombre(""); setDocumento(""); setPlaca(""); setObservaciones("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al registrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Antes de dejar pasar</p>
        <p className="mt-0.5">
          Llama o avisa al dueño de la unidad. Al registrar, la solicitud queda{" "}
          <strong className="text-foreground">esperando su aceptación</strong> en la app.
          Solo entonces el visitante queda adentro y en la minuta.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Nombre completo *</label>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del visitante" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Tipo doc.</label>
            <Select value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value as Vis["tipoDocumento"])}>
              <option value="CC">CC</option><option value="CE">CE</option>
              <option value="NIT">NIT</option><option value="PASAPORTE">Pasaporte</option><option value="OTRO">Otro</option>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Documento *</label>
            <Input value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="Número" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-foreground">Unidad que visita *</label>
          <Input value={unidadNumero} onChange={(e) => setUnidadNumero(e.target.value)} placeholder="Ej. 409" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Tipo</label>
            <Select value={tipo} onChange={(e) => setTipo(e.target.value as Vis["tipo"])}>
              <option value="visitante">Visitante</option>
              <option value="empresa">Empresa</option>
              <option value="domicilio">Domicilio</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">Placa</label>
            <Input value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} placeholder="ABC123" />
          </div>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <label className="block text-xs font-medium text-foreground">Observaciones</label>
          <Input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Notas (opcional)" />
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      {ok && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-emerald-600">
          <CheckCircle2 className="h-4 w-4" /> Solicitud enviada. Espera la aceptación del residente.
        </p>
      )}
      <Button className="mt-4 w-full sm:w-auto" onClick={save} disabled={!valid || busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} Solicitar autorización
      </Button>
    </Card>
  );
}

/* ───────── Escanear QR ───────── */
function EscanearTab() {
  const ingreso = useMutation(api.guardia.registrarIngreso);
  const salida = useMutation(api.guardia.registrarSalida);
  const [pausado, setPausado] = useState(false);
  const [mensaje, setMensaje] = useState<{ tone: "ok" | "error"; texto: string } | null>(null);
  const [salidaPendiente, setSalidaPendiente] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);

  async function procesar(idRaw: string) {
    const id = parseQr(idRaw);
    if (!id || busy) return;
    setBusy(true); setPausado(true); setMensaje(null);
    try {
      await ingreso({ id: id as Id<"visitantes"> });
      setMensaje({ tone: "ok", texto: "Ingreso registrado. Bienvenido." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("YA_ACTIVO")) {
        setSalidaPendiente(id);
      } else if (msg.includes("expiró") || msg.includes("ya no es válido") || msg.includes("Genera un QR")) {
        setMensaje({ tone: "error", texto: msg });
      } else if (msg.includes("fecha futura") || msg.includes("autorizado")) {
        setMensaje({ tone: "error", texto: msg });
      } else {
        setMensaje({
          tone: "error",
          texto: msg || "Código no reconocido. Verifica el QR o usa el registro sin QR.",
        });
      }
    } finally {
      setBusy(false);
      setTimeout(() => setPausado(false), 1600);
    }
  }

  async function confirmarSalida() {
    if (!salidaPendiente) return;
    setBusy(true);
    try {
      await salida({ id: salidaPendiente as Id<"visitantes"> });
      setMensaje({ tone: "ok", texto: "Salida registrada. ¡Hasta pronto!" });
    } catch {
      setMensaje({ tone: "error", texto: "No se pudo registrar la salida." });
    } finally {
      setSalidaPendiente(null);
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="overflow-hidden p-0">
        <div className="aspect-square w-full bg-slate-950 [&_video]:h-full [&_video]:w-full [&_video]:object-cover">
          <Scanner
            onScan={(codes) => {
              const raw = codes[0]?.rawValue;
              if (raw && !pausado) void procesar(raw);
            }}
            onError={() => setMensaje({ tone: "error", texto: "No se pudo acceder a la cámara. Revisa permisos del navegador." })}
            paused={pausado}
            components={{ finder: true }}
            sound={false}
          />
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="p-5">
          <h3 className="mb-1 font-semibold text-foreground">Escaneo de acceso</h3>
          <p className="text-sm text-muted-foreground">
            El visitante presenta el QR que le generó el propietario{" "}
            <strong className="text-foreground">para hoy</strong>. Primer escaneo = ingreso;
            si ya está adentro, puedes registrar la salida. Los QR de días pasados no sirven.
          </p>
          {mensaje && (
            <p className={cn(
              "mt-3 rounded-lg p-3 text-sm font-medium",
              mensaje.tone === "ok" ? "bg-emerald-500/10 text-emerald-700" : "bg-red-500/10 text-red-600",
            )}>
              {mensaje.texto}
            </p>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Código manual</h3>
          <div className="flex gap-2">
            <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Pega el código del QR" />
            <Button variant="outline" onClick={() => { void procesar(manual); setManual(""); }} disabled={!manual.trim() || busy}>
              Validar
            </Button>
          </div>
        </Card>
      </div>

      {salidaPendiente && (
        <Modal
          open onClose={() => setSalidaPendiente(null)}
          title="Visitante dentro del conjunto"
          className="max-w-sm"
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setSalidaPendiente(null)} disabled={busy}>Cancelar</Button>
              <Button size="sm" onClick={confirmarSalida} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} Registrar salida
              </Button>
            </>
          }
        >
          <p className="text-sm text-muted-foreground">
            Este visitante ya tiene un ingreso activo. ¿Deseas registrar su salida?
          </p>
        </Modal>
      )}
    </div>
  );
}
