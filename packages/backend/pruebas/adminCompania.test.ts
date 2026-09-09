import { test, expect, describe, beforeEach } from "vitest";
import { convexTest } from "convex-test";
import betterAuthTest from "@convex-dev/better-auth/test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import { createAuth } from "../convex/auth";
import type { Id } from "../convex/_generated/dataModel";

const modules = import.meta.glob("../convex/**/*.ts");

/**
 * EL ADMINISTRADOR DE UNA COMPANIA DE VIGILANCIA.
 *
 * Entraba bien y no veia un solo conjunto, aunque su empresa tuviera
 * contratos vigentes con varios. No era que faltaran datos ni que una
 * consulta filtrara mal: el contexto de sesion se armaba con `memberships` y
 * `asignaciones`, y el vinculo de este rol es un TERCER eje —
 * `companiaMiembros`— que nunca se conecto. El backend sabia cual era su
 * compania si se le preguntaba (`companias.miCompania` la devolvia bien);
 * simplemente nadie se lo preguntaba al arrancar la sesion.
 *
 * Estas pruebas fijan las dos mitades: ve lo de su empresa, y solo lo de su
 * empresa.
 */

const DIA = 24 * 60 * 60 * 1000;
const CLAVE = "clave-de-prueba-1";

type Escenario = Awaited<ReturnType<typeof montar>>;

/**
 * Dos companias con contratos vigentes.
 *
 *   Andina -> Norte (guarda Gabriel, supervisora Sofia) y Sur
 *   Rival  -> Oriente
 *
 * Alicia administra Andina. Los conjuntos EXISTEN y ESTAN asociados: lo que
 * se prueba no es que haya datos, sino que lleguen.
 */
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

  const condo = async (name: string) =>
    await plataforma.mutation(api.condominios.create, { name });
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

  const contrato = async (
    companiaId: Id<"companiasSeguridad">,
    condominioId: Id<"condominios">,
  ) =>
    await plataforma.mutation(api.companias.crearContrato, {
      companiaId,
      condominioId,
      vigenciaDesde: desde,
    });
  const kNorte = await contrato(andina.companiaId, norte);
  await contrato(andina.companiaId, sur);
  await contrato(rival.companiaId, oriente);

  // Personal de Andina en Norte, para que haya algo que administrar.
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
  for (const m of [sofia, gabriel]) {
    await plataforma.mutation(api.asignaciones.crear, {
      contratoId: kNorte,
      companiaMiembroId: m.miembroId,
      rol: m === sofia ? "supervisor" : "guardia",
      vigenciaDesde: desde,
    });
  }

  // Un administrador del conjunto, de los que ya funcionaban.
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
    andina,
    rival,
    kNorte,
    como: (quien: keyof typeof authIds) =>
      t.withIdentity({ subject: authIds[quien] }),
  };
}

/**
 * Deja operacion real en un conjunto: turno abierto, una ronda y una anotacion
 * dentro de ella. Por la API del guarda y no insertando filas, para que lo que
 * despues lee la compania sea lo mismo que produce la porteria.
 */
async function operar(
  e: Escenario,
  quien: "gabriel",
  condominioId: Id<"condominios">,
  zona: string,
) {
  const guarda = e.como(quien);
  await guarda.mutation(api.guardia.iniciarTurno, {
    condominioId,
    checklist: [
      {
        item: "Radio",
        obligatorio: true,
        cantidadEsperada: 1,
        cantidadEncontrada: 1,
        estadoOk: true,
      },
    ],
  });
  const { rondaId } = await guarda.mutation(api.rondas.iniciar, {
    condominioId,
    zona,
  });
  await guarda.mutation(api.guardia.registrarEventoMinuta, {
    condominioId,
    tipo: "Anotacion",
    resumen: `Novedad de ${zona}`,
  });
  await guarda.mutation(api.rondas.finalizar, {
    rondaId,
    observaciones: "Sin novedad",
  });
  return rondaId;
}

async function iniciarSesion(e: Escenario, email: string) {
  return await e.t.run(async (ctx) => {
    const auth = createAuth(ctx as never);
    try {
      await auth.api.signInEmail({ body: { email, password: CLAVE } });
      return { ok: true };
    } catch (err) {
      return { ok: false, motivo: (err as Error).message };
    }
  });
}

