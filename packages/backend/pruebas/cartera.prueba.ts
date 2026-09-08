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

/**
 * Una factura de la cadena.
 *
 * `totalAPagar` es la deuda ACUMULADA que reclama —arrastre incluido—, no la
 * cuota del mes: asi funciona el modelo, y por eso los saldos no se suman.
 */
function factura(
  estado: FacturaCartera["estado"],
  diasDesdeVencimiento: number,
  periodo = "2026-07",
  totalAPagar = 300000,
  saldoAnterior = 0,
): FacturaCartera {
  return {
    periodo,
    estado,
    fechaVencimiento: AHORA - diasDesdeVencimiento * DIA,
    totalAPagar,
    lineas: [
      {
        codigo: 2,
        concepto: `Administración de ${periodo}`,
        saldoAnterior,
        actual: totalAPagar - saldoAnterior,
        total: totalAPagar,
      },
    ],
  };
}

/** Una factura sin lineas, como quedaron las migradas. */
function suelta(
  periodo: string,
  estado: FacturaCartera["estado"],
  totalAPagar: number,
  fechaVencimiento: number,
): FacturaCartera {
  return { periodo, estado, totalAPagar, fechaVencimiento, lineas: [] };
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
  assert.equal(c.saldoActual, 0);
  assert.equal(c.diasMora, 0);
});

test("caso 4 — la ultima pagada: al dia y sin deuda", () => {
  const c = carteraDeUnidad(
    [factura("pagada", 60, "2026-06"), factura("pagada", 30, "2026-07")],
    AHORA,
  );
  assert.equal(c.estado, "al_dia");
  assert.equal(c.saldoActual, 0);
  assert.equal(c.diasMora, 0);
});

test("un saldo a favor tambien esta saldado", () => {
  const c = carteraDeUnidad([factura("saldo_a_favor", 30)], AHORA);
  assert.equal(c.estado, "al_dia");
  assert.equal(c.saldoActual, 0);
});

test("caso 1 — la ultima pendiente y sin vencer: debe, pero sin mora", () => {
  const c = carteraDeUnidad([factura("pendiente", -7, "2026-09", 380000)], AHORA);
  assert.equal(c.estado, "pendiente");
  assert.equal(c.saldoActual, 380000);
  assert.equal(c.diasMora, 0);
  assert.equal(c.periodoActual, "2026-09");
});

test("caso 2 — la ultima vencida: deuda vigente y dias de mora", () => {
  const c = carteraDeUnidad([factura("vencida", 35, "2026-07", 400800)], AHORA);
  assert.equal(c.estado, "en_mora");
  assert.equal(c.saldoActual, 400800);
  assert.equal(c.diasMora, 35);
  assert.equal(c.periodoEnMora, "2026-07");
});

test("caso 5 — el saldo NO es la suma de los historicos", () => {
  /* El corazon del asunto. Abril deja 400.000; mayo los absorbe y llega a
   * 700.000; junio absorbe lo que quedo y llega a 500.000. Sumar los tres
   * saldos daria 1.200.000 de una casa que debe 500.000. */
  const c = carteraDeUnidad(
    [
      factura("vencida", 110, "2026-04", 400000, 0),
      factura("abonada", 80, "2026-05", 700000, 400000),
      factura("pendiente", 50, "2026-06", 500000, 300000),
    ],
    AHORA,
  );
  assert.equal(c.saldoActual, 500000, "lo vigente, no 1.200.000");
});

test("caso 5 bis — si la cadena termina pagada, la deuda vieja no existe", () => {
  /* El ejemplo del enunciado: abril 400.000, mayo 800.000 (paga 500), junio
   * 700.000 pagado completo. No debe 700.000: no debe nada. */
  const c = carteraDeUnidad(
    [
      factura("vencida", 110, "2026-04", 400000, 0),
      factura("abonada", 80, "2026-05", 800000, 400000),
      factura("pagada", 50, "2026-06", 700000, 300000),
    ],
    AHORA,
  );
  assert.equal(c.estado, "al_dia");
  assert.equal(c.saldoActual, 0);
  assert.equal(c.diasMora, 0);
});

