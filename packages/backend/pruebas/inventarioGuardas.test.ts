import { test, expect, describe, beforeEach } from "vitest";
import { convexTest } from "convex-test";
import betterAuthTest from "@convex-dev/better-auth/test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const modules = import.meta.glob("../convex/**/*.ts");

/**
 * LA CUSTODIA INTERNA: el supervisor reparte el material del conjunto.
 *
 * El nivel de abajo de la cadena, y por eso lo que mas se prueba aqui no es
 * la operacion feliz sino los eslabones:
 *
 *     compania -> elemento -> conjunto -> supervisor -> guarda
 *
 * Dos companias que cubren EL MISMO conjunto, cada una con su supervisor, su
 * guarda y su material. Es el escenario donde `asignacionVigente` dice "si,
 * esta persona esta asignada aqui" siendo de la empresa equivocada, y donde
 * una comprobacion de compania que falte deja pasar material ajeno.
 */

const CLAVE = "clave-de-prueba-1";
const DIA = 24 * 60 * 60 * 1000;

type Escenario = Awaited<ReturnType<typeof montar>>;

async function montar() {
  const t = convexTest(schema, modules);
  betterAuthTest.register(t);

  const ahora = Date.now();
  const desde = ahora - 30 * DIA;

  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      name: "Super Admin",
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

  const condo = (name: string) =>
    plataforma.mutation(api.condominios.create, { name });
  /* Norte lo cubren LAS DOS empresas. Sur solo Andina. Oriente solo Rival. */
  const norte = await condo("Conjunto Norte");
  const sur = await condo("Conjunto Sur");
  const oriente = await condo("Conjunto Oriente");

  const andina = await plataforma.action(api.companias.registrar, {
    nombre: "Seguridad Andina",
    adminName: "Alicia Admin",
    adminEmail: "alicia@andina.test",
    adminPassword: CLAVE,
  });
  const rival = await plataforma.action(api.companias.registrar, {
    nombre: "Seguridad Rival",
    adminName: "Ramon Admin",
    adminEmail: "ramon@rival.test",
    adminPassword: CLAVE,
  });

  const contrato = (
    companiaId: Id<"companiasSeguridad">,
    condominioId: Id<"condominios">,
  ) =>
    plataforma.mutation(api.companias.crearContrato, {
      companiaId,
      condominioId,
      vigenciaDesde: desde,
    });
  const kAndinaNorte = await contrato(andina.companiaId, norte);
  const kAndinaSur = await contrato(andina.companiaId, sur);
  const kRivalNorte = await contrato(rival.companiaId, norte);
  const kRivalOriente = await contrato(rival.companiaId, oriente);

  const miembro = (
    companiaId: Id<"companiasSeguridad">,
    email: string,
    name: string,
    rol: "supervisor" | "guardia",
  ) =>
    plataforma.action(api.companias.crearMiembro, {
      companiaId,
      email,
      name,
      password: CLAVE,
      roles: [rol],
    });

  // Andina: supervisora Sofia y guardas Gabriel (Norte) y Gerardo (Sur).
  const sofia = await miembro(
    andina.companiaId,
    "sofia@andina.test",
    "Sofia Supervisora",
    "supervisor",
  );
  const gabriel = await miembro(
    andina.companiaId,
    "gabriel@andina.test",
    "Gabriel Guarda",
    "guardia",
  );
  const gerardo = await miembro(
    andina.companiaId,
    "gerardo@andina.test",
    "Gerardo Guarda Sur",
    "guardia",
  );
  // Rival: supervisor Rodrigo y guarda Raul, los dos tambien en Norte.
  const rodrigo = await miembro(
    rival.companiaId,
    "rodrigo@rival.test",
    "Rodrigo Supervisor Rival",
    "supervisor",
  );
  const raul = await miembro(
    rival.companiaId,
    "raul@rival.test",
    "Raul Guarda Rival",
    "guardia",
  );

  const asignar = (
    contratoId: Id<"companiaContratos">,
    miembroId: Id<"companiaMiembros">,
    rol: "supervisor" | "guardia",
  ) =>
    plataforma.mutation(api.asignaciones.crear, {
      contratoId,
      companiaMiembroId: miembroId,
      rol,
      vigenciaDesde: desde,
    });

  await asignar(kAndinaNorte, sofia.miembroId, "supervisor");
  await asignar(kAndinaSur, sofia.miembroId, "supervisor");
  await asignar(kAndinaNorte, gabriel.miembroId, "guardia");
  await asignar(kAndinaSur, gerardo.miembroId, "guardia");
  await asignar(kRivalNorte, rodrigo.miembroId, "supervisor");
  await asignar(kRivalOriente, rodrigo.miembroId, "supervisor");
  await asignar(kRivalNorte, raul.miembroId, "guardia");

  await plataforma.action(api.users.createCondoMember, {
    condominioId: norte,
    email: "hernan@norte.test",
    name: "Hernan Admin Conjunto",
    password: CLAVE,
    roles: ["administrador"],
  });

  const authIds = await t.run(async (ctx) => {
    const por = async (email: string) => {
      const u = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();
      return u!.authId!;
    };
    return {
      alicia: await por("alicia@andina.test"),
      ramon: await por("ramon@rival.test"),
      sofia: await por("sofia@andina.test"),
      gabriel: await por("gabriel@andina.test"),
      gerardo: await por("gerardo@andina.test"),
      rodrigo: await por("rodrigo@rival.test"),
      raul: await por("raul@rival.test"),
      hernan: await por("hernan@norte.test"),
    };
  });

  const userIds = await t.run(async (ctx) => {
    const por = async (email: string) => {
      const u = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();
      return u!._id;
    };
    return {
      gabriel: await por("gabriel@andina.test"),
      gerardo: await por("gerardo@andina.test"),
      raul: await por("raul@rival.test"),
      sofia: await por("sofia@andina.test"),
      hernan: await por("hernan@norte.test"),
    };
  });

  return {
    t,
    plataforma,
    norte,
    sur,
    oriente,
    andina: andina.companiaId,
    rival: rival.companiaId,
    miembros: { gabriel, gerardo, raul },
    userIds,
    como: (quien: keyof typeof authIds) =>
      t.withIdentity({ subject: authIds[quien] }),
    anonimo: t,
  };
}

