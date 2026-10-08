import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  AHORA,
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
 * INGESTIÓN CONFIABLE (Fase 2) — lo que se agregó en esa fase y la red de la
 * Fase 0 no cubría. Ver docs/audits/FASE-2-FACTURACION.md.
 *
 * Va en la suite normal (`*.test.ts`, `vitest run`): describe comportamiento
 * ya corregido.
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

/** Lo que manda la confirmación: la factura como la lee el parser, con lo que vio en el PDF. */
async function subir(
  esc: Escenario,
  f: FacturaCarga & { saldoAnteriorDocumento?: number; motivosLectura?: string[] },
  opciones: { skipExisting?: boolean; importacionId?: Id<"importaciones"> } = {},
) {
  const { saldoAnteriorDocumento, motivosLectura, ...carga } = f;
  return await esc.como("admin").mutation(api.facturas.bulkUpsert, {
    facturas: [
      {
        ...comoLaCargaPorPdf(esc, carga),
        ...(saldoAnteriorDocumento !== undefined ? { saldoAnteriorDocumento } : {}),
        ...(motivosLectura ? { motivosLectura } : {}),
      },
    ],
    skipExisting: opciones.skipExisting ?? true,
    ...(opciones.importacionId ? { importacionId: opciones.importacionId } : {}),
  });
}

describe("bulkUpsert valida por su cuenta", () => {
  test("un documento de octubre no se guarda como septiembre: se rechaza con su motivo", async () => {
    const esc = await montar();
    const r = await subir(esc, {
      periodo: "2026-09",
      periodoLabel: "Octubre / 2026",
      lineas: [linea("CUOTA", 0, CUOTA)],
    });
    expect(r.rechazadas).toBe(1);
    expect(r.rechazos[0]?.motivo).toBe("periodo_no_coincide");
    expect(await facturasDe(esc)).toHaveLength(0);
  });

  test("una factura de una unidad de otro conjunto se rechaza", async () => {
    const esc = await montar();
    const ajena = await esc.t.run(async (ctx) => {
      const otro = await ctx.db.insert("condominios", {
        name: "Otro",
        activeModules: [],
        isActive: true,
        createdAt: AHORA,
        updatedAt: AHORA,
      });
      return await ctx.db.insert("unidades", {
        condominioId: otro,
        tipo: "casa",
        estado: "ocupada",
        numero: "1",
        createdAt: AHORA,
        updatedAt: AHORA,
      });
    });
    const r = await esc.como("admin").mutation(api.facturas.bulkUpsert, {
      facturas: [{ ...comoLaCargaPorPdf(esc, { periodo: "2026-09", lineas: [linea("CUOTA", 0, CUOTA)] }), unidadId: ajena }],
      skipExisting: true,
    });
    expect(r.rechazos.map((x) => x.motivo)).toEqual(["unidad_ajena"]);
  });

  test("una factura que no cuadra entra, pero en revisión y con su motivo", async () => {
    const esc = await montar();
    const r = await subir(esc, {
      periodo: "2026-09",
      lineas: [linea("CUOTA", 0, CUOTA)],
      totalAPagar: 0,
    });
    expect(r.inserted).toBe(1);
    expect(r.marcadas).toBe(1);
    const sept = await facturaDe(esc, "2026-09");
    expect(sept.lecturaDudosa?.motivos).toEqual(["lineas_no_cuadran"]);
    expect(sept.estado).toBe("pendiente");
  });

  test("los motivos del parser se suman; los desconocidos se ignoran", async () => {
    const esc = await montar();
    await subir(esc, {
      periodo: "2026-09",
      lineas: [linea("CUOTA", 0, CUOTA)],
      motivosLectura: ["total_no_leido", "inventado"],
    });
    expect((await facturaDe(esc, "2026-09")).lecturaDudosa?.motivos).toEqual(["total_no_leido"]);
  });

  test("una lectura que cuadra no se marca", async () => {
    const esc = await montar();
    const r = await subir(esc, { periodo: "2026-09", lineas: [linea("CUOTA", 0, CUOTA)] });
    expect(r.marcadas).toBe(0);
    expect((await facturaDe(esc, "2026-09")).lecturaDudosa).toBeUndefined();
  });

  test("un total en $0 con saldo a favor entra como saldo a favor, no 'pendiente'", async () => {
    /* Las 5 de Arboleda de septiembre que quedaron "pendiente" con total 0. */
    const esc = await montar();
    await esc.como("admin").mutation(api.facturas.bulkUpsert, {
      facturas: [
        {
          ...comoLaCargaPorPdf(esc, { periodo: "2026-09", lineas: [linea("ADMIN", 0, 0)], totalAPagar: 0 }),
          saldoAFavor: 15_000,
        },
      ],
      skipExisting: true,
    });
    expect((await facturaDe(esc, "2026-09")).estado).toBe("saldo_a_favor");
  });

  test("volver a subir una lectura correcta quita la marca", async () => {
    const esc = await montar();
    await subir(esc, { periodo: "2026-09", lineas: [linea("CUOTA", 0, CUOTA)], totalAPagar: 0 });
    expect((await facturaDe(esc, "2026-09")).lecturaDudosa).toBeDefined();
    await subir(esc, { periodo: "2026-09", lineas: [linea("CUOTA", 0, CUOTA)] }, { skipExisting: false });
    const sept = await facturaDe(esc, "2026-09");
    expect(sept.lecturaDudosa).toBeUndefined();
    expect(sept.totalAPagar).toBe(CUOTA);
  });
});