describe("el administrador de compania ve los conjuntos de su empresa", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("1 y 2. inicia sesion y la sesion identifica su compania", async () => {
    expect(await iniciarSesion(e, "alicia@andina.test")).toEqual({ ok: true });

    const me = await e.como("alicia").query(api.users.me, {});

    /* La forma del fallo: los dos ejes que el frontend miraba, vacios. No es
     * un error —no pertenece a ningun conjunto ni cubre ninguna porteria— y
     * por eso hacia falta el tercero. */
    expect(me!.memberships).toEqual([]);
    expect(me!.asignaciones).toEqual([]);

    expect(me!.compania).not.toBeNull();
    expect(me!.compania!.companiaId).toBe(e.andina.companiaId);
    expect(me!.compania!.nombre).toBe("Seguridad Andina");
    expect(me!.compania!.roles).toEqual(["admin_compania"]);

    // Y responde lo mismo que la consulta que ya existia: un solo resolutor.
    const mia = await e.como("alicia").query(api.companias.miCompania, {});
    expect(mia).toEqual(me!.compania);
  });

  test("3 y 4. consulta y visualiza los conjuntos contratados", async () => {
    const detalle = await e
      .como("alicia")
      .query(api.companias.detail, { companiaId: e.andina.companiaId });

    expect(
      detalle!.contratos.map((k) => [k.condominioNombre, k.estado]),
    ).toEqual([
      ["Conjunto Norte", "vigente"],
      ["Conjunto Sur", "vigente"],
    ]);
    // Y su nomina entera, que es el otro lado de su trabajo.
    expect(detalle!.personal.map((p) => p.nombre).sort()).toEqual([
      "Alicia Admin",
      "Gabriel Guarda",
      "Sofia Supervisora",
    ]);
  });

  test("5 y 6. al seleccionar un conjunto suyo alcanza su operacion", async () => {
    const acceso = await e
      .como("alicia")
      .query(api.asignaciones.miAcceso, { condominioId: e.norte });
    expect(acceso!.capacidades).toEqual(["porteria.ver"]);

    // Quien cubre la porteria de ese conjunto.
    const quienes = await e
      .como("alicia")
      .query(api.asignaciones.porCondominio, { condominioId: e.norte });
    expect(quienes.map((a) => a.nombre).sort()).toEqual([
      "Gabriel Guarda",
      "Sofia Supervisora",
    ]);

    // Y su operacion: rondas, minuta y turnos.
    await expect(
      e.como("alicia").query(api.rondas.listar, { condominioId: e.norte }),
    ).resolves.toEqual([]);
    await expect(
      e.como("alicia").query(api.guardia.listMinuta, { condominioId: e.norte }),
    ).resolves.toEqual([]);
    await expect(
      e.como("alicia").query(api.guardia.listTurnos, { condominioId: e.norte }),
    ).resolves.toEqual([]);
  });

  test("7. cambia de conjunto y el contexto cambia con el", async () => {
    for (const condominioId of [e.norte, e.sur]) {
      const acceso = await e
        .como("alicia")
        .query(api.asignaciones.miAcceso, { condominioId });
      expect(acceso!.capacidades).toEqual(["porteria.ver"]);
    }
  });

  test("mirar no es operar: sigue sin poder tocar la porteria", async () => {
    /* `porteria.ver` y nada mas. El administrador de la empresa no abre
     * turnos ni escribe en la minuta de un conjunto. */
    await expect(
      e.como("alicia").mutation(api.guardia.iniciarTurno, {
        condominioId: e.norte,
        checklist: [
          {
            item: "Radio",
            obligatorio: true,
            cantidadEsperada: 1,
            cantidadEncontrada: 1,
            estadoOk: true,
          },
        ],
      }),
    ).rejects.toThrow();
    expect(
      (await e.como("alicia").query(api.guardia.home, { condominioId: e.norte }))
        .allowed,
    ).toBe(false);
    // Ni la administracion del conjunto, que es de sus residentes.
    expect(
      (
        await e
          .como("alicia")
          .query(api.condominios.adminHome, { condominioId: e.norte })
      ).allowed,
    ).toBe(false);
  });

  test("el acceso cuelga del CONTRATO, no del cargo", async () => {
    const contratos = await e.plataforma.query(
      api.companias.contratosDeCondominio,
      { condominioId: e.norte },
    );
    await e.plataforma.mutation(api.companias.terminarContrato, {
      contratoId: contratos[0]!._id,
      vigenciaHasta: Date.now() - 2 * DIA,
    });

    const acceso = await e
      .como("alicia")
      .query(api.asignaciones.miAcceso, { condominioId: e.norte });
    expect(acceso!.capacidades).toEqual([]);
    await expect(
      e.como("alicia").query(api.rondas.listar, { condominioId: e.norte }),
    ).rejects.toThrow(/porteria\.ver/);

    // Sur, que sigue contratado, no se ve afectado.
    const sur = await e
      .como("alicia")
      .query(api.asignaciones.miAcceso, { condominioId: e.sur });
    expect(sur!.capacidades).toEqual(["porteria.ver"]);
  });

  test("suspender la compania lo deja fuera tambien a el", async () => {
    await e.plataforma.mutation(api.companias.setEstado, {
      companiaId: e.andina.companiaId,
      estado: "suspendida",
    });
    const acceso = await e
      .como("alicia")
      .query(api.asignaciones.miAcceso, { condominioId: e.norte });
    expect(acceso!.capacidades).toEqual([]);
  });
});

