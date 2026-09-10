import { test, expect, describe, beforeEach } from "vitest";
import { convexTest } from "convex-test";
import betterAuthTest from "@convex-dev/better-auth/test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const modules = import.meta.glob("../convex/**/*.ts");

/**
 * EL INVENTARIO DE UNA COMPANIA DE VIGILANCIA.
 *
 * Dos mitades, y la segunda importa tanto como la primera:
 *   - que el administrador pueda llevar su bodega (crear, editar, archivar,
 *     cargar por Excel) y que todo quede en el historial;
 *   - que NADIE mas pueda: ni la compania rival, ni el supervisor, ni el
 *     guarda, ni el administrador del conjunto que la empresa atiende.
 *
 * El aislamiento se prueba con dos companias de verdad y elementos de verdad
 * en las dos. Probarlo con una sola dejaria pasar el fallo mas facil de
 * cometer: filtrar por el `companiaId` que manda el cliente en vez de por el
 * del documento.
 */

const CLAVE = "clave-de-prueba-1";
const DIA = 24 * 60 * 60 * 1000;

type Escenario = Awaited<ReturnType<typeof montar>>;

async function montar() {
  const t = convexTest(schema, modules);
  betterAuthTest.register(t);

  const ahora = Date.now();

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

  const norte = await plataforma.mutation(api.condominios.create, {
    name: "Conjunto Norte",
  });

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

  /* Contrato de Andina sobre Norte: hace falta para que el administrador del
   * conjunto y el guarda existan de verdad en la misma orbita. Si el
   * aislamiento se probara con gente que no tiene nada que ver, no probaria
   * nada: lo dificil es negarle el inventario a quien SI trabaja con la
   * compania. */
  const contrato = await plataforma.mutation(api.companias.crearContrato, {
    companiaId: andina.companiaId,
    condominioId: norte,
    vigenciaDesde: ahora - 30 * DIA,
  });

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
    contratoId: contrato,
    companiaMiembroId: sofia.miembroId,
    rol: "supervisor",
    vigenciaDesde: ahora - 30 * DIA,
  });
  await plataforma.mutation(api.asignaciones.crear, {
    contratoId: contrato,
    companiaMiembroId: gabriel.miembroId,
    rol: "guardia",
    vigenciaDesde: ahora - 30 * DIA,
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
    andina: andina.companiaId,
    rival: rival.companiaId,
    como: (quien: keyof typeof authIds) =>
      t.withIdentity({ subject: authIds[quien] }),
    anonimo: t,
  };
}