/** Un elemento de Andina ya entregado al conjunto indicado. */
async function itemEnConjunto(
  e: Escenario,
  condominioId: Id<"condominios">,
  nombre = "Radio Motorola",
): Promise<Id<"inventarioItems">> {
  const itemId = await e
    .como("alicia")
    .mutation(api.inventario.crear, { companiaId: e.andina, nombre });
  await e
    .como("alicia")
    .mutation(api.inventarioAsignaciones.asignar, { itemId, condominioId });
  return itemId;
}

/** Un elemento de Rival entregado a Norte, que las dos empresas cubren. */
async function itemDeRivalEnNorte(
  e: Escenario,
  nombre = "Radio de Rival",
): Promise<Id<"inventarioItems">> {
  const itemId = await e
    .como("ramon")
    .mutation(api.inventario.crear, { companiaId: e.rival, nombre });
  await e
    .como("ramon")
    .mutation(api.inventarioAsignaciones.asignar, {
      itemId,
      condominioId: e.norte,
    });
  return itemId;
}

async function falla(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error("se esperaba un error y no hubo ninguno");
}

// ─────────────────────────────────────────────────────────────

describe("entregar un elemento a un guarda", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("el supervisor lo entrega y queda registrado quien, a quien y cuando", async () => {
    const item = await itemEnConjunto(e, e.norte);
    const antes = Date.now();

    await e.como("sofia").mutation(api.inventarioGuardas.entregar, {
      itemId: item,
      guardaUserId: e.userIds.gabriel,
      observacion: "Turno de noche",
    });

    const { items } = await e
      .como("sofia")
      .query(api.inventarioGuardas.itemsDelCondominio, {
        condominioId: e.norte,
      });

    expect(items).toHaveLength(1);
    const custodia = items[0]!.custodia!;
    expect(custodia.guardaNombre).toBe("Gabriel Guarda");
    expect(custodia.entregadaPorNombre).toBe("Sofia Supervisora");
    expect(custodia.observacionEntrega).toBe("Turno de noche");
    expect(custodia.entregadaEn).toBeGreaterThanOrEqual(antes);
    expect(custodia.activa).toBe(true);
    expect(custodia.pendiente).toBe(false);
  });

  test("el elemento SIGUE asignado al conjunto mientras el guarda lo tiene", async () => {
    /* La custodia del guarda esta ANIDADA, no sustituye a la del conjunto. */
    const item = await itemEnConjunto(e, e.norte);
    await e.como("sofia").mutation(api.inventarioGuardas.entregar, {
      itemId: item,
      guardaUserId: e.userIds.gabriel,
    });

    const { asignacionActiva } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: item });
    expect(asignacionActiva).not.toBeNull();
    expect(asignacionActiva!.condominioNombre).toBe("Conjunto Norte");
  });

  test("la custodia NO toca el estado fisico del elemento", async () => {
    const item = await itemEnConjunto(e, e.norte);
    await e.como("sofia").mutation(api.inventarioGuardas.entregar, {
      itemId: item,
      guardaUserId: e.userIds.gabriel,
    });
    const { item: doc } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: item });
    expect(doc.estado).toBe("disponible");
  });

  test("el desplegable solo ofrece guardas vigentes de la propia compania", async () => {
    /* Raul esta asignado a Norte, pero es de Rival. */
    const guardas = await e
      .como("sofia")
      .query(api.inventarioGuardas.guardasDisponibles, {
        condominioId: e.norte,
      });
    expect(guardas.map((g) => g.nombre)).toEqual(["Gabriel Guarda"]);
  });

  test("el listado del conjunto distingue lo repartido de lo que esta libre", async () => {
    const conGuarda = await itemEnConjunto(e, e.norte, "Radio repartido");
    await itemEnConjunto(e, e.norte, "Radio en la caseta");
    await e.como("sofia").mutation(api.inventarioGuardas.entregar, {
      itemId: conGuarda,
      guardaUserId: e.userIds.gabriel,
    });

    const { items } = await e
      .como("sofia")
      .query(api.inventarioGuardas.itemsDelCondominio, {
        condominioId: e.norte,
      });
    const repartido = items.find((i) => i.nombre === "Radio repartido")!;
    const libre = items.find((i) => i.nombre === "Radio en la caseta")!;
    expect(repartido.custodia?.guardaNombre).toBe("Gabriel Guarda");
    expect(libre.custodia).toBeNull();
  });
});

