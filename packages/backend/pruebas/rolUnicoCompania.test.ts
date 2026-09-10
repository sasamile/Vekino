import { test, expect, describe, beforeEach } from "vitest";
import { convexTest } from "convex-test";
import betterAuthTest from "@convex-dev/better-auth/test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const modules = import.meta.glob("../convex/**/*.ts");

/**
 * UN USUARIO DE COMPANIA = UN UNICO ROL DE COMPANIA.
 *
 * El sintoma era de ruteo: tras el login, alguien con GUARDA y SUPERVISOR a
 * la vez no tenia un destino inequivoco, y el sistema desempataba por el
 * orden en que el shell comprobaba las ramas. La causa estaba en el modelo,
 * que permitia el estado.
 *
 * Estas pruebas fijan la regla donde tiene que estar —el backend— y por los
 * CINCO caminos que escriben `companiaMiembros.roles`. No basta con que la
 * pantalla mande uno solo: lo que se prueba aqui es que una peticion
 * fabricada a mano tampoco puede dejar a nadie con dos.
 *
 * OJO con el alcance: esto es el eje de VIGILANCIA. `memberships.roles` sigue
 * siendo multi-rol a proposito (alguien es propietario Y junta directiva), y
 * la ultima prueba del archivo lo deja fijado para que nadie extienda la
 * regla por error.
 */

const DIA = 24 * 60 * 60 * 1000;
const CLAVE = "clave-de-prueba-1";

type Escenario = Awaited<ReturnType<typeof montar>>;

/** Una compania con contrato vigente sobre un conjunto, y nada mas. */
async function montar() {
  const t = convexTest(schema, modules);
  betterAuthTest.register(t);

  const ahora = Date.now();
  const desde = ahora - 30 * DIA;

  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      name: "Super",
      email: "super@vekino.test",
      emailVerified: true,
      active: true,
      authId: "super",
      platformRole: "superadmin",
      createdAt: ahora,
      updatedAt: ahora,
    });
  });
  const plataforma = t.withIdentity({ subject: "super" });

  const condominioId = await plataforma.mutation(api.condominios.create, {
    name: "Conjunto Norte",
  });

  const andina = await plataforma.action(api.companias.registrar, {
    nombre: "Seguridad Andina",
    adminName: "Alicia Admin",
    adminEmail: "alicia@andina.test",
    adminPassword: CLAVE,
  });

  const contratoId = await plataforma.mutation(api.companias.crearContrato, {
    companiaId: andina.companiaId,
    condominioId,
    vigenciaDesde: desde,
  });

  const authIdDe = async (email: string) =>
    await t.run(async (ctx) => {
      const u = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();
      return u!.authId!;
    });

  /* La administradora de la compania: el otro perfil que puede gestionar
   * roles, y el que la regla no debe dejar fuera. */
  const alicia = t.withIdentity({ subject: await authIdDe("alicia@andina.test") });

  return {
    t,
    plataforma,
    alicia,
    companiaId: andina.companiaId,
    adminMiembroId: andina.miembroId,
    condominioId,
    contratoId,
    desde,
    authIdDe,
  };
}

/** Los roles que tiene hoy una fila de `companiaMiembros`. */
async function rolesDe(e: Escenario, miembroId: Id<"companiaMiembros">) {
  return await e.t.run(async (ctx) => (await ctx.db.get(miembroId))!.roles);
}

/** Alta de personal por el camino normal (action + credencial). */
async function darDeAlta(
  e: Escenario,
  email: string,
  roles: ("admin_compania" | "supervisor" | "guardia")[],
) {
  return await e.plataforma.action(api.companias.crearMiembro, {
    companiaId: e.companiaId,
    email,
    name: `Persona ${email}`,
    password: CLAVE,
    roles,
  });
}

describe("un rol por persona: el caso valido", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("1. dar de alta con un solo rol funciona", async () => {
    const g = await darDeAlta(e, "gabriel@andina.test", ["guardia"]);
    expect(await rolesDe(e, g.miembroId)).toEqual(["guardia"]);
  });

  test("2. la compania nace con su administradora, y con un solo rol", async () => {
    expect(await rolesDe(e, e.adminMiembroId)).toEqual(["admin_compania"]);
  });
});

