import { test, expect, describe, beforeEach } from "vitest";
import { convexTest } from "convex-test";
import betterAuthTest from "@convex-dev/better-auth/test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const modules = import.meta.glob("../convex/**/*.ts");

/**
 * LA CUSTODIA DE UN ELEMENTO: entregarlo a un conjunto y recuperarlo.
 *
 * Lo que se fija aqui, por orden de importancia:
 *   - que NO se pierda historial: el ciclo compania -> A -> compania -> B deja
 *     dos filas, no una editada;
 *   - que la custodia activa sea inequivoca (como mucho una);
 *   - que el aislamiento aguante con DOS companias que atienden EL MISMO
 *     conjunto, que es el caso donde un indice mal elegido se cuela;
 *   - que solo el administrador de la compania pueda obrar.
 */

const CLAVE = "clave-de-prueba-1";
const DIA = 24 * 60 * 60 * 1000;

type Escenario = Awaited<ReturnType<typeof montar>>;

/**
 * Andina atiende Norte y Sur. Rival atiende Oriente Y TAMBIEN Norte.
 *
 * Ese solape es deliberado: dos empresas cubriendo la misma porteria es un
 * caso real (relevo, turnos partidos) y es donde un indice que fuera solo por
 * conjunto —sin la compania delante— dejaria ver material ajeno, o peor: al
 * acotar la lectura antes de filtrar, se llevaria las filas de la otra empresa
 * y diria "aqui no hay nada" a quien si tiene material.
 */
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
  const norte = await condo("Conjunto Norte");
  const sur = await condo("Conjunto Sur");
  const oriente = await condo("Conjunto Oriente");
  /* Sin contrato con nadie: sirve para probar que no basta con existir. */
  const ajeno = await condo("Conjunto Ajeno");

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
  const kNorte = await contrato(andina.companiaId, norte);
  await contrato(andina.companiaId, sur);
  await contrato(rival.companiaId, oriente);
  await contrato(rival.companiaId, norte);

  const sofia = await plataforma.action(api.companias.crearMiembro, {
    companiaId: andina.companiaId,
    email: "sofia@andina.test",
    name: "Sofia Supervisora",
    password: CLAVE,
    roles: ["supervisor"],
  });
  const gabriel = await plataforma.action(api.companias.crearMiembro, {
    companiaId: andina.companiaId,
    email: "gabriel@andina.test",
    name: "Gabriel Guarda",
    password: CLAVE,
    roles: ["guardia"],
  });
  await plataforma.mutation(api.asignaciones.crear, {
    contratoId: kNorte,
    companiaMiembroId: sofia.miembroId,
    rol: "supervisor",
    vigenciaDesde: desde,
  });
  await plataforma.mutation(api.asignaciones.crear, {
    contratoId: kNorte,
    companiaMiembroId: gabriel.miembroId,
    rol: "guardia",
    vigenciaDesde: desde,
  });

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
      hernan: await por("hernan@norte.test"),
    };
  });

  return {
    t,
    plataforma,
    norte,
    sur,
    oriente,
    ajeno,
    andina: andina.companiaId,
    rival: rival.companiaId,
    como: (quien: keyof typeof authIds) =>
      t.withIdentity({ subject: authIds[quien] }),
    anonimo: t,
  };
}

async function itemDeAndina(e: Escenario, nombre = "Radio Motorola") {
  return await e
    .como("alicia")
    .mutation(api.inventario.crear, { companiaId: e.andina, nombre });
}