describe("una sola custodia de guarda por elemento", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("no se entrega a un segundo guarda mientras el primero lo tenga", async () => {
    /* Se necesita otro guarda vigente en Norte, de Andina. */
    const otro = await e.plataforma.action(api.companias.crearMiembro, {
      companiaId: e.andina,
      email: "pedro@andina.test",
      name: "Pedro Guarda",
      password: CLAVE,
      roles: ["guardia"],
    });
    const { contratos } = await e.plataforma.query(api.companias.detail, {
      companiaId: e.andina,
    });
    await e.plataforma.mutation(api.asignaciones.crear, {
      contratoId: contratos.find((k) => k.condominioId === e.norte)!._id,
      companiaMiembroId: otro.miembroId,
      rol: "guardia",
      vigenciaDesde: Date.now() - DIA,
    });
    const pedroId = await e.t.run(async (ctx) => {
      const u = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "pedro@andina.test"))
        .unique();
      return u!._id;
    });

    const item = await itemEnConjunto(e, e.norte);
    await e.como("sofia").mutation(api.inventarioGuardas.entregar, {
      itemId: item,
      guardaUserId: e.userIds.gabriel,
    });

    const msg = await falla(() =>
      e.como("sofia").mutation(api.inventarioGuardas.entregar, {
        itemId: item,
        guardaUserId: pedroId,
      }),
    );
    expect(msg).toContain("Gabriel");
    expect(msg).toContain("devolución antes");
  });

  test("el doble submit al MISMO guarda tampoco duplica", async () => {
    const item = await itemEnConjunto(e, e.norte);
    const entregar = () =>
      e.como("sofia").mutation(api.inventarioGuardas.entregar, {
        itemId: item,
        guardaUserId: e.userIds.gabriel,
      });
    await entregar();
    expect(await falla(entregar)).toContain("ya tiene este elemento");

    const historial = await e
      .como("sofia")
      .query(api.inventarioGuardas.historialDeItem, { itemId: item });
    expect(historial).toHaveLength(1);
  });

  test("tras la devolucion vuelve a estar libre DENTRO del conjunto", async () => {
    const item = await itemEnConjunto(e, e.norte);
    await e.como("sofia").mutation(api.inventarioGuardas.entregar, {
      itemId: item,
      guardaUserId: e.userIds.gabriel,
    });
    await e
      .como("sofia")
      .mutation(api.inventarioGuardas.recibir, { itemId: item });

    /* Y se puede entregar otra vez, sin haber pasado por la compania. */
    await e.como("sofia").mutation(api.inventarioGuardas.entregar, {
      itemId: item,
      guardaUserId: e.userIds.gabriel,
    });

    const historial = await e
      .como("sofia")
      .query(api.inventarioGuardas.historialDeItem, { itemId: item });
    /* DOS filas: la anterior no se reescribio. */
    expect(historial).toHaveLength(2);
    expect(historial.filter((c) => c.activa)).toHaveLength(1);
    expect(historial[1]!.devueltaEn).toBeGreaterThan(0);
  });
});

