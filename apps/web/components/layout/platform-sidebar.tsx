"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Check,
  ChevronsUpDown,
  ChevronRight,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Palette,
  Sun,
  X,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { PLATFORM_NAV } from "@/components/layout/platform-nav-config";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const THEME_OPTIONS: { id: Theme; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Claro", icon: Sun },
  { id: "dark", label: "Oscuro", icon: Moon },
  { id: "system", label: "Sistema", icon: Monitor },
];

const popoverSurface =
  "rounded-2xl border border-border bg-popover text-popover-foreground shadow-floating " +
  "backdrop-blur-2xl backdrop-saturate-150 dark:border-white/12";

function roleLabel(role: "superadmin" | "admin" | null | undefined) {
  if (role === "superadmin") return "Superadmin";
  if (role === "admin") return "Admin";
  return "Plataforma";
}

export function PlatformSidebar({
  userName,
  userEmail,
  userImage,
  platformRole,
  onNavigate,
}: {
  userName: string;
  userEmail: string;
  userImage?: string | null;
  platformRole: "superadmin" | "admin" | null | undefined;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-3 bg-card px-3 py-3.5">
      {/* Brand — mismo patrón que CondoSwitcher */}
      <div className="flex shrink-0 items-center gap-2.5 rounded-lg px-1 py-1">
        <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[10px] border border-border bg-muted">
          <Image
            src="/logos/logo-vekino.svg"
            alt=""
            width={28}
            height={28}
            className="h-6 w-6 object-contain dark:brightness-0 dark:invert"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium tracking-tight text-foreground">
            Vekino
          </p>
          <p className="-mt-px truncate text-[11px] font-normal text-muted-foreground">
            Plataforma
          </p>
        </div>
      </div>

      <div className="pointer-events-none absolute left-0 right-0 top-14 h-px bg-border" />

      <nav className="mt-1 flex min-h-0 flex-1 flex-col gap-px overflow-y-auto pt-1">
        {PLATFORM_NAV.map((item) => {
          const active =
            item.segment === ""
              ? pathname === "/dashboard"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
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
      </nav>

      <PlatformAccountMenu
        userName={userName}
        userEmail={userEmail}
        userImage={userImage}
        roleLabel={roleLabel(platformRole)}
        onNavigate={onNavigate}
      />
    </div>
  );
}

function PlatformAccountMenu({
  userName,
  userEmail,
  userImage,
  roleLabel: role,
  onNavigate,
}: {
  userName: string;
  userEmail: string;
  userImage?: string | null;
  roleLabel: string;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ bottom: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  function place() {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, 248);
    const left = Math.min(r.left, window.innerWidth - width - 12);
    setPos({
      bottom: window.innerHeight - r.top + 10,
      left: Math.max(12, left),
      width,
    });
  }

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setThemeOpen(false);
      return;
    }
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (themeOpen) setThemeOpen(false);
        else setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, themeOpen]);

  async function signOut() {
    setOpen(false);
    onNavigate?.();
    await authClient.signOut();
    router.replace("/");
  }

  const themeLabel =
    THEME_OPTIONS.find((o) => o.id === theme)?.label ?? "Sistema";

  const panel =
    open && pos && mounted
      ? createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Menú de cuenta"
            style={{
              position: "fixed",
              bottom: pos.bottom,
              left: pos.left,
              width: pos.width,
            }}
            className={cn("z-100 origin-bottom-left p-1.5 animate-fade-in", popoverSurface)}
          >
            <div className="px-2.5 py-2">
              <p className="truncate text-[13px] font-medium tracking-tight text-foreground">
                {userName}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">{userEmail}</p>
            </div>

            <div className="flex flex-col gap-0.5">
              <div className="relative">
                <button
                  type="button"
                  aria-expanded={themeOpen}
                  onClick={() => setThemeOpen((v) => !v)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-normal transition-colors",
                    themeOpen
                      ? "bg-black/5 dark:bg-white/10"
                      : "hover:bg-black/5 dark:hover:bg-white/10",
                  )}
                >
                  <Palette className="h-3.5 w-3.5 stroke-[1.5] text-muted-foreground" aria-hidden />
                  <span className="flex-1 text-left">Tema</span>
                  <span className="text-[11px] text-muted-foreground">{themeLabel}</span>
                  <ChevronRight className="h-3.5 w-3.5 stroke-[1.5] text-muted-foreground" aria-hidden />
                </button>

                {themeOpen && (
                  <div
                    role="menu"
                    className={cn(
                      "absolute bottom-0 left-[calc(100%+8px)] w-42 origin-bottom-left p-1 animate-fade-in",
                      popoverSurface,
                    )}
                  >
                    {THEME_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const active = theme === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={active}
                          onClick={() => {
                            setTheme(opt.id);
                            setThemeOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-normal transition-colors",
                            active
                              ? "bg-black/5 text-foreground dark:bg-white/10"
                              : "text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10",
                          )}
                        >
                          <Icon className="h-3.5 w-3.5 stroke-[1.5]" aria-hidden />
                          <span className="flex-1 text-left">{opt.label}</span>
                          {active && (
                            <Check className="h-3.5 w-3.5 text-brand" aria-hidden />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={signOut}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-normal text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
              >
                <LogOut className="h-3.5 w-3.5 stroke-[1.5]" aria-hidden />
                Cerrar sesión
              </button>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative shrink-0 border-t border-border/70 pt-2.5">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors",
          open ? "bg-accent" : "hover:bg-accent/70",
        )}
      >
        <UserAvatar
          name={userName}
          image={userImage}
          className="h-7 w-7 bg-muted text-[10px] text-muted-foreground"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-normal text-foreground">{userName}</p>
          <p className="truncate text-[10.5px] text-muted-foreground">{role}</p>
        </div>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 stroke-[1.5] text-muted-foreground/70" aria-hidden />
      </button>
      {panel}
    </div>
  );
}

export function PlatformMobileNav({
  userName,
  userEmail,
  userImage,
  platformRole,
}: {
  userName: string;
  userEmail: string;
  userImage?: string | null;
  platformRole: "superadmin" | "admin" | null | undefined;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const close = useCallback(() => setOpen(false), []);
  const prevPath = useRef(pathname);

  useEffect(() => {
    if (prevPath.current !== pathname) {
      prevPath.current = pathname;
      setOpen(false);
    }
  }, [pathname]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">Vekino</p>
          <p className="-mt-0.5 text-[11px] text-muted-foreground">Plataforma</p>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="animate-fade-in absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={close}
          />
          <div className="animate-slide-up absolute inset-y-0 left-0 flex w-63 flex-col border-r border-border bg-card shadow-floating">
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <span className="text-sm font-medium">Menú</span>
              <button
                type="button"
                onClick={close}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <PlatformSidebar
                userName={userName}
                userEmail={userEmail}
                userImage={userImage}
                platformRole={platformRole}
                onNavigate={close}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