test("caso 3 — vencidas viejas pero el ultimo periodo ABONADO: no hay mora", () => {
  /* Abonar el ultimo periodo vencido prueba que la casa esta respondiendo.
   * Debe —y el saldo lo dice— pero no esta incumpliendo. */
  const c = carteraDeUnidad(
    [
      factura("vencida", 78, "2026-05", 300000),
      factura("vencida", 48, "2026-06", 600000, 300000),
      factura("abonada", 17, "2026-07", 900000, 600000),
    ],
    AHORA,
  );
  assert.equal(c.estado, "pendiente");
  assert.equal(c.diasMora, 0);
  assert.equal(c.saldoActual, 900000, "la deuda vigente sigue entera");
});

test("caso 4 bis — vencidas viejas pero el ultimo periodo PAGADO: no hay mora", () => {
  const c = carteraDeUnidad(
    [
      factura("vencida", 78, "2026-05", 300000),
      factura("vencida", 48, "2026-06", 600000, 300000),
      factura("pagada", 17, "2026-07", 900000, 600000),
    ],
    AHORA,
  );
  assert.equal(c.estado, "al_dia");
  assert.equal(c.saldoActual, 0);
});

test("periodos vencidos consecutivos: la mora la marca el ULTIMO", () => {
  const c = carteraDeUnidad(
    [
      factura("vencida", 78, "2026-05", 300000),
      factura("vencida", 48, "2026-06", 600000, 300000),
      factura("vencida", 17, "2026-07", 900000, 600000),
    ],
    AHORA,
  );
  assert.equal(c.estado, "en_mora");
  assert.equal(c.diasMora, 17, "no 78: la mora actual es la del ultimo periodo");
  assert.equal(c.saldoActual, 900000);
});

test("un solo periodo vencido despues de meses pagando: en mora", () => {
  const c = carteraDeUnidad(
    [
      factura("pagada", 78, "2026-05"),
      factura("pagada", 48, "2026-06"),
      factura("vencida", 17, "2026-07", 320000),
    ],
    AHORA,
  );
  assert.equal(c.estado, "en_mora");
  assert.equal(c.diasMora, 17);
  assert.equal(c.saldoActual, 320000);
});

test("las pagadas viejas no arrastran mora aunque sean viejisimas", () => {
  const c = carteraDeUnidad(
    [factura("pagada", 400, "2025-07"), factura("vencida", 20, "2026-08")],
    AHORA,
  );
  assert.equal(c.diasMora, 20);
});

test("caso 6 — pendiente sin vencer no genera mora, aunque haya vencidas atras", () => {
  const c = carteraDeUnidad(
    [
      factura("vencida", 78, "2026-07", 300000),
      /* Esta vencio y quedo cubierta. */
      factura("pagada", 20, "2026-08", 600000, 300000),
      /* Y la vigente no vence hasta dentro de una semana. */
      factura("pendiente", -7, "2026-09", 342000),
    ],
    AHORA,
  );
  assert.equal(c.estado, "pendiente");
  assert.equal(c.diasMora, 0);
  assert.equal(c.saldoActual, 342000);
});

test("el mismo dia del vencimiento todavia no es mora", () => {
  /* Con el corte en cero saldria "En mora — 0 dias", que no dice nada. */
  const c = carteraDeUnidad([factura("pendiente", 0)], AHORA);
  assert.equal(c.estado, "pendiente");
  assert.equal(c.diasMora, 0);
  const alDiaSiguiente = carteraDeUnidad([factura("pendiente", 1)], AHORA);
  assert.equal(alDiaSiguiente.estado, "en_mora");
  assert.equal(alDiaSiguiente.diasMora, 1);
});

