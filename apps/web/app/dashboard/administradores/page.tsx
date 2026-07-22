"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { ShieldCheck, Search, X } from "lucide-react";
import { api } from "@vekino/backend/api";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { useNuevoQuery } from "@/hooks/use-nuevo-query";
import { Card } from "@/components/ui/card";

type PlatformRole = "superadmin" | "admin" | null;

export default function AdministradoresPage() {
  const me = useQuery(api.users.me);
  const isPlatform =
    me?.platformRole === "superadmin" || me?.platformRole === "admin";
  const staff = useQuery(
    api.users.listPlatformStaff,
    isPlatform ? {} : "skip",
  );
  const [showAdd, setShowAdd] = useState(false);
  useNuevoQuery(() => setShowAdd(true));

  if (me === undefined) {
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </PageContainer>
    );
  }

  if (!isPlatform) {
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">No tienes acceso a esta sección.</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          title="Administradores"
          description="Staff con acceso a la plataforma (superadmin / admin). Los residentes se gestionan dentro de cada condominio."
        />

        <Card className="overflow-hidden p-0">
          {staff === undefined ? (
            <p className="p-6 text-sm text-muted-foreground">Cargando…</p>
          ) : staff.length === 0 ? (
            <div className="p-10 text-center">
              <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No hay administradores de plataforma.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Usuario</th>
                  <th className="px-5 py-3 font-medium">Correo</th>
                  <th className="px-5 py-3 font-medium">Rol</th>
                  <th className="px-5 py-3 text-right font-medium">Cambiar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {staff.map((u) => (
                  <StaffRow key={u._id} u={u} />
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {showAdd && <AddAdminDialog onClose={() => setShowAdd(false)} />}
    </PageContainer>
  );
}

function StaffRow({
  u,
}: {
  u: { _id: string; name: string; email: string; platformRole: PlatformRole };
}) {
  const setPlatformRole = useMutation(api.memberships.setPlatformRole);
  const [busy, setBusy] = useState(false);

  async function change(role: PlatformRole) {
    if (role === u.platformRole) return;
    setBusy(true);
    try {
      await setPlatformRole({
        userId: u._id as never,
        platformRole: role ?? undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="hover:bg-zinc-50/50">
      <td className="px-5 py-3.5 font-medium text-zinc-900">{u.name}</td>
      <td className="px-5 py-3.5 text-zinc-600">{u.email}</td>
      <td className="px-5 py-3.5">
        <RoleBadge role={u.platformRole} />
      </td>
      <td className="px-5 py-3.5 text-right">
        <select
          value={u.platformRole ?? "none"}
          disabled={busy}
          onChange={(e) =>
            change(
              e.target.value === "none"
                ? null
                : (e.target.value as PlatformRole),
            )
          }
          className="text-xs border border-zinc-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
        >
          <option value="admin">Admin plataforma</option>
          <option value="superadmin">Superadmin</option>
          <option value="none">Quitar acceso</option>
        </select>
      </td>
    </tr>
  );
}

function RoleBadge({ role }: { role: PlatformRole }) {
  if (role === "superadmin")
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
        Superadmin
      </span>
    );
  if (role === "admin")
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
        Admin plataforma
      </span>
    );
  return <span className="text-xs text-zinc-400">—</span>;
}

function AddAdminDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  const found = useQuery(
    api.users.searchByEmail,
    query ? { email: query } : "skip",
  );
  const setPlatformRole = useMutation(api.memberships.setPlatformRole);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function promote(role: "admin" | "superadmin") {
    if (!found) return;
    setBusy(true);
    try {
      await setPlatformRole({ userId: found._id as never, platformRole: role });
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-900">
            Agregar administrador
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-zinc-500 mb-4">
          Busca un usuario existente por su correo y asígnale un rol de
          plataforma.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setDone(false);
            setQuery(email.trim().toLowerCase());
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            type="submit"
            className="px-4 rounded-lg bg-zinc-100 text-sm font-medium hover:bg-zinc-200"
          >
            Buscar
          </button>
        </form>

        <div className="mt-4">
          {query && found === undefined && (
            <p className="text-sm text-zinc-500">Buscando…</p>
          )}
          {query && found === null && (
            <p className="text-sm text-red-500">
              No se encontró un usuario con ese correo.
            </p>
          )}
          {found && (
            <div className="rounded-lg border border-zinc-200 p-4">
              <p className="font-medium text-zinc-900">{found.name}</p>
              <p className="text-sm text-zinc-500">{found.email}</p>
              {done ? (
                <p className="text-sm text-emerald-600 mt-3">
                  ✓ Rol asignado correctamente.
                </p>
              ) : (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => promote("admin")}
                    disabled={busy}
                    className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
                  >
                    Hacer admin
                  </button>
                  <button
                    onClick={() => promote("superadmin")}
                    disabled={busy}
                    className="flex-1 py-2 rounded-lg border border-primary text-primary text-sm font-medium hover:bg-primary/5 disabled:opacity-60"
                  >
                    Hacer superadmin
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
