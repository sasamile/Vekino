import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estadoDeCarga,
  etiquetaDePeriodo,
  leerMontoArboleda,
  leerMontoCdc,
  motivosValidos,
  normalizarPeriodo,
  rechazoDePeriodo,
  validarLectura,
} from "../convex/lib/lecturaFactura.ts";
import {
  MENSAJE_NO_PAGABLE,
  carteraDeUnidad,
  enRevision,
  motivoNoPagable,
  resumenResidente,
  saldoAnteriorDe,
  type FacturaCartera,
} from "../convex/lib/cartera.ts";

/**
 * LECTURA CONFIABLE DE CUENTAS DE COBRO (Fase 2 de la auditoría de
 * facturación, docs/audits/FASE-2-FACTURACION.md).
 *
 * Los formatos salen del corpus real: 1.621 PDF de Ciudad del Campo y 1.168
 * de Arboleda (enero–septiembre de 2026). Ningún monto se lee sin signo y
 * ninguno que no se pueda leer se convierte en 0.
 */

// ─── Montos ─────────────────────────────────────────────────────────────────

test("Ciudad del Campo: montos con signo, miles con punto y dos decimales", () => {
  assert.equal(leerMontoCdc("10.097.050.00"), 10_097_050);
  assert.equal(leerMontoCdc("-760.000.00"), -760_000);
  assert.equal(leerMontoCdc("$-400.000.00"), -400_000);
  assert.equal(leerMontoCdc("-$400.000.00"), -400_000);
  assert.equal(leerMontoCdc("$612.650.00"), 612_650);
  assert.equal(leerMontoCdc("500.00"), 500);
  assert.equal(leerMontoCdc("0.00"), 0);
});

test("Ciudad del Campo: lo que no es un monto no se convierte en 0", () => {
  for (const t of ["", "2026", "Mayo / 2026", "1.234", "12,50", "abc"]) {
    assert.equal(leerMontoCdc(t), null, JSON.stringify(t));
  }
});

test("Arboleda: miles con coma y negativos entre paréntesis", () => {
  assert.equal(leerMontoArboleda("15,760"), 15_760);
  assert.equal(leerMontoArboleda("$15,760"), 15_760);
  assert.equal(leerMontoArboleda("0"), 0);
  assert.equal(leerMontoArboleda("$0"), 0);
  assert.equal(leerMontoArboleda("(376,000)"), -376_000);
  assert.equal(leerMontoArboleda("$(376,000)"), -376_000);
  assert.equal(leerMontoArboleda("(1,234,567)"), -1_234_567);
  assert.equal(leerMontoArboleda("1,234,567"), 1_234_567);
  assert.equal(leerMontoArboleda("-15,760"), -15_760);
});

test("Arboleda: lo que no es un monto no se convierte en 0", () => {
  for (const t of ["", "289.000", "15,76", "(abc)", "1,2345"]) {
    assert.equal(leerMontoArboleda(t), null, JSON.stringify(t));
  }
});

// ─── Período ────────────────────────────────────────────────────────────────

test("el período del documento, en los formatos de los dos conjuntos", () => {
  assert.equal(normalizarPeriodo("Septiembre / 2026"), "2026-09");
  assert.equal(normalizarPeriodo("01-septiembre-2026"), "2026-09");
  assert.equal(normalizarPeriodo("Septi. 01 / 2026"), "2026-09");
  assert.equal(normalizarPeriodo("Agost. 01 / 2026"), "2026-08");
  assert.equal(normalizarPeriodo("Febre. 01 / 2026"), "2026-02");
  assert.equal(normalizarPeriodo("01-setiembre-2026"), "2026-09");
  assert.equal(normalizarPeriodo("ENERO / 2027"), "2027-01");
  assert.equal(normalizarPeriodo("Octubre/2026"), "2026-10");
});

test("un texto sin forma de período no es un período", () => {
  /* El caso real de septiembre en Arboleda: la fecha bajó un renglón y el
   * parser se llevaba el texto del renglón siguiente. */
  for (const t of ['Arboleda Campestre Aptos"', "", "2026-09", "Ma / 2026", "Septiembre 2026", "13-2026"]) {
    assert.equal(normalizarPeriodo(t), null, JSON.stringify(t));
  }
});

test("la etiqueta canónica de un período", () => {
  assert.equal(etiquetaDePeriodo("2026-09"), "Septiembre / 2026");
  assert.equal(normalizarPeriodo(etiquetaDePeriodo("2026-01")), "2026-01");
});

test("un documento de octubre no se guarda como septiembre; uno ilegible queda en revisión, no rechazado", () => {
  assert.equal(rechazoDePeriodo("2026-09", "Octubre / 2026"), "periodo_no_coincide");
  assert.equal(rechazoDePeriodo("2026-09", "01-octubre-2026"), "periodo_no_coincide");
  assert.equal(rechazoDePeriodo("2026-09", "Septiembre / 2026"), null);
  assert.equal(rechazoDePeriodo("2026-9", "Septiembre / 2026"), "periodo_invalido");
  assert.equal(rechazoDePeriodo("2026-09", ""), null);
  assert.deepEqual(
    validarLectura({ totalAPagar: 1, lineas: [{ saldoAnterior: 0, total: 1 }], periodoLabel: "" }),
    ["periodo_no_leido"],
  );
});

// ─── Cuadre ─────────────────────────────────────────────────────────────────

const linea = (saldoAnterior: number, total: number) => ({ saldoAnterior, total });

