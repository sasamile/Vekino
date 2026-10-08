import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  AHORA,
  bloquearRed,
  bogota,
  cargar,
  esperarProgramadas,
  fijarReloj,
  liberarRed,
  linea,
  montar,
  soltarReloj,
  type Escenario,
} from "./escenario";

/**
 * RED DE SEGURIDAD DE FACTURACIÓN — PARQUEADERO Y APORTE (Fase 0).
 *
 * F-08  Cada reporte del guarda con un vehículo nace como un cargo por pasar
 *       a la cuenta de cobro. Hoy (a) la identidad del cargo es el reporte, no
 *       (casa, vehículo, período); (b) el mismo cargo tiene DOS estados que no
 *       se hablan: `gestion` (Vigilancia → "Marcar cobrada") y `cobroEstado`
 *       (Vehículos → Cobros de parqueadero → "Facturado").
 * F-10  El reporte de aporte voluntario suma el `total` de la línea, que trae
 *       el arrastre, e identifica el concepto por el código 5 en todos los
 *       conjuntos.
 */

beforeEach(() => {
  bloquearRed();
  fijarReloj();
});
afterEach(() => {
  soltarReloj();
  liberarRed();
});

/** Tarifa por defecto de un carro (lib/aporte.ts, TARIFAS_POR_DEFECTO). */
const TARIFA_CARRO = 7_000;

async function conCarro() {
  const esc = await montar();
  const vehiculoId = await esc.t.run(
    async (ctx) =>
      await ctx.db.insert("vehiculos", {
        condominioId: esc.condominioId,
        unidadId: esc.u101,
        placa: "ABC123",
        tipo: "carro",
        marca: "Mazda",
        color: "Gris",
        createdAt: AHORA,
        updatedAt: AHORA,
      }),
  );
  return { esc, vehiculoId };
}

async function reportar(esc: Escenario, vehiculoId: Id<"vehiculos">, dia: string) {
  const id = await esc.como("guarda").mutation(api.guardia.reportarNovedad, {
    condominioId: esc.condominioId,
    titulo: "Vehículo sin aporte",
    descripcion: "Parqueado en zona común sin aporte voluntario.",
    prioridad: "media",
    vehiculoId,
    ocurrioEn: bogota(`2026-09-${dia}T22:00`),
  });
  await esperarProgramadas(esc);
  return id;
}

async function cobros(esc: Escenario, estado = "todos") {
  return await esc
    .como("admin")
    .query(api.parqueadero.listar, { condominioId: esc.condominioId, estado });
}

describe("F08 · cobros de parqueadero", () => {
  test("F08-control · un reporte del carro es un cobro pendiente por la tarifa del carro", async () => {
    const { esc, vehiculoId } = await conCarro();
    await reportar(esc, vehiculoId, "03");
    const { resumen } = await cobros(esc);
    expect(resumen.pendientes).toBe(1);
    expect(resumen.valorPendiente).toBe(TARIFA_CARRO);
  });

  test("F08-control · dos carros distintos de la misma casa en el mismo mes son dos cobros (la identidad es casa + vehículo + período)", async () => {
    const { esc, vehiculoId } = await conCarro();
    const otroCarro = await esc.t.run(
      async (ctx) =>
        await ctx.db.insert("vehiculos", {
          condominioId: esc.condominioId,
          unidadId: esc.u101,
          placa: "XYZ987",
          tipo: "carro",
          createdAt: AHORA,
          updatedAt: AHORA,
        }),
    );
    await reportar(esc, vehiculoId, "03");
    await reportar(esc, otroCarro, "04");
    const { resumen } = await cobros(esc);
    expect(resumen.pendientes).toBe(2);
    expect(resumen.valorPendiente).toBe(2 * TARIFA_CARRO);
  });

  test("F08-reportes-duplican-cobro · tres reportes del mismo carro en septiembre son UN cobro de $7.000, no tres", async () => {
    const { esc, vehiculoId } = await conCarro();
    for (const dia of ["03", "10", "17"]) await reportar(esc, vehiculoId, dia);
    const { resumen } = await cobros(esc);
    expect(resumen.pendientes, "un cargo por reporte").toBe(1);
    expect(resumen.valorPendiente).toBe(TARIFA_CARRO);
  });

  test("F08-estados-paralelos · marcarlo 'cobrada' en Vigilancia no lo deja 'pendiente' en Cobros de parqueadero", async () => {
    const { esc, vehiculoId } = await conCarro();
    const reporteId = await reportar(esc, vehiculoId, "03");
    await esc.como("admin").mutation(api.guardia.gestionarNovedad, {
      novedadId: reporteId,
      gestion: "cobrada",
    });
    const fila = (await cobros(esc)).filas.find((f) => f._id === reporteId);
    expect(fila?.estado, "Cobros de parqueadero lo sigue ofreciendo para facturar").not.toBe(
      "pendiente",
    );
  });

  test("F08-refacturar · un cargo ya facturado en octubre no se puede volver a facturar en noviembre", async () => {
    const { esc, vehiculoId } = await conCarro();
    const reporteId = await reportar(esc, vehiculoId, "03");
    await esc.como("admin").mutation(api.parqueadero.marcarFacturado, {
      reporteId,
      periodo: "2026-10",
    });
    await expect(
      esc.como("admin").mutation(api.parqueadero.marcarFacturado, {
        reporteId,
        periodo: "2026-11",
      }),
    ).rejects.toThrow();
  });
});

