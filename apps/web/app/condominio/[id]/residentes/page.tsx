"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  usePaginatedQuery,
  useMutation,
  useQuery,
  useAction,
} from "convex/react";
import { Pencil, Trash2, Users, Loader2, Check } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { useNuevoQuery } from "@/hooks/use-nuevo-query";
import { SearchInput, Select, Input } from "@/components/ui/input";
import {
  TableCard,
  Table,
  THead,
  TH,
  TBody,
  TR,
  TD,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/user-avatar";

const ASSIGNABLE_ROLES = [
  "propietario",
  "contadora",
  "junta_directiva",
  "guardia",
] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

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

const ROLE_TONE: Record<string, React.ComponentProps<typeof Badge>["tone"]> = {
  administrador: "primary",
  propietario: "success",
  apoderado: "violet",
  arrendatario: "info",
  residente: "neutral",
  contadora: "brand",
  guardia: "warning",
  junta_directiva: "primary",
  representante_asamblea: "violet",
};

const PAGE_SIZE = 30;

type MemberRow = {
  membershipId: Id<"memberships">;
  userId: Id<"users">;
  name: string | null;
  email: string | null;
  telefono: string | null;
  image: string | null;
  roles: string[];
  unidades: {
    unidadId: Id<"unidades">;
    numero: string;
    torre: string | null;
    bloque: string | null;
  }[];
};

function useDebounced(value: string, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function formatUnidad(u: {
  numero: string;
  torre: string | null;
  bloque: string | null;
}) {
  const parts = [
    u.torre && `T${u.torre}`,
    u.bloque && `B${u.bloque}`,
    u.numero,
  ].filter(Boolean);
  return parts.join(" · ");
}

function RolePicker({
  selected,
  onToggle,
}: {
  selected: Set<AssignableRole>;
  onToggle: (r: AssignableRole) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {ASSIGNABLE_ROLES.map((r) => {
        const on = selected.has(r);
        return (
          <button
            key={r}
            type="button"
            onClick={() => onToggle(r)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
              on
                ? "border-primary bg-primary/5 font-medium text-primary"
                : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input",
              )}
            >
              {on && <Check className="h-3 w-3" />}
            </span>
            {ROLE_LABEL[r]}
          </button>
        );
      })}
    </div>
  );
}

function UnidadPicker({
  unidades,
  selected,
  onToggle,
}: {
  unidades:
    | { _id: Id<"unidades">; numero: string; torre?: string; bloque?: string }[]
    | undefined;
  selected: Set<Id<"unidades">>;
  onToggle: (id: Id<"unidades">) => void;
}) {
  const [q, setQ] = useState("");
  const sorted = useMemo(() => {
    if (!unidades) return [];
    return [...unidades].sort((a, b) =>
      a.numero.localeCompare(b.numero, undefined, { numeric: true }),
    );
  }, [unidades]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return sorted;
    return sorted.filter((u) => {
      const label = formatUnidad({
        numero: u.numero,
        torre: u.torre ?? null,
        bloque: u.bloque ?? null,
      }).toLowerCase();
      return (
        u.numero.toLowerCase().includes(needle) ||
        (u.torre ?? "").toLowerCase().includes(needle) ||
        (u.bloque ?? "").toLowerCase().includes(needle) ||
        label.includes(needle)
      );
    });
  }, [sorted, q]);

  if (!unidades) {
    return <p className="text-sm text-muted-foreground">Cargando unidades…</p>;
  }
  if (sorted.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay unidades registradas. Puedes crear el residente y vincular
        después.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <SearchInput
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar número, torre o bloque"
      />
      <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-center text-sm text-muted-foreground">
            Sin coincidencias
          </p>
        ) : (
          filtered.map((u) => {
            const on = selected.has(u._id);
            const label = formatUnidad({
              numero: u.numero,
              torre: u.torre ?? null,
              bloque: u.bloque ?? null,
            });
            return (
              <button
                key={u._id}
                type="button"
                onClick={() => onToggle(u._id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  on
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-foreground hover:bg-accent",
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input",
                  )}
                >
                  {on && <Check className="h-3 w-3" />}
                </span>
                {label}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function ResidentesPage() {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;
  const deactivate = useMutation(api.memberships.deactivate);
  const unidades = useQuery(api.unidades.listByCondominio, { condominioId });

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<AssignableRole | "">("");
  const deferredQ = useDebounced(search, 280);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [removing, setRemoving] = useState<{
    membershipId: Id<"memberships">;
    name: string;
  } | null>(null);
  const [removingBusy, setRemovingBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  useNuevoQuery(() => setCreating(true));

  const { results, status, loadMore } = usePaginatedQuery(
    api.memberships.listPage,
    {
      condominioId,
      q: deferredQ.trim() || undefined,
      role: roleFilter || undefined,
    },
    { initialNumItems: PAGE_SIZE },
  );

  const hasFilters = Boolean(deferredQ.trim() || roleFilter);
  const loading = status === "LoadingFirstPage";
  const canLoadMore = status === "CanLoadMore";
  const loadingMore = status === "LoadingMore";

  async function confirmRemove() {
    if (!removing) return;
    setRemovingBusy(true);
    setRemoveError(null);
    try {
      await deactivate({ membershipId: removing.membershipId });
      setRemoving(null);
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : "No se pudo eliminar.");
    } finally {
      setRemovingBusy(false);
    }
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <PageHeader
            title="Residentes"
            description="Usuarios del condominio, roles y unidades"
          />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value={roleFilter}
              onChange={(e) =>
                setRoleFilter(e.target.value as AssignableRole | "")
              }
              className="sm:w-48"
            >
              <option value="">Todos los roles</option>
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre, correo, teléfono o casa"
              className="sm:w-72"
            />
          </div>
        </div>

        {loading ? (
          <TableSkeleton />
        ) : results.length === 0 ? (
          <EmptyState
            icon={Users}
            title={hasFilters ? "Sin resultados" : "Sin residentes"}
            description={
              hasFilters
                ? "Ningún residente coincide con los filtros aplicados."
                : "Aún no hay usuarios registrados en este condominio."
            }
            action={
              hasFilters ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setRoleFilter("");
                  }}
                >
                  Limpiar filtros
                </Button>
              ) : (
                <Button size="sm" onClick={() => setCreating(true)}>
                  Nuevo residente
                </Button>
              )
            }
          />
        ) : (
          <>
            <TableCard>
              <Table>
                <THead>
                  <tr>
                    <TH>Usuario</TH>
                    <TH className="hidden md:table-cell">Teléfono</TH>
                    <TH className="hidden lg:table-cell">Unidad</TH>
                    <TH>Roles</TH>
                    <TH className="text-right">Acciones</TH>
                  </tr>
                </THead>
                <TBody>
                  {results.map((m) => (
                    <TR key={m.membershipId}>
                      <TD>
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            name={m.name ?? m.email ?? "?"}
                            image={m.image}
                          />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                              {m.name ?? "—"}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {m.email ?? "—"}
                            </p>
                            <p className="truncate text-xs text-muted-foreground md:hidden">
                              {m.telefono || "Sin teléfono"}
                            </p>
                          </div>
                        </div>
                      </TD>
                      <TD className="hidden text-muted-foreground md:table-cell">
                        {m.telefono || "—"}
                      </TD>
                      <TD className="hidden lg:table-cell">
                        {m.unidades.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            Sin unidad
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {m.unidades.map((u: { unidadId: Id<"unidades">; numero: string; torre: string | null; bloque: string | null; }) => (
                              <Badge key={u.unidadId} tone="neutral">
                                {formatUnidad(u)}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TD>
                      <TD>
                        {m.roles.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            Sin rol
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {m.roles.map((r) => (
                              <Badge key={r} tone={ROLE_TONE[r] ?? "neutral"}>
                                {ROLE_LABEL[r] ?? r}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TD>
                      <TD className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => setEditing(m as MemberRow)}
                            aria-label="Editar residente"
                            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              setRemoveError(null);
                              setRemoving({
                                membershipId: m.membershipId,
                                name: m.name ?? m.email ?? "este usuario",
                              });
                            }}
                            aria-label="Eliminar residente"
                            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableCard>

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

      {creating && (
        <ResidentFormDialog
          mode="create"
          condominioId={condominioId}
          unidades={unidades}
          onClose={() => setCreating(false)}
        />
      )}

      {editing && (
        <ResidentFormDialog
          mode="edit"
          condominioId={condominioId}
          member={editing}
          unidades={unidades}
          onClose={() => setEditing(null)}
        />
      )}

      {removing && (
        <Modal
          open
          onClose={() => !removingBusy && setRemoving(null)}
          title="Eliminar residente"
          description={`¿Quitar a ${removing.name} de este condominio? Perderá acceso y sus vínculos a unidades.`}
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => setRemoving(null)}
                disabled={removingBusy}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={confirmRemove}
                disabled={removingBusy}
              >
                {removingBusy && (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                )}
                Eliminar
              </Button>
            </>
          }
        >
          {removeError ? (
            <p className="text-sm text-red-600">{removeError}</p>
          ) : null}
        </Modal>
      )}
    </PageContainer>
  );
}

function TableSkeleton() {
  return (
    <TableCard>
      <div className="divide-y divide-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3.5">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="ml-auto h-5 w-24 rounded-full" />
          </div>
        ))}
      </div>
    </TableCard>
  );
}

function ResidentFormDialog({
  mode,
  condominioId,
  member,
  unidades,
  onClose,
}: {
  mode: "create" | "edit";
  condominioId: Id<"condominios">;
  member?: MemberRow;
  unidades:
    | { _id: Id<"unidades">; numero: string; torre?: string; bloque?: string }[]
    | undefined;
  onClose: () => void;
}) {
  const createMember = useAction(api.users.createCondoMember);
  const updateMember = useMutation(api.memberships.updateMember);
  const setUnidades = useMutation(api.memberships.setMemberUnidades);
  const setPassword = useAction(api.users.setMemberPassword);

  const [name, setName] = useState(member?.name ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [telefono, setTelefono] = useState(member?.telefono ?? "");
  const [selected, setSelected] = useState<Set<AssignableRole>>(() => {
    const fromMember = (member?.roles ?? []).filter((r): r is AssignableRole =>
      (ASSIGNABLE_ROLES as readonly string[]).includes(r),
    );
    return new Set(fromMember.length > 0 ? fromMember : ["propietario"]);
  });
  const [unidadIds, setUnidadIds] = useState<Set<Id<"unidades">>>(
    () => new Set(member?.unidades.map((u) => u.unidadId) ?? []),
  );
  const [password, setPasswordValue] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleRole(r: AssignableRole) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  }

  function toggleUnidad(id: Id<"unidades">) {
    setUnidadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setError(null);
    if (!name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    if (mode === "create" && !email.trim()) {
      setError("El correo es obligatorio.");
      return;
    }
    if (selected.size === 0) {
      setError("Selecciona al menos un rol.");
      return;
    }
    if (mode === "create" || password || password2) {
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
      const roles = [...selected];
      const ids = [...unidadIds];

      if (mode === "create") {
        await createMember({
          condominioId,
          email: email.trim(),
          name: name.trim(),
          password,
          telefono: telefono.trim() || undefined,
          roles,
          unidadIds: ids,
        });
      } else if (member) {
        await updateMember({
          condominioId,
          userId: member.userId,
          name: name.trim(),
          telefono,
          roles,
        });
        await setUnidades({
          condominioId,
          membershipId: member.membershipId,
          unidadIds: ids,
        });
        if (password) {
          await setPassword({
            condominioId,
            userId: member.userId,
            password,
          });
        }
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={mode === "create" ? "Nuevo residente" : "Editar residente"}
      description={
        mode === "create"
          ? "Crea el usuario con acceso al condominio"
          : (member?.email ?? "Sin correo")
      }
      className="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {mode === "create" ? "Crear residente" : "Guardar cambios"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Nombre
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre completo"
            autoComplete="name"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Correo
          </label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="correo@ejemplo.com"
            autoComplete="email"
            disabled={mode === "edit"}
          />
          {mode === "edit" ? (
            <p className="mt-1 text-xs text-muted-foreground">
              El correo no se puede cambiar desde aquí.
            </p>
          ) : null}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Teléfono
          </label>
          <Input
            type="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="Opcional"
            autoComplete="tel"
          />
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">Roles</p>
          <RolePicker selected={selected} onToggle={toggleRole} />
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">
            Unidades / casa
          </p>
          <p className="mb-2 text-xs text-muted-foreground">
            Vincula al residente con uno o más apartamentos o casas.
          </p>
          <UnidadPicker
            unidades={unidades}
            selected={unidadIds}
            onToggle={toggleUnidad}
          />
        </div>

        <div className="border-t border-border pt-4">
          <p className="mb-1 text-sm font-medium text-foreground">
            {mode === "create" ? "Contraseña de acceso" : "Nueva contraseña"}
          </p>
          <p className="mb-2 text-xs text-muted-foreground">
            {mode === "create"
              ? "Mínimo 8 caracteres. El residente usará correo + contraseña para entrar."
              : "Déjalo vacío si no quieres cambiarla."}
          </p>
          <div className="space-y-2">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPasswordValue(e.target.value)}
              placeholder={
                mode === "create" ? "Contraseña" : "Nueva contraseña"
              }
              autoComplete="new-password"
            />
            <Input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              placeholder="Confirmar contraseña"
              autoComplete="new-password"
            />
          </div>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </Modal>
  );
}