describe("cambiar de rol REEMPLAZA, no acumula", () => {
  let e: Escenario;
  let miembroId: Id<"companiaMiembros">;
  beforeEach(async () => {
    e = await montar();
    miembroId = (await darDeAlta(e, "gabriel@andina.test", ["guardia"]))
      .miembroId;
  });

  test("3. GUARDA -> SUPERVISOR deja SUPERVISOR, y no conserva GUARDA", async () => {
    await e.plataforma.mutation(api.companias.setRolesMiembro, {
      miembroId,
      roles: ["supervisor"],
    });

    const roles = await rolesDe(e, miembroId);
    expect(roles).toEqual(["supervisor"]);
    expect(roles).not.toContain("guardia");
  });

  test("4. tambien lo puede hacer la administradora de la compania", async () => {
    await e.alicia.mutation(api.companias.setRolesMiembro, {
      miembroId,
      roles: ["supervisor"],
    });
    expect(await rolesDe(e, miembroId)).toEqual(["supervisor"]);
  });

  test("5. encadenar cambios nunca acumula", async () => {
    for (const rol of ["supervisor", "admin_compania", "guardia"] as const) {
      await e.plataforma.mutation(api.companias.setRolesMiembro, {
        miembroId,
        roles: [rol],
      });
      expect(await rolesDe(e, miembroId)).toHaveLength(1);
    }
    expect(await rolesDe(e, miembroId)).toEqual(["guardia"]);
  });

  test("6. el cambio deja rastro: rol anterior, cuando y quien", async () => {
    const antes = Date.now();
    await e.alicia.mutation(api.companias.setRolesMiembro, {
      miembroId,
      roles: ["supervisor"],
    });

    const { miembro, alicia } = await e.t.run(async (ctx) => {
      const miembro = (await ctx.db.get(miembroId))!;
      const alicia = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "alicia@andina.test"))
        .unique();
      return { miembro, alicia };
    });

    expect(miembro.rolAnterior).toBe("guardia");
    expect(miembro.roles).toEqual(["supervisor"]);
    expect(miembro.rolCambiadoEn).toBeGreaterThanOrEqual(antes);
    expect(miembro.rolCambiadoPorUserId).toBe(alicia!._id);
    expect(miembro.companiaId).toBe(e.companiaId);
  });

  test("7bis. cambiar el rol no le borra el cargo a la persona", async () => {
    await e.plataforma.mutation(api.companias.setRolesMiembro, {
      miembroId,
      roles: ["guardia"],
      cargo: "Guarda zona norte",
    });

    /* La pantalla cambia el rol SIN mandar el cargo: son dos acciones
     * distintas y el formulario de edición vive aparte. */
    await e.plataforma.mutation(api.companias.setRolesMiembro, {
      miembroId,
      roles: ["supervisor"],
    });

    const miembro = await e.t.run(async (ctx) => (await ctx.db.get(miembroId))!);
    expect(miembro.roles).toEqual(["supervisor"]);
    expect(miembro.cargo).toBe("Guarda zona norte");
  });

  test("7. editar solo el cargo no finge un cambio de rol", async () => {
    await e.plataforma.mutation(api.companias.setRolesMiembro, {
      miembroId,
      roles: ["guardia"],
      cargo: "Guarda turno noche",
    });
    const miembro = await e.t.run(async (ctx) => (await ctx.db.get(miembroId))!);
    expect(miembro.cargo).toBe("Guarda turno noche");
    expect(miembro.rolCambiadoEn).toBeUndefined();
    expect(miembro.rolAnterior).toBeUndefined();
  });
});