async function itemDeRival(e: Escenario, nombre = "Radio Rival") {
  return await e
    .como("ramon")
    .mutation(api.inventario.crear, { companiaId: e.rival, nombre });
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

describe("asignar un elemento a un conjunto", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("el administrador lo entrega y queda registrado quien y cuando", async () => {
    const item = await itemDeAndina(e);
    const antes = Date.now();

    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: item,
        condominioId: e.norte,
        observacion: "Turno de noche",
      });

    const { asignacionActiva } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: item });

    expect(asignacionActiva).not.toBeNull();
    expect(asignacionActiva!.condominioNombre).toBe("Conjunto Norte");
    expect(asignacionActiva!.asignadaPorNombre).toBe("Alicia Admin");
    expect(asignacionActiva!.observacionAsignacion).toBe("Turno de noche");
    expect(asignacionActiva!.asignadaEn).toBeGreaterThanOrEqual(antes);
    expect(asignacionActiva!.devueltaEn).toBeNull();
    expect(asignacionActiva!.activa).toBe(true);
  });

  test("la custodia NO toca el estado fisico del elemento", async () => {
    /* Los dos ejes de la tarea 1 siguen separados: entregar un radio no lo
     * hace mas ni menos disponible, solo lo pone en otro sitio. */
    const item = await itemDeAndina(e);
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: item,
        condominioId: e.norte,
      });

    const { item: doc } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: item });
    expect(doc.estado).toBe("disponible");
    expect(doc.archivado).toBe(false);
  });

  test("el listado dice donde esta cada elemento", async () => {
    const enNorte = await itemDeAndina(e, "Radio en Norte");
    await itemDeAndina(e, "Radio en bodega");
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: enNorte,
        condominioId: e.norte,
      });

    const { items } = await e
      .como("alicia")
      .query(api.inventario.listar, { companiaId: e.andina });

    const fuera = items.find((i) => i.nombre === "Radio en Norte")!;
    const dentro = items.find((i) => i.nombre === "Radio en bodega")!;
    expect(fuera.asignacion?.condominioNombre).toBe("Conjunto Norte");
    expect(dentro.asignacion).toBeNull();
  });

  test("se puede filtrar por donde estan", async () => {
    const fuera = await itemDeAndina(e, "Fuera");
    await itemDeAndina(e, "Dentro");
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: fuera,
        condominioId: e.norte,
      });

    const enCondominio = await e
      .como("alicia")
      .query(api.inventario.listar, {
        companiaId: e.andina,
        custodia: "en_condominio",
      });
    const enCompania = await e
      .como("alicia")
      .query(api.inventario.listar, {
        companiaId: e.andina,
        custodia: "en_compania",
      });

    expect(enCondominio.items.map((i) => i.nombre)).toEqual(["Fuera"]);
    expect(enCompania.items.map((i) => i.nombre)).toEqual(["Dentro"]);
  });

  test("los conteos separan bodega de porteria sin tocar el eje del archivo", async () => {
    const fuera = await itemDeAndina(e, "Fuera");
    await itemDeAndina(e, "Dentro");
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: fuera,
        condominioId: e.norte,
      });

    const c = await e
      .como("alicia")
      .query(api.inventario.conteos, { companiaId: e.andina });
    expect(c.activos).toBe(2);
    expect(c.archivados).toBe(0);
    expect(c.enCondominio).toBe(1);
    expect(c.enCompania).toBe(1);
  });

  test("el conjunto puede consultar que tiene hoy", async () => {
    const a = await itemDeAndina(e, "Radio A");
    const b = await itemDeAndina(e, "Radio B");
    for (const id of [a, b]) {
      await e
        .como("alicia")
        .mutation(api.inventarioAsignaciones.asignar, {
          itemId: id,
          condominioId: e.norte,
        });
    }

    const enNorte = await e
      .como("alicia")
      .query(api.inventarioAsignaciones.porCondominio, {
        companiaId: e.andina,
        condominioId: e.norte,
      });
    expect(enNorte.items.map((i) => i.nombre).sort()).toEqual([
      "Radio A",
      "Radio B",
    ]);
    expect(enNorte.truncado).toBe(false);
  });

  test("solo se ofrecen los conjuntos con contrato vigente y activos", async () => {
    const opciones = await e
      .como("alicia")
      .query(api.inventarioAsignaciones.condominiosAsignables, {
        companiaId: e.andina,
      });
    expect(opciones.map((o) => o.nombre)).toEqual([
      "Conjunto Norte",
      "Conjunto Sur",
    ]);
  });
});

