import { test, expect, describe, beforeEach } from "vitest";
import { convexTest } from "convex-test";
import betterAuthTest from "@convex-dev/better-auth/test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import { createAuth } from "../convex/auth";
import type { Id } from "../convex/_generated/dataModel";

const modules = import.meta.glob("../convex/**/*.ts");

/**
 * EL SUPERVISOR: SUS CONJUNTOS Y SUS GUARDAS.
 *
 * El supervisor entraba bien y no veia nada. La causa no estaba en el login
 * ni en un filtro por compania: el eje de vigilancia
 * (`companiaMiembros` + `asignaciones`) nunca se conecto al arranque de
 * sesion, y TODO lo que responde "a que conjuntos pertenezco" leia solo
 * `memberships`, donde el personal de una compania no tiene ni una fila.
 *
 * Estas pruebas montan el escenario entero por la API publica —compania,
 * conjunto, personal, contrato, asignacion— y despues comprueban las dos
 * mitades de la regla: que VE lo suyo y que NO ve lo ajeno. La segunda mitad
 * importa mas: un panel vacio se nota; uno que muestra de mas, no.
 */

const DIA = 24 * 60 * 60 * 1000;
const CLAVE = "clave-de-prueba-1";

type Escenario = Awaited<ReturnType<typeof montar>>;

/**
 * Dos companias, tres conjuntos.
 *
 *   Andina   -> Norte (supervisa Sofia, guarda Gabriel) y Sur (guarda Sandra)
 *   Rival    -> Oriente (guarda Ramiro)
 *
 * Sofia supervisa SOLO Norte: Sur es de su misma compania pero de otra zona, y
 * Oriente es de otra empresa. Las dos son formas distintas de ver de mas.
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

  // 2. Crear conjuntos.
  const norte = await plataforma.mutation(api.condominios.create, {
    name: "Conjunto Norte",
  });
  const sur = await plataforma.mutation(api.condominios.create, {
    name: "Conjunto Sur",
  });
  const oriente = await plataforma.mutation(api.condominios.create, {
    name: "Conjunto Oriente",
  });

  // 1. Crear companias (cada una nace con su administrador).
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

  // 3. Crear supervisor y guardas.
  const persona = async (
    companiaId: Id<"companiasSeguridad">,
    email: string,
    name: string,
    rol: "supervisor" | "guardia",
  ) =>
    await plataforma.action(api.companias.crearMiembro, {
      companiaId,
      email,
      name,
      password: CLAVE,
      roles: [rol],
    });

  const sofia = await persona(
    andina.companiaId,
    "sofia@andina.test",
    "Sofia Supervisora",
    "supervisor",
  );
  const gabriel = await persona(
    andina.companiaId,
    "gabriel@andina.test",
    "Gabriel Guarda",
    "guardia",
  );
  const sandra = await persona(
    andina.companiaId,
    "sandra@andina.test",
    "Sandra Guarda",
    "guardia",
  );
  const ramiro = await persona(
    rival.companiaId,
    "ramiro@rival.test",
    "Ramiro Guarda",
    "guardia",
  );

  // Contratos: lo que autoriza a la compania sobre el conjunto.
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
  const kSur = await contrato(andina.companiaId, sur);
  const kOriente = await contrato(rival.companiaId, oriente);

  // 4 y 5. Asignar: supervisor al conjunto, guardas al conjunto.
  const asignar = async (
    contratoId: Id<"companiaContratos">,
    companiaMiembroId: Id<"companiaMiembros">,
    rol: "supervisor" | "guardia",
  ) =>
    await plataforma.mutation(api.asignaciones.crear, {
      contratoId,
      companiaMiembroId,
      rol,
      vigenciaDesde: desde,
    });

  await asignar(kNorte, sofia.miembroId, "supervisor");
  await asignar(kNorte, gabriel.miembroId, "guardia");
  await asignar(kSur, sandra.miembroId, "guardia");
  await asignar(kOriente, ramiro.miembroId, "guardia");

  /* Un guarda del PROPIO conjunto, de los de antes: el que ya funcionaba.
   * Sirve de contraste y de control de regresion. */
  await plataforma.action(api.users.createCondoMember, {
    condominioId: norte,
    email: "hernan@norte.test",
    name: "Hernan Guarda Propio",
    password: CLAVE,
    roles: ["guardia"],
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
      sofia: await por("sofia@andina.test"),
      gabriel: await por("gabriel@andina.test"),
      sandra: await por("sandra@andina.test"),
      ramiro: await por("ramiro@rival.test"),
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
    authIds,
    como: (quien: keyof typeof authIds) =>
      t.withIdentity({ subject: authIds[quien] }),
  };
}