describe("intentar dos roles a la vez: rechazado en el backend", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("8. crearMiembro con [GUARDA, SUPERVISOR] falla y no crea nada", async () => {
    await expect(
      darDeAlta(e, "doble@andina.test", ["guardia", "supervisor"]),
    ).rejects.toThrow(/un rol/i);

    /* Y no deja restos: ni miembro, ni perfil a medias. */
    const rastro = await e.t.run(async (ctx) => {
      const u = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "doble@andina.test"))
        .unique();
      if (!u) return { user: false, miembros: 0 };
      const miembros = await ctx.db
        .query("companiaMiembros")
        .withIndex("by_user", (q) => q.eq("userId", u._id))
        .collect();
      return { user: true, miembros: miembros.length };
    });
    expect(rastro).toEqual({ user: false, miembros: 0 });
  });

  test("9. upsertMiembroProfile con dos roles falla (la puerta que toca la base)", async () => {
    await expect(
      e.plataforma.mutation(api.companias.upsertMiembroProfile, {
        companiaId: e.companiaId,
        email: "doble2@andina.test",
        name: "Doble",
        roles: ["guardia", "supervisor"],
      }),
    ).rejects.toThrow(/un rol/i);
  });

  test("10. setRolesMiembro con dos roles falla y deja el rol anterior intacto", async () => {
    const { miembroId } = await darDeAlta(e, "gabriel@andina.test", [
      "guardia",
    ]);

    await expect(
      e.plataforma.mutation(api.companias.setRolesMiembro, {
        miembroId,
        roles: ["guardia", "supervisor"],
      }),
    ).rejects.toThrow(/un rol/i);

    expect(await rolesDe(e, miembroId)).toEqual(["guardia"]);
  });

  test("11. la administradora de la compania tampoco puede", async () => {
    const { miembroId } = await darDeAlta(e, "gabriel@andina.test", [
      "guardia",
    ]);
    await expect(
      e.alicia.mutation(api.companias.setRolesMiembro, {
        miembroId,
        roles: ["guardia", "supervisor"],
      }),
    ).rejects.toThrow(/un rol/i);
    expect(await rolesDe(e, miembroId)).toEqual(["guardia"]);
  });

  test("12. la lista vacia sigue rechazandose", async () => {
    const { miembroId } = await darDeAlta(e, "gabriel@andina.test", [
      "guardia",
    ]);
    await expect(
      e.plataforma.mutation(api.companias.setRolesMiembro, {
        miembroId,
        roles: [],
      }),
    ).rejects.toThrow();
    expect(await rolesDe(e, miembroId)).toEqual(["guardia"]);
  });

  test("13. volver a dar de alta a alguien reemplaza su rol, no lo suma", async () => {
    const primera = await darDeAlta(e, "gabriel@andina.test", ["guardia"]);
    await e.plataforma.mutation(api.companias.desactivarMiembro, {
      miembroId: primera.miembroId,
    });

    const segunda = await darDeAlta(e, "gabriel@andina.test", ["supervisor"]);
    expect(segunda.miembroId).toBe(primera.miembroId);
    expect(await rolesDe(e, primera.miembroId)).toEqual(["supervisor"]);
  });
});

describe("la autorizacion no se relaja", () => {
  let e: Escenario;
  let miembroId: Id<"companiaMiembros">;
  beforeEach(async () => {
    e = await montar();
    miembroId = (await darDeAlta(e, "gabriel@andina.test", ["guardia"]))
      .miembroId;
  });

  test("14. un guarda no puede cambiarse el rol a si mismo", async () => {
    const guarda = e.t.withIdentity({
      subject: await e.authIdDe("gabriel@andina.test"),
    });
    await expect(
      guarda.mutation(api.companias.setRolesMiembro, {
        miembroId,
        roles: ["admin_compania"],
      }),
    ).rejects.toThrow(/permiso/i);
    expect(await rolesDe(e, miembroId)).toEqual(["guardia"]);
  });

  test("15. la administradora de OTRA compania no alcanza a esta persona", async () => {
    const rival = await e.plataforma.action(api.companias.registrar, {
      nombre: "Seguridad Rival",
      adminName: "Ramon Admin",
      adminEmail: "ramon@rival.test",
      adminPassword: CLAVE,
    });
    expect(rival.companiaId).not.toBe(e.companiaId);

    const ramon = e.t.withIdentity({
      subject: await e.authIdDe("ramon@rival.test"),
    });
    await expect(
      ramon.mutation(api.companias.setRolesMiembro, {
        miembroId,
        roles: ["supervisor"],
      }),
    ).rejects.toThrow(/compania|compañía/i);
    expect(await rolesDe(e, miembroId)).toEqual(["guardia"]);
  });

  test("16. quitarle el rol con el que esta asignado sigue rechazandose", async () => {
    await e.plataforma.mutation(api.asignaciones.crear, {
      contratoId: e.contratoId,
      companiaMiembroId: miembroId,
      rol: "guardia",
      vigenciaDesde: e.desde,
    });

    await expect(
      e.plataforma.mutation(api.companias.setRolesMiembro, {
        miembroId,
        roles: ["supervisor"],
      }),
    ).rejects.toThrow(/asignaci/i);
    expect(await rolesDe(e, miembroId)).toEqual(["guardia"]);
  });
});