/**
 * LA MINUTA GENERAL DEL EQUIPO, CONJUNTO POR CONJUNTO.
 *
 * El permiso ya estaba —`resolverAcceso` le da `porteria.ver` por el
 * contrato— y las consultas ya respondian. Lo que no existia era el ambito:
 * `miEquipo` solo resolvia la via del supervisor, asi que el administrador no
 * tenia ni un conjunto donde entrar. Sus propios supervisores veian la
 * operacion de un conjunto y el no.
 */
describe("el administrador ve la minuta del equipo de cada conjunto", () => {
  let e: Escenario;
  let rondaNorte: Id<"guardiaRondas">;

  beforeEach(async () => {
    e = await montar();
    rondaNorte = await operar(e, "gabriel", e.norte, "Zona A");
  });

  test("sus conjuntos contratados, cada uno con su equipo", async () => {
    const equipo = await e.como("alicia").query(api.asignaciones.miEquipo, {});
    expect(equipo.map((c) => c.condominioNombre)).toEqual([
      "Conjunto Norte",
      "Conjunto Sur",
    ]);
    /* Por contrato, no por asignacion: el administrador no cubre turnos. */
    expect(equipo.every((c) => c.via === "admin_compania")).toBe(true);
    expect(equipo.every((c) => c.asignacionId === null)).toBe(true);

    const norte = equipo.find((c) => c.condominioId === e.norte)!;
    expect(norte.guardas.map((g) => g.nombre)).toEqual(["Gabriel Guarda"]);
    expect(norte.companiaNombre).toBe("Seguridad Andina");
  });

  test("selecciona un conjunto y ve SU minuta, con la ronda de cada evento", async () => {
    const minuta = await e
      .como("alicia")
      .query(api.guardia.listMinuta, { condominioId: e.norte });

    const evento = minuta.find((m) => m.resumen === "Novedad de Zona A")!;
    expect(evento.actorNombre).toBe("Gabriel Guarda");
    expect(evento.rondaId).toBe(rondaNorte);
    expect(evento.rondaNumero).toBe(1);
    expect(evento.rondaZona).toBe("Zona A");
  });

  test("cambia de conjunto y la minuta cambia con el", async () => {
    /* Sur esta contratado pero sin operacion: responde vacio, no responde lo
     * de Norte. Es la mitad que se rompe cuando el conjunto seleccionado no
     * llega hasta la consulta. */
    await expect(
      e.como("alicia").query(api.guardia.listMinuta, { condominioId: e.sur }),
    ).resolves.toEqual([]);

    const norte = await e
      .como("alicia")
      .query(api.guardia.listMinuta, { condominioId: e.norte });
    expect(norte.some((m) => m.resumen === "Novedad de Zona A")).toBe(true);
  });

  test("el conjunto sale del contrato: al terminarlo desaparece del panel", async () => {
    const contratos = await e.plataforma.query(
      api.companias.contratosDeCondominio,
      { condominioId: e.norte },
    );
    await e.plataforma.mutation(api.companias.terminarContrato, {
      contratoId: contratos[0]!._id,
      vigenciaHasta: Date.now() - 2 * DIA,
    });

    const equipo = await e.como("alicia").query(api.asignaciones.miEquipo, {});
    expect(equipo.map((c) => c.condominioNombre)).toEqual(["Conjunto Sur"]);
    /* Y no es solo que no se liste: la minuta tampoco se deja leer. */
    await expect(
      e.como("alicia").query(api.guardia.listMinuta, { condominioId: e.norte }),
    ).rejects.toThrow(/porteria\.ver/);
  });

  test("suspender la compania lo deja sin panel", async () => {
    await e.plataforma.mutation(api.companias.setEstado, {
      companiaId: e.andina.companiaId,
      estado: "suspendida",
    });
    expect(await e.como("alicia").query(api.asignaciones.miEquipo, {})).toEqual(
      [],
    );
  });

  test("el administrador de la otra compania no alcanza estos conjuntos", async () => {
    const equipo = await e.como("ramon").query(api.asignaciones.miEquipo, {});
    expect(equipo.map((c) => c.condominioId)).toEqual([e.oriente]);
    expect(equipo.flatMap((c) => c.guardas.map((g) => g.nombre))).toEqual([]);
  });

  test("mirar la minuta no es escribirla", async () => {
    await expect(
      e.como("alicia").mutation(api.guardia.registrarEventoMinuta, {
        condominioId: e.norte,
        tipo: "Anotacion",
        resumen: "No deberia poder",
      }),
    ).rejects.toThrow();
  });

  test("el supervisor sigue viendo su conjunto igual que antes", async () => {
    /* La via del supervisor no se toco: `miEquipo` la resuelve primero y la
     * del contrato solo anade los que faltan. */
    const equipo = await e.como("sofia").query(api.asignaciones.miEquipo, {});
    expect(equipo.map((c) => c.condominioNombre)).toEqual(["Conjunto Norte"]);
    expect(equipo[0]!.via).toBe("supervisor");
    expect(equipo[0]!.asignacionId).not.toBeNull();
    expect(equipo[0]!.guardas.map((g) => g.nombre)).toEqual(["Gabriel Guarda"]);
  });
});


