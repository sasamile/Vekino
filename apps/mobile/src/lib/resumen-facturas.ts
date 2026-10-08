import {
  descuentoVigente,
  enRevision,
  fechaLimiteDescuentoDe,
  montoAPagarHoy,
  resumenResidente,
  type FacturaCartera,
  type LecturaDudosa,
} from "@vekino/backend/cartera";

/**
 * LA TARJETA DE FACTURAS DEL RESIDENTE EN EL MÓVIL (inicio y pestaña Facturas).
 *
 * Nada de aquí decide quién debe ni qué se paga: lo dice `resumenResidente`
 * (`packages/backend/convex/lib/cartera.ts`), la misma regla de la cartera de
 * la administración, de la web y del backend de pagos. Por unidad, la deuda es
 * su factura VIGENTE —la del período más reciente—, que ya absorbe a las
 * anteriores. Aquí solo se traduce a lo que muestra la tarjeta.
 *
 * Antes cada pantalla contaba y sumaba las facturas `pendiente` de todo el
 * historial: con dos de la misma casa duplicaba la deuda (`totalAPagar` es
 * acumulado), y una vigente que venció sin pagarse se veía "pendiente".
 *
 * Fase 3: lo "por pagar" es lo que se cobra HOY (con descuento solo dentro de
 * su plazo, `montoAPagarHoy`), y un pago registrado que la contabilidad aún
 * no refleja se ve "Pago en verificación", no como deuda.
 */
type FacturaTarjeta = FacturaCartera & {
  unidadId: string;
  totalConDescuento?: number;
  fechaLimiteDescuento?: number;
};

export function tarjetaFacturas<F extends FacturaTarjeta>(
  facturas: readonly F[],
  ahora: number,
) {
  const { estado, pagables, unidades } = resumenResidente(facturas, ahora);
  const alDia = estado === "al_dia" || estado === "sin_facturas";
  const enMora = estado === "en_mora";
  const enVerificacion = unidades.reduce(
    (s, u) =>
      s + (u.cartera.motivoRevision === "pago_en_verificacion" ? (u.cartera.montoEnVerificacion ?? 0) : 0),
    0,
  );
  return {
    titulo: alDia
      ? "Estás al día"
      : pagables.length === 0
        ? enVerificacion > 0
          ? "Pago en verificación"
          : "Factura en revisión"
        : enMora
          ? "Tienes un saldo vencido"
          : pagables.length === 1
            ? "1 factura pendiente"
            : `${pagables.length} facturas pendientes`,
    /** Lo que se debe hoy: la vigente de cada unidad, nunca el historial. */
    porPagar: pagables.reduce((s, f) => s + montoAPagarHoy(f, ahora), 0),
    /** Pagado y todavía no reflejado por la contabilidad. */
    enVerificacion,
    alDia,
    enMora,
    /** A lo sumo una por unidad. */
    pagables,
  };
}

/**
 * El estado que se le muestra al residente en la lista y en el detalle. Una
 * factura cuya lectura la administración todavía no verificó se ve "en
 * revisión", diga lo que diga el estado guardado: no se paga hasta que la
 * confirmen (Fase 2, docs/audits/FASE-2-FACTURACION.md). Una con un pago en
 * verificación se ve así (Fase 3): pagó y la contabilidad aún no lo refleja.
 */
export function estadoVisible(f: {
  estado: string;
  lecturaDudosa?: LecturaDudosa | null;
  pagoEnVerificacion?: { monto: number } | null;
}): string {
  if (enRevision(f)) return "en_revision";
  if (f.pagoEnVerificacion) return "en_verificacion";
  return f.estado;
}

/**
 * El descuento por pronto pago de una factura, para mostrarlo: hasta cuándo
 * vale (la fecha del documento, o el 15 del mes del período) y si hoy
 * todavía vale. `null` si no tiene.
 */
export function descuentoDe(
  f: { periodo: string; totalAPagar: number; totalConDescuento?: number; fechaLimiteDescuento?: number },
  ahora: number,
): { monto: number; hasta: number; vigente: boolean } | null {
  const hasta = fechaLimiteDescuentoDe(f);
  if (hasta === null || typeof f.totalConDescuento !== "number" || f.totalConDescuento >= f.totalAPagar) {
    return null;
  }
  return { monto: f.totalConDescuento, hasta, vigente: descuentoVigente(f, ahora) };
}