describe("devolver un elemento", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("la devolucion cierra la custodia y registra quien la recibio", async () => {
    const item = await itemDeAndina(e);
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: item,
        condominioId: e.norte,
      });
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.devolver, {
        itemId: item,
        observacion: "Vuelve completo",
      });

    const { asignacionActiva, asignaciones } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: item });

    expect(asignacionActiva).toBeNull();
    expect(asignaciones).toHaveLength(1);
    expect(asignaciones[0]!.activa).toBe(false);
    expect(asignaciones[0]!.devueltaEn).toBeGreaterThan(0);
    expect(asignaciones[0]!.devueltaPorNombre).toBe("Alicia Admin");
    expect(asignaciones[0]!.observacionDevolucion).toBe("Vuelve completo");
    /* Lo de la ida NO se pisa al cerrar: son dos hechos distintos. */
    expect(asignaciones[0]!.asignadaPorNombre).toBe("Alicia Admin");
  });

  test("devolver algo que ya volvio no reescribe nada", async () => {
    const item = await itemDeAndina(e);
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: item,
        condominioId: e.norte,
      });
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.devolver, { itemId: item });

    const segunda = await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.devolver, { itemId: item });
    expect(segunda).toEqual({ yaEstaba: true });

    const { historial } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: item });
    expect(
      historial.filter((h) => h.tipo === "ITEM_RETURNED_FROM_CONDOMINIUM"),
    ).toHaveLength(1);
  });

  test("devolver algo que nunca salio no hace nada ni revienta", async () => {
    const item = await itemDeAndina(e);
    expect(
      await e
        .como("alicia")
        .mutation(api.inventarioAsignaciones.devolver, { itemId: item }),
    ).toEqual({ yaEstaba: true });
  });

  test("se puede recuperar material de un conjunto DADO DE BAJA", async () => {
    /* Al reves que asignar. Si se exigiera conjunto activo para devolver, los
     * radios que quedaron dentro cuando se dio de baja la porteria quedarian
     * atrapados en el sistema para siempre. */
    const item = await itemDeAndina(e);
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: item,
        condominioId: e.norte,
      });

    await e.t.run(async (ctx) => {
      await ctx.db.patch(e.norte, { isActive: false });
    });

    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.devolver, {
        itemId: item,
        observacion: "Se recupera al cerrar el conjunto",
      });

    const { asignacionActiva } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: item });
    expect(asignacionActiva).toBeNull();
  });

  test("se puede recuperar material aunque el contrato ya haya terminado", async () => {
    /* La custodia NO cuelga del contrato justamente por esto: terminar un
     * contrato no devuelve fisicamente el radio, y el sistema tiene que poder
     * registrar la devolucion despues. */
    const item = await itemDeAndina(e);
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: item,
        condominioId: e.norte,
      });

    const { contratos } = await e.plataforma.query(api.companias.detail, {
      companiaId: e.andina,
    });
    const kNorte = contratos.find((k) => k.condominioId === e.norte)!;
    await e.plataforma.mutation(api.companias.terminarContrato, {
      contratoId: kNorte._id,
    });

    /* Sigue constando que esta fuera: el contrato no lo devolvio solo. */
    const antes = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: item });
    expect(antes.asignacionActiva).not.toBeNull();

    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.devolver, { itemId: item });

    const despues = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: item });
    expect(despues.asignacionActiva).toBeNull();
  });
});

describe("una sola custodia activa, y el historial completo", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("no se puede entregar algo que ya esta en otro conjunto", async () => {
    const item = await itemDeAndina(e);
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: item,
        condominioId: e.norte,
      });

    const msg = await falla(() =>
      e
        .como("alicia")
        .mutation(api.inventarioAsignaciones.asignar, {
          itemId: item,
          condominioId: e.sur,
        }),
    );
    expect(msg).toContain("Conjunto Norte");
    expect(msg).toContain("Devuélvelo antes");
  });

  test("tampoco se puede entregar dos veces al MISMO conjunto", async () => {
    /* El doble submit. No hace falta candado: la mutacion es una transaccion,
     * asi que la segunda lee la custodia que abrio la primera. */
    const item = await itemDeAndina(e);
    const asignar = () =>
      e
        .como("alicia")
        .mutation(api.inventarioAsignaciones.asignar, {
          itemId: item,
          condominioId: e.norte,
        });
    await asignar();

    const msg = await falla(asignar);
    expect(msg).toContain("ya está entregado");

    const { asignaciones } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: item });
    expect(asignaciones).toHaveLength(1);
  });

  test("compania -> A -> compania -> B conserva LAS DOS asignaciones", async () => {
    const item = await itemDeAndina(e);
    const asignar = (condominioId: Id<"condominios">) =>
      e
        .como("alicia")
        .mutation(api.inventarioAsignaciones.asignar, { itemId: item, condominioId });
    const devolver = () =>
      e
        .como("alicia")
        .mutation(api.inventarioAsignaciones.devolver, { itemId: item });

    await asignar(e.norte);
    await devolver();
    await asignar(e.sur);

    const { asignaciones, asignacionActiva } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: item });

    /* Dos filas, no una reescrita: la primera custodia sigue diciendo que
     * estuvo en Norte y cuando volvio. */
    expect(asignaciones).toHaveLength(2);
    expect(asignaciones.map((a) => a.condominioNombre)).toEqual([
      "Conjunto Sur",
      "Conjunto Norte",
    ]);
    const norte = asignaciones.find((a) => a.condominioNombre === "Conjunto Norte")!;
    expect(norte.activa).toBe(false);
    expect(norte.devueltaEn).toBeGreaterThan(0);
    expect(asignacionActiva!.condominioNombre).toBe("Conjunto Sur");
  });

  test("el historial dedicado cuenta lo mismo que la ficha", async () => {
    const item = await itemDeAndina(e);
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: item,
        condominioId: e.norte,
      });
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.devolver, { itemId: item });
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: item,
        condominioId: e.sur,
      });

    const historial = await e
      .como("alicia")
      .query(api.inventarioAsignaciones.historialDeItem, { itemId: item });
    expect(historial.map((a) => a.condominioNombre)).toEqual([
      "Conjunto Sur",
      "Conjunto Norte",
    ]);
    expect(historial.filter((a) => a.activa)).toHaveLength(1);
  });

  test("un elemento devuelto ya no figura en el conjunto", async () => {
    const item = await itemDeAndina(e);
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: item,
        condominioId: e.norte,
      });
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.devolver, { itemId: item });

    const enNorte = await e
      .como("alicia")
      .query(api.inventarioAsignaciones.porCondominio, {
        companiaId: e.andina,
        condominioId: e.norte,
      });
    expect(enNorte.items).toEqual([]);
  });
});

