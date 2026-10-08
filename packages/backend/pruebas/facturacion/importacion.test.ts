import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { internal } from "../../convex/_generated/api";
import {
  aprobarPagoAval,
  bloquearRed,
  cargar,
  comoLaCargaPorPdf,
  facturaDe,
  facturasDe,
  fijarReloj,
  liberarRed,
  linea,
  montar,
  soltarReloj,
  type Escenario,
  type FacturaCarga,
} from "./escenario";

/**
 * RED DE SEGURIDAD DE FACTURACIÓN — IMPORTACIÓN Y CONCILIACIÓN (Fase 0).
 *
 * F-11  idempotencia: la misma factura entra una sola vez y re-subirla no
 *       destruye estados, venga por la web, por la migración o por script.
 * F-07  identidad: el período lo elige quien sube; no puede contradecir al
 *       documento sin que nadie se entere.
 * F-09  huecos: un mes sin cargar no autoriza a juzgar el anterior.
 * F-04  documentos que no cuadran: la conciliación no puede usar un saldo
 *       anterior mal leído para declarar vencida una factura.
 */

beforeEach(() => {
  bloquearRed();
  fijarReloj();
});
afterEach(() => {
  soltarReloj();
  liberarRed();
});

const CUOTA = 300_000;

async function todas(esc: Escenario) {
  return await esc.t.run(async (ctx) => await ctx.db.query("facturas").collect());
}

describe("F11 · la misma carga dos veces es idempotente", () => {
  const loteA: FacturaCarga[] = [
    { periodo: "2026-08", casa: "u101", lineas: [linea("CUOTA DE ADMINISTRACIÓN", 0, CUOTA)] },
    { periodo: "2026-08", casa: "u202", lineas: [linea("CUOTA DE ADMINISTRACIÓN", 0, CUOTA)] },
  ];

  test("F11-control · subir el lote A dos veces ('solo nuevas') no duplica ni cambia estados", async () => {
    const esc = await montar();
    const primera = await cargar(esc, loteA);
    const segunda = await cargar(esc, loteA);

    expect(primera.inserted).toBe(2);
    expect(segunda.inserted).toBe(0);
    expect(segunda.skipped).toBe(2);
    const filas = await todas(esc);
    expect(filas).toHaveLength(2);
    expect(filas.map((f) => f.estado)).toEqual(["pendiente", "pendiente"]);
  });

  test("F11-control · re-subir agosto y septiembre con 'actualizar' no duplica y conserva lo que dedujo la conciliación", async () => {
    const esc = await montar();
    const lote: FacturaCarga[] = [
      { periodo: "2026-08", lineas: [linea("CUOTA DE ADMINISTRACIÓN", 0, CUOTA)] },
      { periodo: "2026-09", lineas: [linea("CUOTA DE ADMINISTRACIÓN", 0, CUOTA)] },
    ];
    await cargar(esc, lote);
    await cargar(esc, lote, { skipExisting: false });

    const cadena = await facturasDe(esc);
    expect(cadena.map((f) => [f.periodo, f.estado])).toEqual([
      ["2026-08", "pagada"],
      ["2026-09", "pendiente"],
    ]);
  });

  test("F11-control · volver a subir agosto (con 'actualizar') no deshace un pago aprobado", async () => {
    const esc = await montar();
    const agostoCarga: FacturaCarga = {
      periodo: "2026-08",
      lineas: [linea("CUOTA DE ADMINISTRACIÓN", 0, CUOTA)],
    };
    await cargar(esc, [agostoCarga]);
    const agosto = await facturaDe(esc, "2026-08");
    await aprobarPagoAval(esc, agosto._id, CUOTA);

    await cargar(esc, [agostoCarga], { skipExisting: false });
    expect((await facturaDe(esc, "2026-08")).estado).toBe("pagada");
    expect(await todas(esc)).toHaveLength(1);
  });

  test("F11-bulkFacturas-duplica · la migración no crea una segunda factura de agosto para la casa 101 si ya la subió la web", async () => {
    const esc = await montar();
    const agosto: FacturaCarga = {
      periodo: "2026-08",
      lineas: [linea("CUOTA DE ADMINISTRACIÓN", 0, CUOTA)],
    };
    await cargar(esc, [agosto]);

    await esc.t.mutation(internal.migrations.bulkFacturas, {
      facturas: [{ ...comoLaCargaPorPdf(esc, agosto), legacyId: "legacy-agosto-101" }],
    });

    const deAgosto = (await facturasDe(esc)).filter((f) => f.periodo === "2026-08");
    expect(deAgosto, "dos facturas de agosto para la misma casa").toHaveLength(1);
  });

  test("F11-bulkFacturas-resetea-estado · re-ejecutar la migración no devuelve a 'pendiente' una factura pagada", async () => {
    const esc = await montar();
    const agosto = {
      ...comoLaCargaPorPdf(esc, {
        periodo: "2026-08",
        lineas: [linea("CUOTA DE ADMINISTRACIÓN", 0, CUOTA)],
      }),
      legacyId: "legacy-agosto-101",
    };
    await esc.t.mutation(internal.migrations.bulkFacturas, { facturas: [agosto] });
    const migrada = await facturaDe(esc, "2026-08");
    await aprobarPagoAval(esc, migrada._id, CUOTA);
    expect((await facturaDe(esc, "2026-08")).estado).toBe("pagada");

    // Los scripts de migración mandan siempre estado "pendiente".
    await esc.t.mutation(internal.migrations.bulkFacturas, { facturas: [agosto] });
    expect((await facturaDe(esc, "2026-08")).estado).toBe("pagada");
  });

  test("F11-upsertFactura-resetea-estado · la importación por script (upsertFactura) no devuelve a 'pendiente' una factura pagada", async () => {
    const esc = await montar();
    const carga: FacturaCarga = {
      periodo: "2026-08",
      lineas: [linea("CUOTA DE ADMINISTRACIÓN", 0, CUOTA)],
    };
    await cargar(esc, [carga]);
    const agosto = await facturaDe(esc, "2026-08");
    await aprobarPagoAval(esc, agosto._id, CUOTA);

    await esc.t.mutation(internal.facturas.upsertFactura, comoLaCargaPorPdf(esc, carga));
    expect((await facturaDe(esc, "2026-08")).estado).toBe("pagada");
  });
});

