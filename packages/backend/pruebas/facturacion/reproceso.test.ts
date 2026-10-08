import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  aprobarPagoAval,
  bloquearRed,
  esperarProgramadas,
  facturaDe,
  fijarReloj,
  insertarDirecto,
  liberarRed,
  linea,
  montar,
  soltarReloj,
  type Escenario,
} from "./escenario";

/**
 * RE-PROCESAMIENTO de lo ya cargado con el parser nuevo (Fase 2, PASO 12;
 * docs/audits/FASE-2-FACTURACION.md).
 *
 * `facturas.reprocesarLecturas` es interna y por defecto NO escribe: devuelve
 * el plan que se revisa con la administración. Aplicarlo requiere
 * autorización explícita; aquí se prueba que lo que aplica es exactamente lo
 * que informa, y lo que no debe tocar.
 *
 * El caso base es real (anonimizado): la casa 401 de Ciudad del Campo. Agosto
 * decía saldo a favor de $262.000 y se guardó en $0; septiembre no listaba la
 * fila del crédito y "arrastraba" $335.000; agosto quedó `vencida` y la casa
 * en mora (auditoría §14.5).
 */

beforeEach(() => {
  bloquearRed();
  fijarReloj();
});
afterEach(() => {
  soltarReloj();
  liberarRed();
});

const CUOTA = 335_000;
const CREDITO = -597_000;
const credito = (saldoAnterior: number) => ({
  codigo: 0,
  codigoTexto: "CI",
  concepto: "ANTICIPO DE CLIENTE",
  saldoAnterior,
  actual: 0,
  total: saldoAnterior,
});

/** Agosto y septiembre como los dejó el parser viejo. */
async function comoQuedoLa401(esc: Escenario) {
  const agosto = await insertarDirecto(
    esc,
    { periodo: "2026-08", lineas: [linea("ADMINISTRACION", 0, CUOTA)], totalAPagar: 0 },
    "vencida",
  );
  const septiembre = await insertarDirecto(
    esc,
    { periodo: "2026-09", lineas: [linea("ADMINISTRACION", CUOTA, CUOTA)], totalAPagar: 73_000 },
    "pendiente",
  );
  return { agosto, septiembre };
}

/** Lo que el parser nuevo lee de los dos PDF. */
function lecturasDeLa401(ids: { agosto: Id<"facturas">; septiembre: Id<"facturas"> }) {
  return [
    {
      facturaId: ids.agosto,
      vrAdmon: CUOTA,
      lineas: [linea("ADMINISTRACION", 0, CUOTA), credito(CREDITO)],
      saldoAFavor: 262_000,
      totalAPagar: -262_000,
      saldoAnteriorDocumento: CREDITO,
      periodoLabel: "Agosto / 2026",
      motivos: [],
    },
    {
      facturaId: ids.septiembre,
      vrAdmon: CUOTA,
      lineas: [linea("ADMINISTRACION", CUOTA, CUOTA), credito(CREDITO)],
      saldoAFavor: 0,
      totalAPagar: 73_000,
      totalConDescuento: 33_000,
      saldoAnteriorDocumento: -262_000,
      periodoLabel: "Septiembre / 2026",
      motivos: [],
    },
  ];
}

async function reprocesar(
  esc: Escenario,
  lecturas: ReturnType<typeof lecturasDeLa401>,
  dryRun?: boolean,
) {
  return await esc.t.mutation(internal.facturas.reprocesarLecturas, {
    condominioId: esc.condominioId,
    lecturas,
    ...(dryRun === undefined ? {} : { dryRun }),
  });
}