/**
 * TERMINAR CONTRATO Y ARCHIVAR.
 *
 * El boton no hacia nada por dos motivos distintos y los dos reales:
 *
 *  1. A la compania la rechazaba `requirePlatformStaff`, y el frontend se
 *     tragaba el error. Ni cambio ni aviso.
 *  2. A la plataforma SI le escribia, pero mandaba `vigenciaHasta = hoy` y
 *     `finDe` regala el dia entero: el contrato seguia vigente 24 horas.
 *     Escribia, y aun asi no cambiaba nada.
 *
 * El archivado no estrena estado: un conjunto archivado es un contrato con
 * `estadoVigencia === "terminada"`, y una compania archivada es la que ya
 * tenia `estado: "inactiva"`.
 */
describe("terminar el contrato de un conjunto lo archiva", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  const contratoDe = async (
    quien: "alicia" | "ramon",
    condominioId: Id<"condominios">,
    companiaId: Id<"companiasSeguridad">,
  ) => {
    const detalle = await e
      .como(quien)
      .query(api.companias.detail, { companiaId });
    return detalle!.contratos.find((k) => k.condominioId === condominioId)!;
  };

  /** CASO 1 - plataforma: activo -> archivado, en el acto. */
  test("1. el superadmin lo termina y pasa de activos a archivados", async () => {
    const antes = await contratoDe("alicia", e.norte, e.andina.companiaId);
    expect(antes.estado).toBe("vigente");
    expect(antes.archivado).toBe(false);

    const r = await e.plataforma.mutation(api.companias.terminarContrato, {
      contratoId: antes._id,
    });
    expect(r.ok).toBe(true);
    expect(r.yaEstaba).toBe(false);
    /* Deja sin porteria a los dos que cubrian Norte. */
    expect(r.personasAfectadas).toBe(2);

    const despues = await contratoDe("alicia", e.norte, e.andina.companiaId);
    expect(despues.estado).toBe("terminada");
    expect(despues.archivado).toBe(true);
    expect(despues.terminadoEn).not.toBeNull();

    /* Y de verdad: el corte es AHORA, no manana. Es la mitad que fallaba. */
    const acceso = await e
      .como("alicia")
      .query(api.asignaciones.miAcceso, { condominioId: e.norte });
    expect(acceso!.capacidades).toEqual([]);
    expect(
      (await e.como("gabriel").query(api.guardia.home, { condominioId: e.norte }))
        .allowed,
    ).toBe(false);
  });

  /** CASO 2 - el administrador de la compania puede terminar el suyo. */
  test("2. el administrador de compania termina su conjunto", async () => {
    const k = await contratoDe("alicia", e.sur, e.andina.companiaId);
    const r = await e
      .como("alicia")
      .mutation(api.companias.terminarContrato, { contratoId: k._id });
    expect(r.ok).toBe(true);

    const despues = await contratoDe("alicia", e.sur, e.andina.companiaId);
    expect(despues.archivado).toBe(true);
    /* AUDITORIA: queda quien lo termino, no solo que se termino. */
    expect(despues.terminadoPorNombre).toBe("Alicia Admin");

    // Sale de sus conjuntos activos; Norte, intacto.
    const equipo = await e.como("alicia").query(api.asignaciones.miEquipo, {});
    expect(equipo.map((c) => c.condominioNombre)).toEqual(["Conjunto Norte"]);
  });

  /** CASO 3 - cambiar el id no abre el contrato de otra empresa. */
  test("3. no puede terminar el contrato de otra compania", async () => {
    const ajeno = await e.plataforma.query(api.companias.contratosDeCondominio, {
      condominioId: e.oriente,
    });
    await expect(
      e
        .como("alicia")
        .mutation(api.companias.terminarContrato, { contratoId: ajeno[0]!._id }),
    ).rejects.toThrow(/no pertenece a su compa/i);

    // Y el contrato ajeno sigue en pie.
    const ramon = await contratoDe("ramon", e.oriente, e.rival.companiaId);
    expect(ramon.archivado).toBe(false);
  });

  test("3b. el supervisor no termina contratos: supervisa turnos", async () => {
    const k = await contratoDe("alicia", e.norte, e.andina.companiaId);
    await expect(
      e
        .como("sofia")
        .mutation(api.companias.terminarContrato, { contratoId: k._id }),
    ).rejects.toThrow(/seguridad\.terminar/);
  });

  test("3c. la compania puede renunciar hoy, no reescribir el pacto", async () => {
    /* Programar la fecha de fin es una condicion comercial y sigue siendo de
     * Vekino. Sin esta linea, darle `seguridad.terminar` al administrador le
     * habria dejado mover a mano la vigencia de su propio contrato. */
    const k = await contratoDe("alicia", e.norte, e.andina.companiaId);
    await expect(
      e.como("alicia").mutation(api.companias.terminarContrato, {
        contratoId: k._id,
        vigenciaHasta: Date.now() + 90 * DIA,
      }),
    ).rejects.toThrow(/solo vekino/i);
  });

  /** CASO 4 - idempotencia. */
  test("4. terminarlo dos veces no corrompe nada", async () => {
    const k = await contratoDe("alicia", e.norte, e.andina.companiaId);
    await e
      .como("alicia")
      .mutation(api.companias.terminarContrato, { contratoId: k._id });
    const primero = await contratoDe("alicia", e.norte, e.andina.companiaId);

    const segundo = await e
      .como("alicia")
      .mutation(api.companias.terminarContrato, { contratoId: k._id });
    expect(segundo.yaEstaba).toBe(true);

    /* El sello del PRIMER corte se conserva: quien lo termino de verdad. */
    const despues = await contratoDe("alicia", e.norte, e.andina.companiaId);
    expect(despues.terminadoEn).toBe(primero.terminadoEn);
    expect(despues.terminadoPorNombre).toBe(primero.terminadoPorNombre);
    expect(despues.archivado).toBe(true);
  });

  test("archivar no borra: el historico del conjunto sigue entero", async () => {
    const rondaId = await operar(e, "gabriel", e.norte, "Zona A");
    const k = await contratoDe("alicia", e.norte, e.andina.companiaId);
    await e
      .como("alicia")
      .mutation(api.companias.terminarContrato, { contratoId: k._id });

    const archivado = await contratoDe("alicia", e.norte, e.andina.companiaId);
    // Las asignaciones no se borran: se dejan de contar como vigentes.
    expect(archivado.asignacionesVigentes).toBe(0);
    expect(archivado.asignacionesTotales).toBe(2);

    /* Y la operacion registrada sigue existiendo. La lee la plataforma: la
     * compania ya no tiene contrato y por eso ya no alcanza esa porteria,
     * que es justo lo que se pidio. */
    const minuta = await e.plataforma.query(api.guardia.listMinuta, {
      condominioId: e.norte,
    });
    expect(minuta.some((m) => m.resumen === "Novedad de Zona A")).toBe(true);
    const ronda = await e.plataforma.query(api.rondas.detalle, { rondaId });
    expect(ronda!.zona).toBe("Zona A");

    // El CONJUNTO no se da de baja: terminar el contrato no es eso.
    const conjunto = await e.plataforma.query(api.condominios.get, {
      condominioId: e.norte,
    });
    expect(conjunto!.isActive).toBe(true);
  });

  test("el personal terminado sale del contrato sin borrarse", async () => {
    const k = await contratoDe("alicia", e.norte, e.andina.companiaId);
    const asigs = await e
      .como("alicia")
      .query(api.asignaciones.porContrato, { contratoId: k._id });
    const gabriel = asigs.find((a) => a.nombre === "Gabriel Guarda")!;

    const r = await e
      .como("alicia")
      .mutation(api.asignaciones.terminar, { asignacionId: gabriel._id });
    expect(r.yaEstaba).toBe(false);

    /* Sale HOY, no manana: mismo bug, misma correccion. */
    expect(
      (await e.como("gabriel").query(api.guardia.home, { condominioId: e.norte }))
        .allowed,
    ).toBe(false);

    const vigentes = await e
      .como("alicia")
      .query(api.asignaciones.porContrato, { contratoId: k._id });
    expect(vigentes.map((a) => a.nombre)).toEqual(["Sofia Supervisora"]);

    // Pero sigue en el historico del contrato.
    const todas = await e.como("alicia").query(api.asignaciones.porContrato, {
      contratoId: k._id,
      incluirTerminadas: true,
    });
    expect(todas.map((a) => a.nombre).sort()).toEqual([
      "Gabriel Guarda",
      "Sofia Supervisora",
    ]);

    // Repetir la peticion no rompe nada.
    expect(
      (
        await e
          .como("alicia")
          .mutation(api.asignaciones.terminar, { asignacionId: gabriel._id })
      ).yaEstaba,
    ).toBe(true);
  });
});

