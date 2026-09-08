"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import {
  ShieldCheck,
  ArrowLeft,
  Users,
  FileText,
  UserPlus,
  Plus,
  UserMinus,
  CalendarOff,
  BookOpenCheck,
} from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { PageContainer } from "@/components/layout/page-container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { EstadoBadge, Campo } from "../page";

type Estado = "activa" | "suspendida" | "inactiva";
type RolCompania = "admin_compania" | "supervisor" | "guardia";
type RolAsignacion = "supervisor" | "guardia";

const ETIQUETA_ROL: Record<RolCompania, string> = {
  admin_compania: "Administrador",
  supervisor: "Supervisor",
  guardia: "Guarda",
};

/** `<input type="date">` → milisegundos de la medianoche local. */
function fechaAMs(valor: string): number {
  const [a, m, d] = valor.split("-").map(Number);
  return new Date(a ?? 1970, (m ?? 1) - 1, d ?? 1).getTime();
}

/** Milisegundos → `yyyy-mm-dd` local, para rellenar el input. */
function msAFecha(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fmt(ms: number | null): string {
  if (ms == null) return "indefinido";
  return new Date(ms).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const TONO_VIGENCIA = {
  vigente: "success",
  programada: "info",
  terminada: "neutral",
} as const;

export default function CompaniaDetallePage() {
  const params = useParams<{ id: string }>();
  const companiaId = params.id as Id<"companiasSeguridad">;
  const data = useQuery(api.companias.detail, { companiaId });
  const me = useQuery(api.users.me);
  const [tab, setTab] = useState<"personal" | "contratos">("personal");

  /* Firmar contratos y suspender la empresa son decisiones comerciales del
   * SaaS, no de la compañía: `crearContrato` y `setEstado` exigen plataforma
   * en el backend. Mostrarle esos controles al administrador de la compañía
   * solo le ofrecería botones que terminan en un error. */
  const esPlataforma =
    me?.platformRole === "superadmin" || me?.platformRole === "admin";

  if (data === undefined) {
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </PageContainer>
    );
  }
  if (data === null) {
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">
          Esa compañía no existe o fue eliminada.
        </p>
      </PageContainer>
    );
  }

  const { compania, personal, contratos } = data;

  return (
    <PageContainer>
      <div className="space-y-6">
        <Link
          href="/dashboard/companias"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Compañías
        </Link>

        <Cabecera compania={compania} esPlataforma={esPlataforma} />

        <div className="flex gap-1 border-b border-border">
          <Tab
            activo={tab === "personal"}
            onClick={() => setTab("personal")}
            icon={Users}
            label="Personal"
            n={personal.filter((p) => p.isActive).length}
          />
          <Tab
            activo={tab === "contratos"}
            onClick={() => setTab("contratos")}
            icon={FileText}
            label="Conjuntos"
            n={contratos.filter((c) => c.estado === "vigente").length}
          />
        </div>

        {tab === "personal" ? (
          <PanelPersonal companiaId={companiaId} personal={personal} />
        ) : (
          <PanelContratos
            companiaId={companiaId}
            contratos={contratos}
            personal={personal}
            esPlataforma={esPlataforma}
          />
        )}
      </div>
    </PageContainer>
  );
}

function Tab({
  activo,
  onClick,
  icon: Icon,
  label,
  n,
}: {
  activo: boolean;
  onClick: () => void;
  icon: typeof Users;
  label: string;
  n: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-[13.5px] font-medium transition-colors",
        activo
          ? "border-brand text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {label}
      <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums">
        {n}
      </span>
    </button>
  );
}