describe("modo informe (por defecto)", () => {
  test("no escribe nada y dice qué cambiaría: agosto pasa a saldo a favor y la casa sale de la mora", async () => {
    const esc = await montar();
    const ids = await comoQuedoLa401(esc);
    const r = await reprocesar(esc, lecturasDeLa401(ids));

    expect(r.dryRun).toBe(true);
    const [unidad] = r.unidades;
    expect(unidad?.antes.cartera.estado).toBe("en_mora");
    expect(unidad?.antes.residente).toBe("en_mora");
    expect(unidad?.despues.cartera.estado).toBe("pendiente");
    expect(unidad?.despues.cartera.saldoActual).toBe(73_000);
    expect(unidad?.despues.residente).toBe("pendiente");

    const agosto = unidad?.facturas.find((f) => f.periodo === "2026-08");
    expect(agosto?.cambios).toEqual(
      expect.arrayContaining([
        { campo: "totalAPagar", antes: 0, despues: -262_000 },
        { campo: "estado", antes: "vencida", despues: "saldo_a_favor" },
        { campo: "saldoAnteriorDocumento", despues: CREDITO },
      ]),
    );
    const sept = unidad?.facturas.find((f) => f.periodo === "2026-09");
    expect(sept?.cambios.map((c) => c.campo)).toEqual(
      expect.arrayContaining(["lineas", "saldoAnteriorDocumento", "totalConDescuento"]),
    );
    expect(sept?.cambios.map((c) => c.campo)).not.toContain("estado");

    // Nada se escribió
    expect(await facturaDe(esc, "2026-08")).toMatchObject({ totalAPagar: 0, estado: "vencida" });
    expect((await facturaDe(esc, "2026-09")).saldoAnteriorDocumento).toBeUndefined();
  });
});

describe("aplicado", () => {
  test("escribe exactamente el plan, y otra pasada ya no cambia nada", async () => {
    const esc = await montar();
    const ids = await comoQuedoLa401(esc);
    const plan = await reprocesar(esc, lecturasDeLa401(ids), false);
    expect(plan.dryRun).toBe(false);

    expect(await facturaDe(esc, "2026-08")).toMatchObject({
      totalAPagar: -262_000,
      saldoAFavor: 262_000,
      saldoAnteriorDocumento: CREDITO,
      estado: "saldo_a_favor",
    });
    const sept = await facturaDe(esc, "2026-09");
    expect(sept).toMatchObject({ estado: "pendiente", saldoAnteriorDocumento: -262_000 });
    expect(sept.lineas.map((l) => l.codigoTexto ?? l.codigo)).toEqual([1, "CI"]);
    expect(sept.lecturaDudosa).toBeUndefined();

    const otra = await reprocesar(esc, lecturasDeLa401(ids));
    expect(otra.unidades[0]?.facturas.flatMap((f) => f.cambios)).toEqual([]);
  });

  test("una vigente en $0 sin período legible queda en saldo a favor y con su etiqueta", async () => {
    /* CDC 816, septiembre: el documento solo trae el anticipo; se guardó con
     * total 0, `pendiente` y `periodoLabel` vacío. */
    const esc = await montar();
    const sept = await insertarDirecto(
      esc,
      { periodo: "2026-09", lineas: [], totalAPagar: 0, periodoLabel: "" },
      "pendiente",
    );
    await reprocesar(
      esc,
      [
        {
          facturaId: sept,
          vrAdmon: 0,
          lineas: [credito(-105_000)],
          saldoAFavor: 105_000,
          totalAPagar: -105_000,
          saldoAnteriorDocumento: -105_000,
          periodoLabel: "Septiembre / 2026",
          motivos: [],
        },
      ],
      false,
    );
    expect(await facturaDe(esc, "2026-09")).toMatchObject({
      estado: "saldo_a_favor",
      totalAPagar: -105_000,
      periodoLabel: "Septiembre / 2026",
    });
  });
});

