import { test, expect, describe } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const modules = import.meta.glob("../convex/**/*.ts");

/**
 * EL VALOR DE LA RESERVA, DESDE QUE SE CREA HASTA QUE SE COBRA.
 *
 * El residente veía el precio antes de confirmar y ahí se acababa: el número
 * no se guardaba en ninguna parte, así que la administración —que es quien lo
 * cobra— no podía verlo después. Y quien administra creaba reservas desde un
 * formulario que no mostraba un peso.
 *
 * Lo que se comprueba aquí es que el valor quede PACTADO al crear la reserva,
 * que subir la tarifa después no reescriba lo acordado, y que las reservas
 * viejas —las que nacieron sin valor— se muestren estimadas y marcadas como
 * tales, no disfrazadas de acuerdo.
 */

const AHORA = Date.now();

const como = (t: ReturnType<typeof convexTest>, subject: string) =>
  t.withIdentity({ subject });

async function escenario(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const condominioId = await ctx.db.insert("condominios", {
      name: "Conjunto A",
      activeModules: [],
      isActive: true,
      createdAt: AHORA,
      updatedAt: AHORA,
    });

    const persona = async (name: string, authId: string) =>
      await ctx.db.insert("users", {
        name,
        email: `${authId}@vekino.test`,
        emailVerified: true,
        active: true,
        authId,
        createdAt: AHORA,
        updatedAt: AHORA,
      });

    const admin = await persona("Admin", "admin");
    const residente = await persona("Residente", "residente");

    await ctx.db.insert("memberships", {
      userId: admin,
      condominioId,
      roles: ["administrador"] as never,
      isActive: true,
      createdAt: AHORA,
      updatedAt: AHORA,
    });
    const memResidente = await ctx.db.insert("memberships", {
      userId: residente,
      condominioId,
      roles: ["residente", "propietario"] as never,
      isActive: true,
      createdAt: AHORA,
      updatedAt: AHORA,
    });

    const unidadId = await ctx.db.insert("unidades", {
      condominioId,
      tipo: "casa",
      estado: "ocupada",
      numero: "101",
      createdAt: AHORA,
      updatedAt: AHORA,
    });
    await ctx.db.insert("usuarioUnidad", {
      membershipId: memResidente,
      unidadId,
      condominioId,
      vinculo: "propietario" as never,
      esPrincipal: true,
      createdAt: AHORA,
    });

    /** Salón por día: 150.000 la jornada y 200.000 de depósito. */
    const salon = await ctx.db.insert("zonasComunes", {
      condominioId,
      nombre: "Salón social",
      unidadTiempo: "dia",
      precioPorDia: 150000,
      depositoRequerido: 200000,
      /* Abierto todos los días: el horario no es lo que se prueba aquí. */
      horariosPorDia: [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
        dia,
        horaInicio: "06:00",
        horaFin: "23:00",
      })),
      activa: true,
      createdAt: AHORA,
      updatedAt: AHORA,
    });

    /** Gimnasio por hora, sin tarifa configurada y sin depósito. */
    const gimnasio = await ctx.db.insert("zonasComunes", {
      condominioId,
      nombre: "Gimnasio",
      unidadTiempo: "hora",
      horariosPorDia: [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
        dia,
        horaInicio: "06:00",
        horaFin: "23:00",
      })),
      activa: true,
      createdAt: AHORA,
      updatedAt: AHORA,
    });

    return { condominioId, unidadId, salon, gimnasio };
  });
}

