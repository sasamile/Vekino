import { test, expect, describe } from "vitest";
import { convexTest } from "convex-test";
import betterAuthTest from "@convex-dev/better-auth/test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const modules = import.meta.glob("../convex/**/*.ts");

/**
 * VOLVER A ASIGNAR A ALGUIEN QUE YA PASO POR OTRA COMPANIA.
 *
 * El caso real: se registro un guarda en una compania de pruebas, se le
 * asigno a un conjunto, se termino el contrato y se le dio de baja. Al
 * registrarlo despues en la compania de produccion y asignarlo AL MISMO
 * conjunto, el sistema respondia:
 *
 *   "Esa persona ya tiene una asignacion que se solapa con esas fechas en
 *    este conjunto."
 *
 * No habia datos corruptos. La asignacion vieja esta exactamente como el
 * modelo la deja: sin `vigenciaHasta`, porque terminar un contrato NO recorre
 * sus asignaciones —cuelgan de el justamente para no tener que hacerlo—. El
 * fallo era que la comprobacion de solape leia la fila cruda, donde una
 * asignacion sin fecha de fin parece abierta para siempre, mientras el resto
 * del sistema (`asignacionVigente`) leia la cadena entera.
 *
 * Estas pruebas fijan las dos mitades: lo muerto deja de estorbar, y lo vivo
 * sigue chocando.
 */

const DIA = 24 * 60 * 60 * 1000;
const CLAVE = "clave-de-prueba-1";
const AHORA = Date.now();

/** El correo del caso real. La regla no depende de el; el escenario si. */
const GUARDA = "yeison.2020nieto@gmail.com";

async function montar() {
  const t = convexTest(schema, modules);
  betterAuthTest.register(t);

  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      name: "Super",
      email: "super@vekino.test",
      emailVerified: true,
      active: true,
      authId: "super",
      platformRole: "superadmin",
      createdAt: AHORA,
      updatedAt: AHORA,
    });
  });
  const plataforma = t.withIdentity({ subject: "super" });

  const conjunto = await plataforma.mutation(api.condominios.create, {
    name: "Conjunto Damasco",
  });
  /* Un segundo conjunto, para comprobar que cubrir dos porterias a la vez
   * sigue siendo legitimo. */
  const otroConjunto = await plataforma.mutation(api.condominios.create, {
    name: "Conjunto Vecino",
  });

  const compania = async (nombre: string, adminEmail: string) =>
    await plataforma.action(api.companias.registrar, {
      nombre,
      adminName: `Admin ${nombre}`,
      adminEmail,
      adminPassword: CLAVE,
    });

  return { t, plataforma, conjunto, otroConjunto, compania };
}

/**
 * El flujo que provoco el problema, paso por paso.
 *
 * Devuelve todo lo necesario para asignar en la compania nueva.
 */
async function trasFondoDePruebas(opciones: {
  terminarContrato: boolean;
  darDeBaja: boolean;
}) {
  const e = await montar();

  // 1-3. Compania de pruebas, guarda, contrato y asignacion.
  const test = await e.compania("DamascoTest", "admin@damascotest.test");
  const kTest = await e.plataforma.mutation(api.companias.crearContrato, {
    companiaId: test.companiaId,
    condominioId: e.conjunto,
    vigenciaDesde: AHORA - 60 * DIA,
  });
  const miembroTest = await e.plataforma.action(api.companias.crearMiembro, {
    companiaId: test.companiaId,
    email: GUARDA,
    name: "Yeison Nieto",
    password: CLAVE,
    roles: ["guardia"],
  });
  /* Sin `vigenciaHasta`: es como se asigna a alguien indefinidamente, y es lo
   * que deja la fila con pinta de abierta para siempre. */
  const asignacionTest = await e.plataforma.mutation(api.asignaciones.crear, {
    contratoId: kTest,
    companiaMiembroId: miembroTest.miembroId,
    rol: "guardia",
    vigenciaDesde: AHORA - 60 * DIA,
  });

  // 4. Se termina el contrato de pruebas.
  if (opciones.terminarContrato) {
    await e.plataforma.mutation(api.companias.terminarContrato, {
      contratoId: kTest,
    });
  }
  // 5. Y se da de baja al guarda en la compania de pruebas.
  if (opciones.darDeBaja) {
    await e.plataforma.mutation(api.companias.desactivarMiembro, {
      miembroId: miembroTest.miembroId,
    });
  }

  return { ...e, test, kTest, miembroTest, asignacionTest };
}

/** Registra al mismo guarda en Damasco y devuelve con que asignarlo. */
async function altaEnProduccion(
  e: Awaited<ReturnType<typeof trasFondoDePruebas>>,
  condominioId: Id<"condominios"> = e.conjunto,
) {
  const damasco = await e.compania("Damasco", "admin@damasco.test");
  const kProd = await e.plataforma.mutation(api.companias.crearContrato, {
    companiaId: damasco.companiaId,
    condominioId,
    vigenciaDesde: AHORA - 1 * DIA,
  });
  const miembro = await e.plataforma.action(api.companias.crearMiembro, {
    companiaId: damasco.companiaId,
    email: GUARDA,
    name: "Yeison Nieto",
    password: CLAVE,
    roles: ["guardia"],
  });
  return { damasco, kProd, miembro };
}