describe("devolucion del guarda", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("cierra la custodia y registra quien la recibio", async () => {
    const item = await itemEnConjunto(e, e.norte);
    await e.como("sofia").mutation(api.inventarioGuardas.entregar, {
      itemId: item,
      guardaUserId: e.userIds.gabriel,
    });
    await e.como("sofia").mutation(api.inventarioGuardas.recibir, {
      itemId: item,
      observacion: "Vuelve sin novedad",
    });

    const historial = await e
      .como("sofia")
      .query(api.inventarioGuardas.historialDeItem, { itemId: item });
    expect(historial[0]!.activa).toBe(false);
    expect(historial[0]!.devueltaPorNombre).toBe("Sofia Supervisora");
    expect(historial[0]!.observacionDevolucion).toBe("Vuelve sin novedad");
    /* Lo de la entrega no se pisa al cerrar. */
    expect(historial[0]!.entregadaPorNombre).toBe("Sofia Supervisora");
  });

  test("la devolucion del guarda NO devuelve el elemento a la compania", async () => {
    const item = await itemEnConjunto(e, e.norte);
    await e.como("sofia").mutation(api.inventarioGuardas.entregar, {
      itemId: item,
      guardaUserId: e.userIds.gabriel,
    });
    await e
      .como("sofia")
      .mutation(api.inventarioGuardas.recibir, { itemId: item });

    const { asignacionActiva } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: item });
    expect(asignacionActiva).not.toBeNull();
    expect(asignacionActiva!.condominioNombre).toBe("Conjunto Norte");
  });

  test("recibir dos veces no reescribe nada", async () => {
    const item = await itemEnConjunto(e, e.norte);
    await e.como("sofia").mutation(api.inventarioGuardas.entregar, {
      itemId: item,
      guardaUserId: e.userIds.gabriel,
    });
    await e
      .como("sofia")
      .mutation(api.inventarioGuardas.recibir, { itemId: item });

    expect(
      await e
        .como("sofia")
        .mutation(api.inventarioGuardas.recibir, { itemId: item }),
    ).toEqual({ yaEstaba: true });

    const { historial } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: item });
    expect(
      historial.filter((h) => h.tipo === "ITEM_RETURNED_BY_GUARD"),
    ).toHaveLength(1);
  });

  test("recibir un elemento que nadie tiene no hace nada ni revienta", async () => {
    const item = await itemEnConjunto(e, e.norte);
    expect(
      await e
        .como("sofia")
        .mutation(api.inventarioGuardas.recibir, { itemId: item }),
    ).toEqual({ yaEstaba: true });
  });
});

describe("se acaba la asignacion laboral del guarda", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  /** Termina la asignacion de Gabriel a Norte. */
  async function terminarAGabriel() {
    const asignacionId = await e.t.run(async (ctx) => {
      const a = await ctx.db
        .query("asignaciones")
        .withIndex("by_user_condominio", (q) =>
          q.eq("userId", e.userIds.gabriel).eq("condominioId", e.norte),
        )
        .first();
      return a!._id;
    });
    await e.plataforma.mutation(api.asignaciones.terminar, { asignacionId });
  }

  test("la custodia NO se cierra sola: el radio sigue con el", async () => {
    /* La relacion laboral y la custodia fisica son cosas distintas, igual que
     * en la tarea 2 con el contrato. Cerrarla sola diria que el radio volvio
     * cuando nadie lo ha devuelto, y asi es como se pierde inventario. */
    const item = await itemEnConjunto(e, e.norte);
    await e.como("sofia").mutation(api.inventarioGuardas.entregar, {
      itemId: item,
      guardaUserId: e.userIds.gabriel,
    });

    await terminarAGabriel();

    const { items } = await e
      .como("sofia")
      .query(api.inventarioGuardas.itemsDelCondominio, {
        condominioId: e.norte,
      });
    expect(items[0]!.custodia).not.toBeNull();
    expect(items[0]!.custodia!.activa).toBe(true);
    expect(items[0]!.custodia!.guardaNombre).toBe("Gabriel Guarda");
  });

  test("queda SEÑALADA como pendiente de resolver", async () => {
    const item = await itemEnConjunto(e, e.norte);
    await e.como("sofia").mutation(api.inventarioGuardas.entregar, {
      itemId: item,
      guardaUserId: e.userIds.gabriel,
    });

    const antes = await e
      .como("sofia")
      .query(api.inventarioGuardas.itemsDelCondominio, {
        condominioId: e.norte,
      });
    expect(antes.items[0]!.custodia!.pendiente).toBe(false);
    expect(antes.pendientes).toBe(0);

    await terminarAGabriel();

    const despues = await e
      .como("sofia")
      .query(api.inventarioGuardas.itemsDelCondominio, {
        condominioId: e.norte,
      });
    expect(despues.items[0]!.custodia!.pendiente).toBe(true);
    expect(despues.pendientes).toBe(1);
  });

  test("ya no puede recibir material nuevo", async () => {
    await terminarAGabriel();
    const otro = await itemEnConjunto(e, e.norte, "Radio nuevo");

    expect(
      await falla(() =>
        e.como("sofia").mutation(api.inventarioGuardas.entregar, {
          itemId: otro,
          guardaUserId: e.userIds.gabriel,
        }),
      ),
    ).toContain("asignación vigente");
  });

  test("y desaparece del desplegable de guardas", async () => {
    await terminarAGabriel();
    expect(
      await e
        .como("sofia")
        .query(api.inventarioGuardas.guardasDisponibles, {
          condominioId: e.norte,
        }),
    ).toEqual([]);
  });

  test("pero SI se le puede recibir lo que todavia tiene", async () => {
    /* Si no, el pendiente quedaria abierto para siempre. */
    const item = await itemEnConjunto(e, e.norte);
    await e.como("sofia").mutation(api.inventarioGuardas.entregar, {
      itemId: item,
      guardaUserId: e.userIds.gabriel,
    });
    await terminarAGabriel();

    await e.como("sofia").mutation(api.inventarioGuardas.recibir, {
      itemId: item,
      observacion: "Lo devuelve al terminar su contrato",
    });

    const { items } = await e
      .como("sofia")
      .query(api.inventarioGuardas.itemsDelCondominio, {
        condominioId: e.norte,
      });
    expect(items[0]!.custodia).toBeNull();
  });
});

