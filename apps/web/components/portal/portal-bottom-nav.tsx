"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Home, Wallet, Megaphone, CalendarCheck, LayoutGrid, LogOut } from "lucide-react";
import { PORTAL_NAV } from "./portal-nav-config";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

/** Items principales de la barra inferior (el resto va en "Más"). */
const MAIN = [
  { label: "Inicio", segment: "", icon: Home },
  { label: "Facturas", segment: "cuenta", icon: Wallet },
  { label: "Avisos", segment: "avisos", icon: Megaphone },
  { label: "Reservas", segment: "reservas", icon: CalendarCheck },
];

/**
 * Barra de navegación inferior fija (móvil), réplica del patrón de VekinoWeb.
 * La opción activa usa el color primario. "Más" abre un panel con todo.
 */
export function PortalBottomNav({ base }: { base: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function isActive(segment: string) {
    const href = segment ? `${base}/${segment}` : base;
    return segment ? pathname === href || pathname.startsWith(`${href}/`) : pathname === base;
  }

  async function signOut() {
    await authClient.signOut();
    router.replace("/");
  }

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden">
        <div className="flex h-16 items-center justify-around gap-1 px-1">
          {MAIN.map((item) => {
            const href = item.segment ? `${base}/${item.segment}` : base;
            const active = isActive(item.segment);
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={href}
                className={cn(
                  "flex h-[3.25rem] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="w-full truncate text-center text-[10px] font-medium leading-none">
                  {item.label}
                </span>
              </Link>
            );
          })}
          <button
            onClick={() => setOpen(true)}
            className="flex h-[3.25rem] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md text-muted-foreground"
          >
            <LayoutGrid className="h-5 w-5" />
            <span className="text-[10px] font-medium leading-none">Más</span>
          </button>
        </div>
      </nav>

      {/* Panel "Más" */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="animate-fade-in absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="animate-slide-up absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border bg-card p-4 pb-8">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
            <div className="grid grid-cols-3 gap-2">
              {PORTAL_NAV.map((item) => {
                const href = item.segment ? `${base}/${item.segment}` : base;
                const active = isActive(item.segment);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors",
                      active
                        ? "border-primary/30 bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-xs font-medium leading-tight">{item.label}</span>
                  </Link>
                );
              })}
            </div>
            <button
              onClick={signOut}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-accent"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </>
  );
}
