import { test, expect, describe } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const modules = import.meta.glob("../convex/**/*.ts");

/**
 * ESTADO DE PAGO DE LA UNIDAD EN LA TABLA DE RESERVAS.
 *
 * Lo que se comprueba aquí es que la administración vea la verdad y solo la
 * suya: que la mora se cuente desde el vencimiento y no desde la emisión, que
 * la cartera de un conjunto no se lea desde otro, y —lo más importante— que
 * nada de esto le cierre la puerta a nadie: una casa en mora sigue pudiendo
 * reservar y su reserva sigue pudiendo aprobarse, porque quién reserva lo
 * decide quien administra, no la cartera.
 */

const DIA = 24 * 60 * 60 * 1000;
const AHORA = Date.now();

const como = (t: ReturnType<typeof convexTest>, subject: string) =>
  t.withIdentity({ subject });

/**
 * Dos conjuntos, cada uno con su administrador y sus unidades:
 *   A-101 al día · A-202 en mora de 78 días · A-303 debe pero no ha vencido
 *   A-404 sin facturas · B-101 (del otro conjunto) en mora
 */
async function escenario(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const ahora = AHORA;

    const condo = async (name: string) =>
      await ctx.db.insert("condominios", {
        name,
        activeModules: [],
        isActive: true,
        createdAt: ahora,
        updatedAt: ahora,
      });

    const persona = async (name: string, authId: string) =>
      await ctx.db.insert("users", {
        name,
        email: `${authId}@vekino.test`,
        emailVerified: true,
        active: true,
        authId,
        createdAt: ahora,
        updatedAt: ahora,
      });

    const membresia = async (
      userId: Id<"users">,
      condominioId: Id<"condominios">,
      roles: string[],
    ) =>
      await ctx.db.insert("memberships", {
        userId,
        condominioId,
        roles: roles as never,
        isActive: true,
        createdAt: ahora,
        updatedAt: ahora,
      });

    const unidad = async (condominioId: Id<"condominios">, numero: string) =>
      await ctx.db.insert("unidades", {
        condominioId,
        tipo: "casa",
        estado: "ocupada",
        numero,
        createdAt: ahora,
        updatedAt: ahora,
      });

    const factura = async (
      condominioId: Id<"condominios">,
      unidadId: Id<"unidades">,
      periodo: string,
      estado: "pendiente" | "pagada" | "vencida" | "abonada" | "saldo_a_favor",
      diasDesdeVencimiento: number,
    ) =>
      await ctx.db.insert("facturas", {
        condominioId,
        unidadId,
        numeroFactura: `F-${periodo}`,
        numeroInterno: periodo,
        periodo,
        periodoLabel: periodo,
        residenteNombre: "Quien sea",
        vrAdmon: 274000,
        lineas: [],
        saldoAFavor: 0,
        totalAPagar: 274000,
        estado,
        fechaEmision: ahora - (diasDesdeVencimiento + 45) * DIA,
        fechaVencimiento: ahora - diasDesdeVencimiento * DIA,
        createdAt: ahora,
        updatedAt: ahora,
      });

    /** Como `factura`, pero con líneas: el abono se lee de ellas. */
    const facturaConLineas = async (
      unidadId: Id<"unidades">,
      periodo: string,
      mes: string,
      estado: "pendiente" | "pagada" | "vencida" | "abonada",
      totalAPagar: number,
      saldoAnterior: number,
      diasDesdeVencimiento: number,
    ) =>
      await ctx.db.insert("facturas", {
        condominioId: condoA,
        unidadId,
        numeroFactura: `F-${periodo}`,
        numeroInterno: periodo,
        periodo,
        periodoLabel: `01-${mes}-2026`,
        residenteNombre: "María López",
        vrAdmon: 300000,
        lineas: [
          {
            codigo: 3,
            concepto: "Intereses mora",
            saldoAnterior: 0,
            actual: 12000,
            total: 12000,
          },
          {
            codigo: 2,
            concepto: `Administración de ${mes}`,
            saldoAnterior,
            actual: 300000,
            total: totalAPagar,
          },
        ],
        saldoAFavor: 0,
        totalAPagar,
        estado,
        fechaEmision: ahora - (diasDesdeVencimiento + 45) * DIA,
        fechaVencimiento: ahora - diasDesdeVencimiento * DIA,
        createdAt: ahora,
        updatedAt: ahora,
      });

    const condoA = await condo("Conjunto A");
    const condoB = await condo("Conjunto B");

    const adminA = await persona("Admin A", "adminA");
    const adminB = await persona("Admin B", "adminB");
    const residenteA = await persona("Residente A", "residenteA");
    const guardiaA = await persona("Guarda A", "guardiaA");
    await membresia(adminA, condoA, ["administrador"]);
    await membresia(adminB, condoB, ["administrador"]);
    await membresia(residenteA, condoA, ["residente", "propietario"]);
    await membresia(guardiaA, condoA, ["guardia"]);

    const alDia = await unidad(condoA, "101");
    await factura(condoA, alDia, "2026-06", "pagada", 80);
    await factura(condoA, alDia, "2026-07", "pagada", 50);

    /* Tres periodos vencidos seguidos: la mora la marca el ULTIMO. */
    const enMora = await unidad(condoA, "202");
    await factura(condoA, enMora, "2026-05", "vencida", 78);
    await factura(condoA, enMora, "2026-06", "vencida", 48);
    await factura(condoA, enMora, "2026-07", "vencida", 17);

    /* Misma deuda vieja, pero el ultimo periodo vencido quedo abonado. */
    const pagando = await unidad(condoA, "606");
    await factura(condoA, pagando, "2026-05", "vencida", 78);
    await factura(condoA, pagando, "2026-06", "vencida", 48);
    await factura(condoA, pagando, "2026-07", "abonada", 17);

    const porVencer = await unidad(condoA, "303");
    await factura(condoA, porVencer, "2026-07", "pagada", 30);
    await factura(condoA, porVencer, "2026-08", "pendiente", -7);

    const sinFacturas = await unidad(condoA, "404");

    /* Cadena completa para el estado de cuenta: enero pagada, febrero abonada
     * a medias y marzo todavía sin juzgar. El saldo de cada una lo declara la
     * siguiente, igual que en la conciliación. */
    const cadena = await unidad(condoA, "505");
    await facturaConLineas(cadena, "2026-01", "enero", "pagada", 300000, 0, 90);
    await facturaConLineas(cadena, "2026-02", "febrero", "abonada", 300000, 0, 60);
    await facturaConLineas(cadena, "2026-03", "marzo", "pendiente", 400000, 100000, 30);

    const ajena = await unidad(condoB, "101");
    await factura(condoB, ajena, "2026-05", "vencida", 120);

    const zona = await ctx.db.insert("zonasComunes", {
      condominioId: condoA,
      nombre: "Salón social",
      activa: true,
      createdAt: ahora,
      updatedAt: ahora,
    });

    const reserva = async (unidadId: Id<"unidades">, numero: string) =>
      await ctx.db.insert("reservas", {
        condominioId: condoA,
        unidadId,
        zonaId: zona,
        zonaNombre: "Salón social",
        unidadNumero: numero,
        solicitanteNombre: "Quien sea",
        fecha: "2026-12-10",
        horaInicio: "18:00",
        horaFin: "22:00",
        estado: "pendiente",
        createdAt: ahora,
        updatedAt: ahora,
      });

    /* Dos reservas de la MISMA casa morosa: la consulta debe leerla una vez. */
    const reservaMorosa = await reserva(enMora, "202");
    await reserva(enMora, "202");
    await reserva(alDia, "101");

    return {
      condoA, condoB, zona,
      alDia, enMora, pagando, porVencer, sinFacturas, ajena, cadena,
      reservaMorosa,
    };
  });
}

