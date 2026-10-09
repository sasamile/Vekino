import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  aceptaPagar,
  aprobarPagoAval,
  bloquearRed,
  bogota,
  cargar,
  datosDePagoBot,
  datosDePagoWeb,
  facturaDe,
  fijarReloj,
  insertarDirecto,
  liberarRed,
  linea,
  montar,
  soltarReloj,
} from "./escenario";

/**
 * RED DE SEGURIDAD DE FACTURACIÓN — PAGOS (Fase 0).
 *
 * Cada prueba lleva en el nombre el hallazgo de docs/audits/AUDITORIA_FACTURACION.md
 * que protege. Las que describen un defecto FALLAN hoy a propósito: su
 * expectativa es el comportamiento correcto, y pasan a verde cuando la fase
 * correspondiente lo corrija. Las marcadas "control" pasan hoy y deben seguir
 * pasando después. Ver docs/audits/FASE-0-FACTURACION.md.
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
const ABONO = 250_000;
const SALDO = CUOTA - ABONO; // 50.000

/**
 * R-1/R-2 — el escenario de la auditoría, con los números pedidos para la Fase 0.
 *
 *   factura original   agosto 2026 (periodo "2026-08"), casa 101, cargo $300.000
 *   pago               aprobado por la pasarela Aval: $250.000
 *   saldo restante     $50.000
 *   nueva factura      septiembre 2026: saldo anterior $50.000 + cuota $300.000 = $350.000
 *   conciliación       `conciliarCadenaUnidad` juzga agosto con el saldo anterior de septiembre
 *   estado esperado    agosto ABONADA (hubo pago y quedó saldo), nunca vencida;
 *                      el pago sigue aprobado y ligado a agosto;
 *                      agosto ya NO es pagable (su saldo vive en septiembre);
 *                      septiembre es la única pagable, por $350.000.
 */
