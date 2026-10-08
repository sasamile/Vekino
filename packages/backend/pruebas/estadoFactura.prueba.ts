import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aplicadoEnPosterior,
  calcularCadena,
  discrepanciaDePar,
  estadoDeFactura,
  evidenciaDePago,
  type FacturaEstado,
  type PagoRegistrado,
} from "../convex/lib/estadoFactura.ts";
import {
  carteraDeUnidad,
  descuentoVigente,
  fechaLimiteDescuentoDe,
  leerMontoPesos,
  mensajePagoEnVerificacion,
  montoAPagarHoy,
  motivoNoPagable,
  periodosConsecutivos,
  vencimientoDePeriodo,
  veredictoConciliacion,
  type FacturaCartera,
  type LineaFactura,
} from "../convex/lib/cartera.ts";
import { ambienteAval } from "../convex/lib/avalProduccion.ts";

/**
 * MODELO DE PAGOS Y ESTADOS (Fase 3 de la auditoría de facturación,
 * docs/audits/FASE-3-FACTURACION.md): las reglas puras.
 *
 *   · la función única del estado (evidencia contra inferencia);
 *   · la evidencia de pago por monto, con descuento y varios pagos;
 *   · las discrepancias y su resolución por un documento posterior;
 *   · los meses faltantes;
 *   · el plazo del descuento y el vencimiento nuevo.
 */

const bogota = (local: string) => Date.parse(`${local}:00-05:00`);
const CUOTA = 300_000;

function linea(saldoAnterior: number, actual: number): LineaFactura {
  return { codigo: 1, concepto: "CUOTA", saldoAnterior, actual, total: saldoAnterior + actual };
}

function f(
  _id: string,
  periodo: string,
  lineas: LineaFactura[],
  extra: Partial<FacturaEstado> = {},
): FacturaEstado {
  return {
    _id,
    periodo,
    estado: "pendiente",
    totalAPagar: lineas.reduce((s, l) => s + l.total, 0),
    saldoAFavor: 0,
    lineas,
    ...extra,
  };
}

function pago(facturaId: string, monto: number, fecha = bogota("2026-09-10T10:00"), extra: Partial<PagoRegistrado> = {}): PagoRegistrado {
  return { id: `p-${facturaId}-${monto}-${fecha}`, facturaId, origen: "pasarela", monto, fecha, ...extra };
}

// ─── La regla única del estado ───────────────────────────────────────────────

test("estado: sin evidencia manda el veredicto; sin veredicto, la carga", () => {
  assert.equal(estadoDeFactura({ carga: "pendiente", evidencia: null, veredicto: null }), "pendiente");
  assert.equal(estadoDeFactura({ carga: "saldo_a_favor", evidencia: null, veredicto: null }), "saldo_a_favor");
  for (const v of ["pagada", "abonada", "vencida", "saldo_a_favor"] as const) {
    assert.equal(estadoDeFactura({ carga: "pendiente", evidencia: null, veredicto: v }), v);
  }
  /* Un mes faltante no juzga: queda la carga. */
  assert.equal(estadoDeFactura({ carga: "pendiente", evidencia: null, veredicto: "sin_veredicto" }), "pendiente");
});

test("estado: la evidencia es un piso que la inferencia no baja, y que puede subir", () => {
  for (const v of [null, "sin_veredicto", "pagada", "abonada", "vencida", "saldo_a_favor"] as const) {
    assert.equal(estadoDeFactura({ carga: "pendiente", evidencia: { estado: "pagada" }, veredicto: v }), "pagada", String(v));
  }
  assert.equal(estadoDeFactura({ carga: "pendiente", evidencia: { estado: "abonada" }, veredicto: "vencida" }), "abonada");
  assert.equal(estadoDeFactura({ carga: "pendiente", evidencia: { estado: "abonada" }, veredicto: null }), "abonada");
  /* La contabilidad dice que quedó saldada (pagó el resto por fuera): mejora. */
  assert.equal(estadoDeFactura({ carga: "pendiente", evidencia: { estado: "abonada" }, veredicto: "pagada" }), "pagada");
});

// ─── Evidencia por monto ─────────────────────────────────────────────────────

const AGOSTO = { periodo: "2026-08", totalAPagar: CUOTA };

