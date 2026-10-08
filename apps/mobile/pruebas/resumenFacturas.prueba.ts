import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoVisible, tarjetaFacturas } from "../src/lib/resumen-facturas.ts";

/**
 * LA TARJETA DE FACTURAS DEL MÓVIL (inicio y pestaña Facturas).
 *
 * Mismos casos reales (anonimizados) que la red de la web
 * (`apps/web/pruebas/facturacion/resumenResidente.test.mjs`): la tarjeta
 * tiene que decir lo mismo que la cartera de la administración, sin sumar
 * historial ni esconder la mora. Ver docs/audits/FASE-1-FACTURACION.md.
 */

const bogota = (local: string) => Date.parse(`${local}:00-05:00`);
/** El día de la auditoría: agosto ya venció (15-sep), septiembre no (15-oct). */
const AHORA = bogota("2026-10-08T10:00");

type Estado = "pendiente" | "pagada" | "vencida" | "abonada" | "saldo_a_favor";

function factura(periodo: string, estado: Estado, totalAPagar: number, unidadId = "u101") {
  const [a, m] = periodo.split("-").map(Number) as [number, number];
  const sig = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
  return {
    unidadId,
    periodo,
    estado,
    totalAPagar,
    fechaVencimiento: bogota(`${sig}-15T00:00`),
    lineas: [],
  };
}

test("la casa del PQRS (abril y junio vencidas ya saldadas): 1 factura pendiente, solo septiembre", () => {
  const t = tarjetaFacturas(
    [
      factura("2026-04", "vencida", 385_000),
      factura("2026-05", "pagada", 680_040),
      factura("2026-06", "vencida", 15_760),
      factura("2026-07", "pagada", 584_156),
      factura("2026-08", "pagada", 289_000),
      factura("2026-09", "pendiente", 289_000),
    ],
    AHORA,
  );
  assert.equal(t.titulo, "1 factura pendiente");
  assert.equal(t.porPagar, 289_000);
  assert.equal(t.enMora, false);
});

test("septiembre pagada absorbe agosto vencida: al día, nada por pagar", () => {
  const t = tarjetaFacturas(
    [
      factura("2026-07", "abonada", 345_549),
      factura("2026-08", "vencida", 366_113),
      factura("2026-09", "pagada", 656_804),
    ],
    AHORA,
  );
  assert.equal(t.titulo, "Estás al día");
  assert.equal(t.porPagar, 0);
  assert.deepEqual(t.pagables, []);
});

test("el 20 de octubre, septiembre vencida sin pagar: se ve la mora", () => {
  const t = tarjetaFacturas(
    [factura("2026-08", "pagada", 284_000), factura("2026-09", "pendiente", 284_000)],
    bogota("2026-10-20T10:00"),
  );
  assert.equal(t.titulo, "Tienes un saldo vencido");
  assert.equal(t.enMora, true);
  assert.equal(t.porPagar, 284_000);
});

test("dos 'pendiente' de la misma casa no se suman: el total acumulado ya está en la vigente", () => {
  /* Antes: 300.000 + 600.000 = 900.000 "por pagar" (F-18). */
  const t = tarjetaFacturas(
    [factura("2026-08", "pendiente", 300_000), factura("2026-09", "pendiente", 600_000)],
    AHORA,
  );
  assert.equal(t.porPagar, 600_000);
  assert.equal(t.pagables.length, 1);
});

test("dos casas: una vigente por casa", () => {
  const t = tarjetaFacturas(
    [
      factura("2026-09", "pendiente", 280_000, "u101"),
      factura("2026-08", "vencida", 300_000, "u202"),
      factura("2026-09", "pendiente", 600_000, "u202"),
    ],
    AHORA,
  );
  assert.equal(t.porPagar, 880_000);
  /* La 202 no cubrió agosto, que ya venció. */
  assert.equal(t.titulo, "Tienes un saldo vencido");
});

test("sin facturas: al día, como antes", () => {
  const t = tarjetaFacturas([], AHORA);
  assert.equal(t.titulo, "Estás al día");
  assert.equal(t.porPagar, 0);
});

// ─── Fase 2: lectura en revisión (docs/audits/FASE-2-FACTURACION.md) ─────────

const DUDOSA = { lecturaDudosa: { motivos: ["total_no_leido"] } };

test("vigente con el total no leído: 'en revisión', ni 'al día' ni nada por pagar", () => {
  /* Antes: el total ilegible se guardaba en $0 y la tarjeta decía "Estás al día". */
  const t = tarjetaFacturas(
    [factura("2026-08", "pagada", 289_000), { ...factura("2026-09", "pendiente", 0), ...DUDOSA }],
    AHORA,
  );
  assert.equal(t.titulo, "Factura en revisión");
  assert.equal(t.alDia, false);
  assert.equal(t.porPagar, 0);
  assert.deepEqual(t.pagables, []);
});

test("la lista y el detalle muestran 'en revisión' hasta que la administración confirme", () => {
  assert.equal(estadoVisible({ ...factura("2026-09", "pendiente", 289_000), ...DUDOSA }), "en_revision");
  assert.equal(
    estadoVisible({
      ...factura("2026-09", "pendiente", 289_000),
      lecturaDudosa: { motivos: ["total_no_leido"], confirmada: { at: 1 } },
    }),
    "pendiente",
  );
  assert.equal(estadoVisible(factura("2026-08", "vencida", 300_000)), "vencida");
});