// ─────────────────────────────────────────────────────────────
describe("estado de pago de la unidad", () => {
  test("caso 1 — una unidad sin facturas pendientes sale al día", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const [fila] = await como(t, "adminA").query(api.facturas.carteraPorUnidad, {
      condominioId: s.condoA,
      unidadIds: [s.alDia],
    });
    expect(fila.estado).toBe("al_dia");
    expect(fila.diasMora).toBe(0);
    expect(fila.saldoActual).toBe(0);
  });

  test("caso 2 y 3 — con varias vencidas seguidas, manda la ÚLTIMA", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const [fila] = await como(t, "adminA").query(api.facturas.carteraPorUnidad, {
      condominioId: s.condoA,
      unidadIds: [s.enMora],
    });
    expect(fila.estado).toBe("en_mora");
    expect(fila.diasMora).toBe(17);
    expect(fila.periodoEnMora).toBe("2026-07");
    /* La deuda vigente es la de la última factura, no la suma de las tres. */
    expect(fila.saldoActual).toBe(274000);
  });

  test("deuda vieja con el último período abonado: deuda sí, mora no", async () => {
    /* La misma deuda que la 202, pero abonó el último período. Es la
     * diferencia entre arrastrar deuda y estar incumpliendo. */
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const [fila] = await como(t, "adminA").query(api.facturas.carteraPorUnidad, {
      condominioId: s.condoA,
      unidadIds: [s.pagando],
    });
    expect(fila.estado).toBe("pendiente");
    expect(fila.diasMora).toBe(0);
    /* Debe lo mismo que la 202 —la última factura— pero no está incumpliendo. */
    expect(fila.saldoActual).toBe(274000);
  });

  test("una factura que aún no se vence no es mora", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const [fila] = await como(t, "adminA").query(api.facturas.carteraPorUnidad, {
      condominioId: s.condoA,
      unidadIds: [s.porVencer],
    });
    expect(fila.estado).toBe("pendiente");
    expect(fila.diasMora).toBe(0);
    expect(fila.saldoActual).toBe(274000);
  });

  test("una unidad sin facturas cargadas no se declara al día", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const [fila] = await como(t, "adminA").query(api.facturas.carteraPorUnidad, {
      condominioId: s.condoA,
      unidadIds: [s.sinFacturas],
    });
    expect(fila.estado).toBe("sin_facturas");
  });

  test("por encima del tope, las que sobran vienen SIN fila (no vacías)", async () => {
    /* Quien pinta la tabla tiene que poder distinguir "todavía cargando" de
     * "no vino", o deja una casilla girando para siempre. El contrato es que
     * la unidad simplemente no aparece. */
    const t = convexTest(schema, modules);
    const s = await escenario(t);

    const muchas = await t.run(async (ctx) => {
      const ids: Id<"unidades">[] = [];
      for (let i = 0; i < 130; i++) {
        ids.push(
          await ctx.db.insert("unidades", {
            condominioId: s.condoA,
            tipo: "casa",
            estado: "ocupada",
            numero: `T-${i}`,
            createdAt: AHORA,
            updatedAt: AHORA,
          }),
        );
      }
      return ids;
    });

    const filas = await como(t, "adminA").query(api.facturas.carteraPorUnidad, {
      condominioId: s.condoA,
      unidadIds: muchas,
    });
    expect(filas.length).toBe(120);
    const devueltas = new Set(filas.map((f) => f.unidadId));
    expect(devueltas.has(muchas[0]!)).toBe(true);
    expect(devueltas.has(muchas[129]!)).toBe(false);
  });

  test("responde todas las unidades de la página en una sola consulta", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const filas = await como(t, "adminA").query(api.facturas.carteraPorUnidad, {
      condominioId: s.condoA,
      /* Repetidas a propósito: tres reservas, dos casas. */
      unidadIds: [s.alDia, s.enMora, s.alDia, s.sinFacturas, s.enMora],
    });
    expect(filas.length).toBe(3);
    expect(new Set(filas.map((f) => f.unidadId)).size).toBe(3);
  });

  test("el resumen NO trae las facturas: eso se pide al abrir el modal", async () => {
    /* Es el corazón de la carga bajo demanda. Si algún día alguien mete las
     * facturas en esta respuesta "ya que estamos", la tabla de reservas pasa
     * a cargar la cartera entera del conjunto para enseñar cuatro badges. */
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const [fila] = await como(t, "adminA").query(api.facturas.carteraPorUnidad, {
      condominioId: s.condoA,
      unidadIds: [s.cadena],
    });
    expect(Object.keys(fila).sort()).toEqual([
      "diasMora",
      "estado",
      "periodoActual",
      "periodoEnMora",
      "saldoActual",
      "unidadId",
      "vencimientoEnMora",
    ]);
  });
});