// ─────────────────────────────────────────────────────────────
describe("el caso reportado", () => {
  test("caso 6 — el guarda de la compania de pruebas se asigna en Damasco", async () => {
    const e = await trasFondoDePruebas({ terminarContrato: true, darDeBaja: true });
    const p = await altaEnProduccion(e);

    const nueva = await e.plataforma.mutation(api.asignaciones.crear, {
      contratoId: p.kProd,
      companiaMiembroId: p.miembro.miembroId,
      rol: "guardia",
      vigenciaDesde: AHORA - 1 * DIA,
    });
    expect(nueva).toBeTruthy();
  });

  test("las dos companias comparten la MISMA persona, por el correo", async () => {
    /* Es lo que hace que la asignacion vieja aparezca al buscar por
     * `by_user_condominio`. Si fueran dos usuarios distintos el problema no
     * existiria, y conviene que la prueba lo deje escrito. */
    const e = await trasFondoDePruebas({ terminarContrato: true, darDeBaja: true });
    const p = await altaEnProduccion(e);
    const vieja = await e.t.run(async (ctx) => await ctx.db.get(e.asignacionTest));
    expect(p.miembro.userId).toBe(vieja!.userId);
    expect(p.miembro.existed).toBe(true);
  });

  test("no se borro nada: la asignacion de pruebas sigue en el historial", async () => {
    const e = await trasFondoDePruebas({ terminarContrato: true, darDeBaja: true });
    const p = await altaEnProduccion(e);
    await e.plataforma.mutation(api.asignaciones.crear, {
      contratoId: p.kProd,
      companiaMiembroId: p.miembro.miembroId,
      rol: "guardia",
      vigenciaDesde: AHORA - 1 * DIA,
    });

    const vieja = await e.t.run(async (ctx) => await ctx.db.get(e.asignacionTest));
    expect(vieja).not.toBeNull();
    expect(vieja!.companiaId).toBe(e.test.companiaId);
    expect(vieja!.vigenciaDesde).toBe(AHORA - 60 * DIA);
    /* La baja le puso fecha de fin —eso ya lo hacia `desactivarMiembro`— pero
     * el arreglo no reescribio ni un campo: el historial queda tal cual. */
    expect(vieja!.contratoId).toBe(e.kTest);
  });

  test("y el guarda queda operando en Damasco, no en la de pruebas", async () => {
    const e = await trasFondoDePruebas({ terminarContrato: true, darDeBaja: true });
    const p = await altaEnProduccion(e);
    await e.plataforma.mutation(api.asignaciones.crear, {
      contratoId: p.kProd,
      companiaMiembroId: p.miembro.miembroId,
      rol: "guardia",
      vigenciaDesde: AHORA - 1 * DIA,
    });

    const filas = await e.plataforma.query(api.asignaciones.porCondominio, {
      condominioId: e.conjunto,
    });
    const vigentes = filas.filter((f) => f.estado === "vigente");
    expect(vigentes.length).toBe(1);
    expect(vigentes[0]!.companiaNombre).toBe("Damasco");
  });
});