describe("una vigente en revisión no se paga ni decide la cartera", () => {
  async function septiembreDudosa() {
    const esc = await montar();
    await cargar(esc, [{ periodo: "2026-08", lineas: [linea("CUOTA", 0, CUOTA)] }]);
    await subir(esc, {
      periodo: "2026-09",
      lineas: [linea("CUOTA", 0, CUOTA)],
      motivosLectura: ["total_no_leido"],
    });
    return { esc, sept: await facturaDe(esc, "2026-09") };
  }

  test("puedePagar dice que no y armarDatosTrn la rechaza con el mensaje de revisión", async () => {
    const { esc, sept } = await septiembreDudosa();
    expect(await esc.como("residente").query(api.pagos.puedePagar, { facturaId: sept._id })).toBe(false);
    await expect(
      esc.t.query(internal.pagos.datosParaTrnDeUsuario, { facturaId: sept._id, userId: esc.residenteId }),
    ).rejects.toThrow(/en revisión/);
  });

  test("la cartera de la administración la ve en revisión, no al día ni en mora", async () => {
    const { esc } = await septiembreDudosa();
    const [fila] = await esc.como("admin").query(api.facturas.carteraPorUnidad, {
      condominioId: esc.condominioId,
      unidadIds: [esc.u101],
    });
    expect(fila?.estado).toBe("en_revision");
  });

  test("y aparece en la lista de revisión de Finanzas, con su motivo", async () => {
    const { esc, sept } = await septiembreDudosa();
    const lista = await esc.como("admin").query(api.facturas.listEnRevision, { condominioId: esc.condominioId });
    expect(lista.map((f) => [f._id, f.motivos])).toEqual([[sept._id, ["total_no_leido"]]]);
  });
});

describe("conciliación con lecturas dudosas", () => {
  test("no juzga agosto con un septiembre en revisión: agosto queda sin veredicto", async () => {
    const esc = await montar();
    await cargar(esc, [{ periodo: "2026-08", lineas: [linea("CUOTA", 0, CUOTA)] }]);
    // Septiembre arrastra los $300.000 (agosto sería "vencida"), pero no cuadra.
    await subir(esc, {
      periodo: "2026-09",
      lineas: [linea("CUOTA", CUOTA, CUOTA)],
      totalAPagar: 0,
    });
    expect((await facturaDe(esc, "2026-08")).estado).toBe("pendiente");
  });

  test("confirmada la lectura, concilia, y usa el saldo anterior de la fila Totales", async () => {
    const esc = await montar();
    await cargar(esc, [{ periodo: "2026-08", lineas: [linea("CUOTA", 0, CUOTA)] }]);
    /* Hoja de continuación: las líneas solo muestran $100.000 de saldo
     * anterior; la fila Totales dice $300.000. Con las líneas, agosto sería
     * "abonada"; con Totales, "vencida". */
    await subir(esc, {
      periodo: "2026-09",
      lineas: [linea("CUOTA", 100_000, CUOTA)],
      totalAPagar: 400_000,
      saldoAnteriorDocumento: CUOTA,
    });
    const sept = await facturaDe(esc, "2026-09");
    expect(sept.lecturaDudosa?.motivos).toEqual(["saldo_anterior_no_cuadra"]);
    expect((await facturaDe(esc, "2026-08")).estado).toBe("pendiente");

    await esc.como("admin").mutation(api.facturas.confirmarLectura, { facturaId: sept._id });
    expect((await facturaDe(esc, "2026-08")).estado).toBe("vencida");
    const confirmada = (await facturaDe(esc, "2026-09")).lecturaDudosa;
    expect(confirmada?.confirmada?.userId).toBe(esc.adminId);
    expect(confirmada?.confirmada?.at).toBe(AHORA);
    expect(confirmada?.motivos).toEqual(["saldo_anterior_no_cuadra"]);
  });

  test("confirmar la lectura es de administración o contadora", async () => {
    const esc = await montar();
    await subir(esc, { periodo: "2026-09", lineas: [linea("CUOTA", 0, CUOTA)], totalAPagar: 0 });
    const sept = await facturaDe(esc, "2026-09");
    await expect(
      esc.como("residente").mutation(api.facturas.confirmarLectura, { facturaId: sept._id }),
    ).rejects.toThrow();
    await expect(
      esc.como("guarda").mutation(api.facturas.confirmarLectura, { facturaId: sept._id }),
    ).rejects.toThrow();
  });
});

