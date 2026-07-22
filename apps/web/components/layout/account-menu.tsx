"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronsUpDown,
  ChevronRight,
  LayoutGrid,
  LogOut,
  Monitor,
  Moon,
  Sun,
  User,
  Check,
  Palette,
} from "lucide-react";
import type { Id } from "@vekino/backend/dataModel";
import { authClient } from "@/lib/auth-client";
import { useTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/user-avatar";

const THEME_OPTIONS: { id: Theme; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Claro", icon: Sun },
  { id: "dark", label: "Oscuro", icon: Moon },
  { id: "system", label: "Sistema", icon: Monitor },
];

const popoverSurface =
  "rounded-2xl border border-border bg-popover text-popover-foreground shadow-floating " +
  "backdrop-blur-2xl backdrop-saturate-150 dark:border-white/12";

type Pos = { bottom: number; left: number; width: number };

export function AccountMenu({
  condominioId,
  userName,
  userImage,
  roleLabel,
  isPlatform,
  onNavigate,
}: {
  condominioId: Id<"condominios">;
  userName: string;
  userImage?: string | null;
  roleLabel: string;
  isPlatform?: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [mounted, setMounted] = useState(false);
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
              <p className="truncate text-[11px] text-muted-foreground">{roleLabel}</p>
            </div>

            <div className="flex flex-col gap-0.5">
              <Link
                href={`/condominio/${condominioId}/perfil`}
                onClick={() => {
                  setOpen(false);
                  onNavigate?.();
                }}
                className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-normal text-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              >
                <User className="h-3.5 w-3.5 stroke-[1.5] text-muted-foreground" aria-hidden />
                Mi perfil
              </Link>

              {isPlatform && (
                <Link
                  href="/dashboard"
                  onClick={() => {
                    setOpen(false);
                    onNavigate?.();
                  }}
                  className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-normal text-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <LayoutGrid className="h-3.5 w-3.5 stroke-[1.5] text-muted-foreground" aria-hidden />
                  Volver a plataforma
                </Link>
              )}

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
    <div className="relative border-t border-border/70 pt-2.5">
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
          <p className="truncate text-[10.5px] text-muted-foreground">{roleLabel}</p>
        </div>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 stroke-[1.5] text-muted-foreground/70" aria-hidden />
      </button>
      {panel}
    </div>
  );
}