/** Atajo: crea un elemento en Andina como Alicia. */
async function crearEnAndina(
  e: Escenario,
  datos: { nombre: string; serial?: string; descripcion?: string; fotoUrl?: string },
): Promise<Id<"inventarioItems">> {
  return await e.como("alicia").mutation(api.inventario.crear, {
    companiaId: e.andina,
    ...datos,
  });
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

describe("CRUD del inventario", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("el administrador crea un elemento y queda disponible y activo", async () => {
    const id = await crearEnAndina(e, {
      nombre: "Radio Motorola DEP450",
      serial: "vk-1042",
      descripcion: "Con bateria de repuesto",
    });

    const { item } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: id });

    expect(item.nombre).toBe("Radio Motorola DEP450");
    /* Normalizado al guardar, no solo al comparar: es lo que permite buscarlo
     * por el indice. */
    expect(item.serial).toBe("VK-1042");
    expect(item.estado).toBe("disponible");
    expect(item.archivado).toBe(false);
    expect(item.archivadoEn).toBeNull();
  });

  test("el listado devuelve lo de la compania y nada mas", async () => {
    await crearEnAndina(e, { nombre: "Radio A" });
    await crearEnAndina(e, { nombre: "Radio B" });
    await e.como("ramon").mutation(api.inventario.crear, {
      companiaId: e.rival,
      nombre: "Radio de la competencia",
    });

    const mio = await e
      .como("alicia")
      .query(api.inventario.listar, { companiaId: e.andina });

    expect(mio.items.map((i) => i.nombre).sort()).toEqual(["Radio A", "Radio B"]);
  });

  test("la busqueda mira nombre, serial y descripcion", async () => {
    await crearEnAndina(e, { nombre: "Radio Motorola", serial: "VK-1" });
    await crearEnAndina(e, { nombre: "Linterna", descripcion: "Recargable" });
    await crearEnAndina(e, { nombre: "Chaleco", serial: "MOTO-9" });

    const buscar = async (busqueda: string) =>
      (
        await e
          .como("alicia")
          .query(api.inventario.listar, { companiaId: e.andina, busqueda })
      ).items.map((i) => i.nombre);

    expect(await buscar("moto")).toEqual(
      expect.arrayContaining(["Radio Motorola", "Chaleco"]),
    );
    expect(await buscar("recargable")).toEqual(["Linterna"]);
    expect(await buscar("nada de esto")).toEqual([]);
  });

  test("editar cambia los datos y no toca el resto", async () => {
    const id = await crearEnAndina(e, {
      nombre: "Radio",
      serial: "VK-1",
      descripcion: "vieja",
    });

    await e.como("alicia").mutation(api.inventario.editar, {
      itemId: id,
      nombre: "Radio Motorola",
      serial: "VK-1",
      descripcion: "vieja",
    });

    const { item } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: id });
    expect(item.nombre).toBe("Radio Motorola");
    expect(item.serial).toBe("VK-1");
    expect(item.descripcion).toBe("vieja");
  });

  test("editar sin mandar un campo lo vacia: el formulario manda los cuatro", async () => {
    const id = await crearEnAndina(e, {
      nombre: "Radio",
      serial: "VK-1",
      descripcion: "con bateria",
    });

    await e
      .como("alicia")
      .mutation(api.inventario.editar, { itemId: id, nombre: "Radio" });

    const { item } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: id });
    expect(item.serial).toBeNull();
    expect(item.descripcion).toBeNull();
  });

  test("guardar sin cambiar nada no escribe ni ensucia el historial", async () => {
    const id = await crearEnAndina(e, { nombre: "Radio", serial: "VK-1" });

    const r = await e
      .como("alicia")
      .mutation(api.inventario.editar, {
        itemId: id,
        nombre: "Radio",
        serial: "VK-1",
      });
    expect(r).toEqual({ cambios: 0 });

    const { historial } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: id });
    expect(historial).toHaveLength(1);
    expect(historial[0]!.tipo).toBe("ITEM_CREATED");
  });
});

