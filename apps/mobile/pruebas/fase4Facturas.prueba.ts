import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoVisible, plazosDe, tarjetaFacturas } from "../src/lib/resumen-facturas.ts";
import { bloqueaPorVersion, urlTienda } from "../src/lib/version-minima.ts";

/**
 * LAS FACTURAS EN EL MÓVIL — Fase 4 de la auditoría de facturación
 * (docs/audits/FASE-4-FACTURACION.md):
 *
 *   · una factura histórica que quedó pendiente se ve "sin verificar";
 *   · los plazos: precio completo hasta fin de mes, mora desde el 16 del mes
 *     siguiente (decisión B);
 *   · la versión mínima: sin respuesta del servidor no se bloquea a nadie.
 */

const bogota = (local: string) => Date.parse(`${local}:00-05:00`);
const finDeMes = (periodo: string) => {
  const [a, m] = periodo.split("-").map(Number) as [number, number];
  return Date.UTC(a, m, 0, 5);
};

function factura(periodo: string, estado: string, totalAPagar: number) {
  return {
    _id: `f-${periodo}`,
    unidadId: "u101",
    periodo,
    estado: estado as "pendiente",
    fechaVencimiento: finDeMes(periodo),
    totalAPagar,
    lineas: [],
  };
}

test("sin verificar: la histórica pendiente; la vigente sigue pendiente", () => {
  const cadena = [factura("2026-06", "pendiente", 300_000), factura("2026-08", "pendiente", 600_000)];
  assert.equal(estadoVisible(cadena[0]!, cadena), "sin_verificar");
  assert.equal(estadoVisible(cadena[1]!, cadena), "pendiente");
  /* Sin la cadena (la vista de antes) no se puede decir. */
  assert.equal(estadoVisible(cadena[0]!), "pendiente");
  /* La lista de la administración ya lo trae calculado del backend. */
  assert.equal(estadoVisible({ estado: "pendiente", estadoVisible: "sin_verificar" }), "sin_verificar");
});

test("sin verificar no cambia lo que se debe: la tarjeta cobra solo la vigente", () => {
  const cadena = [factura("2026-06", "pendiente", 300_000), factura("2026-08", "pendiente", 600_000)];
  const t = tarjetaFacturas(cadena, bogota("2026-08-20T10:00"));
  assert.equal(t.porPagar, 600_000);
  assert.equal(t.pagables.length, 1);
});

test("decisión B: precio completo hasta fin de mes y mora desde el 16 del mes siguiente", () => {
  assert.deepEqual(plazosDe(factura("2026-10", "pendiente", 380_000)), {
    precioCompletoHasta: bogota("2026-10-31T00:00"),
    moraDesde: bogota("2026-11-16T00:00"),
  });
  assert.equal(plazosDe({ periodo: "2026-10", fechaVencimiento: 0 }), null);
  /* Del 1 al 15 de noviembre la tarjeta no dice "saldo vencido". */
  const octubre = [factura("2026-10", "pendiente", 380_000)];
  assert.equal(tarjetaFacturas(octubre, bogota("2026-11-10T10:00")).enMora, false);
  assert.equal(tarjetaFacturas(octubre, bogota("2026-11-16T10:00")).enMora, true);
});

test("versión mínima: sin respuesta o sin configuración no bloquea; la tienda según la plataforma", () => {
  assert.equal(bloqueaPorVersion(undefined), false);
  assert.equal(bloqueaPorVersion(null), false);
  assert.equal(bloqueaPorVersion({ debeActualizar: false }), false);
  assert.equal(bloqueaPorVersion({ debeActualizar: true }), true);
  assert.match(urlTienda("ios")!, /apps\.apple\.com/);
  assert.match(urlTienda("android")!, /com\.vekino\.app/);
  assert.equal(urlTienda("web"), null);
});
