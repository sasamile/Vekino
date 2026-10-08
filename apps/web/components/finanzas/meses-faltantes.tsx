"use client";

import { useQuery } from "convex/react";
import { CalendarX } from "lucide-react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";
import { formatPeriodoLabel } from "@/components/layout/periodo-select";

/**
 * Meses faltantes (Fase 3, F-09): unidades a las que les falta la factura de
 * algún mes. Con un hueco, la factura siguiente no permite juzgar la
 * anterior —queda sin veredicto, ni pagada ni vencida— hasta que se cargue el
 * mes que falta; y una unidad sin los meses más recientes muestra como
 * vigente una factura vieja.
 */
export function MesesFaltantes({ condominioId }: { condominioId: Id<"condominios"> }) {
  const datos = useQuery(api.facturas.mesesFaltantes, { condominioId });
  if (!datos || datos.unidades.length === 0) return null;

  const conHueco = datos.unidades.filter((u) => u.huecos.some((h) => h.tipo === "hueco")).length;
  const atrasadas = datos.unidades.filter((u) => u.huecos.some((h) => h.tipo === "al_final")).length;

  return (
    <details className="rounded-xl border border-border bg-muted/30 p-4">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-foreground">
        <CalendarX className="h-4 w-4 text-muted-foreground" aria-hidden />
        Meses faltantes
        <span className="font-normal text-muted-foreground">
          · {conHueco} unidad{conHueco === 1 ? "" : "es"} con un mes sin cargar
          {atrasadas > 0 ? ` · ${atrasadas} sin las facturas más recientes` : ""}
        </span>
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">
        Con un mes sin cargar, la factura siguiente no dice si la anterior se pagó: queda sin veredicto y la unidad
        no se declara en mora por ella hasta que se cargue el mes que falta.
      </p>
      <ul className="mt-2 max-h-64 space-y-1 overflow-auto text-xs">
        {datos.unidades.map((u) => (
          <li key={u.unidadId} className="text-muted-foreground">
            <span className="font-medium text-foreground">
              Unidad {[u.unidadTorre, u.unidadNumero].filter(Boolean).join(" ")}
            </span>
            {" · "}
            {u.huecos
              .map((h) =>
                h.tipo === "hueco"
                  ? `falta ${h.faltan.map(formatPeriodoLabel).join(", ")}`
                  : `sin ${h.faltan.map(formatPeriodoLabel).join(", ")}`,
              )
              .join(" · ")}
          </li>
        ))}
      </ul>
    </details>
  );
}