// ─────────────────────────────────────────────────────────────
describe("aislamiento entre conjuntos", () => {
  test("el admin de A no ve la cartera de una unidad de B", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const filas = await como(t, "adminA").query(api.facturas.carteraPorUnidad, {
      condominioId: s.condoA,
      unidadIds: [s.alDia, s.ajena],
    });
    expect(filas.map((f) => f.unidadId)).toEqual([s.alDia]);
  });

  test("el admin de B no puede pedir la cartera del conjunto A", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await expect(
      como(t, "adminB").query(api.facturas.carteraPorUnidad, {
        condominioId: s.condoA,
        unidadIds: [s.enMora],
      }),
    ).rejects.toThrow(/no pertenece a este condominio/i);
  });

  test("un residente no ve la cartera de sus vecinos", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await expect(
      como(t, "residenteA").query(api.facturas.carteraPorUnidad, {
        condominioId: s.condoA,
        unidadIds: [s.enMora],
      }),
    ).rejects.toThrow(/no tiene el rol requerido/i);
  });

  test("el guarda tampoco: la cartera no es dato de portería", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await expect(
      como(t, "guardiaA").query(api.facturas.carteraPorUnidad, {
        condominioId: s.condoA,
        unidadIds: [s.enMora],
      }),
    ).rejects.toThrow(/no tiene el rol requerido/i);
  });

  test("sin sesión no se lee nada", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await expect(
      t.query(api.facturas.carteraPorUnidad, {
        condominioId: s.condoA,
        unidadIds: [s.enMora],
      }),
    ).rejects.toThrow(/no autenticado/i);
  });
});