test("evidencia: el monto cuenta (250.000 de 300.000 es un abono, F-13)", () => {
  assert.deepEqual(evidenciaDePago(AGOSTO, [pago("a", 250_000)]), {
    estado: "abonada",
    montoPagado: 250_000,
    montoAdeudado: CUOTA,
    conDescuento: false,
  });
  assert.equal(evidenciaDePago(AGOSTO, []), null);
});

test("evidencia: varios pagos se suman; un abono y otro pago completan", () => {
  const e = evidenciaDePago(AGOSTO, [pago("a", 100_000), pago("a", 200_000, bogota("2026-09-20T10:00"))]);
  assert.equal(e?.estado, "pagada");
  assert.equal(e?.montoPagado, CUOTA);
  assert.equal(e?.excedente, undefined);
});

test("evidencia: lo pagado de más queda como excedente", () => {
  const e = evidenciaDePago(AGOSTO, [pago("a", 350_000)]);
  assert.equal(e?.estado, "pagada");
  assert.equal(e?.excedente, 50_000);
});

test("evidencia: tolerancia de $1 por redondeo", () => {
  assert.equal(evidenciaDePago(AGOSTO, [pago("a", CUOTA - 1)])?.estado, "pagada");
  assert.equal(evidenciaDePago(AGOSTO, [pago("a", CUOTA - 2)])?.estado, "abonada");
});

test("evidencia: con descuento solo si lo pagado DENTRO del plazo alcanza", () => {
  const sept = { periodo: "2026-09", totalAPagar: 380_000, totalConDescuento: 340_000 };
  const dentro = evidenciaDePago(sept, [pago("s", 340_000, bogota("2026-09-15T23:00"))]);
  assert.deepEqual([dentro?.estado, dentro?.montoAdeudado, dentro?.conDescuento], ["pagada", 340_000, true]);
  const fuera = evidenciaDePago(sept, [pago("s", 340_000, bogota("2026-09-16T00:00"))]);
  assert.deepEqual([fuera?.estado, fuera?.montoAdeudado, fuera?.conDescuento], ["abonada", 380_000, false]);
  /* Un abono dentro del plazo que no alcanza el descuento: se debe el total. */
  const mitad = evidenciaDePago(sept, [pago("s", 200_000, bogota("2026-09-05T10:00")), pago("s", 180_000, bogota("2026-09-25T10:00"))]);
  assert.deepEqual([mitad?.estado, mitad?.montoAdeudado], ["pagada", 380_000]);
});

test("evidencia: un comprobante aprobado sin monto es pago completo", () => {
  const e = evidenciaDePago(AGOSTO, [pago("a", 0, undefined, { origen: "comprobante", asumido: true })]);
  assert.equal(e?.estado, "pagada");
});

// ─── Meses faltantes ─────────────────────────────────────────────────────────

test("períodos consecutivos, también de diciembre a enero", () => {
  assert.equal(periodosConsecutivos("2026-08", "2026-09"), true);
  assert.equal(periodosConsecutivos("2026-12", "2027-01"), true);
  assert.equal(periodosConsecutivos("2026-08", "2026-10"), false);
});

test("con un mes faltante no hay veredicto, salvo saldo anterior en cero (F-09)", () => {
  const ago = { periodo: "2026-08", totalAPagar: CUOTA };
  assert.equal(veredictoConciliacion(ago, { periodo: "2026-10", lineas: [linea(CUOTA, CUOTA)] }), "sin_veredicto");
  assert.equal(veredictoConciliacion(ago, { periodo: "2026-10", lineas: [linea(0, CUOTA)] }), "pagada");
  assert.equal(veredictoConciliacion(ago, { periodo: "2026-09", lineas: [linea(CUOTA, CUOTA)] }), "vencida");
  assert.equal(veredictoConciliacion(ago, { periodo: "2026-09", lineas: [linea(50_000, CUOTA)] }), "abonada");
});

// ─── Discrepancias ───────────────────────────────────────────────────────────

const AGO = { periodo: "2026-08" };
const sep = (saldo: number) => ({ periodo: "2026-09", lineas: [linea(saldo, CUOTA)] });

