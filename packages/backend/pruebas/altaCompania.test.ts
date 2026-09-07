import { test, expect, describe } from "vitest";
import { convexTest } from "convex-test";
import betterAuthTest from "@convex-dev/better-auth/test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import { createAuth } from "../convex/auth";

const modules = import.meta.glob("../convex/**/*.ts");

/**
 * ALTA DE UNA COMPANIA DE VIGILANCIA, DE PRINCIPIO A FIN.
 *
 * La compania se registraba y aparecia en la lista, pero no nacia con ninguna
 * cuenta: intentar entrar con el correo de contacto respondia "user not
 * found" porque ese correo no existia ni en `users` ni en Better Auth. Estas
 * pruebas fijan el contrato que faltaba —registrar una compania produce un
 * usuario que PUEDE ENTRAR— y comprueban que las altas que ya funcionaban
 * siguen funcionando.
 *
 * Se prueba contra el login de verdad (`auth.api.signInEmail`) y no contra un
 * sustituto: el fallo estaba justo ahi, en que las filas parecian correctas y
 * la credencial no existia.
 */

const CLAVE = "clave-de-prueba-1";

function montar() {
  const t = convexTest(schema, modules);
  betterAuthTest.register(t);
  return t;
}

/** Deja un superadmin de plataforma y devuelve el cliente con su identidad. */
async function conPlataforma(t: ReturnType<typeof convexTest>) {
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
  return t.withIdentity({ subject: "super" });
}

/** El login de verdad: lo que el formulario de /login termina llamando. */
async function iniciarSesion(
  t: ReturnType<typeof convexTest>,
  email: string,
  password: string,
): Promise<{ ok: boolean; motivo?: string }> {
  return await t.run(async (ctx) => {
    const auth = createAuth(ctx as never);
    try {
      await auth.api.signInEmail({ body: { email, password } });
      return { ok: true };
    } catch (e) {
      return { ok: false, motivo: (e as Error).message };
    }
  });
}

/** El perfil de aplicacion y su membresia de compania, por correo. */
async function perfilPorEmail(t: ReturnType<typeof convexTest>, email: string) {
  return await t.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!user) return null;
    const miembros = await ctx.db
      .query("companiaMiembros")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    return { user, miembros };
  });
}

