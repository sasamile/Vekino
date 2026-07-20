"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useAction, usePaginatedQuery } from "convex/react";
import {
  ArrowLeft,
  Building2,
  Users,
  Home,
  Search,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";

const PAGE_SIZE = 30;

const OPERATIONAL_ROLES = [
  "administrador",
  "propietario",
  "apoderado",
  "arrendatario",
  "residente",
  "contadora",
  "guardia",
  "junta_directiva",
  "representante_asamblea",
] as const;
type OpRole = (typeof OPERATIONAL_ROLES)[number];

const ROLE_LABEL: Record<string, string> = {
  administrador: "Administrador",
  propietario: "Propietario",
  apoderado: "Apoderado",
  arrendatario: "Arrendatario",
  residente: "Residente",
  contadora: "Contadora",
  guardia: "Guardia",
  junta_directiva: "Junta directiva",
  representante_asamblea: "Rep. asamblea",
};

const ROLE_COLOR: Record<string, string> = {
  administrador: "bg-primary/10 text-primary",
  propietario: "bg-emerald-50 text-emerald-700",
  apoderado: "bg-violet-50 text-violet-700",
  arrendatario: "bg-sky-50 text-sky-700",
  guardia: "bg-orange-50 text-orange-700",
  contadora: "bg-amber-50 text-amber-700",
  junta_directiva: "bg-indigo-50 text-indigo-700",
  representante_asamblea: "bg-fuchsia-50 text-fuchsia-700",
};

export default function CondominioDetailPage() {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;
  const detail = useQuery(api.condominios.detail, { condominioId });
  const [tab, setTab] = useState<"usuarios" | "unidades">("usuarios");

  if (detail === undefined)
    return <div className="p-6 lg:p-10 text-sm text-zinc-500">Cargando…</div>;
  if (detail === null)
    return (
      <div className="p-6 lg:p-10 text-sm text-zinc-500">
        Condominio no encontrado.
      </div>
    );

  const c = detail.condominio;

  return (
    <div className="p-6 lg:p-10">
      <Link
        href="/dashboard/condominios"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Condominios
      </Link>

      <div className="flex items-start gap-4 mb-6">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shrink-0"
          style={{ backgroundColor: c.primaryColor ?? "#042046" }}
        >
          <Building2 className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">{c.name}</h1>
          <p className="text-sm text-zinc-500">
            {[c.city, c.nit && `NIT ${c.nit}`].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <Stat icon={Users} label="Miembros" value={detail.memberCount} />
        <Stat icon={Home} label="Unidades" value={detail.unidadCount} />
        <Stat label="Plan" text={c.subscriptionPlan ?? "—"} />
        <Stat label="Estado" text={c.isActive ? "Activo" : "Inactivo"} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-200 mb-5">
        <Tab active={tab === "usuarios"} onClick={() => setTab("usuarios")}>
          Usuarios
        </Tab>
        <Tab active={tab === "unidades"} onClick={() => setTab("unidades")}>
          Unidades
        </Tab>
      </div>

      {tab === "usuarios" ? (
        <UsuariosTab condominioId={condominioId} />
      ) : (
        <UnidadesTab condominioId={condominioId} />
      )}
    </div>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-zinc-500 hover:text-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}

function useDebounced(value: string, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function UsuariosTab({ condominioId }: { condominioId: Id<"condominios"> }) {
  const deactivate = useMutation(api.memberships.deactivate);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<OpRole | "">("");
  const deferredQ = useDebounced(search, 280);
  const [editing, setEditing] = useState<{
    userId: Id<"users">;
    name: string;
    email: string;
    telefono: string;
    roles: OpRole[];
  } | null>(null);
  const [removing, setRemoving] = useState<{
    membershipId: Id<"memberships">;
    name: string;
  } | null>(null);
  const [removingBusy, setRemovingBusy] = useState(false);

  const { results, status, loadMore } = usePaginatedQuery(
    api.memberships.listPage,
    {
      condominioId,
      q: deferredQ.trim() || undefined,
      role: roleFilter || undefined,
    },
    { initialNumItems: PAGE_SIZE },
  );

  const rows = results.filter((m) => m.isActive);
  const hasFilters = Boolean(deferredQ.trim() || roleFilter);
  const loading = status === "LoadingFirstPage";
  const canLoadMore = status === "CanLoadMore";
  const loadingMore = status === "LoadingMore";

  async function confirmRemove() {
    if (!removing) return;
    setRemovingBusy(true);
    try {
      await deactivate({ membershipId: removing.membershipId });
      setRemoving(null);
    } finally {
      setRemovingBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3 sm:justify-end">
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as OpRole | "")}
          className="w-full sm:w-48 px-3 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">Todos los roles</option>
          {OPERATIONAL_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o correo"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl ring-1 ring-zinc-100 overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-zinc-500">Cargando usuarios…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">
            {hasFilters ? "Sin resultados." : "Sin usuarios."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500 border-b border-zinc-100">
                <th className="px-5 py-3 font-medium">Usuario</th>
                <th className="px-5 py-3 font-medium">Correo</th>
                <th className="px-5 py-3 font-medium">Roles</th>
                <th className="px-5 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {rows.map((m) => (
                <tr key={m.membershipId} className="hover:bg-zinc-50/50">
                  <td className="px-5 py-3 font-medium text-zinc-900">
                    {m.name ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-zinc-600">{m.email ?? "—"}</td>
                  <td className="px-5 py-3">
                    <RoleBadges roles={m.roles} />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() =>
                          setEditing({
                            userId: m.userId,
                            name: m.name ?? "",
                            email: m.email ?? "",
                            telefono: m.telefono ?? "",
                            roles: m.roles as OpRole[],
                          })
                        }
                        className="text-zinc-400 hover:text-primary"
                        aria-label="Editar usuario"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() =>
                          setRemoving({
                            membershipId: m.membershipId,
                            name: m.name ?? m.email ?? "este usuario",
                          })
                        }
                        className="text-zinc-400 hover:text-red-600"
                        aria-label="Eliminar usuario"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(canLoadMore || loadingMore) && (
        <div className="flex items-center justify-between gap-3 mt-3">
          <p className="text-xs text-zinc-400">
            {rows.length}{!hasFilters ? "+" : ""} usuarios
          </p>
          <button
            type="button"
            onClick={() => loadMore(PAGE_SIZE)}
            disabled={loadingMore}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
          >
            {loadingMore ? "Cargando…" : "Cargar más"}
          </button>
        </div>
      )}

      {!canLoadMore && !loadingMore && rows.length > 0 && (
        <p className="text-xs text-zinc-400 mt-3">{rows.length} usuarios</p>
      )}

      {editing && (
        <EditUserDialog
          condominioId={condominioId}
          userId={editing.userId}
          email={editing.email}
          initialName={editing.name}
          initialTelefono={editing.telefono}
          initialRoles={editing.roles}
          onClose={() => setEditing(null)}
        />
      )}

      {removing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-zinc-900">
              Eliminar usuario
            </h2>
            <p className="text-sm text-zinc-500 mt-2">
              ¿Quitar a{" "}
              <span className="font-medium text-zinc-800">{removing.name}</span>{" "}
              de este condominio? No se borra su cuenta global, solo el acceso
              aquí.
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setRemoving(null)}
                disabled={removingBusy}
                className="flex-1 py-2.5 rounded-lg border border-zinc-200 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={confirmRemove}
                disabled={removingBusy}
                className="flex-1 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60"
              >
                {removingBusy ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function RoleBadges({ roles }: { roles: string[] }) {
  if (roles.length === 0)
    return <span className="text-xs text-zinc-400">Sin rol</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <span
          key={r}
          className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
            ROLE_COLOR[r] ?? "bg-zinc-100 text-zinc-600"
          }`}
        >
          {ROLE_LABEL[r] ?? r}
        </span>
      ))}
    </div>
  );
}

function EditUserDialog({
  condominioId,
  userId,
  email,
  initialName,
  initialTelefono,
  initialRoles,
  onClose,
}: {
  condominioId: Id<"condominios">;
  userId: Id<"users">;
  email: string;
  initialName: string;
  initialTelefono: string;
  initialRoles: OpRole[];
  onClose: () => void;
}) {
  const updateMember = useMutation(api.memberships.updateMember);
  const setPassword = useAction(api.users.setMemberPassword);
  const [name, setName] = useState(initialName);
  const [telefono, setTelefono] = useState(initialTelefono);
  const [selected, setSelected] = useState<Set<OpRole>>(new Set(initialRoles));
  const [password, setPasswordValue] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(r: OpRole) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  }

  async function save() {
    setError(null);
    if (!name.trim()) {
      setError("El nombre es obligatorio.");
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
        userId,
        name: name.trim(),
        telefono,
        roles: [...selected],
      });
      if (password) {
        await setPassword({ condominioId, userId, password });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-zinc-900">Editar usuario</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-zinc-500 mb-5">{email || "Sin correo"}</p>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-zinc-700">Nombre</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 w-full px-3 py-2.5 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">Teléfono</label>
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Opcional"
              className="mt-1.5 w-full px-3 py-2.5 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <p className="text-sm font-medium text-zinc-700 mb-2">Roles</p>
            <div className="grid grid-cols-2 gap-2">
              {OPERATIONAL_ROLES.map((r) => {
                const on = selected.has(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggle(r)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-colors ${
                      on
                        ? "border-primary bg-primary/5 text-primary font-medium"
                        : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        on ? "bg-primary border-primary" : "border-zinc-300"
                      }`}
                    >
                      {on && <span className="text-white text-[10px]">✓</span>}
                    </span>
                    {ROLE_LABEL[r]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-2 border-t border-zinc-100">
            <p className="text-sm font-medium text-zinc-700 mb-1">
              Nueva contraseña
            </p>
            <p className="text-xs text-zinc-400 mb-2">
              Déjalo vacío si no quieres cambiarla.
            </p>
            <div className="space-y-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPasswordValue(e.target.value)}
                placeholder="Nueva contraseña"
                autoComplete="new-password"
                className="w-full px-3 py-2.5 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <input
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                placeholder="Confirmar contraseña"
                autoComplete="new-password"
                className="w-full px-3 py-2.5 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-500 mt-4">{error}</p>}

        <button
          onClick={save}
          disabled={busy}
          className="w-full mt-5 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

function UnidadesTab({ condominioId }: { condominioId: Id<"condominios"> }) {
  const [search, setSearch] = useState("");
  const deferredQ = useDebounced(search, 280);

  const { results, status, loadMore } = usePaginatedQuery(
    api.unidades.listPage,
    {
      condominioId,
      q: deferredQ.trim() || undefined,
    },
    { initialNumItems: PAGE_SIZE },
  );

  const term = deferredQ.trim();
  const loading = status === "LoadingFirstPage";
  const canLoadMore = status === "CanLoadMore";
  const loadingMore = status === "LoadingMore";

  return (
    <>
      <div className="flex items-center justify-end mb-3">
        <div className="relative w-72 max-w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por unidad o residente"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl ring-1 ring-zinc-100 overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-zinc-500">Cargando unidades…</p>
        ) : results.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">
            {term ? "Sin resultados." : "Sin unidades."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500 border-b border-zinc-100">
                <th className="px-5 py-3 font-medium">Unidad</th>
                <th className="px-5 py-3 font-medium">Tipo</th>
                <th className="px-5 py-3 font-medium">Estado</th>
                <th className="px-5 py-3 font-medium">Residentes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {results.map((u) => (
                <tr key={u._id} className="hover:bg-zinc-50/50">
                  <td className="px-5 py-3 font-medium text-zinc-900">
                    {[u.torre, u.numero].filter(Boolean).join(" ")}
                  </td>
                  <td className="px-5 py-3 text-zinc-600 capitalize">
                    {u.tipo}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.estado === "ocupada"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {u.estado}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-zinc-600">
                    {u.residentes.length === 0 ? (
                      <span className="text-zinc-400">—</span>
                    ) : (
                      u.residentes.map((r) => r.name).filter(Boolean).join(", ")
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {(canLoadMore || loadingMore) && (
        <div className="flex items-center justify-between gap-3 mt-3">
          <p className="text-xs text-zinc-400">
            {results.length}{!term ? "+" : ""} unidades
          </p>
          <button
            type="button"
            onClick={() => loadMore(PAGE_SIZE)}
            disabled={loadingMore}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
          >
            {loadingMore ? "Cargando…" : "Cargar más"}
          </button>
        </div>
      )}
      {!canLoadMore && !loadingMore && results.length > 0 && (
        <p className="text-xs text-zinc-400 mt-3">{results.length} unidades</p>
      )}
    </>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  text,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value?: number;
  text?: string;
}) {
  return (
    <div className="bg-white rounded-2xl ring-1 ring-zinc-100 p-4">
      {Icon && <Icon className="w-4 h-4 text-primary mb-2" />}
      <p className="text-xl font-bold text-zinc-900 capitalize">
        {value ?? text ?? "—"}
      </p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}
