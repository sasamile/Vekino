"use client";

import { useEffect, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import { Authenticated, Unauthenticated, AuthLoading, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { SidebarContent } from "@/components/layout/sidebar-content";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Spinner } from "@/components/ui/spinner";
import { hexToHslChannels } from "@/lib/utils";

export function CondominioShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <AuthLoading>
        <Fullscreen>
          <Spinner className="h-5 w-5" />
        </Fullscreen>
      </AuthLoading>
      <Unauthenticated>
        <Redirect to="/" />
      </Unauthenticated>
      <Authenticated>
        <Guard>{children}</Guard>
      </Authenticated>
    </div>
  );
}

function Fullscreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
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

function Guard({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const condominioId = params.id as Id<"condominios">;
  const home = useQuery(api.condominios.adminHome, { condominioId });

  if (home === undefined) {
    return (
      <Fullscreen>
        <Spinner className="h-5 w-5" />
      </Fullscreen>
    );
  }
  if (!home.allowed) return <Redirect to="/dashboard" />;

  const base = `/condominio/${condominioId}`;
  const brandChannels = home.condominio.primaryColor
    ? hexToHslChannels(home.condominio.primaryColor)
    : null;

  // Acento del condominio (azul en Ciudad del Campo, naranja en Arboleda).
  const themeStyle = brandChannels
    ? ({
        "--brand": brandChannels,
        "--ring": brandChannels,
      } as CSSProperties)
    : undefined;

  return (
    <div className="min-h-screen" style={themeStyle}>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-border lg:block">
        <SidebarContent
          base={base}
          name={home.condominio.name}
          logo={home.condominio.logo}
          userName={home.userName}
          isPlatform={home.isPlatform}
        />
      </aside>

      <MobileNav
        base={base}
        name={home.condominio.name}
        logo={home.condominio.logo}
        userName={home.userName}
        isPlatform={home.isPlatform}
      />

      <main className="min-w-0 lg:pl-64">{children}</main>
    </div>
  );
}