describe("novedades de custodia", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("asignar deja ITEM_ASSIGNED_TO_CONDOMINIUM con actor y fecha", async () => {
    const item = await itemDeAndina(e);
    const antes = Date.now();
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: item,
        condominioId: e.norte,
      });

    const { historial } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: item });

    expect(historial[0]!.tipo).toBe("ITEM_ASSIGNED_TO_CONDOMINIUM");
    expect(historial[0]!.actorNombre).toBe("Alicia Admin");
    expect(historial[0]!.createdAt).toBeGreaterThanOrEqual(antes);
    /* El nombre del conjunto va COPIADO en el texto: si lo renombran o lo
     * borran, la linea tiene que seguir diciendo a donde fue. */
    expect(historial[0]!.descripcion).toContain("Conjunto Norte");
  });

  test("la novedad guarda el condominioId que la tarea 1 dejo preparado", async () => {
    const item = await itemDeAndina(e);
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: item,
        condominioId: e.norte,
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
    /* La tarea 3 todavia no existe: nadie escribe este campo. */
    expect(guardado.guardaUserId).toBeUndefined();
  });

  test("devolver deja ITEM_RETURNED_FROM_CONDOMINIUM con su conjunto", async () => {
    const item = await itemDeAndina(e);
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: item,
        condominioId: e.norte,
      });
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.devolver, {
        itemId: item,
        observacion: "Sin novedad",
      });

    const { historial } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: item });

    expect(historial.map((h) => h.tipo)).toEqual([
      "ITEM_RETURNED_FROM_CONDOMINIUM",
      "ITEM_ASSIGNED_TO_CONDOMINIUM",
      "ITEM_CREATED",
    ]);
    expect(historial[0]!.descripcion).toContain("Conjunto Norte");
    expect(historial[0]!.descripcion).toContain("Sin novedad");
  });

  test("la auditoria no depende de la tabla de asignaciones", async () => {
    /* La linea de tiempo cuenta el ciclo entero por si sola: es la exigencia
     * de que la auditoria no obligue a cruzar dos tablas para leerse. */
    const item = await itemDeAndina(e);
    for (const condominioId of [e.norte, e.sur]) {
      await e
        .como("alicia")
        .mutation(api.inventarioAsignaciones.asignar, { itemId: item, condominioId });
      await e
        .como("alicia")
        .mutation(api.inventarioAsignaciones.devolver, { itemId: item });
    }

    const { historial } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: item });
    expect(historial.map((h) => h.tipo)).toEqual([
      "ITEM_RETURNED_FROM_CONDOMINIUM",
      "ITEM_ASSIGNED_TO_CONDOMINIUM",
      "ITEM_RETURNED_FROM_CONDOMINIUM",
      "ITEM_ASSIGNED_TO_CONDOMINIUM",
      "ITEM_CREATED",
    ]);
  });
});

