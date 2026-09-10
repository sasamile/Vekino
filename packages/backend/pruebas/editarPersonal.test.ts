import { test, expect, describe } from "vitest";
import { convexTest } from "convex-test";
import betterAuthTest from "@convex-dev/better-auth/test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import { createAuth } from "../convex/auth";
import type { Id } from "../convex/_generated/dataModel";

const modules = import.meta.glob("../convex/**/*.ts");

/**
 * EDITAR AL PERSONAL DE UNA COMPANIA.
 *
 * El administrador de la compania ya podia dar de alta, cambiar roles y dar de
 * baja; le faltaba corregir datos y volver a ponerle la clave a quien la
 * pierde. Lo que se fija aqui es el borde: que pueda hacerlo con SU gente y
 * con nadie mas, y que la contrasena no se pueda leer por ningun camino.
 */

const CLAVE = "clave-de-prueba-1";
const CLAVE_NUEVA = "otra-clave-larga-7";

async function montar() {
  const t = convexTest(schema, modules);
  betterAuthTest.register(t);

  const ahora = Date.now();
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

  const alfa = await plataforma.action(api.companias.registrar, {
    nombre: "Seguridad Alfa",
    adminName: "Alicia Alfa",
    adminEmail: "alicia@alfa.test",
    adminPassword: CLAVE,
  });
  const beta = await plataforma.action(api.companias.registrar, {
    nombre: "Seguridad Beta",
    adminName: "Bruno Beta",
    adminEmail: "bruno@beta.test",
    adminPassword: CLAVE,
  });

  const guardaAlfa = await plataforma.action(api.companias.crearMiembro, {
    companiaId: alfa.companiaId,
    email: "gabriel@alfa.test",
    name: "Gabriel Guarda",
    password: CLAVE,
    roles: ["guardia"],
  });
  const guardaBeta = await plataforma.action(api.companias.crearMiembro, {
    companiaId: beta.companiaId,
    email: "berta@beta.test",
    name: "Berta Guarda",
    password: CLAVE,
    roles: ["guardia"],
  });

  /** Entra como esa cuenta usando su `authId` real. */
  const como = async (email: string) => {
    const authId = await t.run(async (ctx) => {
      const u = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();
      return u!.authId!;
    });
    return t.withIdentity({ subject: authId });
  };

  return { t, plataforma, alfa, beta, guardaAlfa, guardaBeta, como };
}

/** Comprueba una credencial contra Better Auth, como lo hace el login. */
async function claveSirve(
  t: ReturnType<typeof convexTest>,
  email: string,
  password: string,
): Promise<boolean> {
  return await t.run(async (ctx) => {
    const authCtx = await createAuth(ctx as never).$context;
    const ia = authCtx.internalAdapter;
    const found = await ia.findUserByEmail(email);
    if (!found) return false;
    const cuenta = (await ia.findAccounts(found.user.id)).find(
      (a) => a.providerId === "credential",
    );
    if (!cuenta?.password) return false;
    return await authCtx.password.verify({
      hash: cuenta.password,
      password,
    });
  });
}

