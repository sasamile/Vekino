"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS } from "./nav-config";
import { cn } from "@/lib/utils";

export function SidebarNav({
  base,
  onNavigate,
}: {
  base: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {NAV_GROUPS.map((group, gi) => (
        <div key={group.title ?? `g-${gi}`} className="space-y-1">
          {group.title && (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.title}
            </p>
          )}
          {group.items.map((item) => {
            const href = item.segment ? `${base}/${item.segment}` : base;
            const active = item.segment
              ? pathname === href || pathname.startsWith(`${href}/`)
              : pathname === base;
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-150",
                  active
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors",
                    active
                      ? "text-brand"
                      : "text-muted-foreground/70 group-hover:text-foreground",
                  )}
                  aria-hidden
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