describe("tras el login hay un unico rol, y un unico destino", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  /** Lo que `dashboard-shell` lee para decidir a donde lleva a alguien. */
  async function sesionDe(email: string) {
    const quien = e.t.withIdentity({ subject: await e.authIdDe(email) });
    return await quien.query(api.users.me, {});
  }

  test("17. la administradora: un rol, sin membresias ni asignaciones", async () => {
    const me = await sesionDe("alicia@andina.test");
    expect(me!.compania?.roles).toEqual(["admin_compania"]);
    expect(me!.memberships).toHaveLength(0);
    expect(me!.asignaciones).toHaveLength(0);
  });

  test("18. el guarda asignado: un rol de compania y un solo conjunto", async () => {
    const { miembroId } = await darDeAlta(e, "gabriel@andina.test", [
      "guardia",
    ]);
    await e.plataforma.mutation(api.asignaciones.crear, {
      contratoId: e.contratoId,
      companiaMiembroId: miembroId,
      rol: "guardia",
      vigenciaDesde: e.desde,
    });

    const me = await sesionDe("gabriel@andina.test");
    expect(me!.compania?.roles).toEqual(["guardia"]);
    expect(me!.asignaciones).toHaveLength(1);
    expect(me!.asignaciones[0]!.rol).toBe("guardia");
  });

  test("19. cambiar el rol cambia el destino, sin dejar el anterior detras", async () => {
    const { miembroId } = await darDeAlta(e, "sofia@andina.test", ["guardia"]);
    expect((await sesionDe("sofia@andina.test"))!.compania?.roles).toEqual([
      "guardia",
    ]);

    await e.alicia.mutation(api.companias.setRolesMiembro, {
      miembroId,
      roles: ["supervisor"],
    });

    const me = await sesionDe("sofia@andina.test");
    expect(me!.compania?.roles).toEqual(["supervisor"]);
  });

  test("20. el rol de compania de cualquier persona es siempre uno solo", async () => {
    await darDeAlta(e, "gabriel@andina.test", ["guardia"]);
    await darDeAlta(e, "sofia@andina.test", ["supervisor"]);

    for (const email of [
      "alicia@andina.test",
      "gabriel@andina.test",
      "sofia@andina.test",
    ]) {
      const me = await sesionDe(email);
      expect(me!.compania?.roles).toHaveLength(1);
    }
  });
});