// ─────────────────────────────────────────────────────────────
describe("la mora informa, no bloquea", () => {
  test("caso 4 y 5 — una casa en mora sigue reservando y su reserva se aprueba", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);

    /* La casa 202 lleva 78 días. Si algún día alguien añade una regla de
     * bloqueo por cartera, esta prueba es la que se cae. */
    const nueva = await como(t, "adminA").mutation(api.reservas.create, {
      condominioId: s.condoA,
      unidadId: s.enMora,
      zonaId: s.zona,
      fecha: "2026-12-24",
      horaInicio: "18:00",
      horaFin: "22:00",
    });
    expect(nueva).toBeTruthy();

    await como(t, "adminA").mutation(api.reservas.updateEstado, {
      id: s.reservaMorosa,
      estado: "aprobada",
    });
    const aprobada = await t.run(async (ctx) => await ctx.db.get(s.reservaMorosa));
    expect(aprobada?.estado).toBe("aprobada");
  });

  test("la lista de reservas sigue devolviendo lo mismo que antes", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const page = await como(t, "adminA").query(api.reservas.listPage, {
      condominioId: s.condoA,
      paginationOpts: { numItems: 30, cursor: null },
    });
    expect(page.page.length).toBe(3);
    /* La cartera va aparte, no incrustada: `listPage` la puede leer cualquier
     * miembro del conjunto y la plata del vecino no es dato de vecino. */
    expect(page.page[0]).not.toHaveProperty("estadoCartera");
    expect(page.page[0]).not.toHaveProperty("diasMora");
  });
});

