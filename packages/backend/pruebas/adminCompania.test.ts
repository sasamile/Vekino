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
