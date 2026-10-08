import { test } from "node:test";
import assert from "node:assert/strict";
import { descuentoDe, estadoVisible, tarjetaFacturas } from "../src/lib/resumen-facturas.ts";

/**
 * LA TARJETA DE FACTURAS DEL MÓVIL — Fase 3 de la auditoría de facturación
 * (docs/audits/FASE-3-FACTURACION.md):
 *
 *   · un pago que la contabilidad todavía no refleja se ve "Pago en
 *     verificación" y no queda nada "por pagar";
 *   · lo "por pagar" es lo que se cobra HOY: con descuento solo hasta el 15
 *     del mes del período (o la fecha del documento), no hasta el vencimiento.
 */

const bogota = (local: string) => Date.parse(`${local}:00-05:00`);
const AHORA = bogota("2026-10-08T10:00");

type Estado = "pendiente" | "pagada" | "vencida" | "abonada" | "saldo_a_favor";

function factura(periodo: string, estado: Estado, totalAPagar: number, extra: Record<string, unknown> = {}) {
  const [a, m] = periodo.split("-").map(Number) as [number, number];
  const sig = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
  return {
    unidadId: "u101",
    periodo,
    estado,
    totalAPagar,
    fechaVencimiento: bogota(`${sig}-15T00:00`),
    lineas: [],
    ...extra,
  };
}

test("pago en verificación: la tarjeta lo dice, con su monto, y no hay nada por pagar", () => {
  const t = tarjetaFacturas(
    [
      factura("2026-08", "pagada", 300_000),
      factura("2026-09", "pendiente", 600_000, { pagoEnVerificacion: { monto: 300_000 } }),
    ],
    bogota("2026-10-20T10:00"),
  );
  assert.equal(t.titulo, "Pago en verificación");
  assert.equal(t.enVerificacion, 300_000);
  assert.equal(t.porPagar, 0);
  assert.equal(t.enMora, false);
  assert.deepEqual(t.pagables, []);
});

test("la lista y el detalle muestran 'en verificación'", () => {
  assert.equal(estadoVisible({ estado: "pendiente", pagoEnVerificacion: { monto: 300_000 } }), "en_verificacion");
  assert.equal(estadoVisible({ estado: "pendiente" }), "pendiente");
  /* La revisión de lectura va primero. */
  assert.equal(
    estadoVisible({ estado: "pendiente", lecturaDudosa: { motivos: ["total_no_leido"] }, pagoEnVerificacion: { monto: 1 } }),
    "en_revision",
  );
});

test("lo por pagar es lo de hoy: con descuento hasta el 15 de septiembre, después el total", () => {
  const sept = [factura("2026-09", "pendiente", 380_000, { totalConDescuento: 340_000 })];
  assert.equal(tarjetaFacturas(sept, bogota("2026-09-10T10:00")).porPagar, 340_000);
  assert.equal(tarjetaFacturas(sept, AHORA).porPagar, 380_000);
});

test("el descuento con su fecha: el último instante del 15, o la del documento", () => {
  const sept = { periodo: "2026-09", totalAPagar: 380_000, totalConDescuento: 340_000 };
  assert.deepEqual(descuentoDe(sept, bogota("2026-09-10T10:00")), {
    monto: 340_000,
    hasta: bogota("2026-09-16T00:00") - 1,
    vigente: true,
  });
  assert.equal(descuentoDe(sept, AHORA)?.vigente, false);
  assert.equal(descuentoDe({ ...sept, fechaLimiteDescuento: bogota("2026-09-11T00:00") - 1 }, bogota("2026-09-12T10:00"))?.vigente, false);
  assert.equal(descuentoDe({ periodo: "2026-09", totalAPagar: 380_000 }, AHORA), null);
});
