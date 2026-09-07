import { test, expect, describe } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const modules = import.meta.glob("../convex/**/*.ts");

/**
 * PRUEBAS DE AUTORIZACION.
 *
 * Cada una monta dos conjuntos y dos companias y comprueba que lo de uno no
 * se ve desde el otro. Son las que faltaban: hasta ahora el repositorio no
 * tenia ni una sola prueba que verificara que un usuario de un conjunto no
 * puede leer los datos de otro, y ahi es donde aparecieron los agujeros.
 */

const DIA = 24 * 60 * 60 * 1000;
const AYER = Date.now() - DIA;
const HACE_UN_MES = Date.now() - 30 * DIA;
const EN_UN_MES = Date.now() + 30 * DIA;

/** Monta el escenario completo y devuelve los ids para las aserciones. */
async function escenario(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const ahora = Date.now();
    const condo = async (name: string) =>
      await ctx.db.insert("condominios", {
        name,
        activeModules: [],
        isActive: true,
        createdAt: ahora,
        updatedAt: ahora,
      });

    const persona = async (
      name: string,
      authId: string,
      platformRole?: "superadmin" | "admin",
    ) =>
      await ctx.db.insert("users", {
        name,
        email: `${authId}@vekino.test`,
        emailVerified: true,
        active: true,
        authId,
        platformRole,
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

    const condoA = await condo("Conjunto A");
    const condoB = await condo("Conjunto B");

    const superadmin = await persona("Super", "super", "superadmin");
    const staff = await persona("Staff", "staff", "admin");
    const adminA = await persona("Admin A", "adminA");
    const adminB = await persona("Admin B", "adminB");
    const residenteA = await persona("Residente A", "residenteA");

    await membresia(adminA, condoA, ["administrador"]);
    await membresia(adminB, condoB, ["administrador"]);
    await membresia(residenteA, condoA, ["residente"]);

    // Compañía X atiende A y B; compañía Y atiende solo B.
    const companiaX = await ctx.db.insert("companiasSeguridad", {
      nombre: "Seguridad X",
      estado: "activa",
      createdAt: ahora,
      updatedAt: ahora,
    });
    const companiaY = await ctx.db.insert("companiasSeguridad", {
      nombre: "Seguridad Y",
      estado: "activa",
      createdAt: ahora,
      updatedAt: ahora,
    });

    const miembro = async (
      userId: Id<"users">,
      companiaId: Id<"companiasSeguridad">,
      roles: string[],
    ) =>
      await ctx.db.insert("companiaMiembros", {
        userId,
        companiaId,
        roles: roles as never,
        isActive: true,
        createdAt: ahora,
        updatedAt: ahora,
      });

    const adminX = await persona("Admin X", "adminX");
    const supervisorX = await persona("Supervisor X", "supervisorX");
    const guardaX = await persona("Guarda X", "guardaX");
    const adminY = await persona("Admin Y", "adminY");

    const mAdminX = await miembro(adminX, companiaX, ["admin_compania"]);
    const mSupervisorX = await miembro(supervisorX, companiaX, ["supervisor"]);
    const mGuardaX = await miembro(guardaX, companiaX, ["guardia"]);
    const mAdminY = await miembro(adminY, companiaY, ["admin_compania"]);

    const contrato = async (
      companiaId: Id<"companiasSeguridad">,
      condominioId: Id<"condominios">,
      vigenciaHasta?: number,
    ) =>
      await ctx.db.insert("companiaContratos", {
        companiaId,
        condominioId,
        vigenciaDesde: HACE_UN_MES,
        vigenciaHasta,
        creadoPorUserId: superadmin,
        createdAt: ahora,
        updatedAt: ahora,
      });

    const contratoXA = await contrato(companiaX, condoA);
    const contratoXB = await contrato(companiaX, condoB);
    const contratoYB = await contrato(companiaY, condoB);

    const asignar = async (
      contratoId: Id<"companiaContratos">,
      companiaMiembroId: Id<"companiaMiembros">,
      userId: Id<"users">,
      condominioId: Id<"condominios">,
      companiaId: Id<"companiasSeguridad">,
      rol: "supervisor" | "guardia",
      vigenciaHasta?: number,
    ) =>
      await ctx.db.insert("asignaciones", {
        contratoId,
        companiaMiembroId,
        userId,
        condominioId,
        companiaId,
        rol,
        vigenciaDesde: HACE_UN_MES,
        vigenciaHasta,
        creadoPorUserId: superadmin,
        createdAt: ahora,
      });

    // Supervisor X y guarda X operan SOLO en el conjunto A.
    await asignar(contratoXA, mSupervisorX, supervisorX, condoA, companiaX, "supervisor");
    await asignar(contratoXA, mGuardaX, guardaX, condoA, companiaX, "guardia");

    // Una factura en cada conjunto, para probar fuga de cartera.
    for (const [cid, numero] of [
      [condoA, "A-001"],
      [condoB, "B-001"],
    ] as const) {
      const unidadId = await ctx.db.insert("unidades", {
        condominioId: cid,
        tipo: "apartamento",
        estado: "ocupada",
        numero: "101",
        createdAt: ahora,
        updatedAt: ahora,
      });
      await ctx.db.insert("facturas", {
        condominioId: cid,
        unidadId,
        numeroFactura: numero,
        numeroInterno: numero,
        periodo: "2026-03",
        periodoLabel: "Marzo 2026",
        residenteNombre: "Quien sea",
        vrAdmon: 100,
        lineas: [],
        saldoAFavor: 0,
        totalAPagar: 100,
        estado: "pendiente",
        fechaEmision: ahora,
        fechaVencimiento: ahora,
        createdAt: ahora,
        updatedAt: ahora,
      });
    }

    return {
      condoA, condoB,
      superadmin, staff, adminA, adminB, residenteA,
      companiaX, companiaY,
      adminX, supervisorX, guardaX, adminY,
      mAdminX, mSupervisorX, mGuardaX, mAdminY,
      contratoXA, contratoXB, contratoYB,
    };
  });
}

