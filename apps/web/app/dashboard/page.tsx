"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Building2, CheckCircle2, Users, ShieldCheck } from "lucide-react";
import { api } from "@vekino/backend/api";
import { homeHrefForRoles } from "@/lib/role-routing";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/layout/stat-card";

export default function DashboardHome() {
  const me = useQuery(api.users.me);

  if (me === undefined) {
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </PageContainer>
    );
  }
  if (me === null) {
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">Configurando tu perfil…</p>
      </PageContainer>
    );
  }

  const isPlatform =
    me.platformRole === "superadmin" || me.platformRole === "admin";

  return isPlatform ? <PlatformHome name={me.name} /> : <UserHome me={me} />;
}

function PlatformHome({ name }: { name: string }) {
  const stats = useQuery(api.platform.stats);

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          title="Panel maestro"
          description={`Hola, ${name}. Vista global de la plataforma Vekino.`}
        />

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={Building2}
            tone="brand"
            label="Condominios"
            value={stats?.condominios.total ?? "—"}
            href="/dashboard/condominios"
          />
          <StatCard
            icon={CheckCircle2}
            tone="success"
            label="Activos"
            value={stats?.condominios.activos ?? "—"}
          />
          <StatCard
            icon={Users}
            tone="neutral"
            label="Usuarios"
            value={stats?.usuarios.total ?? "—"}
          />
          <StatCard
            icon={ShieldCheck}
            tone="warning"
            label="Superadmins"
            value={stats?.usuarios.superadmins ?? "—"}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
      </div>
    </PageContainer>
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
    <Link href={href} className="block">
      <Card className="flex items-center gap-3 transition-colors hover:bg-accent/40">
        <div className="grid h-10.5 w-10.5 place-items-center rounded-[11px] bg-brand/10 text-brand">
          <Icon className="h-4.5 w-4.5 stroke-[1.75]" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
      </Card>
    </Link>
  );
}

function UserHome({
  me,
}: {
  me: NonNullable<ReturnType<typeof useQuery<typeof api.users.me>>>;
}) {
  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader title={`Hola, ${me.name}`} description={me.email} />
        <Card className="max-w-xl">
          <div className="flex items-center gap-2 text-foreground">
            <Building2 className="h-4 w-4 text-brand" />
            <strong className="text-sm">
              Mis condominios ({me.memberships.length})
            </strong>
          </div>
          {me.memberships.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Aún no perteneces a ningún condominio.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {me.memberships.map((m) => {
                const canAdmin = m.roles.some((r) =>
                  ["administrador", "junta_directiva", "contadora"].includes(r),
                );
                const esGuardia = !canAdmin && m.roles.includes("guardia");
                const href = homeHrefForRoles(m.condominioId, m.roles);
                return (
                  <li key={m.membershipId}>
                    <Link
                      href={href}
                      className="group flex items-center justify-between py-3 hover:text-brand"
                    >
                      <span className="flex flex-col">
                        <span className="text-sm text-foreground">
                          {m.condominioName ?? m.condominioId}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {m.roles.join(", ")}
                        </span>
                      </span>
                      <span className="text-xs text-brand opacity-0 group-hover:opacity-100">
                        {canAdmin
                          ? "Administrar →"
                          : esGuardia
                            ? "Portería →"
                            : "Entrar →"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