describe("proteccion de la devolucion al inventario (regresion tarea 2)", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("el conjunto NO devuelve a la compania lo que un guarda tiene", async () => {
    const item = await itemEnConjunto(e, e.norte);
    await e.como("sofia").mutation(api.inventarioGuardas.entregar, {
      itemId: item,
      guardaUserId: e.userIds.gabriel,
    });

    const msg = await falla(() =>
      e
        .como("alicia")
        .mutation(api.inventarioAsignaciones.devolver, { itemId: item }),
    );
    expect(msg).toContain("Gabriel");
    expect(msg).toContain("supervisor");

    /* Y sigue en el conjunto. */
    const { asignacionActiva } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: item });
    expect(asignacionActiva).not.toBeNull();
  });

  test("tras la devolucion del guarda SI se puede devolver a la compania", async () => {
    const item = await itemEnConjunto(e, e.norte);
    await e.como("sofia").mutation(api.inventarioGuardas.entregar, {
      itemId: item,
      guardaUserId: e.userIds.gabriel,
    });
    await e
      .como("sofia")
      .mutation(api.inventarioGuardas.recibir, { itemId: item });
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.devolver, { itemId: item });

    const { asignacionActiva, historial } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: item });
    expect(asignacionActiva).toBeNull();
    /* La historia completa, en un solo sitio y en orden. */
    expect(historial.map((h) => h.tipo)).toEqual([
      "ITEM_RETURNED_FROM_CONDOMINIUM",
      "ITEM_RETURNED_BY_GUARD",
      "ITEM_ASSIGNED_TO_GUARD",
      "ITEM_ASSIGNED_TO_CONDOMINIUM",
      "ITEM_CREATED",
    ]);
  });

  test("tampoco se archiva: la tarea 2 ya lo impedia y sigue igual", async () => {
    const item = await itemEnConjunto(e, e.norte);
    await e.como("sofia").mutation(api.inventarioGuardas.entregar, {
      itemId: item,
      guardaUserId: e.userIds.gabriel,
    });
    expect(
      await falla(() =>
        e.como("alicia").mutation(api.inventario.archivar, { itemId: item }),
      ),
    ).toContain("Conjunto Norte");
  });

  test("el administrador de compania VE quien tiene cada elemento", async () => {
    /* Conserva la consulta aunque no pueda repartir: es su patrimonio. */
    const item = await itemEnConjunto(e, e.norte);
    await e.como("sofia").mutation(api.inventarioGuardas.entregar, {
      itemId: item,
      guardaUserId: e.userIds.gabriel,
    });

    const enNorte = await e
      .como("alicia")
      .query(api.inventarioAsignaciones.porCondominio, {
        companiaId: e.andina,
        condominioId: e.norte,
      });
    expect(enNorte.items[0]!.custodiaGuarda?.guardaNombre).toBe(
      "Gabriel Guarda",
    );
  });
});

