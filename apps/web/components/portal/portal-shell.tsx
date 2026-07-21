"use client";

import { useEffect, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import { Authenticated, Unauthenticated, AuthLoading, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { PortalTopNav } from "@/components/portal/portal-top-nav";
import { PortalBottomNav } from "@/components/portal/portal-bottom-nav";
import { Spinner } from "@/components/ui/spinner";
import { hexToHslChannels } from "@/lib/utils";

export function PortalShell({ children }: { children: React.ReactNode }) {
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
  const home = useQuery(api.portal.home, { condominioId });

  if (home === undefined) {
    return (
      <Fullscreen>
        <Spinner className="h-5 w-5" />
      </Fullscreen>
    );
  }
  if (!home.allowed) return <Redirect to="/dashboard" />;

  const base = `/mi/${condominioId}`;
  const brandChannels = home.condominio.primaryColor
    ? hexToHslChannels(home.condominio.primaryColor)
    : null;

  // Acento del condominio (color de marca en tabs activas, iconos, botones).
  const themeStyle = brandChannels
    ? ({
        "--brand": brandChannels,
        "--ring": brandChannels,
      } as CSSProperties)
    : undefined;

  return (
    <div className="min-h-screen bg-background" style={themeStyle}>
      <PortalTopNav
        base={base}
        name={home.condominio.name}
        logo={home.condominio.logo}
        userName={home.userName}
        userImage={home.userImage}
        userEmail={home.userEmail}
        isPlatform={home.isPlatform}
      />

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-2 sm:px-6 md:pb-10">
        {children}
      </main>

      <PortalBottomNav base={base} />
    </div>
  );
}