describe("F07 · el período guardado no puede contradecir al documento", () => {
  async function subirSeptiembreCon(periodoLabel: string) {
    const esc = await montar();
    let rechazo: string | null = null;
    try {
      await cargar(esc, [
        {
          periodo: "2026-09",
          periodoLabel,
          lineas: [linea("CUOTA DE ADMINISTRACIÓN", 0, CUOTA)],
        },
      ]);
    } catch (e) {
      rechazo = e instanceof Error ? e.message : String(e);
    }
    const guardadas = (await facturasDe(esc)).filter((f) => f.periodo === "2026-09");
    return { rechazo, guardadas };
  }

  /*
   * Lo que se exige: o la carga se rechaza, o esa factura no queda guardada
   * con una identidad que su propio documento contradice. Cómo avisarle a
   * quien sube (error, advertencia en la vista previa) lo decide la Fase 2.
   */
  for (const etiqueta of ["Octubre / 2026", "01-octubre-2026"]) {
    test(`F07-periodo-contradice-documento · un documento de '${etiqueta}' no queda guardado en silencio como 2026-09`, async () => {
      const { rechazo, guardadas } = await subirSeptiembreCon(etiqueta);
      expect(
        rechazo !== null || guardadas.length === 0,
        `quedó guardada como 2026-09 con periodoLabel "${guardadas[0]?.periodoLabel}"`,
      ).toBe(true);
    });
  }

  for (const etiqueta of ["Septiembre / 2026", "01-septiembre-2026"]) {
    test(`F07-control · si la etiqueta del documento ('${etiqueta}') coincide con el período, se guarda`, async () => {
      const { rechazo, guardadas } = await subirSeptiembreCon(etiqueta);
      expect(rechazo).toBeNull();
      expect(guardadas).toHaveLength(1);
    });
  }
});