test("discrepancia: el saldo anterior siguiente es mayor que lo que quedaba por pagar", () => {
  const pagada = { montoAdeudado: CUOTA, montoPagado: CUOTA };
  assert.deepEqual(discrepanciaDePar(pagada, AGO, sep(CUOTA)), {
    montoAdeudado: CUOTA,
    montoPagado: CUOTA,
    saldoAnteriorSiguiente: CUOTA,
    montoNoAplicado: CUOTA,
  });
  /* El descuento que la contabilidad no reconoció (F-06): 40.000. */
  assert.equal(discrepanciaDePar(pagada, AGO, sep(40_000))?.montoNoAplicado, 40_000);
});

test("no es discrepancia un abono que la contabilidad refleja, ni un par sin pagos", () => {
  /* #22: 300.000, pagado 250.000, septiembre arrastra 50.000. */
  assert.equal(discrepanciaDePar({ montoAdeudado: CUOTA, montoPagado: 250_000 }, AGO, sep(50_000)), null);
  assert.equal(discrepanciaDePar(null, AGO, sep(CUOTA)), null);
  /* Abono no aplicado: debía quedar 50.000 y arrastra 300.000 → 250.000. */
  assert.equal(discrepanciaDePar({ montoAdeudado: CUOTA, montoPagado: 250_000 }, AGO, sep(CUOTA))?.montoNoAplicado, 250_000);
});

test("no se juzga una discrepancia con un mes faltante ni con una lectura en revisión", () => {
  const pagada = { montoAdeudado: CUOTA, montoPagado: CUOTA };
  assert.equal(discrepanciaDePar(pagada, AGO, { periodo: "2026-10", lineas: [linea(CUOTA, CUOTA)] }), null);
  assert.equal(discrepanciaDePar(pagada, AGO, { ...sep(CUOTA), lecturaDudosa: { motivos: ["total_no_leido"] } }), null);
});

test("un documento posterior que muestra el pago aplicado lo resuelve", () => {
  /* Septiembre arrastró 300.000 ya pagados: total 600.000. Octubre arrastra
   * 300.000 (la cuota de septiembre): los 300.000 de agosto se aplicaron. */
  const septiembre = { periodo: "2026-09", totalAPagar: 600_000 };
  assert.equal(aplicadoEnPosterior(CUOTA, septiembre, 0, { periodo: "2026-10", lineas: [linea(CUOTA, CUOTA)] }), true);
  assert.equal(aplicadoEnPosterior(CUOTA, septiembre, 0, { periodo: "2026-10", lineas: [linea(600_000, CUOTA)] }), false);
});

// ─── La cadena entera ────────────────────────────────────────────────────────

test("cadena: un pago que la siguiente no refleja abre discrepancia y marca la vigente", () => {
  const r = calcularCadena({
    cadena: [f("ago", "2026-08", [linea(0, CUOTA)]), f("sep", "2026-09", [linea(CUOTA, CUOTA)])],
    pagos: [pago("ago", CUOTA)],
    discrepancias: [],
  });
  assert.equal(r.facturas.get("ago")?.estado, "pagada");
  assert.equal(r.facturas.get("ago")?.veredicto?.estado, "vencida");
  assert.equal(r.discrepancias[0]?.tipo, "crear");
  assert.deepEqual(r.facturas.get("sep")?.pagoEnVerificacion, { monto: CUOTA, refs: ["nueva:ago"] });
  assert.equal(r.facturas.get("ago")?.pagoEnVerificacion, null);
});

test("cadena: la discrepancia se resuelve sola con la siguiente corregida", () => {
  const r = calcularCadena({
    cadena: [f("ago", "2026-08", [linea(0, CUOTA)]), f("sep", "2026-09", [linea(0, CUOTA)])],
    pagos: [pago("ago", CUOTA)],
    discrepancias: [
      { _id: "d1", facturaId: "ago", facturaSiguienteId: "sep", estado: "abierta", montoPagado: CUOTA, montoNoAplicado: CUOTA },
    ],
  });
  assert.deepEqual(r.discrepancias, [{ tipo: "resolver", id: "d1", resolucion: "documento_corregido", facturaId: "sep" }]);
  assert.equal(r.facturas.get("sep")?.pagoEnVerificacion, null);
});

test("cadena: si el pago se reversa, la discrepancia se cierra por eso", () => {
  const r = calcularCadena({
    cadena: [f("ago", "2026-08", [linea(0, CUOTA)]), f("sep", "2026-09", [linea(CUOTA, CUOTA)])],
    pagos: [],
    discrepancias: [
      { _id: "d1", facturaId: "ago", facturaSiguienteId: "sep", estado: "abierta", montoPagado: CUOTA, montoNoAplicado: CUOTA },
    ],
  });
  assert.equal(r.discrepancias[0]?.tipo === "resolver" && r.discrepancias[0].resolucion, "pago_reversado");
});