/** El login de verdad, el mismo que dispara el formulario de /login. */
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

describe("el supervisor ve sus conjuntos y sus guardas", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("6. inicia sesion con las credenciales de su alta", async () => {
    expect(await iniciarSesion(e, "sofia@andina.test")).toEqual({ ok: true });
  });

  test("7 y 8. su sesion trae el conjunto asignado", async () => {
    const me = await e.como("sofia").query(api.users.me, {});

    /* La forma del fallo: `memberships` vacio. No es un error, es el modelo
     * —no pertenece al conjunto, pertenece a la empresa que lo cubre— y por
     * eso el arranque de sesion tiene que mirar tambien el otro eje. */
    expect(me!.memberships).toEqual([]);
    expect(me!.asignaciones.map((a) => a.condominioNombre)).toEqual([
      "Conjunto Norte",
    ]);
    expect(me!.asignaciones[0]!.rol).toBe("supervisor");
    expect(me!.asignaciones[0]!.companiaNombre).toBe("Seguridad Andina");

    const mias = await e.como("sofia").query(api.asignaciones.misAsignaciones, {});
    expect(mias.map((a) => a.condominioId)).toEqual([e.norte]);
  });

  test("9. ve a los guardas de ese conjunto", async () => {
    const equipo = await e.como("sofia").query(api.asignaciones.miEquipo, {});
    expect(equipo).toHaveLength(1);
    expect(equipo[0]!.condominioId).toBe(e.norte);
    expect(equipo[0]!.guardas.map((g) => g.nombre)).toEqual([
      "Gabriel Guarda",
    ]);
  });

  test("10. no ve conjuntos de otra zona ni de otra compania", async () => {
    const equipo = await e.como("sofia").query(api.asignaciones.miEquipo, {});
    const ids = equipo.map((c) => c.condominioId);
    expect(ids).not.toContain(e.sur); // misma compania, no la supervisa
    expect(ids).not.toContain(e.oriente); // otra compania

    /* Y no es solo que no se listen: preguntar directo tampoco abre nada. */
    await expect(
      e.como("sofia").query(api.asignaciones.porCondominio, {
        condominioId: e.sur,
      }),
    ).rejects.toThrow(/no tiene acceso/i);
    await expect(
      e.como("sofia").query(api.asignaciones.porCondominio, {
        condominioId: e.oriente,
      }),
    ).rejects.toThrow(/no tiene acceso/i);
    await expect(
      e.como("sofia").query(api.companias.detail, {
        companiaId: e.rival.companiaId,
      }),
    ).rejects.toThrow(/no pertenece a esta compa/i);
  });

  test("11. no ve guardas de conjuntos que no supervisa", async () => {
    const equipo = await e.como("sofia").query(api.asignaciones.miEquipo, {});
    const nombres = equipo.flatMap((c) => c.guardas.map((g) => g.nombre));
    expect(nombres).not.toContain("Sandra Guarda"); // Sur
    expect(nombres).not.toContain("Ramiro Guarda"); // otra compania

    /* El directorio de su propia empresa tambien se le acota a sus conjuntos:
     * Sandra es de Andina, pero de la zona que no supervisa. */
    const suya = await e.como("sofia").query(api.companias.detail, {
      companiaId: e.andina.companiaId,
    });
    const personal = suya!.personal.map((p) => p.nombre);
    expect(personal).toContain("Gabriel Guarda");
    expect(personal).not.toContain("Sandra Guarda");
  });

  test("el alcance sigue las fechas: al terminar el contrato deja de verlo", async () => {
    const contratos = await e.plataforma.query(
      api.companias.contratosDeCondominio,
      { condominioId: e.norte },
    );
    await e.plataforma.mutation(api.companias.terminarContrato, {
      contratoId: contratos[0]!._id,
      vigenciaHasta: Date.now() - 2 * DIA,
    });

    expect(await e.como("sofia").query(api.asignaciones.miEquipo, {})).toEqual(
      [],
    );
    const me = await e.como("sofia").query(api.users.me, {});
    expect(me!.asignaciones).toEqual([]);
  });

  test("suspender la compania corta a todo su personal a la vez", async () => {
    await e.plataforma.mutation(api.companias.setEstado, {
      companiaId: e.andina.companiaId,
      estado: "suspendida",
    });
    expect(await e.como("sofia").query(api.asignaciones.miEquipo, {})).toEqual(
      [],
    );
    const guarda = await e.como("gabriel").query(api.guardia.home, {
      condominioId: e.norte,
    });
    expect(guarda.allowed).toBe(false);
  });
});

