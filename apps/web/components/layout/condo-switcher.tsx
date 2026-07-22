"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { cn, initials } from "@/lib/utils";

/**
 * Switcher de condominios (estilo workspace).
 * Visible para plataforma o quien tenga más de un condo en listMine.
 */
export function CondoSwitcher({
  currentId,
  name,
  logo,
  city,
  isPlatform,
  onNavigate,
}: {
  currentId: Id<"condominios">;
  name: string;
  logo: string | null;
  city?: string | null;
  isPlatform: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const condos = useQuery(api.condominios.listMine);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const list = useMemo(
    () => (condos ?? []).filter((c: { isActive: boolean; }) => c.isActive !== false),
    [condos],
  );
  const canSwitch = isPlatform || list.length > 1;

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(t) ||
        (c.city ?? "").toLowerCase().includes(t),
    );
  }, [list, q]);

  function go(id: Id<"condominios">) {
    setOpen(false);
    onNavigate?.();
    if (id === currentId) return;
    const rest = pathname.replace(`/condominio/${currentId}`, "") || "";
    router.push(`/condominio/${id}${rest}`);
  }

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
      if ((e.metaKey || e.ctrlKey) && e.key >= "1" && e.key <= "9") {
        const idx = Number(e.key) - 1;
        const target = filtered[idx];
        if (target) {
          e.preventDefault();
          go(target._id);
        }
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filtered, currentId, pathname]);

  useEffect(() => {
    if (open) {
      setQ("");
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  if (!canSwitch) {
    return (
      <div className="flex shrink-0 items-center gap-2.5 px-1">
        <CondoMark name={name} logo={logo} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium tracking-tight text-foreground">
            {name}
          </p>
          <p className="-mt-px text-[11px] font-normal text-muted-foreground">
            {city ?? "Administración"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left transition-colors",
          open ? "bg-accent" : "hover:bg-accent/70",
        )}
      >
        <CondoMark name={name} logo={logo} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium tracking-tight text-foreground">
            {name}
          </p>
          <p className="-mt-px truncate text-[11px] font-normal text-muted-foreground">
            {city ?? "Administración"}
          </p>
        </div>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 stroke-[1.5] text-muted-foreground/70" aria-hidden />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-border bg-card shadow-floating backdrop-blur-xl backdrop-saturate-150 animate-scale-in supports-backdrop-filter:bg-card/95 dark:supports-backdrop-filter:bg-card/80"
        >
          {list.length > 5 && (
            <div className="border-b border-border/60 px-2.5 py-2">
              <div className="flex h-8 items-center gap-1.5 rounded-lg border border-border/80 bg-muted/30 px-2">
                <Search className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <input
                  ref={searchRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar…"
                  className="h-full w-full bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>
          )}

          <ul className="max-h-70 overflow-y-auto p-1.5">
            {filtered.length === 0 ? (
              <li className="px-2 py-4 text-center text-[12px] text-muted-foreground">
                Sin resultados
              </li>
            ) : (
              filtered.map((c, i) => {
                const active = c._id === currentId;
                return (
                  <li key={c._id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => go(c._id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                        active ? "bg-accent" : "hover:bg-accent/70",
                      )}
                    >
                      <CondoMark name={c.name} logo={c.logo ?? null} color={c.primaryColor} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-normal text-foreground">
                          {c.name}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {c.city ?? "Sin ciudad"}
                        </p>
                      </div>
                      {active ? (
                        <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden />
                      ) : i < 9 ? (
                        <kbd className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          ⌘{i + 1}
                        </kbd>
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          {isPlatform && (
            <div className="border-t border-border/60 p-1.5">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onNavigate?.();
                  router.push("/dashboard/condominios");
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] font-normal text-foreground transition-colors hover:bg-accent/80"
              >
                <span className="grid h-7 w-7 place-items-center rounded-lg border border-dashed border-border text-muted-foreground">
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                </span>
                Gestionar condominios
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CondoMark({
  name,
  logo,
  color,
}: {
  name: string;
  logo: string | null;
  color?: string | null;
}) {
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt=""
        className="h-7 w-7 shrink-0 rounded-lg object-cover ring-1 ring-border"
      />
    );
  }
  return (
    <div
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
      style={{ backgroundColor: color || "hsl(var(--brand))" }}
    >
      {initials(name).slice(0, 1)}
    </div>
  );
}