describe("F10 · reporte de aporte voluntario", () => {
  test("F10-control · un mes con $7.000 de aporte suma $7.000", async () => {
    const esc = await montar();
    await cargar(esc, [
      {
        periodo: "2026-08",
        lineas: [
          linea("CUOTA DE ADMINISTRACIÓN", 0, 300_000, 1),
          linea("CONT. VOL. AREAS COMUNES", 0, 7_000, 5),
        ],
      },
    ]);
    const { filas } = await esc.como("admin").query(api.aporte.reporte, {
      condominioId: esc.condominioId,
      desde: "2026-08",
      hasta: "2026-08",
    });
    expect(filas.find((f) => f.unidadId === esc.u101)?.valorTotal).toBe(7_000);
  });

  test("F10-aporte-suma-arrastre · agosto y septiembre con $7.000 de aporte cada uno suman $14.000, no $21.000", async () => {
    const esc = await montar();
    await cargar(esc, [
      {
        periodo: "2026-08",
        lineas: [
          linea("CUOTA DE ADMINISTRACIÓN", 0, 300_000, 1),
          linea("CONT. VOL. AREAS COMUNES", 0, 7_000, 5),
        ],
      },
    ]);
    // Septiembre arrastra el aporte de agosto, sin pagar: 7.000 + 7.000.
    await cargar(esc, [
      {
        periodo: "2026-09",
        lineas: [
          linea("CUOTA DE ADMINISTRACIÓN", 0, 300_000, 1),
          linea("CONT. VOL. AREAS COMUNES", 7_000, 7_000, 5),
        ],
      },
    ]);
    const { filas } = await esc.como("admin").query(api.aporte.reporte, {
      condominioId: esc.condominioId,
      desde: "2026-08",
      hasta: "2026-09",
    });
    expect(filas.find((f) => f.unidadId === esc.u101)?.valorTotal).toBe(14_000);
  });

  test("F10-aporte-concepto-equivocado · el código 5 de Arboleda ('Parqueadero visitante') no es aporte voluntario", async () => {
    const esc = await montar();
    await cargar(esc, [
      {
        periodo: "2026-08",
        casa: "u202",
        lineas: [
          linea("Administración de agosto", 0, 300_000, 2),
          linea("Parqueadero visitante", 0, 10_000, 5),
        ],
      },
    ]);
    const { filas } = await esc.como("admin").query(api.aporte.reporte, {
      condominioId: esc.condominioId,
      desde: "2026-08",
      hasta: "2026-08",
    });
    expect(filas.find((f) => f.unidadId === esc.u202)).toBeUndefined();
  });
});