describe("registrar una compania de vigilancia", () => {
  test("crea la empresa Y la cuenta de su administrador, y esa cuenta entra", async () => {
    const t = montar();
    const plataforma = await conPlataforma(t);

    // 1. Registrar compania.
    const r = await plataforma.action(api.companias.registrar, {
      nombre: "Seguridad Andina S.A.S.",
      nit: "900123456-7",
      contactoEmail: "operaciones@andina.test",
      adminName: "Maria Restrepo",
      adminEmail: "  Maria@Andina.test ",
      adminPassword: CLAVE,
      adminTelefono: "3100000000",
    });
    expect(r.ok).toBe(true);
    expect(r.existed).toBe(false);

    const compania = await t.run(async (ctx) => ctx.db.get(r.companiaId));
    expect(compania?.nombre).toBe("Seguridad Andina S.A.S.");
    expect(compania?.estado).toBe("activa");

    // 2. El usuario asociado existe, con el correo normalizado.
    const perfil = await perfilPorEmail(t, "maria@andina.test");
    expect(perfil).not.toBeNull();
    expect(perfil!.user._id).toBe(r.userId);

    // 3. Rol correcto.
    expect(perfil!.miembros).toHaveLength(1);
    expect(perfil!.miembros[0]!.roles).toEqual(["admin_compania"]);

    // 4. Asociado a ESA compania.
    expect(perfil!.miembros[0]!.companiaId).toBe(r.companiaId);
    expect(perfil!.miembros[0]!._id).toBe(r.miembroId);

    // 5. Habilitado en los dos ejes: el perfil y la membresia.
    expect(perfil!.user.active).toBe(true);
    expect(perfil!.miembros[0]!.isActive).toBe(true);

    // 6 y 7. Login con las credenciales elegidas.
    expect(await iniciarSesion(t, "maria@andina.test", CLAVE)).toEqual({
      ok: true,
    });

    /* El enlace perfil <-> identidad queda hecho en el alta y no en el primer
     * ingreso: es lo que hace que la sesion resuelva a este perfil desde el
     * primer clic, y no a uno nuevo. */
    expect(perfil!.user.authId).toBeTruthy();
    const comoAdmin = t.withIdentity({ subject: perfil!.user.authId! });
    const mia = await comoAdmin.query(api.companias.miCompania, {});
    expect(mia?.companiaId).toBe(r.companiaId);
    expect(mia?.roles).toEqual(["admin_compania"]);
  });

  test("el administrador registrado es estructuralmente igual a un usuario valido de antes", async () => {
    const t = montar();
    const plataforma = await conPlataforma(t);

    const condominioId = await t.run(async (ctx) => {
      const ahora = Date.now();
      return await ctx.db.insert("condominios", {
        name: "Conjunto Arboleda",
        activeModules: [],
        isActive: true,
        createdAt: ahora,
        updatedAt: ahora,
      });
    });

    await plataforma.action(api.companias.registrar, {
      nombre: "Seguridad Andina S.A.S.",
      adminName: "Maria Restrepo",
      adminEmail: "maria@andina.test",
      adminPassword: CLAVE,
    });

    // El camino que el proyecto ya usaba: el guarda del conjunto.
    await plataforma.action(api.users.createCondoMember, {
      condominioId,
      email: "guarda@arboleda.test",
      name: "Guarda Antiguo",
      password: CLAVE,
      roles: ["guardia"],
    });

    const forma = async (email: string) => {
      const p = await perfilPorEmail(t, email);
      return {
        tieneAuthId: !!p!.user.authId,
        active: p!.user.active,
        emailNormalizado: p!.user.email === email,
        proveedores: await t.run(async (ctx) => {
          const authCtx = await createAuth(ctx as never).$context;
          const found = await authCtx.internalAdapter.findUserByEmail(email);
          if (!found) return null;
          const cuentas = await authCtx.internalAdapter.findAccounts(
            found.user.id,
          );
          return cuentas.map((c) => c.providerId).sort();
        }),
      };
    };

    /* La misma forma en los dos ejes. Si algun dia divergen, se ve aqui y no
     * en un login que falla en produccion. */
    expect(await forma("maria@andina.test")).toEqual(
      await forma("guarda@arboleda.test"),
    );
    expect((await forma("maria@andina.test")).proveedores).toEqual([
      "credential",
    ]);
  });

  test("sin administrador valido no queda una compania suelta", async () => {
    const t = montar();
    const plataforma = await conPlataforma(t);

    await expect(
      plataforma.action(api.companias.registrar, {
        nombre: "Seguridad Fantasma",
        adminName: "Nadie",
        adminEmail: "nadie@fantasma.test",
        adminPassword: "corta",
      }),
    ).rejects.toThrow(/8 caracteres/);

    /* Y si falla DESPUES de haber creado la empresa, tampoco queda: esa
     * persona ya es personal activo de otra compania, asi que `crearMiembro`
     * la rechaza y el registro se descarta entero. */
    const otra = await plataforma.action(api.companias.registrar, {
      nombre: "Seguridad Andina",
      adminName: "Maria Restrepo",
      adminEmail: "maria@andina.test",
      adminPassword: CLAVE,
    });
    expect(otra.ok).toBe(true);

    await expect(
      plataforma.action(api.companias.registrar, {
        nombre: "Seguridad Duplicada",
        adminName: "Maria Restrepo",
        adminEmail: "maria@andina.test",
        adminPassword: CLAVE,
      }),
    ).rejects.toThrow(/otra compa/);

    const companias = await t.run(async (ctx) =>
      ctx.db.query("companiasSeguridad").collect(),
    );
    expect(companias.map((c) => c.nombre)).toEqual(["Seguridad Andina"]);
  });

  test("registrar una compania sigue siendo cosa de la plataforma", async () => {
    const t = montar();
    await conPlataforma(t);
    const ahora = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        name: "Residente",
        email: "residente@arboleda.test",
        emailVerified: true,
        active: true,
        authId: "residente",
        createdAt: ahora,
        updatedAt: ahora,
      });
    });

    await expect(
      t.withIdentity({ subject: "residente" }).action(api.companias.registrar, {
        nombre: "Seguridad Pirata",
        adminName: "Pirata",
        adminEmail: "pirata@pirata.test",
        adminPassword: CLAVE,
      }),
    ).rejects.toThrow(/plataforma/);

    expect(
      await t.run(async (ctx) => ctx.db.query("companiasSeguridad").collect()),
    ).toHaveLength(0);
  });
});