describe("importaciones: trazabilidad e idempotencia", () => {
  const HASH = "a".repeat(64);

  async function iniciar(esc: Escenario, extra: { soloNuevas?: boolean; etiqueta?: string } = {}) {
    return await esc.como("admin").mutation(api.facturas.iniciarImportacion, {
      condominioId: esc.condominioId,
      periodo: "2026-09",
      archivo: "septiembre.pdf",
      hash: HASH,
      soloNuevas: extra.soloNuevas ?? true,
      documentos: 2,
      candidatas: [
        { indice: 0, unidadId: esc.u101, periodoLabel: extra.etiqueta ?? "Septiembre / 2026" },
        { indice: 1, unidadId: esc.u202, periodoLabel: "Septiembre / 2026" },
      ],
    });
  }

  test("cada carga queda registrada, con sus conteos, y cada factura enlazada a ella", async () => {
    const esc = await montar();
    const inicio = await iniciar(esc);
    expect(inicio.tipo).toBe("nueva");
    expect(inicio.plan.map((p) => p.accion)).toEqual(["insertar", "insertar"]);
    await esc.como("admin").mutation(api.facturas.bulkUpsert, {
      facturas: [
        comoLaCargaPorPdf(esc, { periodo: "2026-09", lineas: [linea("CUOTA", 0, CUOTA)] }),
        comoLaCargaPorPdf(esc, { periodo: "2026-09", casa: "u202", lineas: [linea("CUOTA", 0, CUOTA)], totalAPagar: 0 }, 2),
      ],
      skipExisting: true,
      importacionId: inicio.importacionId,
    });
    const final = await esc.como("admin").mutation(api.facturas.finalizarImportacion, {
      importacionId: inicio.importacionId,
      estado: "completada",
    });
    expect(final).toMatchObject({ estado: "completada", documentos: 2, insertadas: 2, marcadas: 1, rechazadas: 0 });
    const imp = await esc.t.run(async (ctx) => await ctx.db.get(inicio.importacionId));
    expect(imp).toMatchObject({ hash: HASH, periodo: "2026-09", archivo: "septiembre.pdf", userId: esc.adminId, createdAt: AHORA });
    for (const casa of ["u101", "u202"] as const) {
      expect((await facturaDe(esc, "2026-09", casa)).importacionId).toBe(inicio.importacionId);
    }
  });

  test("confirmar dos veces el mismo archivo no carga dos veces: devuelve el resultado anterior", async () => {
    const esc = await montar();
    const inicio = await iniciar(esc);
    await esc.como("admin").mutation(api.facturas.finalizarImportacion, {
      importacionId: inicio.importacionId,
      estado: "completada",
    });
    const otra = await iniciar(esc);
    expect(otra.tipo).toBe("repetida");
    expect(otra.importacionId).toBe(inicio.importacionId);
    expect(otra.plan).toEqual([]);
    expect(await esc.t.run(async (ctx) => (await ctx.db.query("importaciones").collect()).length)).toBe(1);
  });

  test("un doble clic mientras la primera sigue en curso no abre otra", async () => {
    const esc = await montar();
    await iniciar(esc);
    const segunda = await iniciar(esc);
    expect(segunda.tipo).toBe("en_curso");
    expect(segunda.plan).toEqual([]);
  });

  test("el plan omite las existentes con 'solo nuevas', las actualiza sin ella y rechaza un período contradictorio", async () => {
    const esc = await montar();
    await cargar(esc, [{ periodo: "2026-09", lineas: [linea("CUOTA", 0, CUOTA)] }]);
    const conSoloNuevas = await iniciar(esc, { etiqueta: "Octubre / 2026" });
    expect(conSoloNuevas.plan).toEqual([
      { indice: 0, accion: "rechazar", motivo: "periodo_no_coincide" },
      { indice: 1, accion: "insertar" },
    ]);
    await esc.como("admin").mutation(api.facturas.finalizarImportacion, {
      importacionId: conSoloNuevas.importacionId,
      estado: "fallida",
    });
    const sinSoloNuevas = await esc.como("admin").mutation(api.facturas.iniciarImportacion, {
      condominioId: esc.condominioId,
      periodo: "2026-09",
      archivo: "septiembre.pdf",
      hash: "b".repeat(64),
      soloNuevas: false,
      documentos: 1,
      candidatas: [{ indice: 0, unidadId: esc.u101, periodoLabel: "Septiembre / 2026" }],
    });
    expect(sinSoloNuevas.plan).toEqual([{ indice: 0, accion: "actualizar" }]);
  });

  test("una carga que falló se retoma con la misma importación", async () => {
    const esc = await montar();
    const primera = await iniciar(esc);
    await esc.como("admin").mutation(api.facturas.finalizarImportacion, {
      importacionId: primera.importacionId,
      estado: "fallida",
      error: "S3 no respondió",
    });
    const retomada = await iniciar(esc);
    expect(retomada.tipo).toBe("nueva");
    expect(retomada.importacionId).toBe(primera.importacionId);
  });

  test("solo administración o contadora inician una importación", async () => {
    const esc = await montar();
    await expect(
      esc.como("residente").mutation(api.facturas.iniciarImportacion, {
        condominioId: esc.condominioId,
        periodo: "2026-09",
        archivo: "x.pdf",
        hash: HASH,
        soloNuevas: true,
        documentos: 0,
        candidatas: [],
      }),
    ).rejects.toThrow();
  });
});