describe("autorizacion", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("el supervisor de la compania no puede asignar", async () => {
    const item = await itemDeAndina(e);
    const msg = await falla(() =>
      e
        .como("sofia")
        .mutation(api.inventarioAsignaciones.asignar, {
          itemId: item,
          condominioId: e.norte,
        }),
    );
    expect(msg).toContain("inventario.gestionar");
  });

  test("el guarda no puede asignar ni devolver", async () => {
    const item = await itemDeAndina(e);
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: item,
        condominioId: e.norte,
      });

    expect(
      await falla(() =>
        e
          .como("gabriel")
          .mutation(api.inventarioAsignaciones.devolver, { itemId: item }),
      ),
    ).toContain("inventario.gestionar");
  });

  test("el administrador del CONJUNTO que recibe el material no puede obrar", async () => {
    /* Tiene el radio en su porteria, pero el radio es de la empresa y es ella
     * quien responde por el. */
    const item = await itemDeAndina(e);
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: item,
        condominioId: e.norte,
      });

    expect(
      await falla(() =>
        e
          .como("hernan")
          .mutation(api.inventarioAsignaciones.devolver, { itemId: item }),
      ),
    ).toContain("No pertenece a esta compañía");

    expect(
      await falla(() =>
        e
          .como("hernan")
          .query(api.inventarioAsignaciones.porCondominio, {
            companiaId: e.andina,
            condominioId: e.norte,
          }),
      ),
    ).toContain("No pertenece a esta compañía");
  });

  test("sin sesion no se puede nada", async () => {
    const item = await itemDeAndina(e);
    expect(
      await falla(() =>
        e.anonimo.mutation(api.inventarioAsignaciones.asignar, {
          itemId: item,
          condominioId: e.norte,
        }),
      ),
    ).toContain("No autenticado");
  });

  test("una compania suspendida no mueve su material", async () => {
    const item = await itemDeAndina(e);
    await e.plataforma.mutation(api.companias.setEstado, {
      companiaId: e.andina,
      estado: "suspendida",
    });
    expect(
      await falla(() =>
        e
          .como("alicia")
          .mutation(api.inventarioAsignaciones.asignar, {
            itemId: item,
            condominioId: e.norte,
          }),
      ),
    ).toContain("suspendida");
  });
});