describe("autorizacion", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("el guarda no puede repartir material", async () => {
    const item = await itemEnConjunto(e, e.norte);
    expect(
      await falla(() =>
        e.como("gabriel").mutation(api.inventarioGuardas.entregar, {
          itemId: item,
          guardaUserId: e.userIds.gabriel,
        }),
      ),
    ).toContain("inventario.custodiar");
  });

  test("el guarda tampoco ve el listado del conjunto", async () => {
    expect(
      await falla(() =>
        e
          .como("gabriel")
          .query(api.inventarioGuardas.itemsDelCondominio, {
            condominioId: e.norte,
          }),
      ),
    ).toContain("inventario.custodiar");
  });

  test("el ADMINISTRADOR DE COMPANIA no reparte material dentro de una porteria", async () => {
    /* Conserva la consulta pero no la accion: repartir es del supervisor, que
     * es quien esta alli. */
    const item = await itemEnConjunto(e, e.norte);
    expect(
      await falla(() =>
        e.como("alicia").mutation(api.inventarioGuardas.entregar, {
          itemId: item,
          guardaUserId: e.userIds.gabriel,
        }),
      ),
    ).toContain("inventario.custodiar");
  });

  test("el administrador del CONJUNTO no reparte el material de la empresa", async () => {
    const item = await itemEnConjunto(e, e.norte);
    expect(
      await falla(() =>
        e.como("hernan").mutation(api.inventarioGuardas.entregar, {
          itemId: item,
          guardaUserId: e.userIds.gabriel,
        }),
      ),
    ).toContain("inventario.custodiar");
  });

  test("sin sesion no se puede nada", async () => {
    const item = await itemEnConjunto(e, e.norte);
    expect(
      await falla(() =>
        e.anonimo.mutation(api.inventarioGuardas.entregar, {
          itemId: item,
          guardaUserId: e.userIds.gabriel,
        }),
      ),
    ).toContain("No autenticado");
  });

  test("un supervisor de OTRO conjunto no alcanza este", async () => {
    /* Sofia supervisa Norte y Sur; el elemento esta en Norte. Rodrigo
     * supervisa Oriente por Rival — y tambien Norte, que es otro test. */
    const item = await itemEnConjunto(e, e.sur);
    expect(
      await falla(() =>
        e
          .como("rodrigo")
          .query(api.inventarioGuardas.itemsDelCondominio, {
            condominioId: e.sur,
          }),
      ),
    ).toContain("inventario.custodiar");

    expect(
      await falla(() =>
        e.como("rodrigo").mutation(api.inventarioGuardas.entregar, {
          itemId: item,
          guardaUserId: e.userIds.gerardo,
        }),
      ),
    ).toContain("inventario.custodiar");
  });
});

describe("multi-tenancy: dos companias en la MISMA porteria", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("el supervisor de Rival NO reparte el material de Andina", async () => {
    /* EL CASO QUE NO SE VE VENIR. Rodrigo es supervisor vigente de Norte, asi
     * que la capacidad la tiene; el elemento esta en Norte, asi que el
     * conjunto encaja. Lo unico que lo detiene es comparar la COMPANIA. */
    const item = await itemEnConjunto(e, e.norte, "Radio de Andina");

    expect(
      await falla(() =>
        e.como("rodrigo").mutation(api.inventarioGuardas.entregar, {
          itemId: item,
          guardaUserId: e.userIds.raul,
        }),
      ),
    ).toContain("no pertenece a tu compañía");
  });

  test("tampoco se le entrega a un guarda de la otra compania", async () => {
    /* Raul esta asignado a Norte y esta vigente, pero es de Rival. */
    const item = await itemEnConjunto(e, e.norte);
    expect(
      await falla(() =>
        e.como("sofia").mutation(api.inventarioGuardas.entregar, {
          itemId: item,
          guardaUserId: e.userIds.raul,
        }),
      ),
    ).toContain("otra compañía");
  });

  test("cada supervisor solo ve el material de SU empresa en el conjunto", async () => {
    const deAndina = await itemEnConjunto(e, e.norte, "Radio de Andina");
    const deRival = await itemDeRivalEnNorte(e, "Radio de Rival");
    await e.como("sofia").mutation(api.inventarioGuardas.entregar, {
      itemId: deAndina,
      guardaUserId: e.userIds.gabriel,
    });
    await e.como("rodrigo").mutation(api.inventarioGuardas.entregar, {
      itemId: deRival,
      guardaUserId: e.userIds.raul,
    });

    const verSofia = await e
      .como("sofia")
      .query(api.inventarioGuardas.itemsDelCondominio, {
        condominioId: e.norte,
      });
    const verRodrigo = await e
      .como("rodrigo")
      .query(api.inventarioGuardas.itemsDelCondominio, {
        condominioId: e.norte,
      });

    expect(verSofia.items.map((i) => i.nombre)).toEqual(["Radio de Andina"]);
    expect(verRodrigo.items.map((i) => i.nombre)).toEqual(["Radio de Rival"]);
  });

  test("cada supervisor solo ve a los guardas de SU empresa", async () => {
    const deSofia = await e
      .como("sofia")
      .query(api.inventarioGuardas.guardasDisponibles, {
        condominioId: e.norte,
      });
    const deRodrigo = await e
      .como("rodrigo")
      .query(api.inventarioGuardas.guardasDisponibles, {
        condominioId: e.norte,
      });
    expect(deSofia.map((g) => g.nombre)).toEqual(["Gabriel Guarda"]);
    expect(deRodrigo.map((g) => g.nombre)).toEqual(["Raul Guarda Rival"]);
  });

  test("no se ve el historial de un elemento ajeno", async () => {
    const deRival = await itemDeRivalEnNorte(e);
    expect(
      await falla(() =>
        e
          .como("sofia")
          .query(api.inventarioGuardas.historialDeItem, { itemId: deRival }),
      ),
    ).toContain("no pertenece a tu compañía");
  });

  test("no se le recibe material a un guarda de la otra compania", async () => {
    const deRival = await itemDeRivalEnNorte(e);
    await e.como("rodrigo").mutation(api.inventarioGuardas.entregar, {
      itemId: deRival,
      guardaUserId: e.userIds.raul,
    });

    expect(
      await falla(() =>
        e
          .como("sofia")
          .mutation(api.inventarioGuardas.recibir, { itemId: deRival }),
      ),
    ).toContain("no pertenece a tu compañía");
  });
});

