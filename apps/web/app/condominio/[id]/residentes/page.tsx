"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { usePaginatedQuery, useMutation } from "convex/react";
import { Pencil, Users, Loader2, Check } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { SearchInput, Select } from "@/components/ui/input";
import { TableCard, Table, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { initials, cn } from "@/lib/utils";

const OPERATIONAL_ROLES = [
  "administrador", "propietario", "apoderado", "arrendatario", "residente",
  "contadora", "guardia", "junta_directiva", "representante_asamblea",
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

function useDebounced(value: string, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function ResidentesPage() {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<OpRole | "">("");
  const deferredQ = useDebounced(search, 280);
  const [editing, setEditing] = useState<{
    userId: Id<"users">;
    name: string;
    roles: OpRole[];
  } | null>(null);

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

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          title="Residentes"
          description="Usuarios del condominio y sus roles"
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Cargando…"
              : `${results.length}${status !== "Exhausted" && !hasFilters ? "+" : ""} residentes`}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as OpRole | "")}
              className="sm:w-48"
            >
              <option value="">Todos los roles</option>
              {OPERATIONAL_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </Select>
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nombre o correo"
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
              ) : undefined
            }
          />
        ) : (
          <>
            <TableCard>
              <Table>
                <THead>
                  <tr>
                    <TH>Usuario</TH>
                    <TH className="hidden sm:table-cell">Correo</TH>
                    <TH>Roles</TH>
                    <TH className="text-right">Editar</TH>
                  </tr>
                </THead>
                <TBody>
                  {results.map((m) => (
                    <TR key={m.membershipId}>
                      <TD>
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                            {initials(m.name ?? m.email ?? "?")}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                              {m.name ?? "—"}
                            </p>
                            <p className="truncate text-xs text-muted-foreground sm:hidden">
                              {m.email ?? "—"}
                            </p>
                          </div>
                        </div>
                      </TD>
                      <TD className="hidden text-muted-foreground sm:table-cell">
                        {m.email ?? "—"}
                      </TD>
                      <TD>
                        {m.roles.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Sin rol</span>
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
                        <button
                          onClick={() =>
                            setEditing({
                              userId: m.userId,
                              name: m.name ?? m.email ?? "Usuario",
                              roles: m.roles as OpRole[],
                            })
                          }
                          aria-label="Editar roles"
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
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

      {editing && (
        <EditRolesDialog
          condominioId={condominioId}
          userId={editing.userId}
          name={editing.name}
          initial={editing.roles}
          onClose={() => setEditing(null)}
        />
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

function EditRolesDialog({
  condominioId,
  userId,
  name,
  initial,
  onClose,
}: {
  condominioId: Id<"condominios">;
  userId: Id<"users">;
  name: string;
  initial: OpRole[];
  onClose: () => void;
}) {
  const setRoles = useMutation(api.memberships.setRoles);
  const [selected, setSelected] = useState<Set<OpRole>>(new Set(initial));
  const [busy, setBusy] = useState(false);

  function toggle(r: OpRole) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    try {
      await setRoles({ condominioId, userId, roles: [...selected] });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar roles"
      description={name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Guardar roles
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {OPERATIONAL_ROLES.map((r) => {
          const on = selected.has(r);
          return (
            <button
              key={r}
              onClick={() => toggle(r)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                on
                  ? "border-primary bg-primary/5 font-medium text-primary"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded border",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-input",
                )}
              >
                {on && <Check className="h-3 w-3" />}
              </span>
              {ROLE_LABEL[r]}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
