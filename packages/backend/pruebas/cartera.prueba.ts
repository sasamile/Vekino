import { test } from "node:test";
import assert from "node:assert/strict";
import {
  carteraDeUnidad,
  conceptoPrincipal,
  diasDesde,
  estadoCuentaDeCadena,
  saldoAnteriorDe,
  sinPagar,
  type FacturaCadena,
  type FacturaCartera,
} from "../convex/lib/cartera.ts";

const DIA = 24 * 60 * 60 * 1000;
const AHORA = Date.UTC(2026, 8, 8, 12); // 8 de septiembre de 2026

/** Una factura con vencimiento `dias` antes de AHORA (negativo = a futuro). */
function factura(
  estado: FacturaCartera["estado"],
  diasDesdeVencimiento: number,
  periodo = "2026-07",
): FacturaCartera {
  return {
    periodo,
    estado,
    fechaVencimiento: AHORA - diasDesdeVencimiento * DIA,
  };
}

test("abonada cuenta como deuda: abonar no es pagar", () => {
  assert.equal(sinPagar("pendiente"), true);
  assert.equal(sinPagar("vencida"), true);
  assert.equal(sinPagar("abonada"), true);
  assert.equal(sinPagar("pagada"), false);
  assert.equal(sinPagar("saldo_a_favor"), false);
});

test("sin facturas no es lo mismo que al dia", () => {
  const c = carteraDeUnidad([], AHORA);
  assert.equal(c.estado, "sin_facturas");
  assert.equal(c.diasMora, 0);
  assert.equal(c.facturasPendientes, 0);
});

test("caso 1 — todas pagadas: al dia y sin dias de mora", () => {
  const c = carteraDeUnidad(
    [factura("pagada", 60, "2026-06"), factura("pagada", 30, "2026-07")],
    AHORA,
  );
  assert.equal(c.estado, "al_dia");
  assert.equal(c.diasMora, 0);
  assert.equal(c.facturasPendientes, 0);
});

test("un saldo a favor tambien esta saldado", () => {
  const c = carteraDeUnidad([factura("saldo_a_favor", 30)], AHORA);
  assert.equal(c.estado, "al_dia");
});

test("caso 2 — una factura vencida: en mora, con los dias del vencimiento", () => {
  const c = carteraDeUnidad([factura("vencida", 35, "2026-07")], AHORA);
  assert.equal(c.estado, "en_mora");
  assert.equal(c.diasMora, 35);
  assert.equal(c.facturasPendientes, 1);
  assert.equal(c.periodoMasAntiguo, "2026-07");
});

test("caso 3 — varias pendientes: manda la MAS ANTIGUA ya vencida", () => {
  /* Es la que responde "cuanto lleva debiendo". Contar desde la mas reciente
   * dejaria a una casa con setenta y ocho dias de atraso mostrando quince. */
  const c = carteraDeUnidad(
    [
      factura("vencida", 78, "2026-05"),
      factura("vencida", 48, "2026-06"),
      factura("pendiente", 17, "2026-07"),
    ],
    AHORA,
  );
  assert.equal(c.estado, "en_mora");
  assert.equal(c.diasMora, 78);
  assert.equal(c.facturasPendientes, 3);
  assert.equal(c.periodoMasAntiguo, "2026-05");
});

test("una abonada vieja pesa mas que una pendiente reciente", () => {
  const c = carteraDeUnidad(
    [factura("abonada", 90, "2026-05"), factura("pendiente", 10, "2026-08")],
    AHORA,
  );
  assert.equal(c.diasMora, 90);
  assert.equal(c.periodoMasAntiguo, "2026-05");
});

test("las pagadas no arrastran mora aunque sean viejisimas", () => {
  const c = carteraDeUnidad(
    [factura("pagada", 400, "2025-07"), factura("vencida", 20, "2026-08")],
    AHORA,
  );
  assert.equal(c.diasMora, 20);
});

test("debe pero aun no se vence: 'por vencer', no mora", () => {
  /* Una factura de septiembre que vence el 15 de octubre no lleva un mes de
   * atraso el 20 de septiembre: lleva cero. */
  const c = carteraDeUnidad([factura("pendiente", -7, "2026-09")], AHORA);
  assert.equal(c.estado, "pendiente");
  assert.equal(c.diasMora, 0);
  assert.equal(c.facturasPendientes, 1);
  assert.equal(c.periodoMasAntiguo, null);
});

test("el mismo dia del vencimiento todavia no es mora", () => {
  /* Con el corte en cero saldria "En mora — 0 dias", que no dice nada. */
  const c = carteraDeUnidad([factura("pendiente", 0)], AHORA);
  assert.equal(c.estado, "pendiente");
  const alDiaSiguiente = carteraDeUnidad([factura("pendiente", 1)], AHORA);
  assert.equal(alDiaSiguiente.estado, "en_mora");
  assert.equal(alDiaSiguiente.diasMora, 1);
});

test("una factura migrada sin fecha cuenta como deuda pero no inventa dias", () => {
  /* Contra el epoch darian cincuenta y seis anos de mora. */
  const c = carteraDeUnidad(
    [{ periodo: "2024-01", estado: "vencida", fechaVencimiento: 0 }],
    AHORA,
  );
  assert.equal(c.estado, "pendiente");
  assert.equal(c.facturasPendientes, 1);
  assert.equal(c.diasMora, 0);
});

