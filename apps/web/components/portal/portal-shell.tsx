"use client";

import { useEffect, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Authenticated,
  Unauthenticated,
  AuthLoading,
  useQuery,
} from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { PortalSidebarContent } from "@/components/portal/portal-sidebar";
import { PortalMobileNav } from "@/components/portal/portal-mobile-nav";
import { Spinner } from "@/components/ui/spinner";
import { hexToHslChannels, hexToBrandForeground } from "@/lib/utils";
import { BrandThemeProvider } from "@/lib/brand-theme";

export function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-dvh overflow-hidden bg-background">
      <AuthLoading>
        <Fullscreen>
          <Spinner className="h-5 w-5" />
        </Fullscreen>
      </AuthLoading>
      <Unauthenticated>
        <Redirect to="/login" />
      </Unauthenticated>
      <Authenticated>
        <Guard>{children}</Guard>
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
  const primary = home.condominio.primaryColor;
  const brandChannels = primary ? hexToHslChannels(primary) : null;

  const themeStyle = brandChannels
    ? ({
        "--brand": brandChannels,
        "--ring": brandChannels,
        "--brand-foreground": hexToBrandForeground(primary!),
      } as CSSProperties)
    : undefined;

  return (
    <BrandThemeProvider style={themeStyle}>
      <div
        className="flex h-dvh flex-col overflow-hidden bg-background lg:p-1"
        style={themeStyle}
        data-brand-scope
      >
        <div className="flex min-h-0 w-full flex-1 overflow-hidden bg-card lg:rounded-[18px] lg:border lg:border-border lg:shadow-soft">
          <aside className="hidden w-60 shrink-0 flex-col overflow-hidden border-r border-border lg:flex">
            <PortalSidebarContent
              base={base}
              name={home.condominio.name}
              logo={home.condominio.logo}
              coverImage={home.condominio.coverImage}
              city={home.condominio.city}
              userName={home.userName}
              userImage={home.userImage}
              isPlatform={home.isPlatform}
              roles={home.myRoles}
            />
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <PortalMobileNav
              base={base}
              name={home.condominio.name}
              logo={home.condominio.logo}
              coverImage={home.condominio.coverImage}
              city={home.condominio.city}
              userName={home.userName}
              userImage={home.userImage}
              isPlatform={home.isPlatform}
              roles={home.myRoles}
            />
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background">
              <div className="w-full px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
                {children}
              </div>
            </div>
          </div>
        </div>
      </div>
    </BrandThemeProvider>
  );
}