describe("archivado (nunca borrado fisico)", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("archivar saca del listado activo pero la fila sigue existiendo", async () => {
    const id = await crearEnAndina(e, { nombre: "Radio viejo", serial: "VK-1" });
    await e.como("alicia").mutation(api.inventario.archivar, { itemId: id });

    const activos = await e
      .como("alicia")
      .query(api.inventario.listar, { companiaId: e.andina });
    expect(activos.items).toHaveLength(0);

    const archivados = await e
      .como("alicia")
      .query(api.inventario.listar, {
        companiaId: e.andina,
        archivo: "archivados",
      });
    expect(archivados.items.map((i) => i.nombre)).toEqual(["Radio viejo"]);
    expect(archivados.items[0]!.archivado).toBe(true);
    expect(archivados.items[0]!.archivadoEn).toBeGreaterThan(0);
  });

  test("un elemento archivado se sigue pudiendo consultar con su historial", async () => {
    const id = await crearEnAndina(e, { nombre: "Radio viejo" });
    await e
      .como("alicia")
      .mutation(api.inventario.archivar, { itemId: id, motivo: "Se perdio" });

    const { item, historial } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: id });
    expect(item.archivado).toBe(true);
    expect(item.archivadoPorNombre).toBe("Alicia Admin");
    expect(historial.map((h) => h.tipo)).toEqual(["ITEM_ARCHIVED", "ITEM_CREATED"]);
    expect(historial[0]!.descripcion).toContain("Se perdio");
  });

  test("un elemento archivado no se puede editar", async () => {
    const id = await crearEnAndina(e, { nombre: "Radio" });
    await e.como("alicia").mutation(api.inventario.archivar, { itemId: id });

    const msg = await falla(() =>
      e
        .como("alicia")
        .mutation(api.inventario.editar, { itemId: id, nombre: "Otro nombre" }),
    );
    expect(msg).toContain("archivado");
  });

  test("archivar dos veces no duplica la linea del historial", async () => {
    const id = await crearEnAndina(e, { nombre: "Radio" });
    await e.como("alicia").mutation(api.inventario.archivar, { itemId: id });
    const segunda = await e
      .como("alicia")
      .mutation(api.inventario.archivar, { itemId: id });

    expect(segunda).toEqual({ yaEstaba: true });
    const { historial } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: id });
    expect(historial.filter((h) => h.tipo === "ITEM_ARCHIVED")).toHaveLength(1);
  });

  test("el listado avisa cuando no lo esta enseñando todo", async () => {
    /* El tope existe porque Convex limita los documentos por consulta, pero
     * callarlo seria peor que el tope: quien busca un elemento y no lo ve
     * concluye que no existe. Con inventarios pequeños nunca se activa. */
    await crearEnAndina(e, { nombre: "Radio" });
    const lista = await e
      .como("alicia")
      .query(api.inventario.listar, { companiaId: e.andina });
    expect(lista.truncado).toBe(false);
    expect(lista.totalSinFiltrar).toBe(1);
  });

  test("los conteos separan activos de archivados", async () => {
    const a = await crearEnAndina(e, { nombre: "Radio A" });
    await crearEnAndina(e, { nombre: "Radio B" });
    await e.como("alicia").mutation(api.inventario.archivar, { itemId: a });

    const c = await e
      .como("alicia")
      .query(api.inventario.conteos, { companiaId: e.andina });
    /* `aproximado` dice si el conteo se quedo corto por el tope de lectura.
     * Convex no tiene una operacion de contar: contar es leer, y un contador
     * que miente en silencio es peor que uno que dice "2000+". */
    expect(c).toEqual({
      activos: 1,
      activosAproximado: false,
      archivados: 1,
      archivadosAproximado: false,
      /* La custodia es otro eje: nada entregado, todo en bodega. */
      enCondominio: 0,
      enCompania: 1,
    });
  });
});