test("cadena: la resolución de la administración se respeta mientras los montos no cambien", () => {
  const cadena = [f("ago", "2026-08", [linea(0, CUOTA)]), f("sep", "2026-09", [linea(CUOTA, CUOTA)])];
  const resuelta = {
    _id: "d1",
    facturaId: "ago",
    facturaSiguienteId: "sep",
    estado: "resuelta" as const,
    resolucion: { tipo: "administracion" },
    montoPagado: CUOTA,
    montoNoAplicado: CUOTA,
  };
  const igual = calcularCadena({ cadena, pagos: [pago("ago", CUOTA)], discrepancias: [resuelta] });
  assert.deepEqual(igual.discrepancias, []);
  assert.equal(igual.facturas.get("sep")?.pagoEnVerificacion, null);
  /* Otro pago cambia los montos: vuelve a abrirse. */
  const otra = calcularCadena({ cadena, pagos: [pago("ago", 200_000), pago("ago", 100_000, bogota("2026-09-11T10:00"))], discrepancias: [resuelta] });
  assert.deepEqual(otra.discrepancias, []);
  const mas = calcularCadena({ cadena, pagos: [pago("ago", CUOTA), pago("ago", 50_000, bogota("2026-09-12T10:00"))], discrepancias: [resuelta] });
  assert.equal(mas.discrepancias[0]?.tipo, "reabrir");
});

test("cadena: un 'pagada' de antes de la Fase 3, sin siguiente que lo juzgue, se conserva como heredado", () => {
  const r = calcularCadena({
    cadena: [f("sep", "2026-09", [linea(0, CUOTA)], { estado: "pagada" })],
    pagos: [],
    discrepancias: [],
  });
  assert.equal(r.facturas.get("sep")?.estado, "pagada");
  assert.deepEqual(r.facturas.get("sep")?.veredicto, { estado: "pagada", motivo: "heredado" });
});

test("cadena: si el 'pagada' salió de un pago (hay evidencia guardada) y el pago ya no está, no se hereda", () => {
  const r = calcularCadena({
    cadena: [f("sep", "2026-09", [linea(0, CUOTA)], { estado: "pagada", estadoPago: { estado: "pagada" } })],
    pagos: [],
    discrepancias: [],
  });
  assert.equal(r.facturas.get("sep")?.estado, "pendiente");
  assert.equal(r.facturas.get("sep")?.causa, "evidencia");
});

test("cadena: con un mes faltante, la anterior queda sin veredicto (mes faltante)", () => {
  const r = calcularCadena({
    cadena: [f("ago", "2026-08", [linea(0, CUOTA)]), f("oct", "2026-10", [linea(CUOTA, CUOTA)])],
    pagos: [],
    discrepancias: [],
  });
  assert.equal(r.facturas.get("ago")?.estado, "pendiente");
  assert.deepEqual(
    [r.facturas.get("ago")?.veredicto?.estado, r.facturas.get("ago")?.veredicto?.motivo],
    ["sin_veredicto", "mes_faltante"],
  );
});

// ─── Cartera y cobro ─────────────────────────────────────────────────────────

const AHORA = bogota("2026-10-20T10:00");

function cartera(periodo: string, extra: Partial<FacturaCartera> = {}): FacturaCartera {
  const [a, m] = periodo.split("-").map(Number) as [number, number];
  const sig = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
  return {
    periodo,
    estado: "pendiente",
    fechaVencimiento: bogota(`${sig}-15T00:00`),
    totalAPagar: CUOTA,
    lineas: [linea(0, CUOTA)],
    ...extra,
  };
}

test("cartera: un pago en verificación no es mora ni 'al día': en revisión, con su monto", () => {
  const c = carteraDeUnidad(
    [cartera("2026-08", { estado: "pagada" }), cartera("2026-09", { totalAPagar: 600_000, pagoEnVerificacion: { monto: CUOTA } })],
    AHORA,
  );
  assert.deepEqual([c.estado, c.motivoRevision, c.montoEnVerificacion], ["en_revision", "pago_en_verificacion", CUOTA]);
});

