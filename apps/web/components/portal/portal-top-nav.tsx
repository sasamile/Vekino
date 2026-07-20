"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, ChevronLeft } from "lucide-react";
import { PORTAL_NAV } from "./portal-nav-config";
import { authClient } from "@/lib/auth-client";
import { initials, cn } from "@/lib/utils";

/**
 * Barra de navegación superior del portal del propietario (réplica del diseño
 * de VekinoWeb): fila de cabecera con logo + menú de usuario, y debajo la barra
 * de pestañas. La pestaña activa usa el color primario (navy).
 */
export function PortalTopNav({
  base,
  name,
  logo,
  userName,
  userEmail,
  isPlatform,
}: {
  base: string;
  name: string;
  logo: string | null;
  userName: string;
  userEmail: string;
  isPlatform: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  async function signOut() {
    await authClient.signOut();
    router.replace("/");
  }

  return (
    <div className="mx-auto max-w-7xl px-2 sm:px-6">
      {/* Cabecera: logo + menú de usuario */}
      <div className="border-b border-border pt-4">
        <div className="flex h-16 items-center gap-3">
          <Link href={base} className="flex min-w-0 items-center gap-2.5">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo}
                alt={name}
                className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-border"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
                {initials(name)}
              </div>
            )}
            <span className="truncate text-base font-semibold tracking-tight text-foreground">
              {name}
            </span>
          </Link>

          <div className="flex-1" />

          {/* Menú de usuario */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {initials(userName)}
              </div>
              <span className="hidden text-sm font-medium text-foreground md:inline">
                {userName.split(" ")[0]}
              </span>
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="animate-scale-in absolute right-0 z-50 mt-2 w-56 rounded-lg border border-border bg-card p-1 shadow-lg">
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {userName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {userEmail}
                    </p>
                  </div>
                  <div className="my-1 h-px bg-border" />
                  {isPlatform && (
                    <Link
                      href="/dashboard"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Plataforma
                    </Link>
                  )}
                  <button
                    onClick={signOut}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 transition-colors hover:bg-accent"
                  >
                    <LogOut className="h-4 w-4" />
                    Cerrar sesión
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Pestañas (solo desktop) */}
      <div className="hidden py-3 md:block">
        <nav className="flex items-center gap-1 overflow-x-auto">
          {PORTAL_NAV.map((item) => {
            const href = item.segment ? `${base}/${item.segment}` : base;
            const active = item.segment
              ? pathname === href || pathname.startsWith(`${href}/`)
              : pathname === base;
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
