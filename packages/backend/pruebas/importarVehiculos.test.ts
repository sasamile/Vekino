import { test, expect, describe } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";

const modules = import.meta.glob("../convex/**/*.ts");

/**
 * Re-subir el Excel del parqueadero.
 *
 * La administración ya tenía los carros en una hoja. Lo que no podía era
 * volverla a cargar para actualizar casa, marca o color: había que editar
 * placa por placa. Aquí la llave es la placa, con o sin guion.
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
    const admin = await ctx.db.insert("users", {
      name: "Admin",
      email: "admin@vekino.test",
      emailVerified: true,
      active: true,
      authId: "admin",
      createdAt: AHORA,
      updatedAt: AHORA,
    });
    await ctx.db.insert("memberships", {
      userId: admin,
      condominioId,
      roles: ["administrador"] as never,
      isActive: true,
      createdAt: AHORA,
      updatedAt: AHORA,
    });
    const u409 = await ctx.db.insert("unidades", {
      condominioId,
      tipo: "casa",
      estado: "ocupada",
      numero: "409",
      createdAt: AHORA,
      updatedAt: AHORA,
    });
    const u410 = await ctx.db.insert("unidades", {
      condominioId,
      tipo: "casa",
      estado: "ocupada",
      numero: "410",
      createdAt: AHORA,
      updatedAt: AHORA,
    });
    return { condominioId, u409, u410 };
  });
}

describe("actualizar vehículos desde Excel", () => {
  test("una placa que ya existe se actualiza, no se duplica", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);

    const id = await como(t, "admin").mutation(api.vehiculos.create, {
      condominioId: s.condominioId,
      unidadId: s.u409,
      placa: "ABC-123",
      marca: "Renault",
    });

    const res = await como(t, "admin").mutation(api.vehiculos.bulkUpsert, {
      condominioId: s.condominioId,
      filas: [
        {
          unidad: "410",
          placa: "abc 123",
          marca: "Chevrolet",
          color: "Blanco",
        },
      ],
    });

    expect(res.actualizados).toBe(1);
    expect(res.creados).toBe(0);

    const v = await t.run(async (ctx) => await ctx.db.get(id));
    expect(v?.unidadId).toBe(s.u410);
    expect(v?.placa).toBe("ABC123");
    expect(v?.marca).toBe("Chevrolet");
    expect(v?.color).toBe("Blanco");

    const todos = await t.run(async (ctx) =>
      ctx.db
        .query("vehiculos")
        .withIndex("by_condominio", (q) => q.eq("condominioId", s.condominioId))
        .collect(),
    );
    expect(todos).toHaveLength(1);
  });

  test("una placa nueva se crea", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);

    const res = await como(t, "admin").mutation(api.vehiculos.bulkUpsert, {
      condominioId: s.condominioId,
      filas: [{ unidad: "409", placa: "XYZ12D", tipo: "moto", marca: "Yamaha" }],
    });
    expect(res.creados).toBe(1);
    expect(res.actualizados).toBe(0);
  });

  test("un campo vacío no borra la marca que ya estaba", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const id = await como(t, "admin").mutation(api.vehiculos.create, {
      condominioId: s.condominioId,
      unidadId: s.u409,
      placa: "ABC123",
      marca: "Renault",
      color: "Rojo",
    });
    await como(t, "admin").mutation(api.vehiculos.bulkUpsert, {
      condominioId: s.condominioId,
      filas: [{ unidad: "409", placa: "ABC123", color: "Azul" }],
    });
    const v = await t.run(async (ctx) => await ctx.db.get(id));
    expect(v?.marca).toBe("Renault");
    expect(v?.color).toBe("Azul");
  });

  test("sin unidad en el conjunto se omite, no se inventa", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const res = await como(t, "admin").mutation(api.vehiculos.bulkUpsert, {
      condominioId: s.condominioId,
      filas: [{ unidad: "999", placa: "ABC123" }],
    });
    expect(res.creados).toBe(0);
    expect(res.omitidos).toHaveLength(1);
  });

  test("un archivado que vuelve en el Excel se restaura", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const id = await como(t, "admin").mutation(api.vehiculos.create, {
      condominioId: s.condominioId,
      unidadId: s.u409,
      placa: "ABC123",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(id, { archivadoEn: AHORA });
    });
    const res = await como(t, "admin").mutation(api.vehiculos.bulkUpsert, {
      condominioId: s.condominioId,
      filas: [{ unidad: "409", placa: "ABC123" }],
    });
    expect(res.restaurados).toBe(1);
    const v = await t.run(async (ctx) => await ctx.db.get(id));
    expect(v?.archivadoEn).toBeUndefined();
  });
});