function Cabecera({
  compania,
  esPlataforma,
}: {
  compania: { _id: Id<"companiasSeguridad">; nombre: string; estado: string; nit?: string; contactoEmail?: string };
  esPlataforma: boolean;
}) {
  const setEstado = useMutation(api.companias.setEstado);
  const [confirmar, setConfirmar] = useState<Estado | null>(null);

  return (
    <>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10">
          <ShieldCheck className="h-6 w-6 text-brand" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {compania.nombre}
            </h1>
            <EstadoBadge estado={compania.estado as Estado} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {compania.nit ? `NIT ${compania.nit}` : "Sin NIT registrado"}
            {compania.contactoEmail ? ` · ${compania.contactoEmail}` : ""}
          </p>
        </div>

        {esPlataforma && (
          <Select
            className="w-auto"
            value={compania.estado}
            onChange={(e) => setConfirmar(e.target.value as Estado)}
            aria-label="Estado de la compañía"
          >
            <option value="activa">Activa</option>
            <option value="suspendida">Suspendida</option>
            <option value="inactiva">Dada de baja</option>
          </Select>
        )}
      </div>

      <ConfirmarEstado
        companiaId={compania._id}
        estado={confirmar}
        onClose={() => setConfirmar(null)}
        onConfirm={async (estado) => {
          await setEstado({ companiaId: compania._id, estado });
          setConfirmar(null);
        }}
      />
    </>
  );
}

/**
 * Suspender corta la operación de TODA la compañía a la vez. Es una acción
 * con mucho más radio del que sugiere un desplegable, así que se nombra a
 * cuánta gente y cuántos conjuntos deja sin portería antes de aplicarla.
 */
