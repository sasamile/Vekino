"use client";

import { useQuery } from "convex/react";
import { api } from "@vekino/backend/api";
import type { Id } from "@vekino/backend/dataModel";

const ORIGEN: Record<string, string> = {
  carga: "Carga",
  conciliacion: "Conciliación",
  pago: "Pago en línea",
  comprobante: "Comprobante",
  confirmacion_lectura: "Confirmación de lectura",
  reproceso: "Re-procesamiento",
  migracion: "Migración",
  discrepancia: "Discrepancia",
};

const ESTADO: Record<string, string> = {
  pendiente: "pendiente",
  pagada: "pagada",
  vencida: "vencida",
  abonada: "abonada",
  saldo_a_favor: "saldo a favor",
};

/**
 * Bitácora de una factura (Fase 3): cada cambio, con su origen y quién. Es
 * la respuesta a "¿por qué esta factura dice lo que dice?".
 */
export function HistorialFactura({ facturaId }: { facturaId: Id<"facturas"> }) {
  const eventos = useQuery(api.facturas.eventos, { facturaId });
  if (!eventos) return null;
  if (eventos.length === 0) {
    return <p className="text-xs text-muted-foreground">Sin cambios registrados desde que existe la bitácora.</p>;
  }
  return (
    <ol className="space-y-2 text-xs">
      {eventos.map((e) => (
        <li key={e._id} className="rounded-lg border border-border bg-card px-3 py-2">
          <p className="text-muted-foreground">
            {new Date(e.at).toLocaleString("es-CO", { timeZone: "America/Bogota" })} · {ORIGEN[e.origen] ?? e.origen}
            {e.actor ? ` · ${e.actor}` : ""}
            {e.estadoAntes && e.estadoAntes !== e.estadoDespues
              ? ` · ${ESTADO[e.estadoAntes] ?? e.estadoAntes} → ${ESTADO[e.estadoDespues] ?? e.estadoDespues}`
              : !e.estadoAntes
                ? ` · ${ESTADO[e.estadoDespues] ?? e.estadoDespues}`
                : ""}
          </p>
          <p className="mt-0.5 text-foreground">{e.detalle}</p>
        </li>
      ))}
    </ol>
  );
}