describe("serial: unico entre los activos de una compania", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("dos activos no pueden compartir serial", async () => {
    await crearEnAndina(e, { nombre: "Radio A", serial: "VK-1042" });
    const msg = await falla(() =>
      crearEnAndina(e, { nombre: "Radio B", serial: "VK-1042" }),
    );
    expect(msg).toContain("Ya existe un elemento activo con el serial VK-1042");
  });

  test("la caja y los espacios no sirven para colar un duplicado", async () => {
    await crearEnAndina(e, { nombre: "Radio A", serial: "VK-1042" });
    const msg = await falla(() =>
      crearEnAndina(e, { nombre: "Radio B", serial: "  vk-1042 " }),
    );
    expect(msg).toContain("Ya existe");
  });

  test("editar tampoco puede pisar el serial de otro", async () => {
    await crearEnAndina(e, { nombre: "Radio A", serial: "VK-1" });
    const b = await crearEnAndina(e, { nombre: "Radio B", serial: "VK-2" });

    const msg = await falla(() =>
      e
        .como("alicia")
        .mutation(api.inventario.editar, {
          itemId: b,
          nombre: "Radio B",
          serial: "VK-1",
        }),
    );
    expect(msg).toContain("Ya existe");
  });

  test("un elemento puede guardar su propio serial sin chocar consigo mismo", async () => {
    const id = await crearEnAndina(e, { nombre: "Radio", serial: "VK-1" });
    await e.como("alicia").mutation(api.inventario.editar, {
      itemId: id,
      nombre: "Radio renombrado",
      serial: "VK-1",
    });
    const { item } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: id });
    expect(item.nombre).toBe("Radio renombrado");
  });

  test("archivar libera el serial: la flota se renueva", async () => {
    const viejo = await crearEnAndina(e, { nombre: "Radio viejo", serial: "VK-1" });
    await e.como("alicia").mutation(api.inventario.archivar, { itemId: viejo });

    const nuevo = await crearEnAndina(e, { nombre: "Radio nuevo", serial: "VK-1" });
    expect(nuevo).toBeTruthy();
  });

  test("dos companias distintas pueden tener el mismo serial grabado", async () => {
    await crearEnAndina(e, { nombre: "Radio", serial: "VK-1" });
    const otro = await e.como("ramon").mutation(api.inventario.crear, {
      companiaId: e.rival,
      nombre: "Radio",
      serial: "VK-1",
    });
    expect(otro).toBeTruthy();
  });

  test("varios elementos sin serial conviven", async () => {
    await crearEnAndina(e, { nombre: "Chaleco" });
    await crearEnAndina(e, { nombre: "Chaleco" });
    const lista = await e
      .como("alicia")
      .query(api.inventario.listar, { companiaId: e.andina });
    expect(lista.items).toHaveLength(2);
  });
});

describe("historial: cada operacion deja su novedad", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("crear deja ITEM_CREATED con quien lo hizo", async () => {
    const id = await crearEnAndina(e, { nombre: "Radio" });
    const { historial } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: id });

    expect(historial).toHaveLength(1);
    expect(historial[0]!.tipo).toBe("ITEM_CREATED");
    expect(historial[0]!.actorNombre).toBe("Alicia Admin");
    expect(historial[0]!.createdAt).toBeGreaterThan(0);
  });

  test("editar deja ITEM_UPDATED con el detalle campo por campo", async () => {
    const id = await crearEnAndina(e, { nombre: "Radio", serial: "VK-1" });
    await e.como("alicia").mutation(api.inventario.editar, {
      itemId: id,
      nombre: "Radio Motorola",
      serial: "VK-2",
    });

    const { historial } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: id });
    const edicion = historial.find((h) => h.tipo === "ITEM_UPDATED")!;

    /* La razon de existir de `cambios`: "Item editado" a secas no responde la
     * pregunta por la que alguien abre un historial. */
    expect(edicion.cambios).toEqual([
      { campo: "Nombre", antes: "Radio", despues: "Radio Motorola" },
      { campo: "Serial", antes: "VK-1", despues: "VK-2" },
    ]);
  });

  test("el historial va del mas reciente al mas antiguo", async () => {
    const id = await crearEnAndina(e, { nombre: "Radio" });
    await e
      .como("alicia")
      .mutation(api.inventario.editar, { itemId: id, nombre: "Radio 2" });
    await e.como("alicia").mutation(api.inventario.archivar, { itemId: id });

    const { historial } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: id });
    expect(historial.map((h) => h.tipo)).toEqual([
      "ITEM_ARCHIVED",
      "ITEM_UPDATED",
      "ITEM_CREATED",
    ]);
  });

  test("el historial es de su elemento y no se mezcla con el de otro", async () => {
    const a = await crearEnAndina(e, { nombre: "Radio A" });
    const b = await crearEnAndina(e, { nombre: "Radio B" });
    await e
      .como("alicia")
      .mutation(api.inventario.editar, { itemId: a, nombre: "Radio A2" });

    const hb = await e.como("alicia").query(api.inventario.detalle, { itemId: b });
    expect(hb.historial).toHaveLength(1);
    expect(hb.historial[0]!.tipo).toBe("ITEM_CREATED");
  });
});