test("cartera: un período vencido sin veredicto (mes faltante) no decide la mora", () => {
  const c = carteraDeUnidad(
    [cartera("2026-08", { veredictoContable: { estado: "sin_veredicto", motivo: "mes_faltante" } }), cartera("2026-10", { totalAPagar: 600_000 })],
    bogota("2026-10-08T10:00"),
  );
  assert.deepEqual([c.estado, c.motivoRevision, c.diasMora], ["en_revision", "mes_faltante", 0]);
});

test("cobro: la vigente con un pago en verificación no se cobra, con su mensaje", () => {
  const sept = { periodo: "2026-09", estado: "pendiente" as const, totalAPagar: 600_000, pagoEnVerificacion: { monto: CUOTA } };
  assert.equal(motivoNoPagable([sept], sept), "pago_en_verificacion");
  assert.match(mensajePagoEnVerificacion(CUOTA), /Tu pago de \$ 300\.000 está registrado; la contabilidad aún no lo refleja/);
  /* La revisión de lectura va antes. */
  assert.equal(motivoNoPagable([sept], { ...sept, lecturaDudosa: { motivos: ["total_no_leido"] } }), "en_revision");
});

// ─── Descuento y vencimiento (F-06) ──────────────────────────────────────────

const SEPT = { periodo: "2026-09", totalAPagar: 380_000, totalConDescuento: 340_000 };

test("descuento: sin fecha en el documento, hasta el último instante del 15 del mes del período", () => {
  assert.equal(fechaLimiteDescuentoDe(SEPT), bogota("2026-09-16T00:00") - 1);
  assert.equal(montoAPagarHoy(SEPT, bogota("2026-09-15T23:59")), 340_000);
  assert.equal(montoAPagarHoy(SEPT, bogota("2026-09-16T00:00")), 380_000);
  assert.equal(montoAPagarHoy(SEPT, bogota("2026-10-08T10:00")), 380_000);
});

test("descuento: manda la fecha del documento; sin valor con descuento no hay descuento", () => {
  const conFecha = { ...SEPT, fechaLimiteDescuento: bogota("2026-09-11T00:00") - 1 };
  assert.equal(descuentoVigente(conFecha, bogota("2026-09-12T10:00")), false);
  assert.equal(fechaLimiteDescuentoDe({ periodo: "2026-09", totalConDescuento: undefined }), null);
  assert.equal(montoAPagarHoy({ periodo: "2026-09", totalAPagar: 380_000 }, bogota("2026-09-01T10:00")), 380_000);
});

test("vencimiento nuevo: el último día del mes del período, a medianoche de Colombia", () => {
  assert.equal(vencimientoDePeriodo("2026-09"), bogota("2026-09-30T00:00"));
  assert.equal(vencimientoDePeriodo("2026-12"), bogota("2026-12-31T00:00"));
  assert.equal(vencimientoDePeriodo("2028-02"), bogota("2028-02-29T00:00"));
  /* Ese día todavía no es mora; el siguiente sí. */
  const c = (ahora: number) => carteraDeUnidad([cartera("2026-09", { fechaVencimiento: vencimientoDePeriodo("2026-09") })], ahora).estado;
  assert.equal(c(bogota("2026-09-30T18:00")), "pendiente");
  assert.equal(c(bogota("2026-10-01T00:00")), "en_mora");
});

// ─── Montos escritos y ambiente de la pasarela ───────────────────────────────

test("el monto que escribe una persona", () => {
  assert.equal(leerMontoPesos("340000"), 340_000);
  assert.equal(leerMontoPesos("$ 340.000"), 340_000);
  assert.equal(leerMontoPesos("pagué 340.000,00 ayer"), 340_000);
  assert.equal(leerMontoPesos("340,000"), 340_000);
  assert.equal(leerMontoPesos("el 15"), null);
  assert.equal(leerMontoPesos("nada"), null);
});

test("AVAL_AMBIENTE es obligatorio: sin él, o con otro valor, no hay ambiente (F-21)", () => {
  assert.equal(ambienteAval({ AVAL_AMBIENTE: "qa" }), "qa");
  assert.equal(ambienteAval({ AVAL_AMBIENTE: "prod" }), "prod");
  assert.throws(() => ambienteAval({}), /Falta AVAL_AMBIENTE/);
  assert.throws(() => ambienteAval({ AVAL_AMBIENTE: "produccion" }), /debe ser "qa" o "prod"/);
});