describe("aislamiento entre companias", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("no se puede entregar un elemento AJENO", async () => {
    const deRival = await itemDeRival(e);
    const msg = await falla(() =>
      e
        .como("alicia")
        .mutation(api.inventarioAsignaciones.asignar, {
          itemId: deRival,
          condominioId: e.norte,
        }),
    );
    expect(msg).toContain("No pertenece a esta compañía");
  });

  test("no se puede entregar a un conjunto que la compania no atiende", async () => {
    /* Oriente existe y esta activo, pero es de Rival. Sin la comprobacion del
     * contrato, el id de cualquier condominio del SaaS valdria. */
    const item = await itemDeAndina(e);
    const msg = await falla(() =>
      e
        .como("alicia")
        .mutation(api.inventarioAsignaciones.asignar, {
          itemId: item,
          condominioId: e.oriente,
        }),
    );
    expect(msg).toContain("contrato vigente");
  });

  test("un conjunto sin contrato con nadie tampoco vale", async () => {
    const item = await itemDeAndina(e);
    expect(
      await falla(() =>
        e
          .como("alicia")
          .mutation(api.inventarioAsignaciones.asignar, {
            itemId: item,
            condominioId: e.ajeno,
          }),
      ),
    ).toContain("contrato vigente");
  });

  test("cruzado: elemento de A a conjunto de B, con la sesion de B", async () => {
    const item = await itemDeAndina(e);
    const msg = await falla(() =>
      e
        .como("ramon")
        .mutation(api.inventarioAsignaciones.asignar, {
          itemId: item,
          condominioId: e.oriente,
        }),
    );
    /* Falla por el ELEMENTO, antes de mirar el conjunto: la compania sale del
     * documento, no de los argumentos. */
    expect(msg).toContain("No pertenece a esta compañía");
  });

  test("dos companias en la MISMA porteria no se ven el material", async () => {
    /* El caso que un indice mal filtrado deja escapar: `by_condominio_devuelta`
     * va por conjunto, no por compania. */
    const deAndina = await itemDeAndina(e, "Radio de Andina");
    const deRival = await itemDeRival(e, "Radio de Rival");
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: deAndina,
        condominioId: e.norte,
      });
    await e
      .como("ramon")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: deRival,
        condominioId: e.norte,
      });

    const verAndina = await e
      .como("alicia")
      .query(api.inventarioAsignaciones.porCondominio, {
        companiaId: e.andina,
        condominioId: e.norte,
      });
    const verRival = await e
      .como("ramon")
      .query(api.inventarioAsignaciones.porCondominio, {
        companiaId: e.rival,
        condominioId: e.norte,
      });

    expect(verAndina.items.map((i) => i.nombre)).toEqual(["Radio de Andina"]);
    expect(verRival.items.map((i) => i.nombre)).toEqual(["Radio de Rival"]);
  });

  test("no se puede cerrar la custodia de un elemento ajeno", async () => {
    const deRival = await itemDeRival(e);
    await e
      .como("ramon")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: deRival,
        condominioId: e.oriente,
      });

    expect(
      await falla(() =>
        e
          .como("alicia")
          .mutation(api.inventarioAsignaciones.devolver, { itemId: deRival }),
      ),
    ).toContain("No pertenece a esta compañía");

    /* Y sigue fuera. */
    const { asignacionActiva } = await e
      .como("ramon")
      .query(api.inventario.detalle, { itemId: deRival });
    expect(asignacionActiva).not.toBeNull();
  });

  test("no se ve el historial de custodias de un elemento ajeno", async () => {
    const deRival = await itemDeRival(e);
    expect(
      await falla(() =>
        e
          .como("alicia")
          .query(api.inventarioAsignaciones.historialDeItem, { itemId: deRival }),
      ),
    ).toContain("No pertenece a esta compañía");
  });

  test("cada compania solo ve sus propios conjuntos asignables", async () => {
    const deRival = await e
      .como("ramon")
      .query(api.inventarioAsignaciones.condominiosAsignables, {
        companiaId: e.rival,
      });
    expect(deRival.map((o) => o.nombre).sort()).toEqual([
      "Conjunto Norte",
      "Conjunto Oriente",
    ]);
  });
});