// ─────────────────────────────────────────────────────────────
describe("estado de cuenta bajo demanda", () => {
  test("trae las facturas de ESA unidad, de la más reciente hacia atrás", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const cuenta = await como(t, "adminA").query(api.facturas.estadoCuentaUnidad, {
      condominioId: s.condoA,
      unidadId: s.enMora,
    });
    expect(cuenta).not.toBeNull();
    expect(cuenta!.unidad.numero).toBe("202");
    expect(cuenta!.facturas.map((f) => f.periodo)).toEqual([
      "2026-07",
      "2026-06",
      "2026-05",
    ]);
    /* El resumen del modal tiene que cuadrar con el de la tabla. */
    expect(cuenta!.cartera.estado).toBe("en_mora");
    expect(cuenta!.cartera.diasMora).toBe(17);
  });

  test("distingue pagada, abonada y pendiente con el saldo de la siguiente", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const cuenta = await como(t, "adminA").query(api.facturas.estadoCuentaUnidad, {
      condominioId: s.condoA,
      unidadId: s.cadena,
    });
    const porPeriodo = new Map(cuenta!.facturas.map((f) => [f.periodo, f]));

    const enero = porPeriodo.get("2026-01")!;
    expect(enero.estado).toBe("pagada");
    expect(enero.saldoPendiente).toBe(0);
    expect(enero.abonado).toBe(300000);

    /* De febrero quedaron debiendo 100.000: marzo los arrastra. */
    const febrero = porPeriodo.get("2026-02")!;
    expect(febrero.estado).toBe("abonada");
    expect(febrero.saldoPendiente).toBe(100000);
    expect(febrero.abonado).toBe(200000);

    /* Marzo es la última: nadie la ha juzgado todavía. */
    const marzo = porPeriodo.get("2026-03")!;
    expect(marzo.estado).toBe("pendiente");
    expect(marzo.saldoPendiente).toBeNull();
    expect(marzo.abonado).toBeNull();
  });

  test("el concepto sale de la factura, no de un texto inventado", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const cuenta = await como(t, "adminA").query(api.facturas.estadoCuentaUnidad, {
      condominioId: s.condoA,
      unidadId: s.cadena,
    });
    const enero = cuenta!.facturas.find((f) => f.periodo === "2026-01")!;
    expect(enero.concepto).toBe("Administración de enero");
    expect(enero.numeroFactura).toBe("F-2026-01");
  });

  test("una unidad sin facturas responde vacío, no error", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const cuenta = await como(t, "adminA").query(api.facturas.estadoCuentaUnidad, {
      condominioId: s.condoA,
      unidadId: s.sinFacturas,
    });
    expect(cuenta!.facturas).toEqual([]);
    expect(cuenta!.cartera.estado).toBe("sin_facturas");
  });

  test("una unidad de otro conjunto no devuelve nada", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const cuenta = await como(t, "adminA").query(api.facturas.estadoCuentaUnidad, {
      condominioId: s.condoA,
      unidadId: s.ajena,
    });
    expect(cuenta).toBeNull();
  });

  test("el admin de B no puede pedir el estado de cuenta del conjunto A", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await expect(
      como(t, "adminB").query(api.facturas.estadoCuentaUnidad, {
        condominioId: s.condoA,
        unidadId: s.enMora,
      }),
    ).rejects.toThrow(/no pertenece a este condominio/i);
  });

  test("pasar el condominio propio con una unidad ajena no abre la puerta", async () => {
    /* El intento evidente: soy admin de B, pido con MI condominio pero el id
     * de una casa de A. El backend no se fía del id. */
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const cuenta = await como(t, "adminB").query(api.facturas.estadoCuentaUnidad, {
      condominioId: s.condoB,
      unidadId: s.enMora,
    });
    expect(cuenta).toBeNull();
  });

  test("un residente no abre el estado de cuenta de sus vecinos", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await expect(
      como(t, "residenteA").query(api.facturas.estadoCuentaUnidad, {
        condominioId: s.condoA,
        unidadId: s.enMora,
      }),
    ).rejects.toThrow(/no tiene el rol requerido/i);
  });
});

