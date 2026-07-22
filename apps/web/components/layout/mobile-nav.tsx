"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import type { Id } from "@vekino/backend/dataModel";
import { SidebarContent } from "./sidebar-content";
import { initials } from "@/lib/utils";

export function MobileNav({
  base,
  condominioId,
  name,
  logo,
  city,
  userName,
  userImage,
  isPlatform,
  roles,
}: {
  base: string;
  condominioId: Id<"condominios">;
  name: string;
  logo: string | null;
  city?: string | null;
  userName: string;
  userImage?: string | null;
  isPlatform: boolean;
  roles: string[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur lg:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={name} className="h-7 w-7 rounded-md object-cover" />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-[10px] font-semibold text-brand-foreground">
              {initials(name).slice(0, 1)}
            </div>
          )}
          <span className="truncate text-sm font-semibold tracking-tight text-foreground">
            {name}
          </span>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="animate-fade-in absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="animate-slide-up absolute inset-y-0 left-0 w-63 border-r border-border bg-card shadow-floating">
            <button
              onClick={() => setOpen(false)}
              aria-label="Cerrar menú"
              className="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent
              base={base}
              condominioId={condominioId}
              name={name}
              logo={logo}
              city={city}
              userName={userName}
              userImage={userImage}
              isPlatform={isPlatform}
              roles={roles}
              onNavigate={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