describe("integridad", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("un elemento archivado no se puede entregar", async () => {
    const item = await itemDeAndina(e);
    await e.como("alicia").mutation(api.inventario.archivar, { itemId: item });

    const msg = await falla(() =>
      e
        .como("alicia")
        .mutation(api.inventarioAsignaciones.asignar, {
          itemId: item,
          condominioId: e.norte,
        }),
    );
    expect(msg).toContain("archivado");
  });

  test("REGRESION tarea 1: no se archiva algo que esta en una porteria", async () => {
    /* Archivarlo lo sacaria del inventario activo dejando la custodia abierta:
     * desapareceria de la pantalla mientras sigue fisicamente en el conjunto. */
    const item = await itemDeAndina(e);
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: item,
        condominioId: e.norte,
      });

    const msg = await falla(() =>
      e.como("alicia").mutation(api.inventario.archivar, { itemId: item }),
    );
    expect(msg).toContain("Conjunto Norte");
    expect(msg).toContain("devolución antes de archivarlo");

    const { item: doc } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: item });
    expect(doc.archivado).toBe(false);
  });

  test("REGRESION tarea 1: devolverlo primero SI permite archivarlo", async () => {
    const item = await itemDeAndina(e);
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: item,
        condominioId: e.norte,
      });
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.devolver, {
        itemId: item,
        observacion: "Se pierde en el conjunto",
      });
    await e
      .como("alicia")
      .mutation(api.inventario.archivar, { itemId: item, motivo: "Perdido" });

    const { item: doc, historial } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: item });
    expect(doc.archivado).toBe(true);
    /* El historial cuenta la secuencia entera y en orden. */
    expect(historial.map((h) => h.tipo)).toEqual([
      "ITEM_ARCHIVED",
      "ITEM_RETURNED_FROM_CONDOMINIUM",
      "ITEM_ASSIGNED_TO_CONDOMINIUM",
      "ITEM_CREATED",
    ]);
  });

  test("un elemento inexistente no se puede entregar", async () => {
    const item = await itemDeAndina(e);
    await e.t.run(async (ctx) => {
      await ctx.db.delete(item);
    });
    expect(
      await falla(() =>
        e
          .como("alicia")
          .mutation(api.inventarioAsignaciones.asignar, {
            itemId: item,
            condominioId: e.norte,
          }),
      ),
    ).toContain("Elemento no encontrado");
  });

  test("un conjunto inexistente no se puede usar", async () => {
    const item = await itemDeAndina(e);
    const fantasma = await e.plataforma.mutation(api.condominios.create, {
      name: "Se va a borrar",
    });
    await e.t.run(async (ctx) => {
      await ctx.db.delete(fantasma);
    });
    expect(
      await falla(() =>
        e
          .como("alicia")
          .mutation(api.inventarioAsignaciones.asignar, {
            itemId: item,
            condominioId: fantasma,
          }),
      ),
    ).toContain("Conjunto no encontrado");
  });

  test("un conjunto INACTIVO no recibe material nuevo", async () => {
    const item = await itemDeAndina(e);
    await e.t.run(async (ctx) => {
      await ctx.db.patch(e.norte, { isActive: false });
    });
    expect(
      await falla(() =>
        e
          .como("alicia")
          .mutation(api.inventarioAsignaciones.asignar, {
            itemId: item,
            condominioId: e.norte,
          }),
      ),
    ).toContain("inactivo");
  });

  test("un conjunto inactivo desaparece del desplegable", async () => {
    await e.t.run(async (ctx) => {
      await ctx.db.patch(e.norte, { isActive: false });
    });
    const opciones = await e
      .como("alicia")
      .query(api.inventarioAsignaciones.condominiosAsignables, {
        companiaId: e.andina,
      });
    expect(opciones.map((o) => o.nombre)).toEqual(["Conjunto Sur"]);
  });

  test("con el contrato terminado ya no se puede entregar mas", async () => {
    const item = await itemDeAndina(e);
    const { contratos } = await e.plataforma.query(api.companias.detail, {
      companiaId: e.andina,
    });
    const kNorte = contratos.find((k) => k.condominioId === e.norte)!;
    await e.plataforma.mutation(api.companias.terminarContrato, {
      contratoId: kNorte._id,
    });

    expect(
      await falla(() =>
        e
          .como("alicia")
          .mutation(api.inventarioAsignaciones.asignar, {
            itemId: item,
            condominioId: e.norte,
          }),
      ),
    ).toContain("contrato vigente");
  });

  test("REGRESION tarea 1: crear, editar y buscar siguen igual con custodia", async () => {
    const item = await itemDeAndina(e, "Radio Motorola");
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: item,
        condominioId: e.norte,
      });

    /* Editar un elemento entregado se permite: corregir un nombre no tiene
     * nada que ver con donde esta. */
    await e.como("alicia").mutation(api.inventario.editar, {
      itemId: item,
      nombre: "Radio Motorola DEP450",
      serial: "VK-1",
    });

    const encontrado = await e
      .como("alicia")
      .query(api.inventario.listar, { companiaId: e.andina, busqueda: "vk-1" });
    expect(encontrado.items).toHaveLength(1);
    expect(encontrado.items[0]!.nombre).toBe("Radio Motorola DEP450");
    /* Y sigue diciendo donde esta. */
    expect(encontrado.items[0]!.asignacion?.condominioNombre).toBe(
      "Conjunto Norte",
    );
  });
});