describe("integridad del elemento", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("un elemento que NO esta en ningun conjunto no se puede entregar", async () => {
    const item = await e
      .como("alicia")
      .mutation(api.inventario.crear, {
        companiaId: e.andina,
        nombre: "Radio en bodega",
      });

    expect(
      await falla(() =>
        e.como("sofia").mutation(api.inventarioGuardas.entregar, {
          itemId: item,
          guardaUserId: e.userIds.gabriel,
        }),
      ),
    ).toContain("no está asignado a ningún conjunto");
  });

  test("un elemento cuya asignacion al conjunto TERMINO no se puede entregar", async () => {
    const item = await itemEnConjunto(e, e.norte);
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.devolver, { itemId: item });

    expect(
      await falla(() =>
        e.como("sofia").mutation(api.inventarioGuardas.entregar, {
          itemId: item,
          guardaUserId: e.userIds.gabriel,
        }),
      ),
    ).toContain("no está asignado a ningún conjunto");
  });

  test("un elemento archivado no se puede entregar", async () => {
    const item = await e
      .como("alicia")
      .mutation(api.inventario.crear, {
        companiaId: e.andina,
        nombre: "Radio dado de baja",
      });
    await e.como("alicia").mutation(api.inventario.archivar, { itemId: item });

    expect(
      await falla(() =>
        e.como("sofia").mutation(api.inventarioGuardas.entregar, {
          itemId: item,
          guardaUserId: e.userIds.gabriel,
        }),
      ),
    ).toContain("archivado");
  });

  test("un elemento inexistente", async () => {
    const item = await itemEnConjunto(e, e.norte);
    await e.t.run(async (ctx) => {
      await ctx.db.delete(item);
    });
    expect(
      await falla(() =>
        e.como("sofia").mutation(api.inventarioGuardas.entregar, {
          itemId: item,
          guardaUserId: e.userIds.gabriel,
        }),
      ),
    ).toContain("Elemento no encontrado");
  });

  test("un guarda de OTRO conjunto no puede recibirlo", async () => {
    /* Gerardo es de Andina y esta vigente, pero en Sur, no en Norte. */
    const item = await itemEnConjunto(e, e.norte);
    expect(
      await falla(() =>
        e.como("sofia").mutation(api.inventarioGuardas.entregar, {
          itemId: item,
          guardaUserId: e.userIds.gerardo,
        }),
      ),
    ).toContain("asignación vigente en este conjunto");
  });

  test("una persona SIN rol de guarda no puede recibirlo", async () => {
    /* Sofia esta asignada a Norte y vigente, pero como SUPERVISORA. */
    const item = await itemEnConjunto(e, e.norte);
    expect(
      await falla(() =>
        e.como("sofia").mutation(api.inventarioGuardas.entregar, {
          itemId: item,
          guardaUserId: e.userIds.sofia,
        }),
      ),
    ).toContain("no está asignada como guarda");
  });

  test("un residente del conjunto tampoco: no tiene asignacion", async () => {
    const item = await itemEnConjunto(e, e.norte);
    expect(
      await falla(() =>
        e.como("sofia").mutation(api.inventarioGuardas.entregar, {
          itemId: item,
          guardaUserId: e.userIds.hernan,
        }),
      ),
    ).toContain("asignación vigente");
  });

  test("una observacion desmesurada se rechaza y no entrega a medias", async () => {
    const item = await itemEnConjunto(e, e.norte);
    expect(
      await falla(() =>
        e.como("sofia").mutation(api.inventarioGuardas.entregar, {
          itemId: item,
          guardaUserId: e.userIds.gabriel,
          observacion: "x".repeat(501),
        }),
      ),
    ).toContain("500 caracteres");

    const { items } = await e
      .como("sofia")
      .query(api.inventarioGuardas.itemsDelCondominio, {
        condominioId: e.norte,
      });
    expect(items[0]!.custodia).toBeNull();
  });
});

