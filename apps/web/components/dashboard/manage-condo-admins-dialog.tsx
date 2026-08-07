"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Pencil, Trash2, UserPlus, X } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { mensajeErrorUsuario } from "@/lib/utils";

type OpRole =
  | "administrador"
  | "propietario"
  | "apoderado"
  | "arrendatario"
  | "residente"
  | "contadora"
  | "guardia"
  | "junta_directiva"
  | "representante_asamblea";

const ROLE_OPTIONS: { id: OpRole; label: string }[] = [
  { id: "administrador", label: "Administrador" },
  { id: "contadora", label: "Contadora" },
  { id: "junta_directiva", label: "Junta directiva" },
  { id: "guardia", label: "Guardia" },
  { id: "propietario", label: "Propietario" },
  { id: "residente", label: "Residente" },
];

/**
 * Modal ordenado para gestionar administradores del condominio.
 */
export function ManageCondoAdminsDialog({
  condominioId,
  condominioName,
  onClose,
}: {
  condominioId: Id<"condominios">;
  condominioName: string;
  onClose: () => void;
}) {
  const detail = useQuery(api.condominios.detail, { condominioId });
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [editTarget, setEditTarget] = useState<{
    userId: Id<"users">;
    name: string;
    email: string;
    telefono: string;
    roles: OpRole[];
  } | null>(null);

  const title =
    mode === "create"
      ? "Nuevo administrador"
      : mode === "edit"
        ? "Editar administrador"
        : "Administradores";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-labelledby="manage-admins-title"
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-floating"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2
              id="manage-admins-title"
              className="text-base font-semibold text-foreground"
            >
              {title}
            </h2>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {condominioName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {mode === "list" && (
            <AdminsList
              loading={detail === undefined}
              admins={detail?.admins ?? []}
              onAdd={() => setMode("create")}
              onEdit={(a) => {
                setEditTarget({
                  userId: a._id,
                  name: a.name,
                  email: a.email,
                  telefono: a.telefono ?? "",
                  roles: (a.roles as OpRole[]) ?? ["administrador"],
                });
                setMode("edit");
              }}
            />
          )}
          {mode === "create" && (
            <CreateAdminForm
              condominioId={condominioId}
              onCancel={() => setMode("list")}
              onDone={() => setMode("list")}
            />
          )}
          {mode === "edit" && editTarget && (
            <EditAdminForm
              condominioId={condominioId}
              initial={editTarget}
              onCancel={() => {
                setEditTarget(null);
                setMode("list");
              }}
              onDone={() => {
                setEditTarget(null);
                setMode("list");
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function AdminsList({
  loading,
  admins,
  onAdd,
  onEdit,
}: {
  loading: boolean;
  admins: Array<{
    _id: Id<"users">;
    membershipId: Id<"memberships">;
    name: string;
    email: string;
    image: string | null;
    telefono: string | null;
    roles: string[];
  }>;
  onAdd: () => void;
  onEdit: (a: {
    _id: Id<"users">;
    name: string;
    email: string;
    telefono: string | null;
    roles: string[];
  }) => void;
}) {
  const deactivate = useMutation(api.memberships.deactivate);
  const [removingId, setRemovingId] = useState<Id<"memberships"> | null>(null);
  const [busyId, setBusyId] = useState<Id<"memberships"> | null>(null);

  async function confirmRemove(membershipId: Id<"memberships">) {
    setBusyId(membershipId);
    try {
      await deactivate({ membershipId });
      setRemovingId(null);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {admins.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Sin administradores todavía.
          </p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border">
          {admins.map((a, i) => (
            <li
              key={a._id}
              className={
                i > 0
                  ? "flex items-center gap-3 border-t border-border/60 px-3.5 py-3"
                  : "flex items-center gap-3 px-3.5 py-3"
              }
            >
              <UserAvatar name={a.name} image={a.image} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {a.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {a.email}
                </p>
              </div>
              <Badge tone="brand">Admin</Badge>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => onEdit(a)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-brand"
                  aria-label={`Editar ${a.name}`}
                >
                  <Pencil className="h-3.75 w-3.75" />
                </button>
                <button
                  type="button"
                  onClick={() => setRemovingId(a.membershipId)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-red-600"
                  aria-label={`Quitar ${a.name}`}
                >
                  <Trash2 className="h-3.75 w-3.75" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button type="button" variant="brand" className="w-full" onClick={onAdd}>
        <UserPlus className="h-3.75 w-3.75" />
        Agregar administrador
      </Button>

      {removingId && (
        <div className="rounded-xl border border-border bg-muted/40 p-3.5">
          <p className="text-sm text-foreground">
            ¿Quitar a este administrador del condominio?
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={() => setRemovingId(null)}
              disabled={busyId === removingId}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              className="flex-1 bg-red-600 text-white hover:bg-red-700"
              disabled={busyId === removingId}
              onClick={() => void confirmRemove(removingId)}
            >
              {busyId === removingId ? "Quitando…" : "Quitar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateAdminForm({
  condominioId,
  onCancel,
  onDone,
}: {
  condominioId: Id<"condominios">;
  onCancel: () => void;
  onDone: () => void;
}) {
  const createMember = useAction(api.users.createCondoMember);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError("Nombre y correo son obligatorios.");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== password2) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setBusy(true);
    try {
      await createMember({
        condominioId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        telefono: telefono.trim() || undefined,
        password,
        roles: ["administrador"],
      });
      onDone();
    } catch (err) {
      setError(
        mensajeErrorUsuario(
          err,
          "No se pudo crear el administrador. Intenta de nuevo.",
        ),
      );
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Field label="Nombre completo" value={name} onChange={setName} required />
      <Field
        label="Correo"
        value={email}
        onChange={setEmail}
        type="email"
        required
      />
      <Field
        label="Teléfono"
        value={telefono}
        onChange={setTelefono}
        placeholder="Opcional"
      />
      <Field
        label="Contraseña"
        value={password}
        onChange={setPassword}
        type="password"
        required
      />
      <Field
        label="Confirmar contraseña"
        value={password2}
        onChange={setPassword2}
        type="password"
        required
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={onCancel}
          disabled={busy}
        >
          Volver
        </Button>
        <Button type="submit" variant="brand" className="flex-1" disabled={busy}>
          {busy ? "Creando…" : "Crear"}
        </Button>
      </div>
    </form>
  );
}

function EditAdminForm({
  condominioId,
  initial,
  onCancel,
  onDone,
}: {
  condominioId: Id<"condominios">;
  initial: {
    userId: Id<"users">;
    name: string;
    email: string;
    telefono: string;
    roles: OpRole[];
  };
  onCancel: () => void;
  onDone: () => void;
}) {
  const updateMember = useMutation(api.memberships.updateMember);
  const setPassword = useAction(api.users.setMemberPassword);
  const [name, setName] = useState(initial.name);
  const [telefono, setTelefono] = useState(initial.telefono);
  const [roles, setRoles] = useState<Set<OpRole>>(new Set(initial.roles));
  const [password, setPasswordValue] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleRole(r: OpRole) {
    setRoles((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    if (roles.size === 0) {
      setError("Selecciona al menos un rol.");
      return;
    }
    if (password || password2) {
      if (password.length < 8) {
        setError("La contraseña debe tener al menos 8 caracteres.");
        return;
      }
      if (password !== password2) {
        setError("Las contraseñas no coinciden.");
        return;
      }
    }

    setBusy(true);
    try {
      await updateMember({
        condominioId,
        userId: initial.userId,
        name: name.trim(),
        telefono,
        roles: [...roles],
      });
      if (password) {
        await setPassword({
          condominioId,
          userId: initial.userId,
          password,
        });
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3.5">
      <p className="text-xs text-muted-foreground">{initial.email}</p>
      <Field label="Nombre" value={name} onChange={setName} required />
      <Field
        label="Teléfono"
        value={telefono}
        onChange={setTelefono}
        placeholder="Opcional"
      />

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Roles</p>
        <div className="grid grid-cols-2 gap-1.5">
          {ROLE_OPTIONS.map((r) => {
            const on = roles.has(r.id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => toggleRole(r.id)}
                className={
                  on
                    ? "rounded-lg border border-brand bg-brand/5 px-2.5 py-2 text-left text-xs font-medium text-brand"
                    : "rounded-lg border border-border px-2.5 py-2 text-left text-xs text-muted-foreground hover:bg-accent"
                }
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-border pt-3">
        <p className="mb-2 text-sm font-medium text-foreground">
          Nueva contraseña
        </p>
        <div className="space-y-2">
          <Field
            label=""
            value={password}
            onChange={setPasswordValue}
            type="password"
            placeholder="Dejar vacío para no cambiar"
          />
          <Field
            label=""
            value={password2}
            onChange={setPassword2}
            type="password"
            placeholder="Confirmar"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={onCancel}
          disabled={busy}
        >
          Volver
        </Button>
        <Button type="submit" variant="brand" className="flex-1" disabled={busy}>
          {busy ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      {label ? (
        <label className="text-sm font-medium text-foreground">{label}</label>
      ) : null}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className={`${label ? "mt-1.5" : ""} w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand/30`}
      />
    </div>
  );
}