test("una lectura que cuadra no tiene motivos", () => {
  assert.deepEqual(
    validarLectura({
      totalAPagar: 274_000,
      lineas: [linea(184_000, 184_000), linea(0, 360_000), linea(-270_000, -270_000)],
      saldoAnteriorDocumento: -86_000,
      periodoLabel: "Mayo / 2026",
    }),
    [],
  );
});

test("líneas que no suman el total, saldo anterior que no coincide con Totales, sin líneas", () => {
  /* Septiembre real de una casa de CDC leído por el parser viejo: sin la
   * fila del crédito, las líneas suman 670.000 y el total es 73.000. */
  assert.deepEqual(
    validarLectura({
      totalAPagar: 73_000,
      lineas: [linea(335_000, 670_000)],
      saldoAnteriorDocumento: -262_000,
      periodoLabel: "Septiembre / 2026",
    }),
    ["lineas_no_cuadran", "saldo_anterior_no_cuadra"],
  );
  assert.deepEqual(
    validarLectura({ totalAPagar: 8_474_750, lineas: [], periodoLabel: "Junio / 2026" }),
    ["sin_lineas"],
  );
});

test("la tolerancia es de un peso, la misma de la conciliación", () => {
  const conTotal = (totalAPagar: number) =>
    validarLectura({ totalAPagar, lineas: [linea(0, 300_000)], periodoLabel: "Agosto / 2026" });
  assert.deepEqual(conTotal(300_001), []);
  assert.deepEqual(conTotal(300_002), ["lineas_no_cuadran"]);
});

test("los motivos que manda el navegador solo valen si son conocidos", () => {
  assert.deepEqual(motivosValidos(["total_no_leido", "inventado", "total_no_leido"]), ["total_no_leido"]);
});

test("el estado de carga: saldo a favor si el total es negativo, o cero con saldo a favor", () => {
  assert.equal(estadoDeCarga({ totalAPagar: -376_000, saldoAFavor: 376_000 }), "saldo_a_favor");
  assert.equal(estadoDeCarga({ totalAPagar: 0, saldoAFavor: 15_000 }), "saldo_a_favor");
  assert.equal(estadoDeCarga({ totalAPagar: 0, saldoAFavor: 0 }), "pendiente");
  assert.equal(estadoDeCarga({ totalAPagar: 289_000, saldoAFavor: 0 }), "pendiente");
});

// ─── Contrato de lectura dudosa en la cartera ───────────────────────────────

const bogota = (local: string) => Date.parse(`${local}:00-05:00`);
const AHORA = bogota("2026-10-08T10:00");
function factura(
  periodo: string,
  estado: FacturaCartera["estado"],
  totalAPagar: number,
  extra: Partial<FacturaCartera> = {},
): FacturaCartera & { unidadId: string } {
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
const DUDOSA = { lecturaDudosa: { motivos: ["total_no_leido"] } };

test("en revisión mientras no se confirme", () => {
  assert.equal(enRevision({}), false);
  assert.equal(enRevision({ lecturaDudosa: { motivos: ["sin_lineas"] } }), true);
  assert.equal(enRevision({ lecturaDudosa: { motivos: ["sin_lineas"], confirmada: { at: 1 } } }), false);
});

test("una vigente en revisión no se paga, con un mensaje estable", () => {
  const sept = factura("2026-09", "pendiente", 0, DUDOSA);
  assert.equal(motivoNoPagable([factura("2026-08", "pagada", 289_000), sept], sept), "en_revision");
  assert.match(MENSAJE_NO_PAGABLE.en_revision, /en revisión/);
});

test("una vigente en revisión nunca deja la casa 'al día' (total no leído = $0)", () => {
  const c = carteraDeUnidad([factura("2026-08", "pagada", 289_000), factura("2026-09", "pendiente", 0, DUDOSA)], AHORA);
  assert.equal(c.estado, "en_revision");
});

test("ni 'en mora': el 20 de octubre, con la vigente vencida pero dudosa, no se afirma la mora", () => {
  const c = carteraDeUnidad(
    [factura("2026-08", "pagada", 289_000), factura("2026-09", "pendiente", 289_000, DUDOSA)],
    bogota("2026-10-20T10:00"),
  );
  assert.equal(c.estado, "en_revision");
});

test("si el período que decide la mora es dudoso, tampoco se afirma", () => {
  const c = carteraDeUnidad(
    [factura("2026-08", "pendiente", 300_000, DUDOSA), factura("2026-09", "pendiente", 600_000)],
    AHORA,
  );
  assert.equal(c.estado, "en_revision");
});

test("confirmada la lectura, la cartera vuelve a decidir", () => {
  const confirmada = { lecturaDudosa: { motivos: ["lineas_no_cuadran"], confirmada: { at: 1 } } };
  const c = carteraDeUnidad(
    [factura("2026-08", "pagada", 289_000), factura("2026-09", "pendiente", 289_000, confirmada)],
    AHORA,
  );
  assert.equal(c.estado, "pendiente");
});

test("el residente ve 'en revisión' y nada para pagar", () => {
  const r = resumenResidente(
    [factura("2026-08", "pagada", 289_000), factura("2026-09", "pendiente", 0, DUDOSA)],
    AHORA,
  );
  assert.equal(r.estado, "en_revision");
  assert.deepEqual(r.pagables, []);
});

test("el saldo anterior del documento manda sobre la suma de las líneas", () => {
  const lineas = [{ codigo: 1, concepto: "Admón", saldoAnterior: 335_000, actual: 335_000, total: 670_000 }];
  assert.equal(saldoAnteriorDe({ lineas }), 335_000);
  assert.equal(saldoAnteriorDe({ lineas, saldoAnteriorDocumento: -262_000 }), -262_000);
});