describe("R-1/R-2 · cargo → pago aprobado → nueva factura → conciliación", () => {
  async function agostoConAbonoAprobado() {
    const esc = await montar();
    await cargar(esc, [
      { periodo: "2026-08", lineas: [linea("CUOTA DE ADMINISTRACIÓN", 0, CUOTA)] },
    ]);
    const agosto = await facturaDe(esc, "2026-08");
    const pagoId = await aprobarPagoAval(esc, agosto._id, ABONO);
    return { esc, agosto, pagoId };
  }

  test("F13-pago-parcial-marcado-pagada · $250.000 aprobados sobre $300.000 dejan un saldo de $50.000: agosto no puede quedar 'pagada'", async () => {
    const { esc } = await agostoConAbonoAprobado();
    const agosto = await facturaDe(esc, "2026-08");
    // Defecto actual: `aplicarEstado` marca "pagada" sin comparar el monto (pagos.ts).
    expect(agosto.estado).toBe("abonada");
  });

  test("F02-control · septiembre trae los $50.000: agosto queda abonada (no vencida) y el pago sigue aprobado y ligado", async () => {
    const { esc, agosto, pagoId } = await agostoConAbonoAprobado();
    await cargar(esc, [
      { periodo: "2026-09", lineas: [linea("CUOTA DE ADMINISTRACIÓN", SALDO, CUOTA)] },
    ]);

    expect((await facturaDe(esc, "2026-08")).estado).toBe("abonada");
    const pago = await esc.t.run(async (ctx) => await ctx.db.get(pagoId));
    expect(pago?.estado).toBe("aprobada");
    expect(pago?.facturaId).toBe(agosto._id);
    expect((await facturaDe(esc, "2026-09")).totalAPagar).toBe(CUOTA + SALDO);
  });

  test("F02-conciliacion-sobrescribe-pago (Caso A) · la contabilidad cortó antes de aplicar el abono y septiembre arrastra $300.000: agosto no puede quedar 'vencida' con $250.000 aprobados", async () => {
    const { esc } = await agostoConAbonoAprobado();
    await cargar(esc, [
      { periodo: "2026-09", lineas: [linea("CUOTA DE ADMINISTRACIÓN", CUOTA, CUOTA)] },
    ]);
    const agosto = await facturaDe(esc, "2026-08");
    // Defecto actual: la conciliación ignora la tabla `pagos` y deduce
    // "vencida" del saldo anterior del PDF siguiente (facturas.ts).
    expect(agosto.estado).not.toBe("vencida");
  });

  test("F01-factura-historica-doble-pago (Caso C) · tras cargar septiembre, el residente no puede iniciar otro pago de agosto (web ni WhatsApp)", async () => {
    const { esc, agosto } = await agostoConAbonoAprobado();
    await cargar(esc, [
      { periodo: "2026-09", lineas: [linea("CUOTA DE ADMINISTRACIÓN", SALDO, CUOTA)] },
    ]);

    const web = await aceptaPagar(datosDePagoWeb(esc, agosto._id));
    const bot = await aceptaPagar(datosDePagoBot(esc, agosto._id));
    // Defecto actual: `armarDatosTrn` solo rechaza estado "pagada".
    expect(web.acepta, "la web aceptó cobrar agosto otra vez").toBe(false);
    expect(bot.acepta, "WhatsApp aceptó cobrar agosto otra vez").toBe(false);
  });

  test("F01-control (Caso C) · septiembre, la vigente, sí se puede pagar y por $350.000", async () => {
    const { esc } = await agostoConAbonoAprobado();
    await cargar(esc, [
      { periodo: "2026-09", lineas: [linea("CUOTA DE ADMINISTRACIÓN", SALDO, CUOTA)] },
    ]);
    const septiembre = await facturaDe(esc, "2026-09");
    const datos = await datosDePagoBot(esc, septiembre._id);
    expect(datos.monto).toBe(CUOTA + SALDO);
  });

  test("F01-factura-historica-doble-pago (Caso B) · cuando la vigente queda pagada, la absorbida no vuelve a ser pagable", async () => {
    const esc = await montar();
    await cargar(esc, [
      { periodo: "2026-08", lineas: [linea("CUOTA DE ADMINISTRACIÓN", 0, CUOTA)] },
    ]);
    // Agosto no se pagó: septiembre lo arrastra entero y agosto queda vencida (correcto).
    await cargar(esc, [
      { periodo: "2026-09", lineas: [linea("CUOTA DE ADMINISTRACIÓN", CUOTA, CUOTA)] },
    ]);
    const agosto = await facturaDe(esc, "2026-08");
    expect(agosto.estado).toBe("vencida");

    // El residente paga septiembre ($600.000), que ya incluye agosto.
    const septiembre = await facturaDe(esc, "2026-09");
    await aprobarPagoAval(esc, septiembre._id, 2 * CUOTA);

    const web = await aceptaPagar(datosDePagoWeb(esc, agosto._id));
    const bot = await aceptaPagar(datosDePagoBot(esc, agosto._id));
    expect(web.acepta, "la web ofreció cobrar de nuevo los $300.000 de agosto").toBe(false);
    expect(bot.acepta, "WhatsApp ofreció cobrar de nuevo los $300.000 de agosto").toBe(false);
  });

  /*
   * Hallazgo NUEVO de la Fase 0 (no estaba en la auditoría, que daba por
   * correcto el modelo de `lib/cartera.ts`): `carteraDeUnidad` decide la mora
   * con el último período YA vencido (agosto, "vencida") sin mirar que la
   * factura siguiente —que absorbe a agosto— está pagada. Resultado: una casa
   * que pagó todo aparece "en_mora" con saldo 0 hasta que vence septiembre.
   */
  test("F03-cartera-mora-tras-pago (Caso B) · la cartera de la administración debe ver la casa al día después de pagar septiembre", async () => {
    const esc = await montar();
    await cargar(esc, [
      { periodo: "2026-08", lineas: [linea("CUOTA DE ADMINISTRACIÓN", 0, CUOTA)] },
    ]);
    await cargar(esc, [
      { periodo: "2026-09", lineas: [linea("CUOTA DE ADMINISTRACIÓN", CUOTA, CUOTA)] },
    ]);
    const septiembre = await facturaDe(esc, "2026-09");
    await aprobarPagoAval(esc, septiembre._id, 2 * CUOTA);

    const [fila] = await esc.como("admin").query(api.facturas.carteraPorUnidad, {
      condominioId: esc.condominioId,
      unidadIds: [esc.u101],
    });
    expect(fila?.estado).toBe("al_dia");
    expect(fila?.saldoActual).toBe(0);
  });
});

/**
 * F-01 — `armarDatosTrn` (pagos.ts) decide si se puede abrir una transacción
 * en la pasarela. Hoy solo mira `estado !== "pagada"`. Debe mirar si la
 * factura es la VIGENTE de la casa: una factura histórica está absorbida por
 * la siguiente, pagarla es pagar dos veces el mismo saldo.
 *
 * Las facturas se insertan directo (sin conciliación) para probar cada estado
 * que puede tener una histórica, incluido "pendiente" (cadena sin conciliar,
 * p. ej. tras una migración).
 */