test("una factura migrada sin fecha debe, pero no inventa dias de mora", () => {
  /* Contra el epoch darian cincuenta y seis anos. */
  const c = carteraDeUnidad([suelta("2024-01", "vencida", 250000, 0)], AHORA);
  assert.equal(c.estado, "pendiente");
  assert.equal(c.saldoActual, 250000);
  assert.equal(c.diasMora, 0);
});

test("sin fecha en una, pero con fecha en otra: manda la que si la tiene", () => {
  const c = carteraDeUnidad(
    [suelta("2024-01", "vencida", 250000, 0), factura("vencida", 25, "2026-08", 900000)],
    AHORA,
  );
  assert.equal(c.estado, "en_mora");
  assert.equal(c.diasMora, 25);
  assert.equal(c.saldoActual, 900000);
});

test("los dias son completos, no fracciones", () => {
  assert.equal(diasDesde(AHORA - 3 * DIA - 5 * 60 * 60 * 1000, AHORA), 3);
  assert.equal(diasDesde(AHORA + DIA, AHORA), -1);
});

// ─────────────────────────────────────────────────────────────
// Estado de cuenta (historial)
// ─────────────────────────────────────────────────────────────

/** Una factura de la cadena: total acumulado y lo que arrastra del anterior. */
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
      {
        codigo: 2,
        concepto: `Administración de ${periodo}`,
        saldoAnterior,
        actual: totalAPagar - saldoAnterior,
        total: totalAPagar,
      },
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

test("caso 7 — el historial sigue estando, factura por factura", () => {
  const filas = estadoCuentaDeCadena([
    enCadena("2026-01", "pagada", 300000, 0, 90),
    enCadena("2026-02", "abonada", 300000, 0, 60),
    enCadena("2026-03", "pendiente", 400000, 100000, 30),
  ]);
  assert.equal(filas.length, 3);
  assert.deepEqual(
    filas.map((f) => f.periodo),
    ["2026-01", "2026-02", "2026-03"],
  );
});

test("el abono sale del saldo que declara la factura SIGUIENTE", () => {
  /* Enero se pago entero (febrero no arrastra nada). De febrero quedaron
   * debiendo 100.000 (marzo los arrastra): abono 200.000 de 300.000. */
  const filas = estadoCuentaDeCadena([
    enCadena("2026-01", "pagada", 300000, 0, 90),
    enCadena("2026-02", "abonada", 300000, 0, 60),
    enCadena("2026-03", "pendiente", 400000, 100000, 30),
  ]);

  assert.equal(filas[0]!.saldoPendiente, 0, "enero quedo saldado");
  assert.equal(filas[0]!.abonado, 300000);

  assert.equal(filas[1]!.saldoPendiente, 100000, "febrero quedo debiendo 100.000");
  assert.equal(filas[1]!.abonado, 200000);
});

test("el historial no trae dias de mora por factura", () => {
  /* Ver "116 dias" en abril y "85" en mayo invita a leerlos como dos moras
   * que se acumulan, cuando son la misma deuda arrastrada. La mora es una y
   * la dice `carteraDeUnidad`. */
  const filas = estadoCuentaDeCadena([
    enCadena("2026-04", "vencida", 400800, 0, 116),
    enCadena("2026-05", "abonada", 837800, 400800, 85),
  ]);
  for (const f of filas) {
    assert.equal("diasVencida" in f, false);
  }
});

test("la ultima de la cadena no dice cero: dice que no se sabe", () => {
  /* Todavia no existe la factura siguiente que la juzgue. Un cero afirmaria
   * que esta pagada. */
  const filas = estadoCuentaDeCadena([
    enCadena("2026-01", "pagada", 300000, 0),
    enCadena("2026-02", "pendiente", 300000, 0),
  ]);
  assert.equal(filas[1]!.saldoPendiente, null);
  assert.equal(filas[1]!.abonado, null);
});