describe("aislamiento entre companias", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("la compania rival no puede listar el inventario ajeno", async () => {
    await crearEnAndina(e, { nombre: "Radio" });
    const msg = await falla(() =>
      e.como("ramon").query(api.inventario.listar, { companiaId: e.andina }),
    );
    expect(msg).toContain("No pertenece a esta compañía");
  });

  test("la compania rival no puede ver el detalle de un elemento ajeno", async () => {
    const id = await crearEnAndina(e, { nombre: "Radio" });
    const msg = await falla(() =>
      e.como("ramon").query(api.inventario.detalle, { itemId: id }),
    );
    expect(msg).toContain("No pertenece a esta compañía");
  });

  test("la compania rival no puede editar ni archivar un elemento ajeno", async () => {
    const id = await crearEnAndina(e, { nombre: "Radio" });

    expect(
      await falla(() =>
        e
          .como("ramon")
          .mutation(api.inventario.editar, { itemId: id, nombre: "Mio ahora" }),
      ),
    ).toContain("No pertenece a esta compañía");

    expect(
      await falla(() =>
        e.como("ramon").mutation(api.inventario.archivar, { itemId: id }),
      ),
    ).toContain("No pertenece a esta compañía");
  });

  test("mandar el propio companiaId no da acceso al elemento de otra", async () => {
    /* El fallo mas facil de cometer: filtrar por el `companiaId` que llega en
     * los argumentos. Aqui `editar` NO lo recibe — sale del documento —, asi
     * que no hay forma de mentir sobre a quien pertenece el elemento. */
    const id = await crearEnAndina(e, { nombre: "Radio" });
    const msg = await falla(() =>
      e
        .como("ramon")
        .mutation(api.inventario.editar, { itemId: id, nombre: "Secuestrado" }),
    );
    expect(msg).toContain("No pertenece a esta compañía");

    const { item } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: id });
    expect(item.nombre).toBe("Radio");
  });

  test("la compania rival no puede cargar elementos en el inventario ajeno", async () => {
    const msg = await falla(() =>
      e.como("ramon").mutation(api.inventario.importar, {
        companiaId: e.andina,
        filas: [{ nombre: "Radio colado" }],
      }),
    );
    expect(msg).toContain("No pertenece a esta compañía");

    const lista = await e
      .como("alicia")
      .query(api.inventario.listar, { companiaId: e.andina });
    expect(lista.items).toHaveLength(0);
  });
});

describe("autorizacion por rol", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("sin sesion no se lee nada", async () => {
    const msg = await falla(() =>
      e.anonimo.query(api.inventario.listar, { companiaId: e.andina }),
    );
    expect(msg).toContain("No autenticado");
  });

  test("el supervisor de la propia compania todavia no entra al inventario", async () => {
    /* Entregar y recibir elementos es la tarea 3. Darle permiso antes de que
     * ese flujo exista le abriria hoy el CRUD entero de la bodega. */
    const msg = await falla(() =>
      e.como("sofia").query(api.inventario.listar, { companiaId: e.andina }),
    );
    expect(msg).toContain("inventario.ver");
  });

  test("el guarda de la propia compania no entra al inventario", async () => {
    const msg = await falla(() =>
      e.como("gabriel").query(api.inventario.listar, { companiaId: e.andina }),
    );
    expect(msg).toContain("inventario.ver");
  });

  test("el guarda tampoco puede crear elementos", async () => {
    const msg = await falla(() =>
      e.como("gabriel").mutation(api.inventario.crear, {
        companiaId: e.andina,
        nombre: "Radio mio",
      }),
    );
    expect(msg).toContain("inventario.gestionar");
  });

  test("el administrador del CONJUNTO no ve el inventario de la compania que lo cubre", async () => {
    /* Tiene contrato vigente con Andina y manda en su porteria, pero la
     * bodega es de la empresa: no es su patrimonio ni su responsabilidad. */
    await crearEnAndina(e, { nombre: "Radio" });
    const msg = await falla(() =>
      e.como("hernan").query(api.inventario.listar, { companiaId: e.andina }),
    );
    expect(msg).toContain("No pertenece a esta compañía");
  });

  test("la plataforma mantiene el paso libre que ya tiene en todo lo demas", async () => {
    const id = await crearEnAndina(e, { nombre: "Radio" });
    const { item } = await e.plataforma.query(api.inventario.detalle, {
      itemId: id,
    });
    expect(item.nombre).toBe("Radio");
  });

  test("una compania suspendida no opera su inventario, ni su administrador", async () => {
    await e.plataforma.mutation(api.companias.setEstado, {
      companiaId: e.andina,
      estado: "suspendida",
    });
    const msg = await falla(() =>
      e.como("alicia").query(api.inventario.listar, { companiaId: e.andina }),
    );
    expect(msg).toContain("suspendida");
  });
});