describe("F09 · conciliación con un mes sin cargar", () => {
  /*
   * Agosto se pagó por fuera; septiembre nunca se subió a Vekino; octubre
   * arrastra $300.000 de saldo anterior, que son la cuota de SEPTIEMBRE. Con
   * el hueco, ese saldo no dice nada de agosto. Hoy se compara con agosto y
   * agosto queda "vencida". Se espera que quede sin veredicto (hoy, el estado
   * "pendiente"; si la Fase 2 crea uno propio, esta prueba lo admite).
   */
  test("F09-hueco-de-periodo · agosto → [septiembre sin cargar] → octubre: el saldo de octubre no basta para juzgar agosto", async () => {
    const esc = await montar();
    await cargar(esc, [
      { periodo: "2026-08", lineas: [linea("CUOTA DE ADMINISTRACIÓN", 0, CUOTA)] },
    ]);
    await cargar(esc, [
      { periodo: "2026-10", lineas: [linea("CUOTA DE ADMINISTRACIÓN", CUOTA, CUOTA)] },
    ]);
    const agosto = await facturaDe(esc, "2026-08");
    expect(["vencida", "abonada", "pagada"], `agosto quedó "${agosto.estado}"`).not.toContain(
      agosto.estado,
    );
  });

  /*
   * Con saldo anterior 0, octubre sí prueba que todo lo anterior quedó
   * saldado, hueco o no: agosto puede darse por pagada (o quedar sin
   * veredicto), pero nunca vencida ni abonada.
   */
  test("F09-control · con saldo anterior 0 en octubre, agosto no queda vencida ni abonada", async () => {
    const esc = await montar();
    await cargar(esc, [
      { periodo: "2026-08", lineas: [linea("CUOTA DE ADMINISTRACIÓN", 0, CUOTA)] },
    ]);
    await cargar(esc, [
      { periodo: "2026-10", lineas: [linea("CUOTA DE ADMINISTRACIÓN", 0, CUOTA)] },
    ]);
    const agosto = await facturaDe(esc, "2026-08");
    expect(["vencida", "abonada"]).not.toContain(agosto.estado);
  });
});

/**
 * F-04 — valores REALES de una casa de Ciudad del Campo (agosto y septiembre
 * de 2026). Los PDFs están anonimizados en
 * apps/web/pruebas/facturacion/fixtures/cdc-agosto-saldo-a-favor.pdf y
 * cdc-septiembre-saldo-anterior-negativo.pdf.
 *
 *   agosto     Totales: saldo anterior −597.000, este mes 335.000 → total −262.000 (a favor)
 *   septiembre Totales: saldo anterior −262.000, este mes 335.000 → total 73.000
 *
 * El parser actual no lee el signo ni la fila de crédito "CI ANTICIPO DE
 * CLIENTE": guarda agosto con total 0 y septiembre con un saldo anterior de
 * +335.000 (las filas de agosto). Es exactamente lo que hay hoy en la base.
 */
describe("F04 · conciliación con documentos que no cuadran (valores reales, CDC, ago–sep 2026)", () => {
  const agostoLeidoHoy: FacturaCarga = {
    periodo: "2026-08",
    lineas: [
      linea("CUOTA DE ADMINISTRACIÓN", 0, 314_000, 1),
      linea("POZO PTTM Y CORMACARENA", 0, 21_000, 8),
    ],
    totalAPagar: 0,
  };
  const septiembreLeidoHoy: FacturaCarga = {
    periodo: "2026-09",
    lineas: [
      linea("CUOTA DE ADMINISTRACIÓN", 314_000, 314_000, 1),
      linea("POZO PTTM Y CORMACARENA", 21_000, 21_000, 8),
    ],
    totalAPagar: 73_000,
    totalConDescuento: 33_000,
  };
  const anticipo = linea("ANTICIPO DE CLIENTE (CI)", -597_000, 0, 0);
  const agostoReal: FacturaCarga = {
    periodo: "2026-08",
    lineas: [...agostoLeidoHoy.lineas, anticipo],
  };
  const septiembreReal: FacturaCarga = {
    periodo: "2026-09",
    lineas: [...septiembreLeidoHoy.lineas, anticipo],
    totalConDescuento: 33_000,
  };

  test("F04-saldo-a-favor-leido-como-deuda · con la lectura actual, agosto (a favor $262.000) no puede quedar 'vencida'", async () => {
    const esc = await montar();
    await cargar(esc, [agostoLeidoHoy]);
    await cargar(esc, [septiembreLeidoHoy]);
    const agosto = await facturaDe(esc, "2026-08");
    expect(agosto.estado).not.toBe("vencida");
  });

  test("F04-control · con la lectura correcta (la de la fila Totales), la misma regla deja agosto en 'saldo_a_favor'", async () => {
    const esc = await montar();
    await cargar(esc, [agostoReal]);
    await cargar(esc, [septiembreReal]);
    const agosto = await facturaDe(esc, "2026-08");
    const septiembre = await facturaDe(esc, "2026-09");
    expect(agosto.totalAPagar).toBe(-262_000);
    expect(septiembre.totalAPagar).toBe(73_000);
    expect(agosto.estado).toBe("saldo_a_favor");
  });
});
