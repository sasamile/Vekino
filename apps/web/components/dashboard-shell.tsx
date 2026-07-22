"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Authenticated,
  Unauthenticated,
  AuthLoading,
  useQuery,
  useMutation,
} from "convex/react";
import { LayoutDashboard, LogOut } from "lucide-react";
import { api } from "@vekino/backend/api";
import { authClient } from "@/lib/auth-client";
import { homeHrefForRoles } from "@/lib/role-routing";
import {
  PlatformSidebar,
  PlatformMobileNav,
} from "@/components/layout/platform-sidebar";
import { AdminTopbar } from "@/components/layout/admin-topbar";
import { AdminTopbarProvider } from "@/components/layout/admin-topbar-context";
import { Spinner } from "@/components/ui/spinner";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-dvh overflow-hidden bg-background">
      <AuthLoading>
        <Fullscreen>
          <Spinner className="h-5 w-5" />
        </Fullscreen>
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

function Fullscreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function Redirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return (
    <Fullscreen>
      <Spinner className="h-5 w-5" />
    </Fullscreen>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const ensureProfile = useMutation(api.users.ensureProfile);
  const me = useQuery(api.users.me);
  const pathname = usePathname();

  useEffect(() => {
    ensureProfile().catch(() => {});
  }, [ensureProfile]);

  if (me === undefined || me === null) {
    return (
      <Fullscreen>
        <Spinner className="h-5 w-5" />
      </Fullscreen>
    );
  }

  const isPlatform =
    me.platformRole === "superadmin" || me.platformRole === "admin";

  if (!isPlatform && me.memberships.length === 1 && me.memberships[0]) {
    const m = me.memberships[0];
    return <Redirect to={homeHrefForRoles(m.condominioId, m.roles)} />;
  }

  if (
    !isPlatform &&
    (pathname.startsWith("/dashboard/condominios") ||
      pathname.startsWith("/dashboard/administradores") ||
      pathname.startsWith("/dashboard/soporte"))
  ) {
    return <Redirect to="/dashboard" />;
  }

  if (!isPlatform) {
    return <UserMultiCondoShell me={me}>{children}</UserMultiCondoShell>;
  }

  return (
    <div className="font-admin flex h-dvh flex-col overflow-hidden bg-background lg:p-3.5">
      <div className="flex min-h-0 w-full flex-1 overflow-hidden bg-card lg:rounded-[18px] lg:border lg:border-border lg:shadow-soft">
        <aside className="hidden w-60 shrink-0 flex-col overflow-hidden border-r border-border lg:flex">
          <PlatformSidebar
            userName={me.name}
            userEmail={me.email}
            userImage={me.image}
            platformRole={me.platformRole}
          />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <PlatformMobileNav
            userName={me.name}
            userEmail={me.email}
            userImage={me.image}
            platformRole={me.platformRole}
          />
          <AdminTopbarProvider>
            <AdminTopbar base="/dashboard" variant="platform" />
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <Suspense fallback={null}>{children}</Suspense>
            </div>
          </AdminTopbarProvider>
        </div>
      </div>
    </div>
  );
}

function UserMultiCondoShell({
  me,
  children,
}: {
  me: NonNullable<ReturnType<typeof useQuery<typeof api.users.me>>>;
  children: React.ReactNode;
}) {
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.replace("/");
  }

  return (
    <div className="font-admin flex h-dvh flex-col overflow-hidden bg-background lg:p-3.5">
      <div className="flex min-h-0 w-full flex-1 overflow-hidden bg-card lg:rounded-[18px] lg:border lg:border-border lg:shadow-soft">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card lg:flex">
          <div className="flex h-full flex-col gap-3 px-3 py-3.5">
            <div className="px-1.5 py-1">
              <Image
                src="/logos/logo-vekino.svg"
                alt="Vekino"
                width={112}
                height={36}
                className="h-7 w-auto dark:brightness-0 dark:invert"
              />
            </div>
            <nav className="flex-1">
              <Link
                href="/dashboard"
                className="flex h-8 items-center gap-2.5 rounded-lg bg-accent px-2.5 text-[13px] font-normal text-foreground"
              >
                <LayoutDashboard className="h-3.75 w-3.75 stroke-2 text-brand" />
                Mis condominios
              </Link>
            </nav>
            <div className="border-t border-border/70 pt-2.5">
              <div className="px-1.5 py-1">
                <p className="truncate text-[12.5px] text-foreground">{me.name}</p>
                <p className="truncate text-[10.5px] text-muted-foreground">{me.email}</p>
              </div>
              <button
                type="button"
                onClick={signOut}
                className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-red-600 hover:bg-red-500/10 dark:text-red-400"
              >
                <LogOut className="h-3.5 w-3.5" />
                Cerrar sesión
              </button>
            </div>
          </div>
        </aside>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  );
}