describe("archivar una compania", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  /** CASO 5 - sale de activas, entra en archivadas. */
  test("5. el superadmin la archiva y cambia de listado", async () => {
    const activasAntes = await e.plataforma.query(api.companias.listAll, {
      archivo: "activas",
    });
    expect(activasAntes.map((c) => c.nombre).sort()).toEqual([
      "Seguridad Andina",
      "Seguridad Rival",
    ]);

    await e.plataforma.mutation(api.companias.setEstado, {
      companiaId: e.andina.companiaId,
      estado: "inactiva",
    });

    const activas = await e.plataforma.query(api.companias.listAll, {
      archivo: "activas",
    });
    expect(activas.map((c) => c.nombre)).toEqual(["Seguridad Rival"]);

    const archivadas = await e.plataforma.query(api.companias.listAll, {
      archivo: "archivadas",
    });
    expect(archivadas.map((c) => c.nombre)).toEqual(["Seguridad Andina"]);
    // AUDITORIA: quien la archivo y cuando.
    expect(archivadas[0]!.archivadaEn).not.toBeNull();
    expect(archivadas[0]!.archivadaPorNombre).toBe("Super");
  });

  /** CASO 6 - la compania no se archiva a si misma. */
  test("6. el administrador de compania no puede archivar", async () => {
    await expect(
      e.como("alicia").mutation(api.companias.setEstado, {
        companiaId: e.andina.companiaId,
        estado: "inactiva",
      }),
    ).rejects.toThrow();
    // Ni la de al lado, por si acaso.
    await expect(
      e.como("alicia").mutation(api.companias.setEstado, {
        companiaId: e.rival.companiaId,
        estado: "inactiva",
      }),
    ).rejects.toThrow();
  });

  /** CASO 7 - nada se pierde, y se puede deshacer. */
  test("7. archivar conserva el historico y es reversible", async () => {
    const rondaId = await operar(e, "gabriel", e.norte, "Zona A");
    await e.plataforma.mutation(api.companias.setEstado, {
      companiaId: e.andina.companiaId,
      estado: "inactiva",
    });

    /* Sin cascada: los contratos y las asignaciones NO se reescriben. Dejan
     * de autorizar solos porque el estado de la empresa se comprueba al leer,
     * y por eso archivar tiene vuelta atras. */
    const detalle = await e.plataforma.query(api.companias.detail, {
      companiaId: e.andina.companiaId,
    });
    expect(detalle!.contratos.map((k) => k.condominioNombre).sort()).toEqual([
      "Conjunto Norte",
      "Conjunto Sur",
    ]);
    /* Pero en la interfaz van a Archivados: los contratos de una compania
     * dada de baja no son operacion activa de nadie. */
    expect(detalle!.contratos.every((k) => k.archivado)).toBe(true);
    expect(detalle!.personal.map((p) => p.nombre).sort()).toEqual([
      "Alicia Admin",
      "Gabriel Guarda",
      "Sofia Supervisora",
    ]);

    // El acceso se corta en el acto.
    expect(
      (await e.como("gabriel").query(api.guardia.home, { condominioId: e.norte }))
        .allowed,
    ).toBe(false);

    // La operacion registrada en el conjunto no se toca.
    const ronda = await e.plataforma.query(api.rondas.detalle, { rondaId });
    expect(ronda!.zona).toBe("Zona A");
    const minuta = await e.plataforma.query(api.guardia.listMinuta, {
      condominioId: e.norte,
    });
    expect(minuta.some((m) => m.resumen === "Novedad de Zona A")).toBe(true);

    // Y se puede sacar del archivo: todo vuelve a funcionar.
    await e.plataforma.mutation(api.companias.setEstado, {
      companiaId: e.andina.companiaId,
      estado: "activa",
    });
    expect(
      (await e.como("gabriel").query(api.guardia.home, { condominioId: e.norte }))
        .allowed,
    ).toBe(true);
    const reactivada = await e.plataforma.query(api.companias.listAll, {
      archivo: "activas",
    });
    expect(
      reactivada.find((c) => c.nombre === "Seguridad Andina")!.archivadaEn,
    ).toBeNull();
  });

  test("suspender no es archivar: sigue entre las activas", async () => {
    await e.plataforma.mutation(api.companias.setEstado, {
      companiaId: e.andina.companiaId,
      estado: "suspendida",
    });
    const activas = await e.plataforma.query(api.companias.listAll, {
      archivo: "activas",
    });
    expect(activas.map((c) => c.nombre).sort()).toEqual([
      "Seguridad Andina",
      "Seguridad Rival",
    ]);
  });

  test("el directorio de companias sigue siendo de la plataforma", async () => {
    await expect(
      e.como("alicia").query(api.companias.listAll, {}),
    ).rejects.toThrow();
  });
});

