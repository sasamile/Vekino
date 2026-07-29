"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  TIPO_UNIDAD_LABEL,
  VINCULO_LABEL,
} from "@/components/portal/portal-ui";

type Unidad = {
  _id: string;
  numero: string;
  tipo: string;
  vinculo: string;
  esPrincipal: boolean;
};

/**
 * Selector visible de condominio + unidad (portal propietario).
 * Cambia de condo navegando a /mi/[id]; la unidad preferida se guarda en localStorage.
 */
export function PropiedadSelector({
  condominioId,
  condominioName,
  unidades,
  roles,
}: {
  condominioId: Id<"condominios">;
  condominioName: string;
  unidades: Unidad[];
  roles: string[];
}) {
  const router = useRouter();
  const condos = useQuery(api.condominios.listMine);
  const [open, setOpen] = useState(false);
  const [unidadId, setUnidadId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const storageKey = `vekino-portal-unidad:${condominioId}`;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && unidades.some((u) => u._id === saved)) {
        setUnidadId(saved);
        return;
      }
    } catch {
      /* ignore */
    }
    const principal =
      unidades.find((u) => u.esPrincipal) ?? unidades[0] ?? null;
    setUnidadId(principal?._id ?? null);
  }, [storageKey, unidades]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const unidad =
    unidades.find((u) => u._id === unidadId) ??
    unidades.find((u) => u.esPrincipal) ??
    unidades[0] ??
    null;

  const tipoLabel = unidad
    ? TIPO_UNIDAD_LABEL[unidad.tipo] ?? "Unidad"
    : "Unidad";
  const vinculoLabel = unidad
    ? VINCULO_LABEL[unidad.vinculo] ?? "Residente"
    : roles.includes("propietario")
      ? "Propietario"
      : "Residente";

  const otrosCondos = useMemo(
    () => (condos ?? []).filter((c) => c._id !== condominioId),
    [condos, condominioId],
  );

  function pickUnidad(id: string) {
    setUnidadId(id);
    try {
      localStorage.setItem(storageKey, id);
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "group flex min-h-11 w-full max-w-md items-center gap-3 rounded-xl border border-border/80 bg-card px-3.5 py-2.5 text-left transition-colors",
          "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-foreground">
            {condominioName}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-foreground/70">
            <span>
              {unidad
                ? `${tipoLabel} ${unidad.numero}`
                : "Sin unidad vinculada"}
            </span>
            <Badge tone="neutral" className="text-[11px]">
              {vinculoLabel}
            </Badge>
          </p>
        </div>
        <ChevronDown
          className={cn(
            "h-5 w-5 shrink-0 text-foreground/55 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-0 right-0 z-40 mt-2 max-h-72 overflow-auto rounded-xl border border-border bg-card p-1.5 shadow-md sm:right-auto sm:w-[min(100%,22rem)]"
        >
          {unidades.length > 0 ? (
            <div className="mb-1 px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Tus unidades
            </div>
          ) : null}
          {unidades.map((u) => {
            const selected = u._id === (unidad?._id ?? "");
            const label = `${TIPO_UNIDAD_LABEL[u.tipo] ?? "Unidad"} ${u.numero}`;
            return (
              <button
                key={u._id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => pickUnidad(u._id)}
                className={cn(
                  "flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[15px] transition-colors",
                  selected
                    ? "bg-accent font-medium text-foreground"
                    : "text-foreground/90 hover:bg-muted/60",
                )}
              >
                <span className="min-w-0 flex-1 truncate">
                  {condominioName} — {label}
                </span>
                {selected ? (
                  <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden />
                ) : null}
              </button>
            );
          })}

          {otrosCondos.length > 0 ? (
            <>
              <div className="mb-1 mt-2 border-t border-border px-2.5 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Otros condominios
              </div>
              {otrosCondos.map((c) => (
                <button
                  key={c._id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    router.push(`/mi/${c._id}`);
                  }}
                  className="flex min-h-11 w-full items-center rounded-lg px-2.5 py-2 text-left text-[15px] text-foreground/90 transition-colors hover:bg-muted/60"
                >
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