describe("novedades del elemento", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("la novedad queda en EL MISMO historial, con conjunto y guarda", async () => {
    const item = await itemEnConjunto(e, e.norte);
    await e.como("sofia").mutation(api.inventarioGuardas.entregar, {
      itemId: item,
      guardaUserId: e.userIds.gabriel,
    });
    const antes = Date.now();
    await e.como("sofia").mutation(api.inventarioGuardas.registrarNovedad, {
      itemId: item,
      descripcion: "El radio presenta interferencia",
    });

    const { historial } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: item });
    expect(historial[0]!.tipo).toBe("ITEM_NOTE");
    expect(historial[0]!.descripcion).toBe("El radio presenta interferencia");
    expect(historial[0]!.actorNombre).toBe("Sofia Supervisora");
    expect(historial[0]!.createdAt).toBeGreaterThanOrEqual(antes);

    const guardado = await e.t.run(async (ctx) => {
      const n = await ctx.db
        .query("inventarioNovedades")
        .withIndex("by_item", (q) => q.eq("itemId", item))
        .order("desc")
        .first();
      return {
        condominioId: n!.condominioId,
        guardaUserId: n!.guardaUserId,
        tipo: n!.tipo,
      };
    });
    expect(guardado.tipo).toBe("ITEM_NOTE");
    expect(guardado.condominioId).toBe(e.norte);
    /* Ligada al guarda que lo tiene, sin que haya que decirlo. */
    expect(guardado.guardaUserId).toBe(e.userIds.gabriel);
  });

  test("la novedad NO cambia el estado fisico del elemento", async () => {
    /* "El radio presenta interferencia" es una observacion, no un
     * diagnostico: convertirla en `averiado` dejaria que cualquiera sacara
     * material de circulacion con una frase. */
    const item = await itemEnConjunto(e, e.norte);
    await e.como("sofia").mutation(api.inventarioGuardas.registrarNovedad, {
      itemId: item,
      descripcion: "El chaleco esta deteriorado",
    });

    const { item: doc } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: item });
    expect(doc.estado).toBe("disponible");
    expect(doc.archivado).toBe(false);
  });

  test("sin guarda, la novedad queda ligada solo al conjunto", async () => {
    const item = await itemEnConjunto(e, e.norte);
    await e.como("sofia").mutation(api.inventarioGuardas.registrarNovedad, {
      itemId: item,
      descripcion: "Se encontro en la caseta sin antena",
    });

    const guardado = await e.t.run(async (ctx) => {
      const n = await ctx.db
        .query("inventarioNovedades")
        .withIndex("by_item", (q) => q.eq("itemId", item))
        .order("desc")
        .first();
      return { condominioId: n!.condominioId, guardaUserId: n!.guardaUserId };
    });
    expect(guardado.condominioId).toBe(e.norte);
    expect(guardado.guardaUserId).toBeUndefined();
  });

  test("una novedad vacia se rechaza", async () => {
    const item = await itemEnConjunto(e, e.norte);
    expect(
      await falla(() =>
        e.como("sofia").mutation(api.inventarioGuardas.registrarNovedad, {
          itemId: item,
          descripcion: "   ",
        }),
      ),
    ).toContain("Escribe la novedad");
  });

  test("no se registran novedades sobre material ajeno", async () => {
    const deRival = await itemDeRivalEnNorte(e);
    expect(
      await falla(() =>
        e.como("sofia").mutation(api.inventarioGuardas.registrarNovedad, {
          itemId: deRival,
          descripcion: "Le falta la bateria",
        }),
      ),
    ).toContain("no pertenece a tu compañía");
  });

  test("la historia completa se lee entera y en orden en un solo sitio", async () => {
    /* La exigencia del enunciado: la linea de tiempo no puede quedar partida
     * entre varios sistemas de auditoria. */
    const item = await itemEnConjunto(e, e.norte, "Radio Motorola X");
    await e.como("sofia").mutation(api.inventarioGuardas.entregar, {
      itemId: item,
      guardaUserId: e.userIds.gabriel,
    });
    await e.como("sofia").mutation(api.inventarioGuardas.registrarNovedad, {
      itemId: item,
      descripcion: "El radio presenta interferencia",
    });
    await e
      .como("sofia")
      .mutation(api.inventarioGuardas.recibir, { itemId: item });

    const { historial } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: item });
    expect(historial.map((h) => h.tipo)).toEqual([
      "ITEM_RETURNED_BY_GUARD",
      "ITEM_NOTE",
      "ITEM_ASSIGNED_TO_GUARD",
      "ITEM_ASSIGNED_TO_CONDOMINIUM",
      "ITEM_CREATED",
    ]);
    /* Y con el nombre del guarda copiado, para que sobreviva a su baja. */
    expect(historial[2]!.descripcion).toContain("Gabriel");
  });
});