describe("normalizacion de los datos que ya existen", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  /** Escribe una fila multi-rol saltandose la API, como las que ya existan. */
  async function ensuciar(
    miembroId: Id<"companiaMiembros">,
    roles: ("admin_compania" | "supervisor" | "guardia")[],
  ) {
    await e.t.run(async (ctx) => {
      await ctx.db.patch(miembroId, { roles });
    });
  }

  test("21. sobre datos ya limpios es un no-op que solo cuenta", async () => {
    await darDeAlta(e, "gabriel@andina.test", ["guardia"]);
    const r = await e.t.mutation(
      internal.migrations.normalizarRolesCompania,
      {},
    );
    expect(r.conVariosRoles).toBe(0);
    expect(r.normalizados).toHaveLength(0);
    expect(r.ambiguos).toHaveLength(0);
  });

  test("22. `simular` informa sin escribir nada", async () => {
    const { miembroId } = await darDeAlta(e, "gabriel@andina.test", [
      "guardia",
    ]);
    await ensuciar(miembroId, ["guardia", "supervisor"]);

    const r = await e.t.mutation(internal.migrations.normalizarRolesCompania, {
      simular: true,
    });
    expect(r.simulado).toBe(true);
    expect(r.normalizados).toHaveLength(1);
    expect(await rolesDe(e, miembroId)).toEqual(["guardia", "supervisor"]);
  });

  test("23. sin asignaciones manda la jerarquia: admin > supervisor > guarda", async () => {
    const { miembroId } = await darDeAlta(e, "gabriel@andina.test", [
      "guardia",
    ]);
    await ensuciar(miembroId, ["guardia", "supervisor"]);

    const r = await e.t.mutation(
      internal.migrations.normalizarRolesCompania,
      {},
    );
    expect(r.normalizados[0]!.porque).toBe("jerarquia");
    expect(await rolesDe(e, miembroId)).toEqual(["supervisor"]);
  });

  test("24. con asignacion vigente manda la asignacion, no la jerarquia", async () => {
    const { miembroId } = await darDeAlta(e, "gabriel@andina.test", [
      "guardia",
    ]);
    await e.plataforma.mutation(api.asignaciones.crear, {
      contratoId: e.contratoId,
      companiaMiembroId: miembroId,
      rol: "guardia",
      vigenciaDesde: e.desde,
    });
    await ensuciar(miembroId, ["guardia", "supervisor"]);

    const r = await e.t.mutation(
      internal.migrations.normalizarRolesCompania,
      {},
    );
    expect(r.normalizados[0]!.porque).toBe("asignacion_vigente");
    /* Conservar "guardia" es lo que evita que se quede fuera de su porteria a
     * mitad de turno, aunque la jerarquia prefiriera "supervisor". */
    expect(await rolesDe(e, miembroId)).toEqual(["guardia"]);
  });

  test("25. cubrir dos roles a la vez es ambiguo: se reporta y NO se toca", async () => {
    const { miembroId } = await darDeAlta(e, "sofia@andina.test", ["guardia"]);
    await e.plataforma.mutation(api.asignaciones.crear, {
      contratoId: e.contratoId,
      companiaMiembroId: miembroId,
      rol: "guardia",
      vigenciaDesde: e.desde,
    });
    await ensuciar(miembroId, ["guardia", "supervisor"]);
    /* Segunda asignacion, con el otro rol, en otro conjunto de la misma
     * compania: es el caso que ninguna regla automatica puede decidir. */
    const otro = await e.plataforma.mutation(api.condominios.create, {
      name: "Conjunto Sur",
    });
    const contratoSur = await e.plataforma.mutation(
      api.companias.crearContrato,
      {
        companiaId: e.companiaId,
        condominioId: otro,
        vigenciaDesde: e.desde,
      },
    );
    await e.plataforma.mutation(api.asignaciones.crear, {
      contratoId: contratoSur,
      companiaMiembroId: miembroId,
      rol: "supervisor",
      vigenciaDesde: e.desde,
    });

    const r = await e.t.mutation(
      internal.migrations.normalizarRolesCompania,
      {},
    );
    expect(r.normalizados).toHaveLength(0);
    expect(r.ambiguos).toHaveLength(1);
    expect(r.ambiguos[0]!.rolesAsignadosVigentes.sort()).toEqual([
      "guardia",
      "supervisor",
    ]);
    expect(await rolesDe(e, miembroId)).toEqual(["guardia", "supervisor"]);
  });

  test("26. una decision manual resuelve el ambiguo, si es coherente", async () => {
    const { miembroId } = await darDeAlta(e, "gabriel@andina.test", [
      "guardia",
    ]);
    await ensuciar(miembroId, ["guardia", "supervisor"]);

    const r = await e.t.mutation(internal.migrations.normalizarRolesCompania, {
      decisiones: [{ miembroId, rol: "guardia" }],
    });
    expect(r.normalizados[0]!.porque).toBe("decision_manual");
    expect(await rolesDe(e, miembroId)).toEqual(["guardia"]);
  });

  test("27. una decision manual incoherente se rechaza, no se aplica", async () => {
    const { miembroId } = await darDeAlta(e, "gabriel@andina.test", [
      "guardia",
    ]);
    await e.plataforma.mutation(api.asignaciones.crear, {
      contratoId: e.contratoId,
      companiaMiembroId: miembroId,
      rol: "guardia",
      vigenciaDesde: e.desde,
    });
    await ensuciar(miembroId, ["guardia", "supervisor"]);

    const r = await e.t.mutation(internal.migrations.normalizarRolesCompania, {
      decisiones: [{ miembroId, rol: "supervisor" }],
    });
    expect(r.normalizados).toHaveLength(0);
    expect(r.ambiguos).toHaveLength(1);
    expect(await rolesDe(e, miembroId)).toEqual(["guardia", "supervisor"]);
  });

  test("28. es idempotente: la segunda pasada no encuentra nada", async () => {
    const { miembroId } = await darDeAlta(e, "gabriel@andina.test", [
      "guardia",
    ]);
    await ensuciar(miembroId, ["guardia", "supervisor"]);

    await e.t.mutation(internal.migrations.normalizarRolesCompania, {});
    const segunda = await e.t.mutation(
      internal.migrations.normalizarRolesCompania,
      {},
    );
    expect(segunda.conVariosRoles).toBe(0);
  });

  test("29. no finge un cambio de rol hecho por alguien: el informe es el registro", async () => {
    const { miembroId } = await darDeAlta(e, "gabriel@andina.test", [
      "guardia",
    ]);
    await ensuciar(miembroId, ["guardia", "supervisor"]);
    const r = await e.t.mutation(
      internal.migrations.normalizarRolesCompania,
      {},
    );

    /* Lo que pasó consta en la salida, con el antes, el después y el porqué. */
    expect(r.normalizados[0]).toMatchObject({
      antes: ["guardia", "supervisor"],
      despues: "supervisor",
      porque: "jerarquia",
      email: "gabriel@andina.test",
    });

    /* Y NO en los campos de auditoría de la fila: esos dicen "fulano le
     * cambió el rol a mengano", y aquí no hubo ningún fulano. Además
     * `rolAnterior` es un rol y la fila tenía dos, así que cualquier valor que
     * pusiera seria mentira a medias. */
    const miembro = await e.t.run(async (ctx) => (await ctx.db.get(miembroId))!);
    expect(miembro.roles).toEqual(["supervisor"]);
    expect(miembro.rolAnterior).toBeUndefined();
    expect(miembro.rolCambiadoEn).toBeUndefined();
    expect(miembro.rolCambiadoPorUserId).toBeUndefined();
  });
});

describe("el eje residencial no se toca", () => {
  test("30. una membresia de conjunto sigue admitiendo varios roles", async () => {
    const e = await montar();

    /* Propietario Y junta directiva a la vez es un caso legitimo del eje
     * residencial. Si esta prueba falla, la regla de rol unico se ha
     * extendido a `memberships`, que no es lo que se pidio. */
    await e.plataforma.action(api.users.createCondoMember, {
      condominioId: e.condominioId,
      email: "vecina@norte.test",
      name: "Vecina Propietaria",
      password: CLAVE,
      roles: ["propietario", "junta_directiva"],
    });

    const roles = await e.t.run(async (ctx) => {
      const u = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "vecina@norte.test"))
        .unique();
      const m = await ctx.db
        .query("memberships")
        .withIndex("by_user", (q) => q.eq("userId", u!._id))
        .unique();
      return m!.roles;
    });
    expect(roles.sort()).toEqual(["junta_directiva", "propietario"]);
  });
});