// ─────────────────────────────────────────────────────────────
describe("regresión: la casa de los 116 días", () => {
  /**
   * El caso que destapó la regla, con su forma real: cuota de abril vencida
   * desde hace 116 días, pero pagó completo en julio y de la de agosto —que
   * ni siquiera ha vencido— ya lleva abonado. El sistema la marcaba con 116
   * días de mora, que describe a alguien que no ha pagado en cuatro meses.
   * No es esta persona.
   */
  async function casoReportado(t: ReturnType<typeof convexTest>) {
    const s = await escenario(t);
    const u = await t.run(async (ctx) => {
      const unidadId = await ctx.db.insert("unidades", {
        condominioId: s.condoA,
        tipo: "casa",
        estado: "ocupada",
        numero: "25",
        createdAt: AHORA,
        updatedAt: AHORA,
      });
      const f = async (
        periodo: string,
        estado: "pendiente" | "pagada" | "vencida" | "abonada",
        total: number,
        diasDesdeVencimiento: number,
      ) =>
        await ctx.db.insert("facturas", {
          condominioId: s.condoA,
          unidadId,
          numeroFactura: `FAC-${periodo}-0100`,
          numeroInterno: periodo,
          periodo,
          periodoLabel: periodo,
          residenteNombre: "Quien sea",
          vrAdmon: total,
          lineas: [],
          saldoAFavor: 0,
          totalAPagar: total,
          estado,
          fechaEmision: AHORA - (diasDesdeVencimiento + 45) * DIA,
          fechaVencimiento: AHORA - diasDesdeVencimiento * DIA,
          createdAt: AHORA,
          updatedAt: AHORA,
        });

      await f("2026-03", "pagada", 321200, 146);
      await f("2026-04", "vencida", 400800, 116);
      await f("2026-05", "abonada", 837800, 85);
      await f("2026-06", "pagada", 638600, 55);
      /* Las dos últimas todavía no vencen. */
      await f("2026-08", "abonada", 338000, -7);
      await f("2026-09", "pendiente", 380000, -37);
      return unidadId;
    });
    return { s, unidadId: u };
  }

  test("debe 380.000, no 1.083.400, y no está en mora", async () => {
    const t = convexTest(schema, modules);
    const { s, unidadId } = await casoReportado(t);
    const [fila] = await como(t, "adminA").query(api.facturas.carteraPorUnidad, {
      condominioId: s.condoA,
      unidadIds: [unidadId],
    });
    /* Lo vigente es la de septiembre, que ya lleva dentro los 38.000 de
     * agosto. Lo de abril y mayo se pagó en junio. */
    expect(fila.saldoActual).toBe(380000);
    expect(fila.saldoActual).not.toBe(1083400);
    expect(fila.periodoActual).toBe("2026-09");
    expect(fila.estado).toBe("pendiente");
    expect(fila.diasMora).toBe(0);
  });

  test("caso 7 — el historial sigue completo, sin días de mora por fila", async () => {
    const t = convexTest(schema, modules);
    const { s, unidadId } = await casoReportado(t);
    const cuenta = await como(t, "adminA").query(api.facturas.estadoCuentaUnidad, {
      condominioId: s.condoA,
      unidadId,
    });
    /* Las seis siguen ahí para auditar: no se borra información histórica. */
    expect(cuenta!.facturas.length).toBe(6);
    const abril = cuenta!.facturas.find((f) => f.periodo === "2026-04")!;
    expect(abril.estado).toBe("vencida");
    expect(abril.totalAPagar).toBe(400800);
    /* Pero sin "116 días" en la fila: se leía como una mora aparte. */
    expect(abril).not.toHaveProperty("diasVencida");
  });

  test("si deja de pagar, la mora aparece sola y con los días correctos", async () => {
    const t = convexTest(schema, modules);
    const { s, unidadId } = await casoReportado(t);
    /* La de agosto vence y nadie la abona. */
    await t.run(async (ctx) => {
      const f = (
        await ctx.db
          .query("facturas")
          .withIndex("by_unidad", (q) => q.eq("unidadId", unidadId))
          .collect()
      ).find((x) => x.periodo === "2026-08")!;
      await ctx.db.patch(f._id, {
        estado: "vencida",
        fechaVencimiento: AHORA - 23 * DIA,
      });
    });

    const [fila] = await como(t, "adminA").query(api.facturas.carteraPorUnidad, {
      condominioId: s.condoA,
      unidadIds: [unidadId],
    });
    expect(fila.estado).toBe("en_mora");
    expect(fila.diasMora).toBe(23);
    expect(fila.periodoEnMora).toBe("2026-08");
  });

  test("la reserva de esa casa se sigue gestionando igual", async () => {
    /* Criterio 9: nada de esto bloquea nada. */
    const t = convexTest(schema, modules);
    const { s, unidadId } = await casoReportado(t);
    const id = await como(t, "adminA").mutation(api.reservas.create, {
      condominioId: s.condoA,
      unidadId,
      zonaId: s.zona,
      fecha: "2026-12-31",
      horaInicio: "18:00",
      horaFin: "23:00",
    });
    await como(t, "adminA").mutation(api.reservas.updateEstado, {
      id,
      estado: "aprobada",
    });
    const r = await t.run(async (ctx) => await ctx.db.get(id));
    expect(r?.estado).toBe("aprobada");
  });
});
