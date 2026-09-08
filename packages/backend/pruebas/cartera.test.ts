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

    const enMora = await unidad(condoA, "202");
    await factura(condoA, enMora, "2026-05", "vencida", 78);
    await factura(condoA, enMora, "2026-06", "vencida", 48);
    await factura(condoA, enMora, "2026-07", "abonada", 17);

    const porVencer = await unidad(condoA, "303");
    await factura(condoA, porVencer, "2026-07", "pagada", 30);
    await factura(condoA, porVencer, "2026-08", "pendiente", -7);

    const sinFacturas = await unidad(condoA, "404");

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
      alDia, enMora, porVencer, sinFacturas, ajena,
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
    expect(fila.facturasPendientes).toBe(0);
  });

  test("caso 2 y 3 — con varias vencidas, los días salen de la más antigua", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const [fila] = await como(t, "adminA").query(api.facturas.carteraPorUnidad, {
      condominioId: s.condoA,
      unidadIds: [s.enMora],
    });
    expect(fila.estado).toBe("en_mora");
    expect(fila.diasMora).toBe(78);
    /* Las tres cuentan como deuda; la abonada también, porque abonar no es
     * pagar. */
    expect(fila.facturasPendientes).toBe(3);
    expect(fila.periodoMasAntiguo).toBe("2026-05");
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
    expect(fila.facturasPendientes).toBe(1);
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