describe("lo que no toca", () => {
  test("una factura con un pago aprobado: ni sus números ni su estado", async () => {
    const esc = await montar();
    const ids = await comoQuedoLa401(esc);
    await aprobarPagoAval(esc, ids.septiembre, 73_000);
    const antes = await facturaDe(esc, "2026-09");

    const r = await reprocesar(esc, lecturasDeLa401(ids), false);
    const sept = r.unidades[0]?.facturas.find((f) => f.periodo === "2026-09");
    expect(sept?.omitida).toBe("evidencia_de_pago");
    expect(sept?.cambios).toEqual([]);

    const despues = await facturaDe(esc, "2026-09");
    expect(despues.estado).toBe(antes.estado);
    expect(despues.lineas).toEqual(antes.lineas);
    expect(despues.saldoAnteriorDocumento).toBeUndefined();
  });

  test("una factura con un comprobante aprobado tampoco, ni siquiera por la conciliación", async () => {
    const esc = await montar();
    const ids = await comoQuedoLa401(esc);
    /* CAMBIO DE LA FASE 3 (docs/audits/FASE-3-FACTURACION.md, §13): esta
     * prueba subía el comprobante de AGOSTO con `soportesPago.crearMio`, y
     * desde la Fase 3 (PASO 6) un comprobante solo se adjunta a la factura
     * vigente: agosto ya está absorbida por septiembre. Lo que la prueba
     * protege —el re-procesamiento no toca una factura con un comprobante
     * aprobado— sigue igual; el comprobante entra como uno subido antes de
     * la Fase 3 y la administración lo aprueba por el camino normal. */
    const soporteId = await esc.t.run(
      async (ctx) =>
        await ctx.db.insert("soportesPago", {
          condominioId: esc.condominioId,
          unidadId: esc.u101,
          facturaId: ids.agosto,
          userId: esc.residenteId,
          origen: "app",
          url: "https://archivos.test/comprobante.pdf",
          mimeType: "application/pdf",
          estado: "pendiente_revision",
          createdAt: Date.now(),
        }),
    );
    await esc.como("admin").mutation(api.soportesPago.aprobar, { id: soporteId });
    await esperarProgramadas(esc);
    const antes = await facturaDe(esc, "2026-08");

    const r = await reprocesar(esc, lecturasDeLa401(ids), false);
    expect(r.unidades[0]?.facturas.find((f) => f.periodo === "2026-08")?.omitida).toBe(
      "evidencia_de_pago",
    );
    const despues = await facturaDe(esc, "2026-08");
    expect(despues.totalAPagar).toBe(antes.totalAPagar);
    expect(despues.estado).toBe(antes.estado);
  });

  test("un documento que dice otro período no reescribe la factura", async () => {
    const esc = await montar();
    const ids = await comoQuedoLa401(esc);
    const [agosto, septiembre] = lecturasDeLa401(ids);
    const r = await reprocesar(esc, [agosto!, { ...septiembre!, periodoLabel: "Octubre / 2026" }], false);
    const sept = r.unidades[0]?.facturas.find((f) => f.periodo === "2026-09");
    expect(sept?.omitida).toBe("periodo_no_coincide");
    expect((await facturaDe(esc, "2026-09")).saldoAnteriorDocumento).toBeUndefined();
  });

  test("facturas de otro conjunto: se informan y no se leen", async () => {
    const esc = await montar();
    const ids = await comoQuedoLa401(esc);
    const otro = await esc.t.run(
      async (ctx) =>
        await ctx.db.insert("condominios", {
          name: "Otro",
          activeModules: [],
          isActive: true,
          createdAt: 0,
          updatedAt: 0,
        }),
    );
    const r = await esc.t.mutation(internal.facturas.reprocesarLecturas, {
      condominioId: otro,
      lecturas: lecturasDeLa401(ids),
      dryRun: false,
    });
    expect(r.ajenas).toEqual([ids.agosto, ids.septiembre]);
    expect(r.unidades).toEqual([]);
    expect((await facturaDe(esc, "2026-08")).estado).toBe("vencida");
  });
});

describe("lecturas que no cuadran", () => {
  test("agosto sin total en el documento: queda en revisión, conserva su estado y la casa no se declara en mora", async () => {
    /* Las 16 de agosto de CDC cuyo PDF publicado es solo la primera hoja. */
    const esc = await montar();
    const ids = await comoQuedoLa401(esc);
    const [agosto, septiembre] = lecturasDeLa401(ids);
    const r = await reprocesar(
      esc,
      [
        {
          ...agosto!,
          lineas: [linea("ADMINISTRACION", 3_609_800, CUOTA)],
          totalAPagar: 3_944_800,
          saldoAFavor: 0,
          saldoAnteriorDocumento: undefined,
          motivos: ["total_no_leido"],
        },
        septiembre!,
      ],
      false,
    );
    const ago = await facturaDe(esc, "2026-08");
    expect(ago.lecturaDudosa?.motivos).toEqual(["total_no_leido"]);
    expect(ago.estado).toBe("vencida");
    expect(r.unidades[0]?.despues.cartera.estado).toBe("en_revision");
    expect(r.unidades[0]?.despues.residente).toBe("en_revision");
  });
});
