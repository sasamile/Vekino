"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, LogOut } from "lucide-react";
import { SidebarNav } from "./sidebar-nav";
import { authClient } from "@/lib/auth-client";
import { initials, cn } from "@/lib/utils";

export function SidebarContent({
  base,
  name,
  logo,
  userName,
  isPlatform,
  onNavigate,
}: {
  base: string;
  name: string;
  logo: string | null;
  userName: string;
  isPlatform: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.replace("/");
  }

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Marca */}
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt={name}
            className="h-9 w-9 rounded-lg object-cover ring-1 ring-border"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
            {initials(name)}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-foreground">
            {name}
          </p>
          <p className="text-xs text-muted-foreground">Administración</p>
        </div>
      </div>

      <SidebarNav base={base} onNavigate={onNavigate} />

      {/* Footer */}
      <div className="space-y-1 border-t border-border p-3">
        {isPlatform && (
          <Link
            href="/dashboard"
            onClick={onNavigate}
            className={cn(
              "flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground",
              "transition-colors duration-150 hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Plataforma
          </Link>
        )}
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
            {initials(userName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {userName.split(" ")[0]}
            </p>
            <p className="truncate text-xs text-muted-foreground">Sesión activa</p>
          </div>
          <button
            onClick={signOut}
            aria-label="Cerrar sesión"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
