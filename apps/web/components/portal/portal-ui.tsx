import type { LucideIcon } from "lucide-react";
import { CheckCircle2, Clock, AlertTriangle, CircleDollarSign } from "lucide-react";

/** Fecha larga en español a partir de un timestamp (ms). */
export function fechaLarga(ts: number): string {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(ts));
}

/** Fecha corta desde un string ISO "YYYY-MM-DD" (sin desfase de zona). */
export function fechaISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(y, m - 1, d));
}

export type FacturaEstado =
  | "pendiente"
  | "pagada"
  | "vencida"
  | "abonada"
  | "saldo_a_favor";

export const ESTADO_FACTURA: Record<
  FacturaEstado,
  { label: string; tone: "success" | "warning" | "destructive" | "info"; icon: LucideIcon }
> = {
  pagada: { label: "Pagada", tone: "success", icon: CheckCircle2 },
  pendiente: { label: "Pendiente", tone: "warning", icon: Clock },
  vencida: { label: "Vencida", tone: "destructive", icon: AlertTriangle },
  abonada: { label: "Abono parcial", tone: "info", icon: CircleDollarSign },
  saldo_a_favor: {
    label: "Saldo a favor",
    tone: "info",
    icon: CircleDollarSign,
  },
};

export const VINCULO_LABEL: Record<string, string> = {
  propietario: "Propietario",
  apoderado: "Apoderado",
  arrendatario: "Arrendatario",
  residente: "Residente",
};

export const TIPO_UNIDAD_LABEL: Record<string, string> = {
  apartamento: "Apartamento",
  casa: "Casa",
  local: "Local",
  parqueadero: "Parqueadero",
  deposito: "Depósito",
  oficina: "Oficina",
  otro: "Unidad",
};