describe("las altas que ya funcionaban siguen funcionando", () => {
  test("el administrador de la compania puede dar de alta a su propio personal", async () => {
    const t = montar();
    const plataforma = await conPlataforma(t);

    const r = await plataforma.action(api.companias.registrar, {
      nombre: "Seguridad Andina",
      adminName: "Maria Restrepo",
      adminEmail: "maria@andina.test",
      adminPassword: CLAVE,
    });
    const admin = await perfilPorEmail(t, "maria@andina.test");

    /* La segunda cara del mismo fallo: el alta se partia en dos porque el
     * ultimo paso —enlazar el perfil con su identidad— exigia rol de
     * plataforma, que el administrador de la compania no tiene. La persona
     * quedaba creada con `authId` vacio y con un error en pantalla. */
    const comoAdminCia = t.withIdentity({ subject: admin!.user.authId! });
    const guarda = await comoAdminCia.action(api.companias.crearMiembro, {
      companiaId: r.companiaId,
      email: "guarda@andina.test",
      name: "Guarda Nuevo",
      password: CLAVE,
      roles: ["guardia"],
    });
    expect(guarda.ok).toBe(true);

    const perfil = await perfilPorEmail(t, "guarda@andina.test");
    expect(perfil!.user.authId).toBeTruthy();
    expect(perfil!.user.active).toBe(true);
    expect(perfil!.miembros[0]!.roles).toEqual(["guardia"]);
    expect(perfil!.miembros[0]!.companiaId).toBe(r.companiaId);
    expect(await iniciarSesion(t, "guarda@andina.test", CLAVE)).toEqual({
      ok: true,
    });
  });

  test("el administrador del conjunto sigue dando de alta a su gente", async () => {
    const t = montar();
    const plataforma = await conPlataforma(t);

    const condominioId = await t.run(async (ctx) => {
      const ahora = Date.now();
      const condominioId = await ctx.db.insert("condominios", {
        name: "Conjunto Arboleda",
        activeModules: [],
        isActive: true,
        createdAt: ahora,
        updatedAt: ahora,
      });
      const adminId = await ctx.db.insert("users", {
        name: "Admin Conjunto",
        email: "admin@arboleda.test",
        emailVerified: true,
        active: true,
        authId: "adminconj",
        createdAt: ahora,
        updatedAt: ahora,
      });
      await ctx.db.insert("memberships", {
        userId: adminId,
        condominioId,
        roles: ["administrador"],
        isActive: true,
        createdAt: ahora,
        updatedAt: ahora,
      });
      return condominioId;
    });

    await t
      .withIdentity({ subject: "adminconj" })
      .action(api.users.createCondoMember, {
        condominioId,
        email: "guarda@arboleda.test",
        name: "Guarda Antiguo",
        password: CLAVE,
        roles: ["guardia"],
      });

    const perfil = await perfilPorEmail(t, "guarda@arboleda.test");
    expect(perfil!.user.authId).toBeTruthy();
    expect(await iniciarSesion(t, "guarda@arboleda.test", CLAVE)).toEqual({
      ok: true,
    });

    // Y el staff de plataforma, que es el tercer camino con contrasena.
    await plataforma.action(api.users.createPlatformAdmin, {
      email: "staff@vekino.test",
      name: "Staff",
      password: CLAVE,
      platformRole: "admin",
    });
    expect(
      (await perfilPorEmail(t, "staff@vekino.test"))!.user.authId,
    ).toBeTruthy();
    expect(await iniciarSesion(t, "staff@vekino.test", CLAVE)).toEqual({
      ok: true,
    });
  });
});