/**
 * LA VIGILANCIA VISTA DESDE EL CONJUNTO.
 *
 * El administrador del conjunto no veia quien cubria su propia porteria. No
 * era un problema de permisos —`administrador` tiene `porteria.ver` desde
 * siempre, y `asignaciones.porCondominio` existe justo para responder "quien
 * esta autorizado a entrar a mi porteria"—: era que ninguna pantalla se lo
 * preguntaba.
 *
 * Estas pruebas fijan las dos mitades del aislamiento: alcanza SU conjunto por
 * el rol, y cambiar el id no le abre el de al lado. Es el mismo `porteria.ver`
 * que ya usa la compania, resuelto por otra via.
 */
describe("el administrador del conjunto ve la vigilancia de SU conjunto", () => {
  let e: Escenario;
  let rondaNorte: Id<"guardiaRondas">;

  beforeEach(async () => {
    e = await montar();
    rondaNorte = await operar(e, "gabriel", e.norte, "Zona A");
  });

  test("ve a los guardas y supervisores asignados a su porteria", async () => {
    const personal = await e
      .como("hernan")
      .query(api.asignaciones.porCondominio, { condominioId: e.norte });

    expect(
      personal.map((p) => [p.nombre, p.rol]).sort((a, b) => a[0]!.localeCompare(b[0]!)),
    ).toEqual([
      ["Gabriel Guarda", "guardia"],
      ["Sofia Supervisora", "supervisor"],
    ]);
    // Sabe por que empresa entran y hasta cuando.
    expect(personal.every((p) => p.companiaNombre === "Seguridad Andina")).toBe(true);
    expect(personal.every((p) => p.estado === "vigente")).toBe(true);
    /* Administra el conjunto, asi que si ve el contacto: es quien tiene que
     * poder llamar al supervisor cuando pasa algo en su porteria. */
    expect(personal.every((p) => p.email !== null)).toBe(true);
  });

  test("consulta la minuta y las rondas de su conjunto", async () => {
    const rondas = await e
      .como("hernan")
      .query(api.rondas.listar, { condominioId: e.norte });
    expect(rondas.map((r) => r.zona)).toEqual(["Zona A"]);
    expect(rondas[0]!.guardiaNombre).toBe("Gabriel Guarda");

    const minuta = await e
      .como("hernan")
      .query(api.guardia.listMinuta, { condominioId: e.norte });
    const evento = minuta.find((m) => m.resumen === "Novedad de Zona A")!;
    expect(evento.rondaId).toBe(rondaNorte);
    expect(evento.rondaNumero).toBe(1);
    expect(evento.rondaZona).toBe("Zona A");

    // Y el resto del contexto de porteria, que ya tenia.
    const turnos = await e
      .como("hernan")
      .query(api.guardia.listTurnos, { condominioId: e.norte });
    expect(turnos).toHaveLength(1);
  });

  test("cambiar el id no le abre el conjunto de al lado", async () => {
    /* Sur y Oriente existen y tienen operacion; lo que no tiene Hernan es
     * membresia en ellos. El id viaja desde el cliente y no autoriza nada. */
    for (const condominioId of [e.sur, e.oriente]) {
      await expect(
        e
          .como("hernan")
          .query(api.asignaciones.porCondominio, { condominioId }),
      ).rejects.toThrow(/no tiene acceso/i);
      await expect(
        e.como("hernan").query(api.rondas.listar, { condominioId }),
      ).rejects.toThrow(/porteria\.ver/);
      await expect(
        e.como("hernan").query(api.guardia.listMinuta, { condominioId }),
      ).rejects.toThrow(/porteria\.ver/);
    }
  });

  test("la plataforma ve lo mismo en el conjunto que abrio", async () => {
    const personal = await e.plataforma.query(api.asignaciones.porCondominio, {
      condominioId: e.norte,
    });
    expect(personal.map((p) => p.nombre).sort()).toEqual([
      "Gabriel Guarda",
      "Sofia Supervisora",
    ]);
    const rondas = await e.plataforma.query(api.rondas.listar, {
      condominioId: e.norte,
    });
    expect(rondas.map((r) => r.zona)).toEqual(["Zona A"]);
  });

  test("mirar la porteria no es operarla: sigue sin escribir en la minuta", async () => {
    /* El administrador del conjunto SI puede operar la porteria por rol
     * (`porteria.operar`), pero no sin turno abierto: la regla de la minuta
     * no cambia porque ahora exista la pantalla. */
    await expect(
      e.como("hernan").mutation(api.guardia.registrarEventoMinuta, {
        condominioId: e.sur,
        tipo: "Anotacion",
        resumen: "En un conjunto que no es suyo",
      }),
    ).rejects.toThrow();
  });

  test("al terminar el contrato deja de ver personal, no historico", async () => {
    const contratos = await e.plataforma.query(
      api.companias.contratosDeCondominio,
      { condominioId: e.norte },
    );
    await e.plataforma.mutation(api.companias.terminarContrato, {
      contratoId: contratos[0]!._id,
    });

    /* Ya no hay nadie autorizado a entrar: es la respuesta correcta, y la
     * misma regla que aplica la compania. */
    const personal = await e
      .como("hernan")
      .query(api.asignaciones.porCondominio, { condominioId: e.norte });
    expect(personal).toEqual([]);

    /* Pero el conjunto es SUYO: lo que quedo registrado en su porteria sigue
     * siendo suyo aunque la empresa se haya ido. Es justo lo contrario de lo
     * que le pasa a la compania, que pierde el acceso con el contrato. */
    const minuta = await e
      .como("hernan")
      .query(api.guardia.listMinuta, { condominioId: e.norte });
    expect(minuta.some((m) => m.resumen === "Novedad de Zona A")).toBe(true);
    const rondas = await e
      .como("hernan")
      .query(api.rondas.listar, { condominioId: e.norte });
    expect(rondas.map((r) => r.zona)).toEqual(["Zona A"]);
  });

  test("la compania sigue viendo lo suyo exactamente igual", async () => {
    // Regresion: la via del contrato no se toco.
    const equipo = await e.como("alicia").query(api.asignaciones.miEquipo, {});
    expect(equipo.map((c) => c.condominioNombre)).toEqual([
      "Conjunto Norte",
      "Conjunto Sur",
    ]);
    const minuta = await e
      .como("alicia")
      .query(api.guardia.listMinuta, { condominioId: e.norte });
    expect(minuta.some((m) => m.resumen === "Novedad de Zona A")).toBe(true);

    const delSupervisor = await e
      .como("sofia")
      .query(api.rondas.listar, { condominioId: e.norte });
    expect(delSupervisor.map((r) => r.zona)).toEqual(["Zona A"]);
  });
});