describe("el guarda de compania y el del conjunto se tratan igual", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("el guarda asignado entra a la porteria de su conjunto", async () => {
    /* Sin esto la asignacion no servia para nada: el guarda entraba a Vekino
     * y la porteria le rebotaba porque no tenia fila en `memberships`. */
    const home = await e.como("gabriel").query(api.guardia.home, {
      condominioId: e.norte,
    });
    expect(home.allowed).toBe(true);

    // Y puede operar de verdad, no solo abrir el cascaron.
    expect(
      await e.como("gabriel").query(api.guardia.turnoActivo, {
        condominioId: e.norte,
      }),
    ).toBeNull();
  });

  test("pero solo en el conjunto que cubre", async () => {
    expect(
      (await e.como("gabriel").query(api.guardia.home, { condominioId: e.sur }))
        .allowed,
    ).toBe(false);
    expect(
      (
        await e
          .como("ramiro")
          .query(api.guardia.home, { condominioId: e.norte })
      ).allowed,
    ).toBe(false);
    await expect(
      e.como("ramiro").query(api.guardia.turnoActivo, { condominioId: e.norte }),
    ).rejects.toThrow();
  });

  test("los dos guardas de la garita se ven como companeros de turno", async () => {
    const equipoDeGabriel = await e.como("gabriel").query(api.guardia.equipo, {
      condominioId: e.norte,
    });
    expect(equipoDeGabriel.map((g) => g.nombre)).toEqual([
      "Hernan Guarda Propio",
    ]);

    const equipoDeHernan = await e.como("hernan").query(api.guardia.equipo, {
      condominioId: e.norte,
    });
    expect(equipoDeHernan.map((g) => g.nombre)).toEqual(["Gabriel Guarda"]);
  });

  test("el supervisor no releva: mira la porteria, no la opera", async () => {
    expect(
      (
        await e
          .como("sofia")
          .query(api.guardia.home, { condominioId: e.norte })
      ).allowed,
    ).toBe(false);

    // Lo que si puede: ver quien cubre su conjunto.
    const quienes = await e.como("sofia").query(api.asignaciones.porCondominio, {
      condominioId: e.norte,
    });
    expect(quienes.map((a) => a.nombre).sort()).toEqual([
      "Gabriel Guarda",
      "Sofia Supervisora",
    ]);
  });

  test("el guarda de compania no se cuela en la vida del conjunto", async () => {
    /* `roles: []` en `requireCondominioRole` significa "cualquier miembro del
     * conjunto" —votar en asamblea, otorgar un poder—. El personal de una
     * empresa contratada no es parte de la comunidad y esa puerta sigue
     * cerrada, aunque cubra la porteria todos los dias. */
    await expect(
      e.como("gabriel").query(api.asambleas.listByCondominio, {
        condominioId: e.norte,
      }),
    ).rejects.toThrow(/no pertenece a este condominio/i);
  });
});

describe("nada de esto cambia para quien ya funcionaba", () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await montar();
  });

  test("el guarda propio del conjunto sigue igual", async () => {
    expect(await iniciarSesion(e, "hernan@norte.test")).toEqual({ ok: true });
    const me = await e.como("hernan").query(api.users.me, {});
    expect(me!.memberships).toHaveLength(1);
    expect(me!.memberships[0]!.roles).toEqual(["guardia"]);
    // No trabaja por ninguna compania: el eje nuevo le queda vacio.
    expect(me!.asignaciones).toEqual([]);
    expect(
      (
        await e
          .como("hernan")
          .query(api.guardia.home, { condominioId: e.norte })
      ).allowed,
    ).toBe(true);
    expect(
      (await e.como("hernan").query(api.guardia.home, { condominioId: e.sur }))
        .allowed,
    ).toBe(false);
  });

  test("condominios.listMine sigue siendo el eje residencial", async () => {
    /* A proposito: lo consumen el selector de propiedad y el conmutador del
     * panel de administracion, que llevan a pantallas donde un guarda de
     * compania no pinta nada. Mezclar los dos ejes ahi le pondria enlaces que
     * terminan en un "no tiene acceso". Su via es `me.asignaciones`. */
    expect(
      await e.como("sofia").query(api.condominios.listMine, {}),
    ).toEqual([]);
    const deHernan = await e.como("hernan").query(api.condominios.listMine, {});
    expect(deHernan.map((c) => c._id)).toEqual([e.norte]);
  });
});