// ─────────────────────────────────────────────────────────────
describe("que deja de estorbar y que no", () => {
  test("caso 4 — un contrato terminado no bloquea, aunque las fechas se pisen", async () => {
    /* Sin dar de baja al miembro: se aisla el efecto del contrato. */
    const e = await trasFondoDePruebas({ terminarContrato: true, darDeBaja: false });
    /* Para poder darlo de alta en otra compania hay que darlo de baja en la
     * primera —el modelo no admite dos companias activas— asi que se prueba
     * el contrato terminado dentro de la MISMA compania, con otro contrato.
     * Empieza manana: dos contratos de la misma compania al mismo conjunto no
     * pueden solaparse, y el anterior se corto hace un instante. */
    const kNuevo = await e.plataforma.mutation(api.companias.crearContrato, {
      companiaId: e.test.companiaId,
      condominioId: e.conjunto,
      vigenciaDesde: AHORA + 1 * DIA,
    });
    /* Las fechas de la asignacion vieja —abierta desde hace 60 dias— SI se
     * pisan con esta. Antes bastaba para bloquear. */
    const nueva = await e.plataforma.mutation(api.asignaciones.crear, {
      contratoId: kNuevo,
      companiaMiembroId: e.miembroTest.miembroId,
      rol: "guardia",
      vigenciaDesde: AHORA + 1 * DIA,
    });
    expect(nueva).toBeTruthy();
  });

  test("caso 1 y 7 — con el contrato vivo, el solape se sigue rechazando", async () => {
    const e = await trasFondoDePruebas({ terminarContrato: false, darDeBaja: false });
    /* El contrato de pruebas sigue vigente y la asignacion abierta. Un
     * segundo contrato de la misma compania al mismo conjunto no cabe, asi
     * que se intenta reasignar bajo el MISMO contrato: es el duplicado que la
     * regla existe para evitar. */
    await expect(
      e.plataforma.mutation(api.asignaciones.crear, {
        contratoId: e.kTest,
        companiaMiembroId: e.miembroTest.miembroId,
        rol: "guardia",
        vigenciaDesde: AHORA - 1 * DIA,
      }),
    ).rejects.toThrow(/ya tiene una asignación que se solapa/i);
  });

  test("caso 3 — una asignacion terminada a mano tampoco bloquea", async () => {
    const e = await trasFondoDePruebas({ terminarContrato: false, darDeBaja: false });
    await e.plataforma.mutation(api.asignaciones.terminar, {
      asignacionId: e.asignacionTest,
    });
    const nueva = await e.plataforma.mutation(api.asignaciones.crear, {
      contratoId: e.kTest,
      companiaMiembroId: e.miembroTest.miembroId,
      rol: "guardia",
      vigenciaDesde: AHORA + 1 * DIA,
    });
    expect(nueva).toBeTruthy();
  });

  test("caso 5 — contrato terminado con la asignacion aun abierta: no bloquea", async () => {
    /* Es EXACTAMENTE el estado que deja el modelo, y no es una inconsistencia
     * que haya que reparar: terminar el contrato no escribe en la asignacion
     * a proposito. Lo que no puede es seguir contando como conflicto. */
    const e = await trasFondoDePruebas({ terminarContrato: true, darDeBaja: false });
    const vieja = await e.t.run(async (ctx) => await ctx.db.get(e.asignacionTest));
    expect(vieja!.vigenciaHasta).toBeUndefined();
    expect(vieja!.terminadoEn).toBeUndefined();

    const kNuevo = await e.plataforma.mutation(api.companias.crearContrato, {
      companiaId: e.test.companiaId,
      condominioId: e.conjunto,
      vigenciaDesde: AHORA + 1 * DIA,
    });
    await expect(
      e.plataforma.mutation(api.asignaciones.crear, {
        contratoId: kNuevo,
        companiaMiembroId: e.miembroTest.miembroId,
        rol: "guardia",
        vigenciaDesde: AHORA + 1 * DIA,
      }),
    ).resolves.toBeTruthy();
  });

  test("una baja en la compania tampoco deja la asignacion estorbando", async () => {
    const e = await trasFondoDePruebas({ terminarContrato: false, darDeBaja: true });
    const p = await altaEnProduccion(e);
    const nueva = await e.plataforma.mutation(api.asignaciones.crear, {
      contratoId: p.kProd,
      companiaMiembroId: p.miembro.miembroId,
      rol: "guardia",
      vigenciaDesde: AHORA - 1 * DIA,
    });
    expect(nueva).toBeTruthy();
  });

  test("caso 2 — dos porterias a la vez siguen siendo legitimas", async () => {
    /* No es un solape: son conjuntos distintos. La regla nunca miro esto y
     * tiene que seguir sin mirarlo. */
    const e = await trasFondoDePruebas({ terminarContrato: false, darDeBaja: false });
    const kOtro = await e.plataforma.mutation(api.companias.crearContrato, {
      companiaId: e.test.companiaId,
      condominioId: e.otroConjunto,
      vigenciaDesde: AHORA - 1 * DIA,
    });
    const nueva = await e.plataforma.mutation(api.asignaciones.crear, {
      contratoId: kOtro,
      companiaMiembroId: e.miembroTest.miembroId,
      rol: "guardia",
      vigenciaDesde: AHORA - 1 * DIA,
    });
    expect(nueva).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────
describe("multi-tenancy", () => {
  test("caso 8 — el admin de Damasco no puede asignar bajo el contrato ajeno", async () => {
    const e = await trasFondoDePruebas({ terminarContrato: true, darDeBaja: true });
    const p = await altaEnProduccion(e);

    const damascoAuth = await e.t.run(async (ctx) => {
      const u = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "admin@damasco.test"))
        .unique();
      return u!.authId!;
    });

    await expect(
      e.t.withIdentity({ subject: damascoAuth }).mutation(api.asignaciones.crear, {
        contratoId: e.kTest,
        companiaMiembroId: p.miembro.miembroId,
        rol: "guardia",
        vigenciaDesde: AHORA - 1 * DIA,
      }),
    ).rejects.toThrow();
  });

  test("caso 8 — ni asignar personal de otra compania bajo el suyo", async () => {
    const e = await trasFondoDePruebas({ terminarContrato: true, darDeBaja: true });
    const p = await altaEnProduccion(e);

    await expect(
      e.plataforma.mutation(api.asignaciones.crear, {
        contratoId: p.kProd,
        /* El miembro de DamascoTest bajo el contrato de Damasco. */
        companiaMiembroId: e.miembroTest.miembroId,
        rol: "guardia",
        vigenciaDesde: AHORA - 1 * DIA,
      }),
    ).rejects.toThrow(/no pertenece a la compañía del contrato/i);
  });
});
