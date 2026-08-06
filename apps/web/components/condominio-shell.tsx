"use client";

import { Suspense, useEffect, type CSSProperties } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Authenticated, Unauthenticated, AuthLoading, useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { SidebarContent } from "@/components/layout/sidebar-content";
import { MobileNav } from "@/components/layout/mobile-nav";
import { AdminTopbar } from "@/components/layout/admin-topbar";
import { AdminTopbarProvider } from "@/components/layout/admin-topbar-context";
import { canAccessCondoSegment } from "@/components/layout/nav-config";
import { Spinner } from "@/components/ui/spinner";
import { CambiarClaveTemporalModal } from "@/components/cambiar-clave-temporal-modal";
import { WhatsappFab } from "@/components/whatsapp-fab";
import { hexToHslChannels, hexToBrandForeground } from "@/lib/utils";
import { BrandThemeProvider } from "@/lib/brand-theme";

export function CondominioShell({ children }: { children: React.ReactNode }) {
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

/**
 * Shell fijo (sin scroll de página).
 * Scroll solo en el panel main, dentro de la card.
 */
function Guard({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const condominioId = params.id as Id<"condominios">;
  const home = useQuery(api.condominios.adminHome, { condominioId });

  const base = `/condominio/${condominioId}`;
  const segment =
    pathname.startsWith(base)
      ? pathname.slice(base.length).replace(/^\//, "").split("/")[0] ?? ""
      : "";

  useEffect(() => {
    if (!home?.allowed) return;
    if (
      !canAccessCondoSegment(home.myRoles, home.isPlatform, segment)
    ) {
      router.replace(base);
    }
  }, [home, segment, base, router]);

  if (home === undefined) {
    return (
      <Fullscreen>
        <Spinner className="h-5 w-5" />
      </Fullscreen>
    );
  }
  if (!home.allowed) return <Redirect to="/dashboard" />;

  if (!canAccessCondoSegment(home.myRoles, home.isPlatform, segment)) {
    return (
      <Fullscreen>
        <Spinner className="h-5 w-5" />
      </Fullscreen>
    );
  }

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
        className="font-admin flex h-dvh flex-col overflow-hidden bg-background lg:p-1"
        style={themeStyle}
        data-brand-scope
      >
        <div className="flex min-h-0 w-full flex-1 overflow-hidden bg-card lg:rounded-[18px] lg:border lg:border-border lg:shadow-soft">
          <aside className="hidden w-60 shrink-0 flex-col overflow-hidden border-r border-border lg:flex">
            <SidebarContent
              base={base}
              condominioId={condominioId}
              name={home.condominio.name}
              logo={home.condominio.logo}
              city={home.condominio.city}
              userName={home.userName}
              userImage={home.userImage}
              isPlatform={home.isPlatform}
              roles={home.myRoles}
            />
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <MobileNav
              base={base}
              condominioId={condominioId}
              name={home.condominio.name}
              logo={home.condominio.logo}
              city={home.condominio.city}
              userName={home.userName}
              userImage={home.userImage}
              isPlatform={home.isPlatform}
              roles={home.myRoles}
            />
            <AdminTopbarProvider>
              <AdminTopbar
                base={base}
                roles={home.myRoles}
                isPlatform={home.isPlatform}
              />
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <Suspense fallback={null}>{children}</Suspense>
              </div>
            </AdminTopbarProvider>
          </div>
        </div>

        <CambiarClaveTemporalModal />
        {/* Sin barra inferior en móvil: `MobileNav` es solo header superior. */}
        <WhatsappFab condominioId={condominioId} />
      </div>
    </BrandThemeProvider>
  );
}
