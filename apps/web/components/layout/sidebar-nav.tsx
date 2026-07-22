"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { visibleNavGroups } from "./nav-config";
import { cn } from "@/lib/utils";

export function SidebarNav({
  base,
  roles,
  isPlatform,
  onNavigate,
}: {
  base: string;
  roles: string[];
  isPlatform: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const groups = visibleNavGroups(roles, isPlatform);
  const scrollerRef = useRef<HTMLElement>(null);
  const [fadeTop, setFadeTop] = useState(false);
  const [fadeBottom, setFadeBottom] = useState(false);

  const syncFades = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const canScroll = scrollHeight > clientHeight + 1;
    setFadeTop(canScroll && scrollTop > 4);
    setFadeBottom(canScroll && scrollTop + clientHeight < scrollHeight - 4);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    syncFades();
    el.addEventListener("scroll", syncFades, { passive: true });
    const ro = new ResizeObserver(syncFades);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", syncFades);
      ro.disconnect();
    };
  }, [syncFades, groups]);

  const maskImage =
    fadeTop && fadeBottom
      ? "linear-gradient(to bottom, transparent 0%, black 28px, black calc(100% - 28px), transparent 100%)"
      : fadeTop
        ? "linear-gradient(to bottom, transparent 0%, black 28px, black 100%)"
        : fadeBottom
          ? "linear-gradient(to bottom, black 0%, black calc(100% - 28px), transparent 100%)"
          : undefined;

  return (
    <nav
      ref={scrollerRef}
      className="scrollbar-none min-h-0 flex-1  pt-2 overflow-y-auto overflow-x-hidden"
      style={
        maskImage
          ? { WebkitMaskImage: maskImage, maskImage }
          : undefined
      }
    >
      <div className="flex flex-col gap-3">
        {groups.map((group, gi) => (
          <div key={group.title ?? `g-${gi}`} className="flex flex-col gap-px">
            {group.title && (
              <p className="mb-0.5 px-2.5 text-[10px] font-normal uppercase tracking-[0.06em] text-muted-foreground/70">
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
                    "group flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-normal tracking-[-0.01em] transition-colors",
                    active
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-3.75 w-3.75 shrink-0 stroke-2",
                      active
                        ? "text-brand"
                        : "text-foreground/45 group-hover:text-foreground/70",
                    )}
                    aria-hidden
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