const como = (t: ReturnType<typeof convexTest>, subject: string) =>
  t.withIdentity({ subject });

// ─────────────────────────────────────────────────────────────
describe("aislamiento entre companias", () => {
  test("la compania Y no puede leer el detalle de la compania X", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await expect(
      como(t, "adminY").query(api.companias.detail, { companiaId: s.companiaX }),
    ).rejects.toThrow(/no pertenece a esta compañía/i);
  });

  test("la compania Y no puede asignar personal bajo un contrato de X", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await expect(
      como(t, "adminY").mutation(api.asignaciones.crear, {
        contratoId: s.contratoXA,
        companiaMiembroId: s.mAdminY,
        rol: "guardia",
        vigenciaDesde: Date.now(),
      }),
    ).rejects.toThrow(/no pertenece a su compañía/i);
  });

  test("no se puede asignar a alguien de otra compania bajo el propio contrato", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await expect(
      como(t, "adminX").mutation(api.asignaciones.crear, {
        contratoId: s.contratoXA,
        companiaMiembroId: s.mAdminY,
        rol: "guardia",
        vigenciaDesde: Date.now(),
      }),
    ).rejects.toThrow(/no pertenece a la compañía del contrato/i);
  });

  test("el admin de X si ve su propia compania", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const d = await como(t, "adminX").query(api.companias.detail, {
      companiaId: s.companiaX,
    });
    expect(d?.compania.nombre).toBe("Seguridad X");
    expect(d?.contratos.length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────
describe("ambito del supervisor", () => {
  test("no puede asignar en un conjunto que no supervisa", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    // Supervisa A; el contrato XB es del conjunto B, de su misma compañía.
    await expect(
      como(t, "supervisorX").mutation(api.asignaciones.crear, {
        contratoId: s.contratoXB,
        companiaMiembroId: s.mGuardaX,
        rol: "guardia",
        vigenciaDesde: Date.now(),
      }),
    ).rejects.toThrow(/no tiene permiso/i);
  });

  test("si puede asignar en el conjunto que supervisa", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const nuevo = await t.run(async (ctx) =>
      ctx.db.insert("companiaMiembros", {
        userId: s.adminX,
        companiaId: s.companiaX,
        roles: ["guardia"],
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const id = await como(t, "supervisorX").mutation(api.asignaciones.crear, {
      contratoId: s.contratoXA,
      companiaMiembroId: nuevo,
      rol: "guardia",
      vigenciaDesde: Date.now(),
    });
    expect(id).toBeTruthy();
  });

  test("solo ve los conjuntos que supervisa en el detalle de su compania", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const d = await como(t, "supervisorX").query(api.companias.detail, {
      companiaId: s.companiaX,
    });
    // La compañía tiene contratos con A y con B; él solo supervisa A.
    expect(d?.contratos.map((c) => c.condominioNombre)).toEqual(["Conjunto A"]);
  });

  test("un guarda no ve el directorio de su compania", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await expect(
      como(t, "guardaX").query(api.companias.detail, { companiaId: s.companiaX }),
    ).rejects.toThrow(/no tiene permiso/i);
  });
});

// ─────────────────────────────────────────────────────────────
describe("aislamiento entre conjuntos", () => {
  test("el admin del conjunto B no puede leer la cartera del conjunto A", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await expect(
      como(t, "adminB").query(api.facturas.listByPeriodo, {
        condominioId: s.condoA,
        periodo: "2026-03",
      }),
    ).rejects.toThrow(/no pertenece a este condominio/i);
  });

  test("sin sesion no se lee la cartera de nadie", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await expect(
      t.query(api.facturas.listByPeriodo, {
        condominioId: s.condoA,
        periodo: "2026-03",
      }),
    ).rejects.toThrow(/no autenticado/i);
  });

  test("sin sesion no se pueden escribir facturas", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await expect(
      t.mutation(api.facturas.bulkUpsert, { facturas: [] }),
    ).rejects.toThrow();
  });

  test("un residente no puede leer la cartera de su propio conjunto", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await expect(
      como(t, "residenteA").query(api.facturas.listPeriodos, {
        condominioId: s.condoA,
      }),
    ).rejects.toThrow(/no tiene el rol requerido/i);
  });

  test("el admin del conjunto A si lee su propia cartera", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const filas = await como(t, "adminA").query(api.facturas.listByPeriodo, {
      condominioId: s.condoA,
      periodo: "2026-03",
    });
    expect(filas.map((f) => f.numeroFactura)).toEqual(["A-001"]);
  });

  test("un residente de A no puede leer los datos del conjunto B", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await expect(
      como(t, "residenteA").query(api.condominios.get, { condominioId: s.condoB }),
    ).rejects.toThrow(/no tiene acceso a este conjunto/i);
  });

  test("un residente no puede leer el historial de actividad del conjunto", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await expect(
      como(t, "residenteA").query(api.historial.feed, { condominioId: s.condoA }),
    ).rejects.toThrow(/no tiene el rol requerido/i);
  });
});