// ─────────────────────────────────────────────────────────────
describe("autorizacion y multi-tenancy", () => {
  test("1 — el admin de Alfa edita a su propio guarda", async () => {
    const e = await montar();
    const alicia = await e.como("alicia@alfa.test");
    await alicia.mutation(api.companias.actualizarMiembro, {
      miembroId: e.guardaAlfa.miembroId,
      name: "Gabriel Guarda Nieto",
      numeroDocumento: "1030512345",
      telefono: "3001234567",
      cargo: "Guarda turno noche",
    });

    const d = await alicia.query(api.companias.detalleMiembro, {
      miembroId: e.guardaAlfa.miembroId,
    });
    expect(d.nombre).toBe("Gabriel Guarda Nieto");
    expect(d.numeroDocumento).toBe("1030512345");
    expect(d.cargo).toBe("Guarda turno noche");
  });

  test("2 — el admin de Alfa NO edita a un guarda de Beta", async () => {
    const e = await montar();
    const alicia = await e.como("alicia@alfa.test");
    await expect(
      alicia.mutation(api.companias.actualizarMiembro, {
        miembroId: e.guardaBeta.miembroId,
        name: "Secuestrada",
      }),
    ).rejects.toThrow(/no pertenece a esta compañía/i);
  });

  test("2 bis — ni le cambia la contrasena", async () => {
    const e = await montar();
    const alicia = await e.como("alicia@alfa.test");
    await expect(
      alicia.action(api.companias.setPasswordMiembro, {
        miembroId: e.guardaBeta.miembroId,
        password: CLAVE_NUEVA,
      }),
    ).rejects.toThrow(/no pertenece a esta compañía/i);
    /* Y la de Berta sigue siendo la suya. */
    expect(await claveSirve(e.t, "berta@beta.test", CLAVE)).toBe(true);
    expect(await claveSirve(e.t, "berta@beta.test", CLAVE_NUEVA)).toBe(false);
  });

  test("3 — no hay companiaId que manipular: sale del miembro", async () => {
    /* Las mutations no aceptan `companiaId`. La unica palanca del cliente es
     * `miembroId`, y de el se deriva la compañia que se comprueba. */
    const e = await montar();
    const alicia = await e.como("alicia@alfa.test");
    const args = Object.keys(
      (api.companias.actualizarMiembro as unknown as { _args?: object })._args ?? {},
    );
    expect(args).not.toContain("companiaId");
    /* Y de hecho, apuntar al miembro ajeno es lo unico que se puede intentar. */
    await expect(
      alicia.query(api.companias.detalleMiembro, {
        miembroId: e.guardaBeta.miembroId,
      }),
    ).rejects.toThrow(/no pertenece a esta compañía/i);
  });

  test("4 — un guarda no puede editar a nadie, ni a si mismo", async () => {
    const e = await montar();
    const gabriel = await e.como("gabriel@alfa.test");
    await expect(
      gabriel.mutation(api.companias.actualizarMiembro, {
        miembroId: e.guardaAlfa.miembroId,
        name: "Yo Mismo",
      }),
    ).rejects.toThrow(/no tiene permiso/i);
  });

  test("sin sesion no se lee ni se escribe", async () => {
    const e = await montar();
    await expect(
      e.t.query(api.companias.detalleMiembro, {
        miembroId: e.guardaAlfa.miembroId,
      }),
    ).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
describe("datos personales", () => {
  test("5 — se guardan los campos del modelo, y el telefono se normaliza", async () => {
    const e = await montar();
    const alicia = await e.como("alicia@alfa.test");
    await alicia.mutation(api.companias.actualizarMiembro, {
      miembroId: e.guardaAlfa.miembroId,
      name: "Gabriel Guarda",
      firstName: "Gabriel",
      lastName: "Guarda",
      tipoDocumento: "CC",
      numeroDocumento: "1030512345",
      telefono: "300 123 4567",
    });
    const u = await e.t.run(
      async (ctx) => await ctx.db.get(e.guardaAlfa.userId),
    );
    expect(u!.firstName).toBe("Gabriel");
    expect(u!.tipoDocumento).toBe("CC");
    /* Lo canonico lo deriva `lib/telefono`, igual que en el resto del sistema. */
    expect(u!.telefonoE164).toBe("+573001234567");
  });

  test("6 — datos invalidos se rechazan en el backend", async () => {
    const e = await montar();
    const alicia = await e.como("alicia@alfa.test");
    const base = { miembroId: e.guardaAlfa.miembroId, name: "Gabriel Guarda" };

    await expect(
      alicia.mutation(api.companias.actualizarMiembro, { ...base, name: "   " }),
    ).rejects.toThrow(/nombre es obligatorio/i);

    await expect(
      alicia.mutation(api.companias.actualizarMiembro, {
        ...base,
        numeroDocumento: "??",
      }),
    ).rejects.toThrow(/documento no parece válido/i);

    await expect(
      alicia.mutation(api.companias.actualizarMiembro, {
        ...base,
        telefono: "no-es-un-telefono",
      }),
    ).rejects.toThrow(/teléfono no parece válido/i);
  });

  test("7 — un correo ya usado por otra cuenta se rechaza", async () => {
    const e = await montar();
    const alicia = await e.como("alicia@alfa.test");
    await expect(
      alicia.action(api.companias.setEmailMiembro, {
        miembroId: e.guardaAlfa.miembroId,
        email: "berta@beta.test",
      }),
    ).rejects.toThrow(/ya está en uso/i);
  });

  test("el correo se cambia en el perfil Y en la credencial", async () => {
    /* Si solo se cambiara en `users`, el login seguiria pidiendo el viejo. */
    const e = await montar();
    const alicia = await e.como("alicia@alfa.test");
    await alicia.action(api.companias.setEmailMiembro, {
      miembroId: e.guardaAlfa.miembroId,
      email: "gabriel.nuevo@alfa.test",
    });

    const u = await e.t.run(
      async (ctx) => await ctx.db.get(e.guardaAlfa.userId),
    );
    expect(u!.email).toBe("gabriel.nuevo@alfa.test");
    expect(await claveSirve(e.t, "gabriel.nuevo@alfa.test", CLAVE)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
describe("contrasena", () => {
  test("8, 12 y 13 — la nueva sirve y la anterior deja de servir", async () => {
    const e = await montar();
    const alicia = await e.como("alicia@alfa.test");
    expect(await claveSirve(e.t, "gabriel@alfa.test", CLAVE)).toBe(true);

    const r = await alicia.action(api.companias.setPasswordMiembro, {
      miembroId: e.guardaAlfa.miembroId,
      password: CLAVE_NUEVA,
    });
    expect(r.ok).toBe(true);

    expect(await claveSirve(e.t, "gabriel@alfa.test", CLAVE_NUEVA)).toBe(true);
    expect(await claveSirve(e.t, "gabriel@alfa.test", CLAVE)).toBe(false);
  });

  test("9 — se guarda hasheada con el mecanismo existente, nunca en claro", async () => {
    const e = await montar();
    const alicia = await e.como("alicia@alfa.test");
    await alicia.action(api.companias.setPasswordMiembro, {
      miembroId: e.guardaAlfa.miembroId,
      password: CLAVE_NUEVA,
    });

    const hash = await e.t.run(async (ctx) => {
      const authCtx = await createAuth(ctx as never).$context;
      const ia = authCtx.internalAdapter;
      const found = await ia.findUserByEmail("gabriel@alfa.test");
      const cuenta = (await ia.findAccounts(found!.user.id)).find(
        (a) => a.providerId === "credential",
      );
      return cuenta!.password!;
    });
    expect(hash).not.toContain(CLAVE_NUEVA);
    /* Y verifica de verdad: es un hash, no un texto disfrazado. */
    expect(await claveSirve(e.t, "gabriel@alfa.test", CLAVE_NUEVA)).toBe(true);
  });

  test("10 y 11 — ni la clave ni el hash salen en ninguna respuesta", async () => {
    const e = await montar();
    const alicia = await e.como("alicia@alfa.test");

    const r = await alicia.action(api.companias.setPasswordMiembro, {
      miembroId: e.guardaAlfa.miembroId,
      password: CLAVE_NUEVA,
    });
    expect(JSON.stringify(r)).not.toContain(CLAVE_NUEVA);
    expect(Object.keys(r).sort()).toEqual(["cuentaCreada", "ok"]);

    const d = await alicia.query(api.companias.detalleMiembro, {
      miembroId: e.guardaAlfa.miembroId,
    });
    const texto = JSON.stringify(d);
    expect(texto).not.toContain(CLAVE_NUEVA);
    expect(texto).not.toContain(CLAVE);
    /* Ningun campo que lleve el secreto ni nada derivado de el. El rastro de
     * CUANDO se fijo si esta, y es un hecho, no un secreto. */
    const prohibidos = ["password", "passwordhash", "hash", "salt", "credential"];
    for (const k of Object.keys(d)) {
      if (k === "passwordFijadaEn") continue;
      expect(prohibidos).not.toContain(k.toLowerCase());
    }
    expect(d.passwordFijadaEn).toBeTypeOf("number");

    const detalle = await alicia.query(api.companias.detail, {
      companiaId: e.alfa.companiaId,
    });
    expect(JSON.stringify(detalle)).not.toContain(CLAVE_NUEVA);
  });

  test("14 — la confirmacion la valida el cliente; el backend no la recibe", async () => {
    /* La seguridad real no puede estar en que dos campos coincidan en el
     * navegador: el backend nunca ve la confirmacion. Lo que si valida —y es
     * lo que importa— es la fuerza. */
    const e = await montar();
    const args = Object.keys(
      (api.companias.setPasswordMiembro as unknown as { _args?: object })._args ??
        {},
    );
    expect(args).not.toContain("confirmacion");
    expect(e.alfa.companiaId).toBeTruthy();
  });

  test("15 — se aplica la politica de contrasena del proyecto", async () => {
    const e = await montar();
    const alicia = await e.como("alicia@alfa.test");
    const intento = (password: string) =>
      alicia.action(api.companias.setPasswordMiembro, {
        miembroId: e.guardaAlfa.miembroId,
        password,
      });

    await expect(intento("corta1")).rejects.toThrow(/al menos 8/i);
    await expect(intento("password123")).rejects.toThrow(/demasiado conocida/i);
    await expect(intento("abcd1234efgh")).rejects.toThrow(/secuencias/i);
    /* Y la clave vieja sigue intacta tras cada rechazo. */
    expect(await claveSirve(e.t, "gabriel@alfa.test", CLAVE)).toBe(true);
  });

  test("queda el rastro de quien la fijo y cuando", async () => {
    const e = await montar();
    const alicia = await e.como("alicia@alfa.test");
    await alicia.action(api.companias.setPasswordMiembro, {
      miembroId: e.guardaAlfa.miembroId,
      password: CLAVE_NUEVA,
    });
    const m = await e.t.run(
      async (ctx) => await ctx.db.get(e.guardaAlfa.miembroId),
    );
    expect(m!.passwordFijadaEn).toBeTypeOf("number");
    expect(m!.passwordFijadaPorUserId).toBeTruthy();
    /* Y nada del secreto en la fila. */
    expect(JSON.stringify(m)).not.toContain(CLAVE_NUEVA);
  });
});

// ─────────────────────────────────────────────────────────────
describe("escalada de privilegios", () => {
  test("16 — el formulario no toca roles: eso sigue en setRolesMiembro", async () => {
    const e = await montar();
    const args = Object.keys(
      (api.companias.actualizarMiembro as unknown as { _args?: object })._args ?? {},
    );
    expect(args).not.toContain("roles");
    expect(args).not.toContain("platformRole");
    expect(args).not.toContain("isActive");
    expect(e.alfa.companiaId).toBeTruthy();
  });

  test("17 — no se puede tomar una cuenta de plataforma", async () => {
    /* El superadmin metido como guarda en la propia compania: sin este
     * cierre, el admin le fijaba la clave y se quedaba con la plataforma. */
    const e = await montar();
    const alicia = await e.como("alicia@alfa.test");
    const miembroDelSuper = await e.t.run(async (ctx) => {
      const su = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "super@vekino.test"))
        .unique();
      return await ctx.db.insert("companiaMiembros", {
        userId: su!._id,
        companiaId: e.alfa.companiaId,
        roles: ["guardia"],
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    await expect(
      alicia.action(api.companias.setPasswordMiembro, {
        miembroId: miembroDelSuper,
        password: CLAVE_NUEVA,
      }),
    ).rejects.toThrow(/cuenta es de la plataforma/i);
  });

  test("18 — ni una cuenta que administra un conjunto", async () => {
    /* El salto entre los dos ejes: dar de alta como guarda a la
     * administradora de un conjunto y cambiarle la clave le entregaba ese
     * conjunto entero. Es legal apuntarla; tomarle la cuenta no. */
    const e = await montar();
    const alicia = await e.como("alicia@alfa.test");

    const condominioId = await e.plataforma.mutation(api.condominios.create, {
      name: "Conjunto Norte",
    });
    await e.plataforma.action(api.users.createCondoMember, {
      condominioId,
      email: "hernan@norte.test",
      name: "Hernan Admin",
      password: CLAVE,
      roles: ["administrador"],
    });
    const suMiembro = await e.plataforma.action(api.companias.crearMiembro, {
      companiaId: e.alfa.companiaId,
      email: "hernan@norte.test",
      name: "Hernan Admin",
      password: CLAVE,
      roles: ["guardia"],
    });

    await expect(
      alicia.action(api.companias.setPasswordMiembro, {
        miembroId: suMiembro.miembroId,
        password: CLAVE_NUEVA,
      }),
    ).rejects.toThrow(/administra un conjunto/i);
    /* Y su clave del conjunto sigue siendo la suya. */
    expect(await claveSirve(e.t, "hernan@norte.test", CLAVE)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
describe("regresion", () => {
  test("19 — el guarda sigue pudiendo entrar tras editarle los datos", async () => {
    const e = await montar();
    const alicia = await e.como("alicia@alfa.test");
    await alicia.mutation(api.companias.actualizarMiembro, {
      miembroId: e.guardaAlfa.miembroId,
      name: "Gabriel Corregido",
      telefono: "3009998877",
    });
    /* Editar datos no toca la credencial. */
    expect(await claveSirve(e.t, "gabriel@alfa.test", CLAVE)).toBe(true);
  });

  test("21 — contratos y asignaciones siguen funcionando igual", async () => {
    const e = await montar();
    const condominioId = await e.plataforma.mutation(api.condominios.create, {
      name: "Conjunto Norte",
    });
    const contratoId = await e.plataforma.mutation(api.companias.crearContrato, {
      companiaId: e.alfa.companiaId,
      condominioId,
      vigenciaDesde: Date.now() - 86400000,
    });
    const asignacionId = await e.plataforma.mutation(api.asignaciones.crear, {
      contratoId,
      companiaMiembroId: e.guardaAlfa.miembroId,
      rol: "guardia",
      vigenciaDesde: Date.now() - 86400000,
    });
    expect(asignacionId).toBeTruthy();

    const alicia = await e.como("alicia@alfa.test");
    await alicia.mutation(api.companias.actualizarMiembro, {
      miembroId: e.guardaAlfa.miembroId,
      name: "Gabriel Corregido",
    });
    await alicia.action(api.companias.setPasswordMiembro, {
      miembroId: e.guardaAlfa.miembroId,
      password: CLAVE_NUEVA,
    });

    /* La asignacion sigue viva: editar a la persona no toca donde trabaja. */
    const filas = await alicia.query(api.asignaciones.porContrato, { contratoId });
    expect(filas.filter((f) => f.estado === "vigente").length).toBe(1);
  });

  test("20 — el restablecimiento por correo sigue apuntando a la cuenta", async () => {
    /* Better Auth busca por correo: si el cambio de correo no hubiera movido
     * la cuenta, aqui no se encontraria nada. */
    const e = await montar();
    const alicia = await e.como("alicia@alfa.test");
    await alicia.action(api.companias.setEmailMiembro, {
      miembroId: e.guardaAlfa.miembroId,
      email: "gabriel.nuevo@alfa.test",
    });
    const existe = await e.t.run(async (ctx) => {
      const ia = (await createAuth(ctx as never).$context).internalAdapter;
      return !!(await ia.findUserByEmail("gabriel.nuevo@alfa.test"));
    });
    expect(existe).toBe(true);
  });
});
