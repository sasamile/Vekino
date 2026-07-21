"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Building2, CheckCircle2, Users, ShieldCheck } from "lucide-react";
import { api } from "@vekino/backend/api";
import { homeHrefForRoles } from "@/lib/role-routing";

export default function DashboardHome() {
  const me = useQuery(api.users.me);

  if (me === undefined) {
    return <Page title="Inicio"><p className="text-sm text-zinc-500">Cargando…</p></Page>;
  }
  if (me === null) {
    return <Page title="Inicio"><p className="text-sm text-zinc-500">Configurando tu perfil…</p></Page>;
  }

  const isPlatform =
    me.platformRole === "superadmin" || me.platformRole === "admin";

  return isPlatform ? <PlatformHome name={me.name} /> : <UserHome me={me} />;
}

function Page({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-6 lg:p-10">
      <h1 className="text-2xl font-semibold text-zinc-900 mb-6">{title}</h1>
      {children}
    </div>
  );
}

function PlatformHome({ name }: { name: string }) {
  const stats = useQuery(api.platform.stats);

  return (
    <Page title="Panel maestro">
      <p className="text-sm text-zinc-500 -mt-4 mb-6">
        Hola, {name}. Vista global de la plataforma Vekino.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Building2}
          label="Condominios"
          value={stats?.condominios.total}
        />
        <StatCard
          icon={CheckCircle2}
          label="Activos"
          value={stats?.condominios.activos}
          accent="emerald"
        />
        <StatCard
          icon={Users}
          label="Usuarios"
          value={stats?.usuarios.total}
        />
        <StatCard
          icon={ShieldCheck}
          label="Superadmins"
          value={stats?.usuarios.superadmins}
          accent="amber"
        />
      </div>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <QuickLink
          href="/dashboard/condominios"
          icon={Building2}
          title="Gestionar condominios"
          desc="Crear, activar y editar conjuntos."
        />
        <QuickLink
          href="/dashboard/administradores"
          icon={Users}
          title="Administradores"
          desc="Roles de plataforma y usuarios."
        />
      </div>
    </Page>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | undefined;
  accent?: "emerald" | "amber";
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-600 bg-emerald-50"
      : accent === "amber"
        ? "text-amber-600 bg-amber-50"
        : "text-primary bg-primary/5";
  return (
    <div className="bg-white rounded-2xl ring-1 ring-zinc-100 p-5">
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center ${accentClass}`}
      >
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-3xl font-bold text-zinc-900 mt-3">
        {value ?? "—"}
      </p>
      <p className="text-sm text-zinc-500">{label}</p>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  title,
  desc,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group bg-white rounded-2xl ring-1 ring-zinc-100 p-5 hover:ring-primary/30 hover:shadow-md transition-all"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/5 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="font-semibold text-zinc-900">{title}</p>
          <p className="text-sm text-zinc-500">{desc}</p>
        </div>
      </div>
    </Link>
  );
}

function UserHome({
  me,
}: {
  me: NonNullable<ReturnType<typeof useQuery<typeof api.users.me>>>;
}) {
  // Un solo condominio: el shell ya redirige; aquí solo multi-condo o vacío.
  return (
    <Page title={`Hola, ${me.name}`}>
      <div className="bg-white rounded-2xl ring-1 ring-zinc-100 p-6 max-w-xl">
        <p className="text-sm text-zinc-500">{me.email}</p>
        <div className="mt-6">
          <div className="flex items-center gap-2 text-zinc-900">
            <Building2 className="w-4 h-4 text-primary" />
            <strong className="text-sm">
              Mis condominios ({me.memberships.length})
            </strong>
          </div>
          {me.memberships.length === 0 ? (
            <p className="text-sm text-zinc-500 mt-3">
              Aún no perteneces a ningún condominio.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-zinc-100">
              {me.memberships.map((m) => {
                const canAdmin = m.roles.some((r) =>
                  ["administrador", "junta_directiva", "contadora"].includes(r),
                );
                const esGuardia = !canAdmin && m.roles.includes("guardia");
                const inner = (
                  <>
                    <span className="text-sm text-zinc-800">
                      {m.condominioName ?? m.condominioId}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {m.roles.join(", ")}
                    </span>
                  </>
                );
                const href = homeHrefForRoles(m.condominioId, m.roles);
                return (
                  <li key={m.membershipId}>
                    <Link
                      href={href}
                      className="flex items-center justify-between py-3 hover:text-primary group"
                    >
                      {inner}
                      <span className="text-xs text-primary opacity-0 group-hover:opacity-100">
                        {canAdmin ? "Administrar →" : esGuardia ? "Portería →" : "Entrar →"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Page>
  );
}
