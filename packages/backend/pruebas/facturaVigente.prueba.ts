import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MENSAJE_NO_PAGABLE,
  carteraDeUnidad,
  facturaVigente,
  motivoNoPagable,
  resumenResidente,
  type FacturaCartera,
} from "../convex/lib/cartera.ts";

/**
 * LA FACTURA VIGENTE Y LO QUE SE PUEDE PAGAR (Fase 1 de la auditoría de
 * facturación, docs/audits/FASE-1-FACTURACION.md).
 *
 * Una sola definición para toda la aplicación: la vigente es la factura del
 * período más reciente de la unidad, y es la única que se cobra. Estas
 * pruebas fijan esa definición y la de la mora con la que se pinta al
 * residente; las de regresión de la Fase 0 la prueban a través del backend y
 * de las páginas.
 */

const bogota = (local: string) => Date.parse(`${local}:00-05:00`);
/** El día de la auditoría: agosto ya venció (15-sep), septiembre no (15-oct). */
const AHORA = bogota("2026-10-08T10:00");

function vence(periodo: string): number {
  const [a, m] = periodo.split("-").map(Number) as [number, number];
  const sig = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
  return bogota(`${sig}-15T00:00`);
}

type F = FacturaCartera & { id: string; unidadId: string };

function factura(
  periodo: string,
  estado: FacturaCartera["estado"],
  totalAPagar: number,
  unidadId = "u101",
): F {
  return {
    id: `${unidadId}-${periodo}-${estado}`,
    unidadId,
    periodo,
    estado,
    totalAPagar,
    fechaVencimiento: vence(periodo),
    lineas: [],
  };
}

/** Todas las permutaciones: el resultado no puede depender del orden de carga. */
function permutaciones<T>(xs: readonly T[]): T[][] {
  if (xs.length <= 1) return [[...xs]];
  return xs.flatMap((x, i) =>
    permutaciones([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r]),
  );
}

// ─────────────────────────────────────────────────────────────
// La vigente
// ─────────────────────────────────────────────────────────────

test("la vigente es la del período más reciente, en cualquier orden de carga", () => {
  const julio = factura("2026-07", "pendiente", 300_000);
  const agosto = factura("2026-08", "vencida", 600_000);
  const septiembre = factura("2026-09", "pendiente", 900_000);
  /* Julio subido tarde, septiembre antes que julio, al revés…: siempre septiembre. */
  for (const orden of permutaciones([julio, agosto, septiembre])) {
    assert.equal(facturaVigente(orden)?.id, septiembre.id);
  }
});

test("una histórica no es vigente aunque esté vencida, abonada o pendiente", () => {
  for (const estado of ["vencida", "abonada", "pendiente"] as const) {
    const agosto = factura("2026-08", estado, 366_113);
    const septiembre = factura("2026-09", "pendiente", 656_804);
    assert.equal(facturaVigente([agosto, septiembre])?.id, septiembre.id, estado);
  }
});

test("con la vigente pagada no se retrocede a una anterior sin pagar", () => {
  const agosto = factura("2026-08", "vencida", 366_113);
  const septiembre = factura("2026-09", "pagada", 656_804);
  assert.equal(facturaVigente([agosto, septiembre])?.id, septiembre.id);
});

test("sin facturas, o con dos del período más reciente, no hay vigente que adivinar", () => {
  assert.equal(facturaVigente([]), null);
  const a = factura("2026-09", "pendiente", 300_000);
  const b = { ...factura("2026-09", "pendiente", 310_000), id: "duplicada" };
  for (const orden of permutaciones([factura("2026-08", "pagada", 1), a, b])) {
    assert.equal(facturaVigente(orden), null);
  }
});

// ─────────────────────────────────────────────────────────────
// Lo que se puede pagar
// ─────────────────────────────────────────────────────────────

test("agosto absorbido por septiembre no es pagable; septiembre sí (caso de la auditoría)", () => {
  const agosto = factura("2026-08", "vencida", 366_113);
  const septiembre = factura("2026-09", "pendiente", 656_804);
  const cadena = [agosto, septiembre];
  assert.equal(motivoNoPagable(cadena, agosto), "historica");
  assert.equal(motivoNoPagable(cadena, septiembre), null);
});

test("con septiembre pagada, ni agosto ni septiembre son pagables", () => {
  const agosto = factura("2026-08", "vencida", 366_113);
  const septiembre = factura("2026-09", "pagada", 656_804);
  const cadena = [agosto, septiembre];
  assert.equal(motivoNoPagable(cadena, agosto), "historica");
  assert.equal(motivoNoPagable(cadena, septiembre), "pagada");
});

test("una histórica no se paga en ningún estado de deuda", () => {
  for (const estado of ["vencida", "abonada", "pendiente"] as const) {
    const agosto = factura("2026-08", estado, 300_000);
    const cadena = [agosto, factura("2026-09", "pendiente", 600_000)];
    assert.equal(motivoNoPagable(cadena, agosto), "historica", estado);
  }
});

test("la vigente sin saldo no se paga: saldo a favor o total en cero", () => {
  const aFavor = factura("2026-09", "saldo_a_favor", -262_000);
  assert.equal(motivoNoPagable([aFavor], aFavor), "sin_saldo");
  const enCero = factura("2026-09", "pendiente", 0);
  assert.equal(motivoNoPagable([enCero], enCero), "sin_saldo");
});

