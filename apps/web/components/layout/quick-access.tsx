"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Search,
  CornerDownLeft,
  Upload,
  Download,
  User,
  Plus,
  FileUp,
  UserPlus,
  Building2,
  type LucideIcon,
} from "lucide-react";
import { visibleNavGroups } from "./nav-config";
import { PLATFORM_NAV } from "./platform-nav-config";
import { cn } from "@/lib/utils";

type QuickItem = {
  id: string;
  label: string;
  hint?: string;
  href: string;
  icon: LucideIcon;
  group: string;
  keywords: string[];
};

export function QuickAccess({
  base,
  roles = [],
  isPlatform = false,
  variant = "condo",
  className,
}: {
  base: string;
  roles?: string[];
  isPlatform?: boolean;
  variant?: "condo" | "platform";
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const items = useMemo(() => {
    if (variant === "platform") {
      const pages: QuickItem[] = PLATFORM_NAV.map((it) => ({
        id: `plat-${it.segment || "inicio"}`,
        label: it.label,
        hint: "Plataforma",
        href: it.href,
        icon: it.icon,
        group: "Páginas",
        keywords: it.keywords ?? [],
      }));
      const actions: QuickItem[] = [
        {
          id: "act-nuevo-condo",
          label: "Nuevo condominio",
          hint: "Condominios",
          href: "/dashboard/condominios?nuevo=1",
          icon: Plus,
          group: "Acciones rápidas",
          keywords: ["crear", "conjunto", "cliente"],
        },
        {
          id: "act-add-admin",
          label: "Agregar administrador",
          hint: "Administradores",
          href: "/dashboard/administradores?nuevo=1",
          icon: User,
          group: "Acciones rápidas",
          keywords: ["staff", "superadmin", "invitar"],
        },
        {
          id: "act-soporte",
          label: "Ver tickets de soporte",
          hint: "Soporte",
          href: "/dashboard/soporte",
          icon: FileUp,
          group: "Acciones rápidas",
          keywords: ["ayuda", "tickets"],
        },
      ];
      return [...pages, ...actions];
    }

    const pages: QuickItem[] = [];
    for (const g of visibleNavGroups(roles, isPlatform)) {
      const group = g.title ?? "Inicio";
      for (const it of g.items) {
        pages.push({
          id: `nav-${it.segment || "panel"}`,
          label: it.label,
          hint: group,
          href: it.segment ? `${base}/${it.segment}` : base,
          icon: it.icon,
          group: "Páginas",
          keywords: it.keywords ?? [],
        });
      }
    }

    const actions: QuickItem[] = [
      {
        id: "act-facturas",
        label: "Cargar facturas",
        hint: "Finanzas",
        href: `${base}/finanzas`,
        icon: Upload,
        group: "Acciones rápidas",
        keywords: ["subir", "excel", "cobros", "cuotas"],
      },
      {
        id: "act-export",
        label: "Exportar / reportes",
        hint: "Reportes",
        href: `${base}/reportes`,
        icon: Download,
        group: "Acciones rápidas",
        keywords: ["descargar", "estadisticas"],
      },
      {
        id: "act-perfil",
        label: "Mi perfil",
        hint: "Cuenta",
        href: `${base}/perfil`,
        icon: User,
        group: "Acciones rápidas",
        keywords: ["cuenta", "usuario", "ajustes"],
      },
      {
        id: "act-unidad",
        label: "Nueva unidad",
        hint: "Unidades",
        href: `${base}/unidades?nuevo=1`,
        icon: Building2,
        group: "Acciones rápidas",
        keywords: ["apto", "casa", "inmueble", "crear"],
      },
      {
        id: "act-residente",
        label: "Nuevo residente",
        hint: "Residentes",
        href: `${base}/residentes?nuevo=1`,
        icon: UserPlus,
        group: "Acciones rápidas",
        keywords: ["usuario", "propietario", "invitar", "crear"],
      },
      {
        id: "act-vehiculo",
        label: "Registrar vehículo",
        hint: "Vehículos",
        href: `${base}/vehiculos?nuevo=1`,
        icon: Plus,
        group: "Acciones rápidas",
        keywords: ["carro", "moto", "placa"],
      },
      {
        id: "act-documento",
        label: "Subir documento",
        hint: "Documentos",
        href: `${base}/documentos?nuevo=1`,
        icon: FileUp,
        group: "Acciones rápidas",
        keywords: ["pdf", "archivo", "acta"],
      },
    ];

    return [...pages, ...actions];
  }, [base, roles, isPlatform, variant]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("es");
    if (!needle) return items;
    return items.filter((it) => {
      const haystack = [
        it.label,
        it.hint ?? "",
        it.group,
        ...it.keywords,
      ]
        .join(" ")
        .toLocaleLowerCase("es");
      return haystack.includes(needle) || needle.split(/\s+/).every((w) => haystack.includes(w));
    });
  }, [items, q]);

  const groups = useMemo(() => {
    const map = new Map<string, QuickItem[]>();
    for (const it of filtered) {
      const list = map.get(it.group) ?? [];
      list.push(it);
      map.set(it.group, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const flat = filtered;

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setActive(0);
  }, []);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    setActive(0);
    const t = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, Math.max(0, flat.length - 1)));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const it = flat[active];
        if (it) go(it.href);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, flat, active, close, go]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const shortcut = isMac ? "⌘K" : "Ctrl K";

  let idx = -1;

  const modal =
    open && mounted
      ? createPortal(
          <div
            className="animate-fade-in fixed inset-0 z-200 flex items-start justify-center bg-foreground/40 px-4 pt-[12vh] backdrop-blur-sm dark:bg-foreground/50"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) close();
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Acceso rápido"
              className="animate-fade-in flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-floating"
            >
              <div className="flex h-12 items-center gap-2.5 border-b border-border px-3.5">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar páginas, acciones…"
                  className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
                  autoComplete="off"
                  spellCheck={false}
                />
                <kbd className="hidden rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
                  esc
                </kbd>
              </div>

              <div ref={listRef} className="max-h-80 overflow-y-auto p-1.5">
                {flat.length === 0 ? (
                  <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                    Sin resultados para “{q}”
                  </p>
                ) : (
                  groups.map(([group, list]) => (
                    <div key={group} className="mb-1.5 last:mb-0">
                      <p className="px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground/70">
                        {group}
                      </p>
                      <ul className="flex flex-col gap-0.5">
                        {list.map((it) => {
                          idx += 1;
                          const i = idx;
                          const Icon = it.icon;
                          const selected = i === active;
                          return (
                            <li key={it.id}>
                              <button
                                type="button"
                                data-idx={i}
                                onMouseEnter={() => setActive(i)}
                                onClick={() => go(it.href)}
                                className={cn(
                                  "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] transition-colors",
                                  selected
                                    ? "bg-accent text-foreground"
                                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                                )}
                              >
                                <Icon
                                  className={cn(
                                    "h-4 w-4 shrink-0 stroke-[1.75]",
                                    selected ? "text-brand" : "text-muted-foreground/70",
                                  )}
                                  aria-hidden
                                />
                                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                                  {it.label}
                                </span>
                                {it.hint && (
                                  <span className="shrink-0 text-[11px] text-muted-foreground">
                                    {it.hint}
                                  </span>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center justify-between border-t border-border px-3.5 py-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CornerDownLeft className="h-3 w-3" aria-hidden />
                  Ir a la página
                </span>
                <span>↑↓ navegar</span>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-9 w-full max-w-md items-center gap-2 rounded-xl border border-border bg-card px-3 text-left text-[13px] text-muted-foreground shadow-soft transition-colors hover:bg-accent/50 hover:text-foreground",
          className,
        )}
      >
        <Search className="h-3.5 w-3.5 shrink-0 stroke-[1.75]" aria-hidden />
        <span className="min-w-0 flex-1 truncate">Buscar o ir a…</span>
        <kbd className="hidden shrink-0 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
          {shortcut}
        </kbd>
      </button>
      {modal}
    </>
  );
}