test("sin fecha en una, pero con fecha en otra: manda la que si la tiene", () => {
  const c = carteraDeUnidad(
    [
      { periodo: "2024-01", estado: "vencida", fechaVencimiento: 0 },
      factura("vencida", 25, "2026-08"),
    ],
    AHORA,
  );
  assert.equal(c.estado, "en_mora");
  assert.equal(c.diasMora, 25);
  assert.equal(c.facturasPendientes, 2);
});

test("los dias son completos, no fracciones", () => {
  assert.equal(diasDesde(AHORA - 3 * DIA - 5 * 60 * 60 * 1000, AHORA), 3);
  assert.equal(diasDesde(AHORA + DIA, AHORA), -1);
});

// ─────────────────────────────────────────────────────────────
// Estado de cuenta
// ─────────────────────────────────────────────────────────────

/** Una factura de la cadena: total del mes y lo que arrastra del anterior. */
function enCadena(
  periodo: string,
  estado: FacturaCadena["estado"],
  totalAPagar: number,
  saldoAnterior: number,
  diasDesdeVencimiento = 30,
): FacturaCadena {
  return {
    periodo,
    periodoLabel: `01-${periodo}`,
    estado,
    totalAPagar,
    fechaVencimiento: AHORA - diasDesdeVencimiento * DIA,
    lineas: [
      { codigo: 2, concepto: `Administración de ${periodo}`, saldoAnterior, actual: 300000, total: totalAPagar },
    ],
  };
}

test("el saldo anterior es la suma de lo que arrastran las lineas", () => {
  assert.equal(
    saldoAnteriorDe({
      lineas: [
        { codigo: 2, concepto: "Admón", saldoAnterior: 100000, actual: 300000, total: 400000 },
        { codigo: 3, concepto: "Intereses mora", saldoAnterior: 5000, actual: 0, total: 5000 },
      ],
    }),
    105000,
  );
});

test("el abono sale del saldo que declara la factura SIGUIENTE", () => {
  /* Enero se pago entero (febrero no arrastra nada). De febrero quedaron
   * debiendo 100.000 (marzo los arrastra): abono 200.000 de 300.000. */
  const filas = estadoCuentaDeCadena(
    [
      enCadena("2026-01", "pagada", 300000, 0, 90),
      enCadena("2026-02", "abonada", 300000, 0, 60),
      enCadena("2026-03", "pendiente", 400000, 100000, 30),
    ],
    AHORA,
  );

  assert.equal(filas[0]!.saldoPendiente, 0, "enero quedo saldado");
  assert.equal(filas[0]!.abonado, 300000);

  assert.equal(filas[1]!.saldoPendiente, 100000, "febrero quedo debiendo 100.000");
  assert.equal(filas[1]!.abonado, 200000);
});

test("la ultima de la cadena no dice cero: dice que no se sabe", () => {
  /* Todavia no existe la factura siguiente que la juzgue. Un cero afirmaria
   * que esta pagada. */
  const filas = estadoCuentaDeCadena(
    [enCadena("2026-01", "pagada", 300000, 0), enCadena("2026-02", "pendiente", 300000, 0)],
    AHORA,
  );
  assert.equal(filas[1]!.saldoPendiente, null);
  assert.equal(filas[1]!.abonado, null);
});

test("con intereses lo arrastrado supera el mes, y el abono no se va a negativo", () => {
  const filas = estadoCuentaDeCadena(
    [
      enCadena("2026-01", "vencida", 300000, 0, 90),
      enCadena("2026-02", "pendiente", 620000, 320000, 30),
    ],
    AHORA,
  );
  assert.equal(filas[0]!.saldoPendiente, 320000, "se muestra la deuda real, no recortada");
  assert.equal(filas[0]!.abonado, 0);
});

test("los dias de vencida los manda el estado, no la fecha", () => {
  /* La de enero vencio hace mas de un ano, pero esta pagada: no lleva un solo
   * dia de mora. La de febrero si. */
  const filas = estadoCuentaDeCadena(
    [enCadena("2026-01", "pagada", 300000, 0, 400), enCadena("2026-02", "vencida", 300000, 0, 40)],
    AHORA,
  );
  assert.equal(filas[0]!.diasVencida, null);
  assert.equal(filas[1]!.diasVencida, 40);
});

test("una vencida en medio de la cadena si cuenta sus dias", () => {
  const filas = estadoCuentaDeCadena(
    [
      enCadena("2026-01", "vencida", 300000, 0, 90),
      enCadena("2026-02", "pendiente", 600000, 300000, 30),
    ],
    AHORA,
  );
  assert.equal(filas[0]!.diasVencida, 90);
});

test("el concepto es la linea que mas pesa, venga del codigo que venga", () => {
  /* El importador de PDF pone la administracion en el 2 y el alta manual en
   * el 1. Mirar el monto acierta con las dos. */
  assert.equal(
    conceptoPrincipal(
      [
        { codigo: 3, concepto: "Intereses mora", saldoAnterior: 0, actual: 12000, total: 12000 },
        { codigo: 2, concepto: "Administración de marzo", saldoAnterior: 0, actual: 300000, total: 300000 },
      ],
      "01-marzo-2026",
    ),
    "Administración de marzo",
  );
  assert.equal(
    conceptoPrincipal(
      [{ codigo: 1, concepto: "Administración de abril", saldoAnterior: 0, actual: 274000, total: 274000 }],
      "01-abril-2026",
    ),
    "Administración de abril",
  );
});

test("sin lineas, el concepto cae al periodo en vez de inventarse uno", () => {
  /* Las facturas migradas llegaron sin lineas. */
  assert.equal(conceptoPrincipal([], "01-marzo-2026"), "01-marzo-2026");
});