function ConfirmarEstado({
  companiaId,
  estado,
  onClose,
  onConfirm,
}: {
  companiaId: Id<"companiasSeguridad">;
  estado: Estado | null;
  onClose: () => void;
  onConfirm: (estado: Estado) => Promise<void>;
}) {
  const data = useQuery(api.companias.detail, { companiaId });
  const [busy, setBusy] = useState(false);
  if (!estado) return null;

  const vigentes = data?.contratos.filter((c) => c.estado === "vigente") ?? [];
  const personas = vigentes.reduce((n, c) => n + c.asignacionesVigentes, 0);
  const corta = estado !== "activa";

  return (
    <Modal
      open
      onClose={onClose}
      title={estado === "activa" ? "Reactivar compañía" : `Marcar como ${estado}`}
    >
      <div className="space-y-4">
        {corta ? (
          <p className="text-sm text-foreground">
            Su personal dejará de poder operar de inmediato en{" "}
            <strong>
              {vigentes.length} conjunto{vigentes.length === 1 ? "" : "s"}
            </strong>
            , afectando a <strong>{personas}</strong> asignación
            {personas === 1 ? "" : "es"} vigente{personas === 1 ? "" : "s"}.
            {estado === "suspendida" &&
              " Los contratos y las asignaciones quedan intactos: al reactivarla, todo vuelve a funcionar."}
          </p>
        ) : (
          <p className="text-sm text-foreground">
            Su personal recuperará el acceso a los conjuntos con contrato
            vigente.
          </p>
        )}
        {vigentes.length > 0 && corta && (
          <ul className="rounded-lg bg-muted/60 p-3 text-[13px] text-muted-foreground">
            {vigentes.map((c) => (
              <li key={c._id}>· {c.condominioNombre}</li>
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant={corta ? "destructive" : "primary"}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(estado);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Aplicando…" : "Confirmar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Personal
// ─────────────────────────────────────────────────────────────

type Persona = {
  _id: Id<"companiaMiembros">;
  userId: Id<"users">;
  nombre: string;
  email: string | null;
  roles: string[];
  cargo: string | null;
  isActive: boolean;
  asignacionesVigentes: number;
};

function PanelPersonal({
  companiaId,
  personal,
}: {
  companiaId: Id<"companiasSeguridad">;
  personal: Persona[];
}) {
  const [agregar, setAgregar] = useState(false);
  const activos = personal.filter((p) => p.isActive);
  const bajas = personal.filter((p) => !p.isActive);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Supervisores y guardas de la compañía. Pertenecer a ella no da acceso
          a ningún conjunto: eso lo da la asignación.
        </p>
        <Button size="sm" onClick={() => setAgregar(true)}>
          <UserPlus className="h-4 w-4" aria-hidden />
          Agregar persona
        </Button>
      </div>

      {activos.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Sin personal todavía"
          description="Agrega supervisores y guardas para poder asignarlos a los conjuntos que la compañía atiende."
          action={<Button onClick={() => setAgregar(true)}>Agregar persona</Button>}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-5 py-3 font-medium">Persona</th>
                <th className="px-5 py-3 font-medium">Roles</th>
                <th className="px-5 py-3 font-medium">Conjuntos</th>
                <th className="px-5 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {activos.map((p) => (
                <FilaPersona key={p._id} p={p} />
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {bajas.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            {bajas.length} persona{bajas.length === 1 ? "" : "s"} dada
            {bajas.length === 1 ? "" : "s"} de baja
          </summary>
          <ul className="mt-2 space-y-1 pl-4 text-muted-foreground">
            {bajas.map((p) => (
              <li key={p._id}>
                {p.nombre} {p.email ? `· ${p.email}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}

      <AgregarPersonaDialog
        companiaId={companiaId}
        open={agregar}
        onClose={() => setAgregar(false)}
      />
    </div>
  );
}

function FilaPersona({ p }: { p: Persona }) {
  const setRoles = useMutation(api.companias.setRolesMiembro);
  const desactivar = useMutation(api.companias.desactivarMiembro);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function alternar(rol: RolCompania) {
    const nuevos = p.roles.includes(rol)
      ? p.roles.filter((r) => r !== rol)
      : [...p.roles, rol];
    if (nuevos.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      await setRoles({ miembroId: p._id, roles: nuevos as RolCompania[] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="align-top">
      <td className="px-5 py-3.5">
        <p className="font-medium text-foreground">{p.nombre}</p>
        <p className="text-xs text-muted-foreground">{p.email}</p>
        {p.cargo && (
          <p className="text-xs text-muted-foreground">{p.cargo}</p>
        )}
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </td>
      <td className="px-5 py-3.5">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(ETIQUETA_ROL) as RolCompania[]).map((rol) => {
            const puesto = p.roles.includes(rol);
            return (
              <button
                key={rol}
                type="button"
                disabled={busy}
                onClick={() => alternar(rol)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[11.5px] transition-colors disabled:opacity-50",
                  puesto
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                {ETIQUETA_ROL[rol]}
              </button>
            );
          })}
        </div>
      </td>
      <td className="px-5 py-3.5 tabular-nums text-muted-foreground">
        {p.asignacionesVigentes}
      </td>
      <td className="px-5 py-3.5 text-right">
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await desactivar({ miembroId: p._id });
            } finally {
              setBusy(false);
            }
          }}
        >
          <UserMinus className="h-3.5 w-3.5" aria-hidden />
          Dar de baja
        </Button>
      </td>
    </tr>
  );
}

function AgregarPersonaDialog({
  companiaId,
  open,
  onClose,
}: {
  companiaId: Id<"companiasSeguridad">;
  open: boolean;
  onClose: () => void;
}) {
  const crear = useAction(api.companias.crearMiembro);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [telefono, setTelefono] = useState("");
  const [cargo, setCargo] = useState("");
  const [roles, setRoles] = useState<RolCompania[]>(["guardia"]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function cerrar() {
    setNombre("");
    setEmail("");
    setPassword("");
    setTelefono("");
    setCargo("");
    setRoles(["guardia"]);
    setError(null);
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await crear({
        companiaId,
        name: nombre,
        email,
        password,
        telefono: telefono || undefined,
        cargo: cargo || undefined,
        roles,
      });
      cerrar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo agregar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={cerrar}
      title="Agregar persona a la compañía"
      description="Si ya tiene cuenta en Vekino se le respeta y solo se le añade el vínculo con la compañía."
    >
      <form onSubmit={submit} className="space-y-3.5">
        <Campo label="Nombre completo" requerido>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            autoFocus
          />
        </Campo>
        <Campo label="Correo" requerido>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Campo>
        <Campo
          label="Contraseña"
          requerido
          ayuda="Mínimo 8 caracteres. Es con la que entrará a la app."
        >
          <Input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </Campo>
        <Campo label="Teléfono">
          <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        </Campo>
        <Campo label="Cargo" ayuda="Solo informativo. No otorga permisos.">
          <Input
            value={cargo}
            onChange={(e) => setCargo(e.target.value)}
            placeholder="Supervisor zona norte"
          />
        </Campo>

        <Campo label="Roles en la compañía" requerido>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(ETIQUETA_ROL) as RolCompania[]).map((rol) => {
              const puesto = roles.includes(rol);
              return (
                <button
                  key={rol}
                  type="button"
                  onClick={() =>
                    setRoles(
                      puesto
                        ? roles.filter((r) => r !== rol)
                        : [...roles, rol],
                    )
                  }
                  className={cn(
                    "rounded-full border px-3 py-1 text-[12.5px] transition-colors",
                    puesto
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  {ETIQUETA_ROL[rol]}
                </button>
              );
            })}
          </div>
        </Campo>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={cerrar}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={busy || roles.length === 0 || password.length < 8}
          >
            {busy ? "Agregando…" : "Agregar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Contratos y asignaciones
// ─────────────────────────────────────────────────────────────

type Contrato = {
  _id: Id<"companiaContratos">;
  condominioId: Id<"condominios">;
  condominioNombre: string;
  vigenciaDesde: number;
  vigenciaHasta: number | null;
  estado: "programada" | "vigente" | "terminada";
  asignacionesVigentes: number;
};

function PanelContratos({
  companiaId,
  contratos,
  personal,
  esPlataforma,
}: {
  companiaId: Id<"companiasSeguridad">;
  contratos: Contrato[];
  personal: Persona[];
  esPlataforma: boolean;
}) {
  const [nuevo, setNuevo] = useState(false);
  const [abierto, setAbierto] = useState<Id<"companiaContratos"> | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Los conjuntos donde esta compañía presta servicio. El contrato es lo
          que autoriza: sin uno vigente, ninguna asignación funciona.
        </p>
        {esPlataforma && (
          <Button size="sm" onClick={() => setNuevo(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Contratar conjunto
          </Button>
        )}
      </div>

      {contratos.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Sin conjuntos contratados"
          description={
            esPlataforma
              ? "Contrata un conjunto para poder asignarle supervisores y guardas."
              : "Cuando Vekino firme un contrato con un conjunto aparecerá aquí y podrás asignarle tu personal."
          }
          action={
            esPlataforma ? (
              <Button onClick={() => setNuevo(true)}>Contratar conjunto</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {contratos.map((k) => (
            <FilaContrato
              key={k._id}
              contrato={k}
              personal={personal}
              esPlataforma={esPlataforma}
              abierto={abierto === k._id}
              onToggle={() => setAbierto(abierto === k._id ? null : k._id)}
            />
          ))}
        </div>
      )}

      <NuevoContratoDialog
        companiaId={companiaId}
        open={nuevo}
        onClose={() => setNuevo(false)}
      />
    </div>
  );
}

function FilaContrato({
  contrato,
  personal,
  esPlataforma,
  abierto,
  onToggle,
}: {
  contrato: Contrato;
  personal: Persona[];
  esPlataforma: boolean;
  abierto: boolean;
  onToggle: () => void;
}) {
  const asignaciones = useQuery(
    api.asignaciones.porContrato,
    abierto ? { contratoId: contrato._id, incluirTerminadas: true } : "skip",
  );
  const terminar = useMutation(api.companias.terminarContrato);
  const [asignar, setAsignar] = useState(false);
  const [terminando, setTerminando] = useState(false);

  return (
    <Card className="overflow-hidden p-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-accent/40"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-foreground">
              {contrato.condominioNombre}
            </p>
            <Badge tone={TONO_VIGENCIA[contrato.estado]}>{contrato.estado}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {fmt(contrato.vigenciaDesde)} → {fmt(contrato.vigenciaHasta)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums text-foreground">
            {contrato.asignacionesVigentes}
          </p>
          <p className="text-[11px] text-muted-foreground">asignados</p>
        </div>
      </button>

      {/* La operación del conjunto: rondas y minuta del equipo que lo cubre.
          Es la misma pantalla que ya usa el supervisor —no una copia— y el
          servidor vuelve a resolver el permiso por contrato en cada consulta.
          Solo en los contratos que siguen en pie: en uno terminado la
          portería rebota, y ofrecer el enlace sería prometer lo que no hay.
          Y solo al personal de la compañía: el staff de plataforma no entra
          por ese shell —no es de ninguna empresa— y tiene la minuta del
          conjunto en su propio panel de control de guardia. */}
      {contrato.estado !== "terminada" && !esPlataforma && (
        <div className="border-t border-border px-4 py-2.5">
          <Link
            href={`/vigilancia/${contrato.condominioId}`}
            className="inline-flex items-center gap-1.5 text-[12.5px] text-brand hover:underline"
          >
            <BookOpenCheck className="h-3.5 w-3.5" aria-hidden />
            Ver minuta y rondas del conjunto
          </Link>
        </div>
      )}

      {abierto && (
        <div className="border-t border-border bg-muted/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] font-medium text-foreground">
              Personal asignado
            </p>
            <div className="flex gap-2">
              {contrato.estado !== "terminada" && (
                <>
                  <Button size="sm" onClick={() => setAsignar(true)}>
                    <UserPlus className="h-3.5 w-3.5" aria-hidden />
                    Asignar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={terminando}
                    onClick={async () => {
                      setTerminando(true);
                      try {
                        await terminar({
                          contratoId: contrato._id,
                          vigenciaHasta: Date.now(),
                        });
                      } finally {
                        setTerminando(false);
                      }
                    }}
                  >
                    <CalendarOff className="h-3.5 w-3.5" aria-hidden />
                    Terminar contrato
                  </Button>
                </>
              )}
            </div>
          </div>

          {asignaciones === undefined ? (
            <p className="text-[13px] text-muted-foreground">Cargando…</p>
          ) : asignaciones.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              Nadie asignado todavía. La compañía tiene el contrato, pero sin
              asignaciones su personal no puede operar esta portería.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {asignaciones.map((a) => (
                <FilaAsignacion key={a._id} a={a} />
              ))}
            </ul>
          )}
        </div>
      )}

      <AsignarDialog
        contrato={contrato}
        personal={personal}
        open={asignar}
        onClose={() => setAsignar(false)}
      />
    </Card>
  );
}

function FilaAsignacion({
  a,
}: {
  a: {
    _id: Id<"asignaciones">;
    nombre: string;
    rol: string;
    vigenciaDesde: number;
    vigenciaHasta: number | null;
    estado: "programada" | "vigente" | "terminada";
  };
}) {
  const terminar = useMutation(api.asignaciones.terminar);
  const [busy, setBusy] = useState(false);

  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium text-foreground">{a.nombre}</p>
        <p className="text-xs text-muted-foreground">
          {a.rol === "supervisor" ? "Supervisor" : "Guarda"} ·{" "}
          {fmt(a.vigenciaDesde)} → {fmt(a.vigenciaHasta)}
        </p>
      </div>
      <Badge tone={TONO_VIGENCIA[a.estado]}>{a.estado}</Badge>
      {a.estado !== "terminada" && (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await terminar({
                asignacionId: a._id,
                vigenciaHasta: Date.now(),
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          Terminar
        </Button>
      )}
    </li>
  );
}

function AsignarDialog({
  contrato,
  personal,
  open,
  onClose,
}: {
  contrato: Contrato;
  personal: Persona[];
  open: boolean;
  onClose: () => void;
}) {
  const crear = useMutation(api.asignaciones.crear);
  const [miembroId, setMiembroId] = useState<string>("");
  const [rol, setRol] = useState<RolAsignacion>("guardia");
  const [desde, setDesde] = useState(msAFecha(Math.max(contrato.vigenciaDesde, Date.now())));
  const [hasta, setHasta] = useState(
    contrato.vigenciaHasta ? msAFecha(contrato.vigenciaHasta) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Solo tiene sentido ofrecer a quien la compañía reconoce con ese rol.
  const elegibles = personal.filter((p) => p.isActive && p.roles.includes(rol));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await crear({
        contratoId: contrato._id,
        companiaMiembroId: miembroId as Id<"companiaMiembros">,
        rol,
        vigenciaDesde: fechaAMs(desde),
        vigenciaHasta: hasta ? fechaAMs(hasta) : undefined,
      });
      setMiembroId("");
      setError(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo asignar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Asignar a ${contrato.condominioNombre}`}
      description="La asignación tiene que caber dentro de la vigencia del contrato."
    >
      <form onSubmit={submit} className="space-y-3.5">
        <Campo label="Rol en este conjunto" requerido>
          <Select
            value={rol}
            onChange={(e) => {
              setRol(e.target.value as RolAsignacion);
              setMiembroId("");
            }}
          >
            <option value="guardia">Guarda</option>
            <option value="supervisor">Supervisor</option>
          </Select>
        </Campo>

        <Campo
          label="Persona"
          requerido
          ayuda={
            elegibles.length === 0
              ? "Nadie de la compañía tiene ese rol todavía. Asígnaselo primero en la pestaña Personal."
              : undefined
          }
        >
          <Select
            value={miembroId}
            onChange={(e) => setMiembroId(e.target.value)}
            required
            disabled={elegibles.length === 0}
          >
            <option value="">Selecciona…</option>
            {elegibles.map((p) => (
              <option key={p._id} value={p._id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Desde" requerido>
            <Input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              required
            />
          </Campo>
          <Campo label="Hasta" ayuda="Vacío = indefinido">
            <Input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
            />
          </Campo>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy || !miembroId}>
            {busy ? "Asignando…" : "Asignar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function NuevoContratoDialog({
  companiaId,
  open,
  onClose,
}: {
  companiaId: Id<"companiasSeguridad">;
  open: boolean;
  onClose: () => void;
}) {
  const condominios = useQuery(api.condominios.listAll, open ? {} : "skip");
  const crear = useMutation(api.companias.crearContrato);
  const [condominioId, setCondominioId] = useState("");
  const [desde, setDesde] = useState(msAFecha(Date.now()));
  const [hasta, setHasta] = useState("");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await crear({
        companiaId,
        condominioId: condominioId as Id<"condominios">,
        vigenciaDesde: fechaAMs(desde),
        vigenciaHasta: hasta ? fechaAMs(hasta) : undefined,
        notas: notas || undefined,
      });
      setCondominioId("");
      setNotas("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo contratar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Contratar un conjunto"
      description="Autoriza a esta compañía a operar la portería del conjunto durante el período indicado."
    >
      <form onSubmit={submit} className="space-y-3.5">
        <Campo label="Conjunto" requerido>
          <Select
            value={condominioId}
            onChange={(e) => setCondominioId(e.target.value)}
            required
          >
            <option value="">Selecciona…</option>
            {(condominios ?? []).map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Desde" requerido>
            <Input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              required
            />
          </Campo>
          <Campo label="Hasta" ayuda="Vacío = indefinido">
            <Input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
            />
          </Campo>
        </div>

        <Campo label="Referencia del contrato">
          <Input
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Contrato 2026-014"
          />
        </Campo>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy || !condominioId}>
            {busy ? "Contratando…" : "Contratar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