// ─────────────────────────────────────────────────────────────
describe("escalada de privilegios", () => {
  test("un admin de conjunto no puede tomar la cuenta de un superadmin", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    // Aunque el superadmin fuera miembro del conjunto.
    await t.run(async (ctx) => {
      await ctx.db.insert("memberships", {
        userId: s.superadmin,
        condominioId: s.condoA,
        roles: ["residente"],
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    await expect(
      como(t, "adminA").query(api.users.assertCanEditMember, {
        condominioId: s.condoA,
        userId: s.superadmin,
      }),
    ).rejects.toThrow(/panel maestro/i);
  });

  test("un admin de conjunto no puede tocar a alguien de otro conjunto", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await expect(
      como(t, "adminA").query(api.users.assertCanEditMember, {
        condominioId: s.condoA,
        userId: s.adminB,
      }),
    ).rejects.toThrow(/no es miembro de este conjunto/i);
  });

  test("un admin de conjunto no puede reescribir el perfil global de otro", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await expect(
      como(t, "adminA").mutation(api.memberships.updateMember, {
        condominioId: s.condoA,
        userId: s.adminB,
        name: "Secuestrado",
      }),
    ).rejects.toThrow(/no es miembro de este conjunto/i);
  });

  test("un admin de plataforma no puede ascenderse a superadmin", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await expect(
      como(t, "staff").mutation(api.memberships.setPlatformRole, {
        userId: s.staff,
        platformRole: "superadmin",
      }),
    ).rejects.toThrow(/requiere rol superadmin/i);
  });

  test("el superadmin no puede retirarse a si mismo el control maestro", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await expect(
      como(t, "super").mutation(api.memberships.setPlatformRole, {
        userId: s.superadmin,
        platformRole: "admin",
      }),
    ).rejects.toThrow(/a ti mismo/i);
  });

  test("el superadmin si puede promover a otro", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await como(t, "super").mutation(api.memberships.setPlatformRole, {
      userId: s.adminA,
      platformRole: "admin",
    });
    const u = await t.run(async (ctx) => ctx.db.get(s.adminA));
    expect(u?.platformRole).toBe("admin");
  });
});