// ─────────────────────────────────────────────────────────────
describe("el valor queda pactado al crear la reserva", () => {
  test("la administración crea y el valor se congela con la tarifa del día", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);

    const id = await como(t, "admin").mutation(api.reservas.create, {
      condominioId: s.condominioId,
      unidadId: s.unidadId,
      zonaId: s.salon,
      fecha: "2026-12-24",
      horaInicio: "18:00",
      horaFin: "22:00",
    });

    const reserva = await t.run(async (ctx) => await ctx.db.get(id));
    /* Por día: una jornada, no cuatro horas. Es lo mismo que ve el residente
     * en pantalla antes de confirmar. */
    expect(reserva?.valorReserva).toBe(150000);
    expect(reserva?.depositoRequerido).toBe(200000);
  });

  test("el residente crea y queda exactamente lo mismo", async () => {
    /* Un solo cálculo para los dos: si se desvían, esta prueba se cae. */
    const t = convexTest(schema, modules);
    const s = await escenario(t);

    const id = await como(t, "residente").mutation(api.reservas.createMia, {
      condominioId: s.condominioId,
      unidadId: s.unidadId,
      zonaId: s.salon,
      fecha: "2026-12-24",
      horaInicio: "18:00",
      horaFin: "22:00",
    });

    const reserva = await t.run(async (ctx) => await ctx.db.get(id));
    expect(reserva?.valorReserva).toBe(150000);
    expect(reserva?.depositoRequerido).toBe(200000);
  });

  test("subir la tarifa después no reescribe lo ya pactado", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);

    const id = await como(t, "admin").mutation(api.reservas.create, {
      condominioId: s.condominioId,
      unidadId: s.unidadId,
      zonaId: s.salon,
      fecha: "2026-12-24",
      horaInicio: "18:00",
      horaFin: "22:00",
    });

    await como(t, "admin").mutation(api.reservas.updateZona, {
      id: s.salon,
      precioPorDia: 400000,
      depositoRequerido: 500000,
    });

    const reserva = await t.run(async (ctx) => await ctx.db.get(id));
    expect(reserva?.valorReserva).toBe(150000);
    expect(reserva?.depositoRequerido).toBe(200000);
  });

  test("una zona sin tarifa no guarda un cero", async () => {
    /* Cero es "gratis". Esto es "nadie le puso precio", y la diferencia
     * importa el día que la administración cuadre caja. */
    const t = convexTest(schema, modules);
    const s = await escenario(t);

    const id = await como(t, "admin").mutation(api.reservas.create, {
      condominioId: s.condominioId,
      unidadId: s.unidadId,
      zonaId: s.gimnasio,
      fecha: "2026-12-24",
      horaInicio: "07:00",
      horaFin: "09:00",
    });

    const reserva = await t.run(async (ctx) => await ctx.db.get(id));
    expect(reserva?.valorReserva).toBeUndefined();
    expect(reserva?.depositoRequerido).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────
describe("la tabla de la administración muestra los valores", () => {
  test("una reserva nueva se muestra como pactada, no como estimada", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);

    await como(t, "admin").mutation(api.reservas.create, {
      condominioId: s.condominioId,
      unidadId: s.unidadId,
      zonaId: s.salon,
      fecha: "2026-12-24",
      horaInicio: "18:00",
      horaFin: "22:00",
    });

    const page = await como(t, "admin").query(api.reservas.listPage, {
      condominioId: s.condominioId,
      paginationOpts: { numItems: 30, cursor: null },
    });

    expect(page.page[0]?.valorReserva).toBe(150000);
    expect(page.page[0]?.depositoRequerido).toBe(200000);
    expect(page.page[0]?.valoresEstimados).toBe(false);
  });

  test("una reserva vieja se estima con la tarifa de hoy y se marca", async () => {
    /* Las reservas anteriores a este cambio no tienen valor guardado. Dejar
     * la columna en blanco sería inútil; mostrarla sin marcar sería mentir. */
    const t = convexTest(schema, modules);
    const s = await escenario(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("reservas", {
        condominioId: s.condominioId,
        unidadId: s.unidadId,
        zonaId: s.salon,
        zonaNombre: "Salón social",
        unidadNumero: "101",
        solicitanteNombre: "Quien sea",
        fecha: "2026-11-01",
        horaInicio: "18:00",
        horaFin: "22:00",
        estado: "aprobada",
        createdAt: AHORA,
        updatedAt: AHORA,
      });
    });

    const page = await como(t, "admin").query(api.reservas.listPage, {
      condominioId: s.condominioId,
      paginationOpts: { numItems: 30, cursor: null },
    });

    expect(page.page[0]?.valorReserva).toBe(150000);
    expect(page.page[0]?.depositoRequerido).toBe(200000);
    expect(page.page[0]?.valoresEstimados).toBe(true);
  });

  test("si la zona ya no existe no se inventa un valor", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("reservas", {
        condominioId: s.condominioId,
        unidadId: s.unidadId,
        zonaId: s.salon,
        zonaNombre: "Zona borrada",
        unidadNumero: "101",
        solicitanteNombre: "Quien sea",
        fecha: "2026-11-01",
        horaInicio: "18:00",
        horaFin: "22:00",
        estado: "aprobada",
        createdAt: AHORA,
        updatedAt: AHORA,
      });
      await ctx.db.delete(s.salon);
    });

    const page = await como(t, "admin").query(api.reservas.listPage, {
      condominioId: s.condominioId,
      paginationOpts: { numItems: 30, cursor: null },
    });

    expect(page.page[0]?.valorReserva).toBeNull();
    expect(page.page[0]?.valoresEstimados).toBe(false);
  });

  test("el filtro por estado también trae los valores", async () => {
    /* `listPage` tiene dos caminos —paginado y filtrado— y es fácil arreglar
     * uno y olvidar el otro. */
    const t = convexTest(schema, modules);
    const s = await escenario(t);

    await como(t, "admin").mutation(api.reservas.create, {
      condominioId: s.condominioId,
      unidadId: s.unidadId,
      zonaId: s.salon,
      fecha: "2026-12-24",
      horaInicio: "18:00",
      horaFin: "22:00",
    });

    const page = await como(t, "admin").query(api.reservas.listPage, {
      condominioId: s.condominioId,
      paginationOpts: { numItems: 30, cursor: null },
      estado: "pendiente",
    });

    expect(page.page).toHaveLength(1);
    expect(page.page[0]?.valorReserva).toBe(150000);
  });

  test("varias reservas de varias zonas salen cada una con lo suyo", async () => {
    /* Las zonas se leen UNA vez por página y se resuelven en memoria. Si
     * alguien vuelve a leerlas por fila, esto sigue pasando —pero al menos
     * queda comprobado que el mapa no confunde una zona con otra. */
    const t = convexTest(schema, modules);
    const s = await escenario(t);

    await t.run(async (ctx) => {
      const vieja = async (zonaId: Id<"zonasComunes">, nombre: string, fecha: string) =>
        await ctx.db.insert("reservas", {
          condominioId: s.condominioId,
          unidadId: s.unidadId,
          zonaId,
          zonaNombre: nombre,
          unidadNumero: "101",
          solicitanteNombre: "Quien sea",
          fecha,
          horaInicio: "07:00",
          horaFin: "09:00",
          estado: "aprobada",
          createdAt: AHORA,
          updatedAt: AHORA,
        });
      await vieja(s.salon, "Salón social", "2026-11-01");
      await vieja(s.gimnasio, "Gimnasio", "2026-11-02");
      await vieja(s.salon, "Salón social", "2026-11-03");
    });

    const page = await como(t, "admin").query(api.reservas.listPage, {
      condominioId: s.condominioId,
      paginationOpts: { numItems: 30, cursor: null },
    });

    const porZona = new Map(page.page.map((r) => [r.zonaNombre, r]));
    expect(porZona.get("Salón social")?.valorReserva).toBe(150000);
    expect(porZona.get("Salón social")?.depositoRequerido).toBe(200000);
    /* El gimnasio no tiene tarifa: no es gratis, es que nadie le puso precio. */
    expect(porZona.get("Gimnasio")?.valorReserva).toBeNull();
    expect(porZona.get("Gimnasio")?.depositoRequerido).toBeUndefined();
  });
});