test("con intereses lo arrastrado supera el mes, y el abono no se va a negativo", () => {
  const filas = estadoCuentaDeCadena([
    enCadena("2026-01", "vencida", 300000, 0, 90),
    enCadena("2026-02", "pendiente", 620000, 320000, 30),
  ]);
  assert.equal(filas[0]!.saldoPendiente, 320000, "se muestra la deuda real, no recortada");
  assert.equal(filas[0]!.abonado, 0);
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

// ─────────────────────────────────────────────────────────────
// Regresion: el caso de Camilo
// ─────────────────────────────────────────────────────────────

/**
 * La cadena real, con hoy = 8 de septiembre de 2026. Cada `totalAPagar` es la
 * deuda acumulada, y se descompone en cargo nuevo + lo que arrastra:
 *
 *   abril   400.800 = 400.800 nuevos +       0   -> deja 400.800
 *   mayo    837.800 = 437.000 nuevos + 400.800   -> deja 264.600
 *   junio   638.600 = 374.000 nuevos + 264.600   -> PAGADA, deja 0
 *   agosto  338.000 = 338.000 nuevos +       0   -> deja  38.000
 *   sept    380.000 = 342.000 nuevos +  38.000   -> vigente
 *
 * Abril y mayo no se deben: se pagaron en junio. Sumar sus saldos no contaba
 * dos veces, resucitaba 665.400 de deuda que ya no existe.
 */
const CAMILO: FacturaCartera[] = [
  suelta("2026-03", "pagada", 321200, Date.UTC(2026, 3, 15, 12)),
  suelta("2026-04", "vencida", 400800, Date.UTC(2026, 4, 15, 12)),
  suelta("2026-05", "abonada", 837800, Date.UTC(2026, 5, 15, 12)),
  suelta("2026-06", "pagada", 638600, Date.UTC(2026, 6, 15, 12)),
  suelta("2026-08", "abonada", 338000, Date.UTC(2026, 8, 15, 12)),
  suelta("2026-09", "pendiente", 380000, Date.UTC(2026, 9, 15, 12)),
];

test("caso 6 (Camilo) — debe 380.000, no 1.083.400", () => {
  const c = carteraDeUnidad(CAMILO, Date.UTC(2026, 8, 8, 12));
  assert.equal(c.saldoActual, 380000, "la obligacion vigente, no la suma historica");
  assert.notEqual(c.saldoActual, 1083400);
  assert.equal(c.periodoActual, "2026-09");
});

test("caso 6 (Camilo) — sin mora, pese a los 116 dias de abril", () => {
  const c = carteraDeUnidad(CAMILO, Date.UTC(2026, 8, 8, 12));
  assert.equal(c.estado, "pendiente");
  assert.equal(c.diasMora, 0);
  assert.equal(c.periodoEnMora, null);
});

test("caso 6 (Camilo) — el resumen ya no puede contar facturas", () => {
  /* El contador "4 de 8" medía cuántas veces se arrastró la misma deuda. */
  const c = carteraDeUnidad(CAMILO, Date.UTC(2026, 8, 8, 12));
  assert.equal("facturasPendientes" in c, false);
});

test("regresion — si Camilo deja de pagar, la mora aparece sola", () => {
  /* Mismo historial, pero la de agosto vencio sin abono. La mora es la de
   * agosto: 23 dias, no los 116 de abril. */
  const c = carteraDeUnidad(
    [
      suelta("2026-04", "vencida", 400800, Date.UTC(2026, 4, 15, 12)),
      suelta("2026-06", "pagada", 638600, Date.UTC(2026, 6, 15, 12)),
      suelta("2026-08", "vencida", 338000, Date.UTC(2026, 8, 15, 12)),
    ],
    Date.UTC(2026, 9, 8, 12), // 8 de octubre
  );
  assert.equal(c.estado, "en_mora");
  assert.equal(c.diasMora, 23, "del 15 de septiembre al 8 de octubre");
  assert.equal(c.periodoEnMora, "2026-08");
  assert.equal(c.saldoActual, 338000);
});