test("dos facturas del período vigente: ninguna se cobra hasta que se revise", () => {
  const a = factura("2026-09", "pendiente", 300_000);
  const b = { ...factura("2026-09", "pendiente", 310_000), id: "duplicada" };
  assert.equal(motivoNoPagable([a, b], a), "vigente_ambigua");
  assert.equal(motivoNoPagable([a, b], b), "vigente_ambigua");
});

test("los mensajes de rechazo son claros y conservan el que ya reconocía la web", () => {
  assert.equal(MENSAJE_NO_PAGABLE.pagada, "Esta factura ya está pagada.");
  assert.match(MENSAJE_NO_PAGABLE.historica, /ya no está vigente/);
  for (const m of Object.values(MENSAJE_NO_PAGABLE)) {
    assert.doesNotMatch(m, /js[0-9a-z]{20,}|_id|undefined/);
  }
});

// ─────────────────────────────────────────────────────────────
// La mora: historial absorbido frente a mora actual
// ─────────────────────────────────────────────────────────────

test("agosto vencida y septiembre (que la absorbe) pagada: al día, sin mora", () => {
  const c = carteraDeUnidad(
    [factura("2026-08", "vencida", 300_000), factura("2026-09", "pagada", 600_000)],
    AHORA,
  );
  assert.equal(c.estado, "al_dia");
  assert.equal(c.saldoActual, 0);
  assert.equal(c.diasMora, 0);
});

test("agosto vencida y septiembre sin pagar: la mora de agosto sigue siendo actual", () => {
  /* Septiembre aún no vence, pero lo de agosto ya venció y nadie lo cubrió. */
  const c = carteraDeUnidad(
    [factura("2026-08", "vencida", 300_000), factura("2026-09", "pendiente", 600_000)],
    AHORA,
  );
  assert.equal(c.estado, "en_mora");
  assert.equal(c.periodoEnMora, "2026-08");
  assert.equal(c.saldoActual, 600_000);
});

test("la vigente vencida sin pagar es mora aunque el historial esté limpio", () => {
  const c = carteraDeUnidad(
    [factura("2026-08", "pagada", 284_000), factura("2026-09", "pendiente", 284_000)],
    bogota("2026-10-20T10:00"),
  );
  assert.equal(c.estado, "en_mora");
  assert.equal(c.periodoEnMora, "2026-09");
});

test("sin saldo no hay mora: una vigente en cero que ya venció no deja a nadie en mora", () => {
  const c = carteraDeUnidad([factura("2026-09", "pendiente", 0)], bogota("2026-10-20T10:00"));
  assert.equal(c.estado, "al_dia");
  assert.equal(c.diasMora, 0);
});

test("la cartera no depende del orden de carga, tampoco con un período duplicado", () => {
  const cadena = [
    factura("2026-07", "vencida", 300_000),
    factura("2026-08", "pagada", 600_000),
    factura("2026-09", "pendiente", 300_000),
    { ...factura("2026-09", "pagada", 300_000), id: "duplicada" },
  ];
  const esperado = carteraDeUnidad(cadena, AHORA);
  /* Con dos de septiembre se reporta la que más debe, no la última cargada. */
  assert.equal(esperado.saldoActual, 300_000);
  for (const orden of permutaciones(cadena)) {
    assert.deepEqual(carteraDeUnidad(orden, AHORA), esperado);
  }
});

// ─────────────────────────────────────────────────────────────
// Lo que ve el residente
// ─────────────────────────────────────────────────────────────

test("el resumen del residente es la cartera de la administración, por unidad", () => {
  const pqrs = [
    factura("2026-04", "vencida", 385_000),
    factura("2026-05", "pagada", 680_040),
    factura("2026-06", "vencida", 15_760),
    factura("2026-07", "pagada", 584_156),
    factura("2026-08", "pagada", 289_000),
    factura("2026-09", "pendiente", 289_000),
  ];
  const r = resumenResidente(pqrs, AHORA);
  assert.equal(r.estado, carteraDeUnidad(pqrs, AHORA).estado);
  assert.equal(r.estado, "pendiente");
  assert.deepEqual(
    r.pagables.map((f) => f.periodo),
    ["2026-09"],
  );
});

test("con la vigente pagada el residente está al día y no se le ofrece nada", () => {
  const r = resumenResidente(
    [
      factura("2026-07", "abonada", 345_549),
      factura("2026-08", "vencida", 366_113),
      factura("2026-09", "pagada", 656_804),
    ],
    AHORA,
  );
  assert.equal(r.estado, "al_dia");
  assert.deepEqual(r.pagables, []);
});

test("dos unidades: una vigente por unidad, y el estado es el de la que peor esté", () => {
  const r = resumenResidente(
    [
      factura("2026-08", "pagada", 280_000, "u101"),
      factura("2026-09", "pendiente", 280_000, "u101"),
      factura("2026-08", "vencida", 300_000, "u202"),
      factura("2026-09", "pendiente", 600_000, "u202"),
    ],
    AHORA,
  );
  assert.equal(r.estado, "en_mora");
  assert.deepEqual(
    r.unidades.map((u) => [u.unidadId, u.cartera.estado, u.pagable?.periodo]),
    [
      ["u101", "pendiente", "2026-09"],
      ["u202", "en_mora", "2026-09"],
    ],
  );
  /* Nunca la suma del historial: 280.000 + 600.000, no + 300.000 de agosto. */
  assert.equal(
    r.pagables.reduce((s, f) => s + f.totalAPagar, 0),
    880_000,
  );
});

test("sin facturas no se declara al día", () => {
  const r = resumenResidente([], AHORA);
  assert.equal(r.estado, "sin_facturas");
  assert.deepEqual(r.pagables, []);
});