describe("multi-tenant: cada compania ve solo lo suyo", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("8 y 10. no alcanza un conjunto que su empresa no atiende", async () => {
    const acceso = await e
      .como("alicia")
      .query(api.asignaciones.miAcceso, { condominioId: e.oriente });
    expect(acceso!.capacidades).toEqual([]);

    /* Cambiar el conjunto de la peticion no abre nada: el contexto lo pone el
     * cliente, el permiso lo pone el servidor resolviendo el contrato. */
    await expect(
      e.como("alicia").query(api.rondas.listar, { condominioId: e.oriente }),
    ).rejects.toThrow(/porteria\.ver/);
    await expect(
      e
        .como("alicia")
        .query(api.guardia.listMinuta, { condominioId: e.oriente }),
    ).rejects.toThrow(/porteria\.ver/);
    await expect(
      e
        .como("alicia")
        .query(api.asignaciones.porCondominio, { condominioId: e.oriente }),
    ).rejects.toThrow(/no tiene acceso/i);
  });

  test("9. cambiar el id de compania tampoco", async () => {
    await expect(
      e
        .como("alicia")
        .query(api.companias.detail, { companiaId: e.rival.companiaId }),
    ).rejects.toThrow(/no pertenece a esta compa/i);
    await expect(
      e.como("alicia").mutation(api.companias.update, {
        companiaId: e.rival.companiaId,
        nombre: "Secuestrada",
      }),
    ).rejects.toThrow(/no pertenece a esta compa/i);
  });

  test("11. el administrador de la otra compania no ve estos conjuntos", async () => {
    const me = await e.como("ramon").query(api.users.me, {});
    expect(me!.compania!.companiaId).toBe(e.rival.companiaId);

    const suyo = await e
      .como("ramon")
      .query(api.companias.detail, { companiaId: e.rival.companiaId });
    expect(suyo!.contratos.map((k) => k.condominioNombre)).toEqual([
      "Conjunto Oriente",
    ]);

    for (const condominioId of [e.norte, e.sur]) {
      const acceso = await e
        .como("ramon")
        .query(api.asignaciones.miAcceso, { condominioId });
      expect(acceso!.capacidades).toEqual([]);
    }
  });
});

