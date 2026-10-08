import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  aprobarComprobante,
  aprobarPagoAval,
  bloquearRed,
  cargar,
  facturaDe,
  fijarReloj,
  insertarDirecto,
  liberarRed,
  linea,
  montar,
  soltarReloj,
} from "./escenario";

/**
 * RED DE SEGURIDAD DE FACTURACIÓN — TRANSICIONES DE ESTADO (Fase 0).
 *
 * Hoy el estado de una factura es UN campo que escriben tres fuentes: la
 * pasarela (`pagos.aplicarEstado`), la aprobación de un comprobante
 * (`soportesPago.aprobar`) y la conciliación por saldo anterior
 * (`facturas.ts`, al subir el PDF siguiente o con el botón "Conciliar").
 * Gana la última. La conciliación es una INFERENCIA; las otras dos son
 * EVIDENCIA de pago.
 *
 * Lo que fijan estas pruebas (auditoría §11, F-02, F-12):
 *   pagada → vencida   y   pagada → abonada
 * no pueden ocurrir por inferencia cuando hay evidencia de pago. Lo que haga
 * el sistema en su lugar (dejarla pagada, marcar una discrepancia para
 * revisión) lo decide la Fase 3; aquí solo se exige que el pago no
 * desaparezca. Un "pagada" que vino de la misma inferencia sí puede
 * corregirse con un PDF posterior (control al final).
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

async function agostoPagadoPorPasarela() {
  const esc = await montar();
  await cargar(esc, [
    { periodo: "2026-08", lineas: [linea("CUOTA DE ADMINISTRACIÓN", 0, CUOTA)] },
  ]);
  const agosto = await facturaDe(esc, "2026-08");
  await aprobarPagoAval(esc, agosto._id, CUOTA);
  return { esc, agosto };
}

describe("Estados con evidencia de pago frente a la inferencia del PDF siguiente", () => {
  test("F02-control · un pago aprobado sin factura siguiente deja la factura 'pagada'", async () => {
    const { esc } = await agostoPagadoPorPasarela();
    expect((await facturaDe(esc, "2026-08")).estado).toBe("pagada");
  });

  test("F02-pagada-a-vencida · agosto pagado por la pasarela no pasa a 'vencida' porque septiembre arrastre los $300.000", async () => {
    const { esc } = await agostoPagadoPorPasarela();
    await cargar(esc, [
      { periodo: "2026-09", lineas: [linea("CUOTA DE ADMINISTRACIÓN", CUOTA, CUOTA)] },
    ]);
    expect((await facturaDe(esc, "2026-08")).estado).toBe("pagada");
  });

  test("F02-pagada-a-abonada · agosto pagado por la pasarela no pasa a 'abonada' porque septiembre arrastre $40.000", async () => {
    const { esc } = await agostoPagadoPorPasarela();
    // $40.000: el descuento que la contabilidad no reconoce (ver F-06).
    await cargar(esc, [
      { periodo: "2026-09", lineas: [linea("CUOTA DE ADMINISTRACIÓN", 40_000, CUOTA)] },
    ]);
    expect((await facturaDe(esc, "2026-08")).estado).toBe("pagada");
  });

  test("F12-comprobante-sobrescrito · un comprobante aprobado por la administración tampoco se borra por inferencia", async () => {
    const esc = await montar();
    await cargar(esc, [
      { periodo: "2026-08", lineas: [linea("CUOTA DE ADMINISTRACIÓN", 0, CUOTA)] },
    ]);
    const agosto = await facturaDe(esc, "2026-08");
    await aprobarComprobante(esc, agosto._id);
    expect((await facturaDe(esc, "2026-08")).estado).toBe("pagada");

    await cargar(esc, [
      { periodo: "2026-09", lineas: [linea("CUOTA DE ADMINISTRACIÓN", CUOTA, CUOTA)] },
    ]);
    expect((await facturaDe(esc, "2026-08")).estado).toBe("pagada");
  });

  test("F02-conciliar-boton · el botón 'Conciliar' (facturas.reconciliar) tampoco degrada una factura pagada con evidencia", async () => {
    const esc = await montar();
    // Cadena ya cargada, sin conciliar: agosto pendiente, septiembre arrastra agosto.
    const agosto = await insertarDirecto(
      esc,
      { periodo: "2026-08", lineas: [linea("CUOTA DE ADMINISTRACIÓN", 0, CUOTA)] },
      "pendiente",
    );
    await insertarDirecto(
      esc,
      { periodo: "2026-09", lineas: [linea("CUOTA DE ADMINISTRACIÓN", CUOTA, CUOTA)] },
      "pendiente",
    );
    await aprobarPagoAval(esc, agosto, CUOTA);
    expect((await facturaDe(esc, "2026-08")).estado).toBe("pagada");

    await esc
      .como("admin")
      .mutation(api.facturas.reconciliar, { condominioId: esc.condominioId });
    expect((await facturaDe(esc, "2026-08")).estado).toBe("pagada");
  });

  test("F02-control · un 'pagada' INFERIDO (sin evidencia) sí se corrige si se vuelve a subir el PDF siguiente corregido", async () => {
    const esc = await montar();
    await cargar(esc, [
      { periodo: "2026-08", lineas: [linea("CUOTA DE ADMINISTRACIÓN", 0, CUOTA)] },
    ]);
    await cargar(esc, [
      { periodo: "2026-09", lineas: [linea("CUOTA DE ADMINISTRACIÓN", 0, CUOTA)] },
    ]);
    // Septiembre decía saldo anterior 0: agosto se dedujo pagada.
    expect((await facturaDe(esc, "2026-08")).estado).toBe("pagada");

    // La contabilidad corrige septiembre: agosto no se había pagado.
    await cargar(
      esc,
      [{ periodo: "2026-09", lineas: [linea("CUOTA DE ADMINISTRACIÓN", CUOTA, CUOTA)] }],
      { skipExisting: false },
    );
    expect((await facturaDe(esc, "2026-08")).estado).toBe("vencida");
  });
});