describe("carga masiva por Excel", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  const filas = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      nombre: `Radio ${i}`,
      serial: `VK-${i}`,
    }));

  test("una carga valida entra entera y cada elemento trae su novedad", async () => {
    const r = await e.como("alicia").mutation(api.inventario.importar, {
      companiaId: e.andina,
      filas: filas(3),
    });

    expect(r.aplicado).toBe(true);
    expect(r.importados).toBe(3);

    const lista = await e
      .como("alicia")
      .query(api.inventario.listar, { companiaId: e.andina });
    expect(lista.items).toHaveLength(3);

    const { historial } = await e
      .como("alicia")
      .query(api.inventario.detalle, { itemId: lista.items[0]!._id });
    expect(historial).toHaveLength(1);
    expect(historial[0]!.tipo).toBe("ITEM_IMPORTED");
    /* Con la fila del Excel de la que salio: es lo que permite volver al
     * archivo cuando aparecen doscientos elementos iguales. */
    expect(historial[0]!.descripcion).toMatch(/fila \d+/);
  });

  test("con una sola fila mala NO entra nada, y se dice cual y por que", async () => {
    const r = await e.como("alicia").mutation(api.inventario.importar, {
      companiaId: e.andina,
      filas: [
        { nombre: "Radio bueno", serial: "VK-1" },
        { serial: "SIN-NOMBRE" },
        { nombre: "Otro bueno", serial: "VK-2" },
      ],
    });

    expect(r.aplicado).toBe(false);
    expect(r.importados).toBe(0);
    expect(r.informe.validas).toBe(2);
    expect(r.informe.invalidas).toBe(1);

    const mala = r.informe.filas.find((f) => f.estado === "invalida")!;
    expect(mala.fila).toBe(3);
    expect(mala.estado === "invalida" && mala.motivos[0]!.codigo).toBe(
      "FALTA_NOMBRE",
    );

    /* Lo importante: la base quedo intacta. No hay estado a medias. */
    const lista = await e
      .como("alicia")
      .query(api.inventario.listar, { companiaId: e.andina });
    expect(lista.items).toHaveLength(0);
  });

  test("con omitirInvalidas entran las buenas y se detallan las descartadas", async () => {
    const r = await e.como("alicia").mutation(api.inventario.importar, {
      companiaId: e.andina,
      filas: [
        { nombre: "Radio bueno", serial: "VK-1" },
        { serial: "SIN-NOMBRE" },
      ],
      omitirInvalidas: true,
    });

    expect(r.aplicado).toBe(true);
    expect(r.importados).toBe(1);
    expect(r.informe.invalidas).toBe(1);

    const lista = await e
      .como("alicia")
      .query(api.inventario.listar, { companiaId: e.andina });
    expect(lista.items.map((i) => i.nombre)).toEqual(["Radio bueno"]);
  });

  test("dos filas del archivo con el mismo serial se descartan las dos", async () => {
    const r = await e.como("alicia").mutation(api.inventario.importar, {
      companiaId: e.andina,
      filas: [
        { nombre: "Radio A", serial: "VK-9" },
        { nombre: "Radio B", serial: "vk-9" },
      ],
      omitirInvalidas: true,
    });

    /* Ninguna de las dos, no la primera: el sistema no puede adivinar cual es
     * la buena, y quedarse con una crearia justo el duplicado silencioso que
     * la regla existe para evitar. */
    expect(r.importados).toBe(0);
    expect(r.informe.invalidas).toBe(2);
  });

  test("un serial que ya esta en el inventario se rechaza en la carga", async () => {
    await crearEnAndina(e, { nombre: "Radio existente", serial: "VK-1042" });

    const r = await e.como("alicia").mutation(api.inventario.importar, {
      companiaId: e.andina,
      filas: [{ nombre: "Radio repetido", serial: "vk-1042" }],
    });

    expect(r.aplicado).toBe(false);
    const mala = r.informe.filas.find((f) => f.estado === "invalida")!;
    expect(mala.estado === "invalida" && mala.motivos[0]!.codigo).toBe(
      "SERIAL_YA_EXISTE",
    );
  });

  test("las filas en blanco del final no cuentan como error", async () => {
    const r = await e.como("alicia").mutation(api.inventario.importar, {
      companiaId: e.andina,
      filas: [{ nombre: "Radio" }, {}, { nombre: "  " }],
    });

    expect(r.aplicado).toBe(true);
    expect(r.importados).toBe(1);
    expect(r.informe.vacias).toBe(2);
    expect(r.informe.invalidas).toBe(0);
  });

  test("un archivo sin filas se rechaza con un mensaje que se entiende", async () => {
    const msg = await falla(() =>
      e
        .como("alicia")
        .mutation(api.inventario.importar, { companiaId: e.andina, filas: [] }),
    );
    expect(msg).toContain("no tiene ninguna fila");
  });

  test("un archivo con solo filas en blanco no importa nada", async () => {
    const r = await e.como("alicia").mutation(api.inventario.importar, {
      companiaId: e.andina,
      filas: [{}, { nombre: "   " }],
    });
    expect(r.aplicado).toBe(false);
    expect(r.importados).toBe(0);
    expect(r.informe.vacias).toBe(2);
  });

  test("un archivo demasiado grande se rechaza antes de escribir nada", async () => {
    const msg = await falla(() =>
      e
        .como("alicia")
        .mutation(api.inventario.importar, {
          companiaId: e.andina,
          filas: filas(501),
        }),
    );
    expect(msg).toContain("máximo por carga");
  });

  test("la previsualizacion dice lo mismo que va a pasar, y no escribe nada", async () => {
    const entrada = [
      { nombre: "Radio bueno", serial: "VK-1" },
      { serial: "SIN-NOMBRE" },
    ];

    const previo = await e
      .como("alicia")
      .query(api.inventario.previsualizarImportacion, {
        companiaId: e.andina,
        filas: entrada,
      });

    expect(previo.validas).toBe(1);
    expect(previo.invalidas).toBe(1);

    const lista = await e
      .como("alicia")
      .query(api.inventario.listar, { companiaId: e.andina });
    expect(lista.items).toHaveLength(0);

    const real = await e
      .como("alicia")
      .mutation(api.inventario.importar, {
        companiaId: e.andina,
        filas: entrada,
        omitirInvalidas: true,
      });
    expect(real.informe.validas).toBe(previo.validas);
    expect(real.informe.invalidas).toBe(previo.invalidas);
  });

  test("los elementos archivados no bloquean un serial que se vuelve a cargar", async () => {
    const viejo = await crearEnAndina(e, { nombre: "Radio viejo", serial: "VK-1" });
    await e.como("alicia").mutation(api.inventario.archivar, { itemId: viejo });

    const r = await e.como("alicia").mutation(api.inventario.importar, {
      companiaId: e.andina,
      filas: [{ nombre: "Radio nuevo", serial: "VK-1" }],
    });
    expect(r.aplicado).toBe(true);
    expect(r.importados).toBe(1);
  });
});
