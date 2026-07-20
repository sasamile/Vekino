"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Authenticated,
  Unauthenticated,
  AuthLoading,
  useQuery,
  useMutation,
} from "convex/react";
import {
  LayoutDashboard,
  Building2,
  ShieldCheck,
  LogOut,
  Users,
} from "lucide-react";
import { api } from "@vekino/backend/api";
import { authClient } from "@/lib/auth-client";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const PLATFORM_NAV: NavItem[] = [
  { href: "/dashboard", label: "Inicio", icon: LayoutDashboard },
  { href: "/dashboard/condominios", label: "Condominios", icon: Building2 },
  { href: "/dashboard/administradores", label: "Administradores", icon: Users },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50">
      <AuthLoading>
        <FullscreenMsg>Cargando…</FullscreenMsg>
      </AuthLoading>
      <Unauthenticated>
        <Redirect to="/" />
      </Unauthenticated>
      <Authenticated>
        <Shell>{children}</Shell>
      </Authenticated>
    </div>
  );
}

function FullscreenMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-zinc-500">
      {children}
    </div>
  );
}

function Redirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return <FullscreenMsg>Entrando…</FullscreenMsg>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const ensureProfile = useMutation(api.users.ensureProfile);
  const me = useQuery(api.users.me);
  const pathname = usePathname();

  useEffect(() => {
    ensureProfile().catch(() => {});
  }, [ensureProfile]);

  if (me === undefined || me === null) {
    return <FullscreenMsg>Cargando…</FullscreenMsg>;
  }

  const isPlatform =
    me.platformRole === "superadmin" || me.platformRole === "admin";

  // Un solo condominio: entrar directo, sin panel de plataforma. Los roles
  // administrativos van al área de administración; el resto (propietario,
  // arrendatario, residente…) va a su portal personal.
  if (!isPlatform && me.memberships.length === 1 && me.memberships[0]) {
    const m = me.memberships[0];
    const canAdmin = m.roles.some((r) =>
      ["administrador", "junta_directiva", "contadora"].includes(r),
    );
    return (
      <Redirect
        to={canAdmin ? `/condominio/${m.condominioId}` : `/mi/${m.condominioId}`}
      />
    );
  }

  // Rutas solo de plataforma.
  if (
    !isPlatform &&
    (pathname.startsWith("/dashboard/condominios") ||
      pathname.startsWith("/dashboard/administradores"))
  ) {
    return <Redirect to="/dashboard" />;
  }

  if (!isPlatform) {
    return (
      <div className="min-h-screen">
        <MinimalSidebar me={me} />
        <main className="ml-64 min-h-screen min-w-0">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Sidebar nav={PLATFORM_NAV} me={me} />
      <main className="ml-64 min-h-screen min-w-0">{children}</main>
    </div>
  );
}

function MinimalSidebar({
  me,
}: {
  me: NonNullable<ReturnType<typeof useQuery<typeof api.users.me>>>;
}) {
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.replace("/");
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-zinc-200 bg-white">
      <div className="border-b border-zinc-100 px-5 py-4">
        <Image
          src="/logos/logo-vekino.svg"
          alt="Vekino"
          width={120}
          height={40}
          className="h-8 w-auto"
        />
      </div>
      <nav className="flex-1 px-3 py-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900"
        >
          <LayoutDashboard className="h-4 w-4 text-zinc-500" />
          Mis condominios
        </Link>
      </nav>
      <div className="border-t border-zinc-100 p-3">
        <div className="px-3 py-2">
          <p className="truncate text-sm font-medium text-zinc-900">{me.name}</p>
          <p className="truncate text-xs text-zinc-500">{me.email}</p>
        </div>
        <button
          onClick={signOut}
          className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}

function Sidebar({
  nav,
  me,
}: {
  nav: NavItem[];
  me: NonNullable<ReturnType<typeof useQuery<typeof api.users.me>>>;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.replace("/");
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-primary text-white">
      <div className="p-5">
        <Image
          src="/logos/logo-vekino.svg"
          alt="Vekino"
          width={130}
          height={44}
          className="h-auto w-32 brightness-0 invert"
        />
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {nav.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${
                active
                  ? "bg-white/15 font-medium text-white"
                  : "text-white/65 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="px-3 py-2">
          <p className="truncate text-sm font-medium">{me.name}</p>
          <p className="truncate text-xs text-white/50">{me.email}</p>
          {me.platformRole && (
            <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/80">
              <ShieldCheck className="h-3 w-3" />
              {me.platformRole === "superadmin" ? "Superadmin" : "Admin"}
            </span>
          )}
        </div>
        <button
          onClick={signOut}
          className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/65 transition-colors duration-150 hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