describe("F01 · armarDatosTrn solo acepta la factura vigente de la casa", () => {
  for (const estado of ["vencida", "abonada", "pendiente"] as const) {
    test(`F01-armarDatosTrn-no-vigente · agosto (${estado}) quedó absorbido por septiembre: no basta con que no esté 'pagada'`, async () => {
      const esc = await montar();
      const agosto = await insertarDirecto(
        esc,
        { periodo: "2026-08", lineas: [linea("CUOTA DE ADMINISTRACIÓN", 0, CUOTA)] },
        estado,
      );
      await insertarDirecto(
        esc,
        { periodo: "2026-09", lineas: [linea("CUOTA DE ADMINISTRACIÓN", CUOTA, CUOTA)] },
        "pendiente",
      );

      const web = await aceptaPagar(datosDePagoWeb(esc, agosto));
      const bot = await aceptaPagar(datosDePagoBot(esc, agosto));
      expect(web.acepta, `la web aceptó pagar agosto (${estado})`).toBe(false);
      expect(bot.acepta, `WhatsApp aceptó pagar agosto (${estado})`).toBe(false);
    });
  }

  test("F01-control · la vigente (septiembre) sí se acepta, por su total acumulado", async () => {
    const esc = await montar();
    await insertarDirecto(
      esc,
      { periodo: "2026-08", lineas: [linea("CUOTA DE ADMINISTRACIÓN", 0, CUOTA)] },
      "vencida",
    );
    const septiembre = await insertarDirecto(
      esc,
      { periodo: "2026-09", lineas: [linea("CUOTA DE ADMINISTRACIÓN", CUOTA, CUOTA)] },
      "pendiente",
    );
    expect((await datosDePagoWeb(esc, septiembre)).monto).toBe(2 * CUOTA);
    expect((await datosDePagoBot(esc, septiembre)).monto).toBe(2 * CUOTA);
  });

  test("F01-control · una factura pagada se sigue rechazando", async () => {
    const esc = await montar();
    const agosto = await insertarDirecto(
      esc,
      { periodo: "2026-08", lineas: [linea("CUOTA DE ADMINISTRACIÓN", 0, CUOTA)] },
      "pagada",
    );
    const r = await aceptaPagar(datosDePagoBot(esc, agosto));
    expect(r.acepta).toBe(false);
    expect(r.motivo).toMatch(/ya está pagada/i);
  });
});

/**
 * F-06 — fecha límite del descuento por pronto pago.
 *
 * Valores reales de una factura 2026-09 de Ciudad del Campo (la del pago QA
 * `m978jsk6…` del 2026-10-08): total $380.000, con descuento $340.000.
 *
 * El propio PDF de Ciudad del Campo fija la regla: "PARA BENEFICIARSE DEL
 * DESCUENTO POR PRONTO PAGO… DEBE PAGAR LA TOTALIDAD DEL ESTADO DE CUENTA
 * HASTA EL DIA 15 DEL PRESENTE MES" (ver fixtures de apps/web). Para la cuenta
 * de septiembre, el descuento vence el 15 de septiembre. La carga por PDF
 * guarda `fechaVencimiento` = 15 de OCTUBRE y `armarDatosTrn` la usa como
 * límite del descuento.
 */
describe("F06 · el descuento por pronto pago no se extiende hasta el vencimiento", () => {
  async function septiembreConDescuento() {
    const esc = await montar();
    await cargar(esc, [
      {
        periodo: "2026-09",
        lineas: [linea("CUOTA DE ADMINISTRACIÓN", 0, 380_000)],
        totalConDescuento: 340_000,
      },
    ]);
    return { esc, septiembre: await facturaDe(esc, "2026-09") };
  }

  async function montoEl(fecha: string) {
    const { esc, septiembre } = await septiembreConDescuento();
    vi.setSystemTime(bogota(fecha));
    return (await datosDePagoBot(esc, septiembre._id)).monto;
  }

  test("F06-descuento-vencido · el 8 de octubre (fecha del pago QA real) se cobra $380.000, no $340.000", async () => {
    expect(await montoEl("2026-10-08T10:00")).toBe(380_000);
  });

  test("F06-control · el 10 de septiembre (dentro del 1–15) se cobra con descuento: $340.000", async () => {
    expect(await montoEl("2026-09-10T10:00")).toBe(340_000);
  });

  test("F06-control · el 20 de octubre (después del vencimiento guardado) se cobra $380.000", async () => {
    expect(await montoEl("2026-10-20T10:00")).toBe(380_000);
  });
});

describe("F20 · los pagos de una factura no son visibles para cualquier sesión", () => {
  test("F20-listPorFactura-sin-control · el vecino de la 202 no puede listar los pagos de la factura de la 101", async () => {
    const esc = await montar();
    await cargar(esc, [
      { periodo: "2026-08", lineas: [linea("CUOTA DE ADMINISTRACIÓN", 0, CUOTA)] },
    ]);
    const agosto = await facturaDe(esc, "2026-08");
    await aprobarPagoAval(esc, agosto._id, CUOTA);

    await expect(
      esc.como("vecino").query(api.pagos.listPorFactura, { facturaId: agosto._id }),
    ).rejects.toThrow();
  });

  test("F20-control · la dueña de la factura sí ve su pago", async () => {
    const esc = await montar();
    await cargar(esc, [
      { periodo: "2026-08", lineas: [linea("CUOTA DE ADMINISTRACIÓN", 0, CUOTA)] },
    ]);
    const agosto = await facturaDe(esc, "2026-08");
    await aprobarPagoAval(esc, agosto._id, CUOTA);
    const pagos = await esc
      .como("residente")
      .query(api.pagos.listPorFactura, { facturaId: agosto._id });
    expect(pagos).toHaveLength(1);
    expect(pagos[0]?.estado).toBe("aprobada");
  });
});