describe("lo que se quedo fuera y no ha vuelto", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("el material sigue localizable cuando el contrato ya termino", async () => {
    /* La pregunta que el modelo existe para responder: se acabo la relacion
     * comercial, ¿que nos quedamos sin recuperar? `condominiosAsignables` no
     * puede contestarla —solo lista donde se PUEDE entregar— y por eso son dos
     * consultas distintas y no una derivada de la otra. */
    const item = await itemDeAndina(e, "Radio olvidado");
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: item,
        condominioId: e.norte,
      });

    const { contratos } = await e.plataforma.query(api.companias.detail, {
      companiaId: e.andina,
    });
    await e.plataforma.mutation(api.companias.terminarContrato, {
      contratoId: contratos.find((k) => k.condominioId === e.norte)!._id,
    });

    /* Ya no se puede entregar mas ahi... */
    const asignables = await e
      .como("alicia")
      .query(api.inventarioAsignaciones.condominiosAsignables, {
        companiaId: e.andina,
      });
    expect(asignables.map((c) => c.nombre)).toEqual(["Conjunto Sur"]);

    /* ...pero el conjunto SIGUE apareciendo entre los que tienen material. */
    const conMaterial = await e
      .como("alicia")
      .query(api.inventarioAsignaciones.condominiosConMaterial, {
        companiaId: e.andina,
      });
    expect(conMaterial).toHaveLength(1);
    expect(conMaterial[0]!.nombre).toBe("Conjunto Norte");
    expect(conMaterial[0]!.elementos).toBe(1);
  });

  test("un conjunto dado de baja con material dentro tambien aparece", async () => {
    const item = await itemDeAndina(e);
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: item,
        condominioId: e.norte,
      });
    await e.t.run(async (ctx) => {
      await ctx.db.patch(e.norte, { isActive: false });
    });

    const conMaterial = await e
      .como("alicia")
      .query(api.inventarioAsignaciones.condominiosConMaterial, {
        companiaId: e.andina,
      });
    expect(conMaterial[0]!.nombre).toBe("Conjunto Norte");
    /* Se avisa de que ahi ya no se puede entregar mas, pero si recuperar. */
    expect(conMaterial[0]!.activo).toBe(false);
  });

  test("solo lista conjuntos con material, y solo de la propia compania", async () => {
    const mio = await itemDeAndina(e);
    const suyo = await itemDeRival(e);
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: mio,
        condominioId: e.norte,
      });
    await e
      .como("ramon")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: suyo,
        condominioId: e.norte,
      });

    const andina = await e
      .como("alicia")
      .query(api.inventarioAsignaciones.condominiosConMaterial, {
        companiaId: e.andina,
      });
    /* Las dos tienen material en Norte, pero cada una cuenta el suyo. */
    expect(andina).toHaveLength(1);
    expect(andina[0]!.elementos).toBe(1);

    /* Sur tiene contrato pero nada dentro: no sale. */
    expect(andina.map((c) => c.nombre)).not.toContain("Conjunto Sur");
  });

  test("al devolverlo todo, el conjunto desaparece de la lista", async () => {
    const item = await itemDeAndina(e);
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: item,
        condominioId: e.norte,
      });
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.devolver, { itemId: item });

    expect(
      await e
        .como("alicia")
        .query(api.inventarioAsignaciones.condominiosConMaterial, {
          companiaId: e.andina,
        }),
    ).toEqual([]);
  });

  test("la compania rival no puede preguntar por el material ajeno", async () => {
    expect(
      await falla(() =>
        e
          .como("ramon")
          .query(api.inventarioAsignaciones.condominiosConMaterial, {
            companiaId: e.andina,
          }),
      ),
    ).toContain("No pertenece a esta compañía");
  });
});

describe("tope de las observaciones", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("una observacion desmesurada se rechaza al entregar", async () => {
    /* La observacion se guarda DOS veces —en la fila y dentro del texto de la
     * novedad—, asi que sin tope un punado de entregas basta para que la ficha
     * del elemento deje de caber en una respuesta y no vuelva a cargar. */
    const item = await itemDeAndina(e);
    const msg = await falla(() =>
      e
        .como("alicia")
        .mutation(api.inventarioAsignaciones.asignar, {
          itemId: item,
          condominioId: e.norte,
          observacion: "x".repeat(501),
        }),
    );
    expect(msg).toContain("500 caracteres");

    /* Y no se entrego a medias. */
    const { asignacionActiva } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: item });
    expect(asignacionActiva).toBeNull();
  });

  test("una observacion desmesurada se rechaza al devolver", async () => {
    const item = await itemDeAndina(e);
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: item,
        condominioId: e.norte,
      });

    expect(
      await falla(() =>
        e
          .como("alicia")
          .mutation(api.inventarioAsignaciones.devolver, {
            itemId: item,
            observacion: "y".repeat(501),
          }),
      ),
    ).toContain("500 caracteres");

    /* Y sigue fuera: la devolucion no se aplico a medias. */
    const { asignacionActiva } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: item });
    expect(asignacionActiva).not.toBeNull();
  });

  test("una observacion en el limite si entra", async () => {
    const item = await itemDeAndina(e);
    await e
      .como("alicia")
      .mutation(api.inventarioAsignaciones.asignar, {
        itemId: item,
        condominioId: e.norte,
        observacion: "z".repeat(500),
      });
    const { asignacionActiva } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: item });
    expect(asignacionActiva!.observacionAsignacion).toHaveLength(500);
  });
});