// ─────────────────────────────────────────────────────────────
describe("capacidades del guarda por conjunto", () => {
  test("opera donde esta asignado", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const a = await como(t, "guardaX").query(api.asignaciones.miAcceso, {
      condominioId: s.condoA,
    });
    expect(a?.capacidades).toContain("porteria.operar");
    expect(a?.viaCompania?.companiaNombre).toBe("Seguridad X");
  });

  test("no opera donde NO esta asignado, aunque su compania tenga contrato", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const a = await como(t, "guardaX").query(api.asignaciones.miAcceso, {
      condominioId: s.condoB,
    });
    expect(a?.capacidades).toEqual([]);
    expect(a?.viaCompania).toBeNull();
  });

  test("una asignacion vencida deja de dar acceso", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await t.run(async (ctx) => {
      const filas = await ctx.db
        .query("asignaciones")
        .withIndex("by_user_condominio", (q) =>
          q.eq("userId", s.guardaX).eq("condominioId", s.condoA),
        )
        .collect();
      for (const f of filas) await ctx.db.patch(f._id, { vigenciaHasta: AYER });
    });
    const a = await como(t, "guardaX").query(api.asignaciones.miAcceso, {
      condominioId: s.condoA,
    });
    expect(a?.capacidades).toEqual([]);
  });

  test("terminar el contrato corta el acceso de todo su personal", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(s.contratoXA, { vigenciaHasta: AYER });
    });
    const guarda = await como(t, "guardaX").query(api.asignaciones.miAcceso, {
      condominioId: s.condoA,
    });
    const sup = await como(t, "supervisorX").query(api.asignaciones.miAcceso, {
      condominioId: s.condoA,
    });
    expect(guarda?.capacidades).toEqual([]);
    expect(sup?.capacidades).toEqual([]);
  });

  test("suspender la compania corta el acceso sin borrar nada", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await como(t, "super").mutation(api.companias.setEstado, {
      companiaId: s.companiaX,
      estado: "suspendida",
    });
    const a = await como(t, "guardaX").query(api.asignaciones.miAcceso, {
      condominioId: s.condoA,
    });
    expect(a?.capacidades).toEqual([]);

    // La estructura sigue intacta: reactivar la devuelve tal cual.
    await como(t, "super").mutation(api.companias.setEstado, {
      companiaId: s.companiaX,
      estado: "activa",
    });
    const b = await como(t, "guardaX").query(api.asignaciones.miAcceso, {
      condominioId: s.condoA,
    });
    expect(b?.capacidades).toContain("porteria.operar");
  });

  test("dar de baja al miembro corta el acceso aunque la asignacion siga", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await como(t, "adminX").mutation(api.companias.desactivarMiembro, {
      miembroId: s.mGuardaX,
    });
    const a = await como(t, "guardaX").query(api.asignaciones.miAcceso, {
      condominioId: s.condoA,
    });
    expect(a?.capacidades).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────
describe("la identidad no se acepta del cliente", () => {
  test("crear una asignacion deriva userId y conjunto del contrato, no del argumento", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const nuevo = await t.run(async (ctx) =>
      ctx.db.insert("companiaMiembros", {
        userId: s.adminX,
        companiaId: s.companiaX,
        roles: ["guardia"],
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const id = await como(t, "adminX").mutation(api.asignaciones.crear, {
      contratoId: s.contratoXB,
      companiaMiembroId: nuevo,
      rol: "guardia",
      vigenciaDesde: Date.now(),
    });
    const fila = await t.run(async (ctx) => ctx.db.get(id));
    expect(fila?.userId).toBe(s.adminX);
    expect(fila?.condominioId).toBe(s.condoB);
    expect(fila?.companiaId).toBe(s.companiaX);
    expect(fila?.creadoPorUserId).toBe(s.adminX);
  });

  test("el contrato registra a quien lo firmo, tomado de la sesion", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const nuevoCondo = await t.run(async (ctx) =>
      ctx.db.insert("condominios", {
        name: "Conjunto C",
        activeModules: [],
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const id = await como(t, "super").mutation(api.companias.crearContrato, {
      companiaId: s.companiaX,
      condominioId: nuevoCondo,
      vigenciaDesde: Date.now(),
    });
    const k = await t.run(async (ctx) => ctx.db.get(id));
    expect(k?.creadoPorUserId).toBe(s.superadmin);
  });
});

// ─────────────────────────────────────────────────────────────
describe("reglas de negocio de las asignaciones", () => {
  test("no se asigna con un rol que la compania no reconoce", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await expect(
      como(t, "adminX").mutation(api.asignaciones.crear, {
        contratoId: s.contratoXA,
        companiaMiembroId: s.mGuardaX,
        rol: "supervisor",
        vigenciaDesde: Date.now(),
      }),
    ).rejects.toThrow(/no tiene el rol "supervisor"/i);
  });

  test("no se solapan dos asignaciones en el mismo conjunto", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await expect(
      como(t, "adminX").mutation(api.asignaciones.crear, {
        contratoId: s.contratoXA,
        companiaMiembroId: s.mGuardaX,
        rol: "guardia",
        vigenciaDesde: Date.now(),
      }),
    ).rejects.toThrow(/se solapa/i);
  });

  test("el mismo guarda si puede cubrir dos conjuntos a la vez", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const id = await como(t, "adminX").mutation(api.asignaciones.crear, {
      contratoId: s.contratoXB,
      companiaMiembroId: s.mGuardaX,
      rol: "guardia",
      vigenciaDesde: Date.now(),
    });
    expect(id).toBeTruthy();
    const donde = await como(t, "guardaX").query(api.asignaciones.misAsignaciones, {});
    expect(donde.map((d) => d.condominioNombre).sort()).toEqual([
      "Conjunto A",
      "Conjunto B",
    ]);
  });

  test("la asignacion no puede durar mas que su contrato", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(s.contratoXB, { vigenciaHasta: Date.now() + DIA });
    });
    await expect(
      como(t, "adminX").mutation(api.asignaciones.crear, {
        contratoId: s.contratoXB,
        companiaMiembroId: s.mGuardaX,
        rol: "guardia",
        vigenciaDesde: Date.now(),
        vigenciaHasta: EN_UN_MES,
      }),
    ).rejects.toThrow(/no cabe dentro de la vigencia/i);
  });

  test("no se puede terminar una asignacion de otra compania", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    const asignacionId = await t.run(async (ctx) => {
      const filas = await ctx.db
        .query("asignaciones")
        .withIndex("by_user_condominio", (q) =>
          q.eq("userId", s.guardaX).eq("condominioId", s.condoA),
        )
        .collect();
      return filas[0]!._id;
    });
    await expect(
      como(t, "adminY").mutation(api.asignaciones.terminar, {
        asignacionId,
        vigenciaHasta: Date.now(),
      }),
    ).rejects.toThrow(/no pertenece a su compañía/i);
  });

  test("solo la plataforma firma contratos", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await expect(
      como(t, "adminX").mutation(api.companias.crearContrato, {
        companiaId: s.companiaX,
        condominioId: s.condoB,
        vigenciaDesde: Date.now(),
      }),
    ).rejects.toThrow(/rol de plataforma/i);
  });

  test("el historial dice donde estaba una persona en una fecha dada", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    // Se va de A y entra a B.
    await t.run(async (ctx) => {
      const filas = await ctx.db
        .query("asignaciones")
        .withIndex("by_user_condominio", (q) =>
          q.eq("userId", s.guardaX).eq("condominioId", s.condoA),
        )
        .collect();
      await ctx.db.patch(filas[0]!._id, { vigenciaHasta: AYER });
      await ctx.db.insert("asignaciones", {
        contratoId: s.contratoXB,
        companiaMiembroId: s.mGuardaX,
        userId: s.guardaX,
        condominioId: s.condoB,
        companiaId: s.companiaX,
        rol: "guardia",
        vigenciaDesde: Date.now(),
        creadoPorUserId: s.adminX,
        createdAt: Date.now(),
      });
    });

    const antes = await como(t, "adminX").query(api.asignaciones.historialDePersona, {
      userId: s.guardaX,
      en: HACE_UN_MES + DIA,
    });
    const ahora = await como(t, "adminX").query(api.asignaciones.historialDePersona, {
      userId: s.guardaX,
      en: Date.now(),
    });
    expect(antes.map((a) => a.condominioNombre)).toEqual(["Conjunto A"]);
    expect(ahora.map((a) => a.condominioNombre)).toEqual(["Conjunto B"]);
  });

  test("el admin de otra compania no ve el historial de una persona ajena", async () => {
    const t = convexTest(schema, modules);
    const s = await escenario(t);
    await expect(
      como(t, "adminY").query(api.asignaciones.historialDePersona, {
        userId: s.guardaX,
      }),
    ).rejects.toThrow(/no tiene acceso al historial/i);
  });
});