describe("regresion: nadie pierde lo que ya tenia", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("12. el supervisor sigue viendo sus conjuntos", async () => {
    const me = await e.como("sofia").query(api.users.me, {});
    expect(me!.asignaciones.map((a) => a.condominioNombre)).toEqual([
      "Conjunto Norte",
    ]);
    const equipo = await e.como("sofia").query(api.asignaciones.miEquipo, {});
    expect(equipo.map((c) => c.condominioNombre)).toEqual(["Conjunto Norte"]);
    // Pertenece a la compania, pero no la administra.
    expect(me!.compania!.roles).toEqual(["supervisor"]);
  });

  test("13. el guarda sigue entrando a su porteria", async () => {
    const me = await e.como("gabriel").query(api.users.me, {});
    expect(me!.asignaciones.map((a) => a.condominioNombre)).toEqual([
      "Conjunto Norte",
    ]);
    expect(
      (
        await e
          .como("gabriel")
          .query(api.guardia.home, { condominioId: e.norte })
      ).allowed,
    ).toBe(true);
    expect(
      (await e.como("gabriel").query(api.guardia.home, { condominioId: e.sur }))
        .allowed,
    ).toBe(false);
  });

  test("14 y 15. el administrador del conjunto sigue igual", async () => {
    const me = await e.como("hernan").query(api.users.me, {});
    expect(me!.memberships.map((m) => m.condominioName)).toEqual([
      "Conjunto Norte",
    ]);
    expect(me!.asignaciones).toEqual([]);
    // No es de ninguna compania: el eje nuevo le queda en null.
    expect(me!.compania).toBeNull();

    expect(
      (
        await e
          .como("hernan")
          .query(api.condominios.adminHome, { condominioId: e.norte })
      ).allowed,
    ).toBe(true);
    expect(
      (await e.como("hernan").query(api.condominios.listMine, {})).map(
        (c) => c.name,
      ),
    ).toEqual(["Conjunto Norte"]);
  });
});
