import { resumenResidente, type FacturaCartera } from "@vekino/backend/cartera";

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
 */
export function tarjetaFacturas<F extends FacturaCartera & { unidadId: string }>(
  facturas: readonly F[],
  ahora: number,
) {
  const { estado, pagables } = resumenResidente(facturas, ahora);
  const alDia = estado === "al_dia" || estado === "sin_facturas";
  const enMora = estado === "en_mora";
  return {
    titulo: alDia
      ? "Estás al día"
      : pagables.length === 0
        ? "Factura en revisión"
        : enMora
          ? "Tienes un saldo vencido"
          : pagables.length === 1
            ? "1 factura pendiente"
            : `${pagables.length} facturas pendientes`,
    /** Lo que se debe hoy: la vigente de cada unidad, nunca el historial. */
    porPagar: pagables.reduce((s, f) => s + f.totalAPagar, 0),
    alDia,
    enMora,
    /** A lo sumo una por unidad. */
    pagables,
  };
}
