import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { AHORA, bloquearRed, fijarReloj, liberarRed, montar, soltarReloj } from "./escenario";

/**
 * CARGA DE PDF POR CONJUNTO, NO POR `legacyId` (Hallazgo 2 de la QA en
 * Factory; ver docs/audits/FALTANTES-WEB-FACTURACION.md).
 *
 * Solo los conjuntos migrados (CDC, Arboleda) tienen `legacyId`, y la carga
 * de facturas en PDF se resolvía por él: un conjunto creado desde la
 * plataforma no podía cargar. `facturas.destinoCarga` resuelve el conjunto
 * por `condominioId` —o por `condominioLegacyId`, que sigue mandando la web
 * anterior— y devuelve, con el permiso, el conjunto y su carpeta de S3:
 * `legacyId` si lo tiene (las llaves de los migrados no cambian), `_id` si no.
 *
 * `permisoSubida` no cambia: la web anterior lo sigue llamando.
 */

beforeEach(() => {
  bloquearRed();
  fijarReloj();
});
afterEach(() => {
  soltarReloj();
  liberarRed();
});

type Quien =
  | "admin"
  | "contadora"
  | "plataforma"
  | "residente"
  | "junta"
  | "guarda"
  | "sin-vinculo"
  | "admin-otro";

/**
 * El escenario de la red (administración, residente, vecino y guarda) más lo
 * que esta prueba necesita: contadora, junta directiva, staff de plataforma,
 * una persona sin vínculo con el conjunto y la administración de OTRO
 * conjunto.
 */
async function montarConjuntos({ legacyId }: { legacyId?: string } = {}) {
  const esc = await montar();
  const extra = await esc.t.run(async (ctx) => {
    if (legacyId !== undefined) await ctx.db.patch(esc.condominioId, { legacyId });
    const persona = (authId: string, platformRole?: "admin") =>
      ctx.db.insert("users", {
        name: authId,
        email: `${authId}@vekino.test`,
        emailVerified: true,
        active: true,
        authId,
        ...(platformRole ? { platformRole } : {}),
        createdAt: AHORA,
        updatedAt: AHORA,
      });
    const membresia = (
      userId: Id<"users">,
      condominioId: Id<"condominios">,
      roles: Array<"administrador" | "contadora" | "junta_directiva">,
    ) =>
      ctx.db.insert("memberships", {
        userId,
        condominioId,
        roles,
        isActive: true,
        createdAt: AHORA,
        updatedAt: AHORA,
      });

    const otroId = await ctx.db.insert("condominios", {
      name: "Otro conjunto",
      legacyId: "otro-conjunto",
      activeModules: [],
      isActive: true,
      createdAt: AHORA,
      updatedAt: AHORA,
    });
    await membresia(await persona("contadora"), esc.condominioId, ["contadora"]);
    await membresia(await persona("junta"), esc.condominioId, ["junta_directiva"]);
    await membresia(await persona("admin-otro"), otroId, ["administrador"]);
    await persona("sin-vinculo");
    await persona("plataforma", "admin");
    return { otroId };
  });
  const como = (quien: Quien) => esc.t.withIdentity({ subject: quien });
  return { ...esc, ...extra, como };
}

type Conjuntos = Awaited<ReturnType<typeof montarConjuntos>>;

/** Inserta un conjunto más, sin nadie dentro. */
async function otroConjunto(esc: Conjuntos, legacyId?: string) {
  return await esc.t.run((ctx) =>
    ctx.db.insert("condominios", {
      name: "Conjunto extra",
      ...(legacyId !== undefined ? { legacyId } : {}),
      activeModules: [],
      isActive: true,
      createdAt: AHORA,
      updatedAt: AHORA,
    }),
  );
}

const SIN_PERMISO = { allowed: false, motivo: "sin_permiso" };
const PUEDEN: Quien[] = ["admin", "contadora", "plataforma"];
const NO_PUEDEN: Quien[] = ["residente", "junta", "guarda", "sin-vinculo", "admin-otro"];

describe("facturas.destinoCarga · conjunto SIN legacyId (creado desde la plataforma)", () => {
  test.each(PUEDEN)("%s: sí, y la carpeta es el _id del conjunto", async (quien) => {
    const esc = await montarConjuntos();
    expect(
      await esc.como(quien).query(api.facturas.destinoCarga, { condominioId: esc.condominioId }),
    ).toEqual({ allowed: true, condominioId: esc.condominioId, carpeta: esc.condominioId });
  });

  test.each(NO_PUEDEN)("%s: no", async (quien) => {
    const esc = await montarConjuntos();
    expect(
      await esc.como(quien).query(api.facturas.destinoCarga, { condominioId: esc.condominioId }),
    ).toEqual(SIN_PERMISO);
  });

  test("sin sesión: no, y se distingue de no tener permiso (401 frente a 403)", async () => {
    const esc = await montarConjuntos();
    expect(
      await esc.t.query(api.facturas.destinoCarga, { condominioId: esc.condominioId }),
    ).toEqual({ allowed: false, motivo: "sin_sesion" });
  });

  test("un id que no es de un conjunto: no (sin error de validación)", async () => {
    const esc = await montarConjuntos();
    for (const condominioId of ["no-es-un-id", esc.u101]) {
      expect(
        await esc.como("admin").query(api.facturas.destinoCarga, { condominioId }),
      ).toEqual(SIN_PERMISO);
    }
  });

  test("sin ningún identificador: no hay conjunto que resolver", async () => {
    const esc = await montarConjuntos();
    expect(await esc.como("admin").query(api.facturas.destinoCarga, {})).toEqual({
      allowed: false,
      motivo: "sin_conjunto",
    });
  });
});

describe("facturas.destinoCarga · conjunto CON legacyId, por las dos vías", () => {
  const VIAS = {
    condominioId: (esc: Conjuntos) => ({ condominioId: esc.condominioId as string }),
    condominioLegacyId: () => ({ condominioLegacyId: "conjunto-de-prueba" }),
    "los dos": (esc: Conjuntos) => ({
      condominioId: esc.condominioId as string,
      condominioLegacyId: "conjunto-de-prueba",
    }),
  };
  const casos = Object.keys(VIAS) as Array<keyof typeof VIAS>;

  describe.each(casos)("por %s", (via) => {
    test.each(PUEDEN)("%s: sí, y la carpeta sigue siendo el legacyId", async (quien) => {
      const esc = await montarConjuntos({ legacyId: "conjunto-de-prueba" });
      expect(
        await esc.como(quien).query(api.facturas.destinoCarga, VIAS[via](esc)),
      ).toEqual({ allowed: true, condominioId: esc.condominioId, carpeta: "conjunto-de-prueba" });
    });

    test.each(NO_PUEDEN)("%s: no", async (quien) => {
      const esc = await montarConjuntos({ legacyId: "conjunto-de-prueba" });
      expect(
        await esc.como(quien).query(api.facturas.destinoCarga, VIAS[via](esc)),
      ).toEqual(SIN_PERMISO);
    });
  });

  test("permisoSubida no cambia: mismos argumentos y la misma respuesta", async () => {
    const esc = await montarConjuntos({ legacyId: "conjunto-de-prueba" });
    for (const quien of ["admin", "contadora"] as const) {
      expect(
        await esc
          .como(quien)
          .query(api.facturas.permisoSubida, { condominioLegacyId: "conjunto-de-prueba" }),
      ).toEqual({ allowed: true });
    }
    for (const quien of ["residente", "sin-vinculo", "admin-otro"] as const) {
      expect(
        await esc
          .como(quien)
          .query(api.facturas.permisoSubida, { condominioLegacyId: "conjunto-de-prueba" }),
      ).toEqual(SIN_PERMISO);
    }
  });

  test("un legacyId que no existe: no", async () => {
    const esc = await montarConjuntos({ legacyId: "conjunto-de-prueba" });
    expect(
      await esc.como("admin").query(api.facturas.destinoCarga, { condominioLegacyId: "no-existe" }),
    ).toEqual(SIN_PERMISO);
  });
});

describe("facturas.destinoCarga · la carpeta de S3", () => {
  test("es el legacyId cuando existe y el _id cuando no", async () => {
    const conLegacy = await montarConjuntos({ legacyId: "conjunto-de-prueba" });
    const sinLegacy = await montarConjuntos();
    const carpeta = async (esc: Conjuntos) =>
      ((await esc.como("admin").query(api.facturas.destinoCarga, {
        condominioId: esc.condominioId,
      })) as { carpeta: string }).carpeta;
    expect(await carpeta(conLegacy)).toBe("conjunto-de-prueba");
    expect(await carpeta(sinLegacy)).toBe(sinLegacy.condominioId);
  });

  test("un legacyId vacío cuenta como ausente: la carpeta es el _id, nunca ''", async () => {
    const esc = await montarConjuntos({ legacyId: "" });
    expect(
      await esc.como("admin").query(api.facturas.destinoCarga, { condominioId: esc.condominioId }),
    ).toEqual({ allowed: true, condominioId: esc.condominioId, carpeta: esc.condominioId });
  });

  test("si el legacyId de otro conjunto es igual a este _id, nadie carga en esa carpeta", async () => {
    const esc = await montarConjuntos();
    const intruso = await otroConjunto(esc, esc.condominioId);
    expect(
      await esc.como("admin").query(api.facturas.destinoCarga, { condominioId: esc.condominioId }),
    ).toEqual({ allowed: false, motivo: "carpeta_compartida" });
    expect(
      await esc.como("plataforma").query(api.facturas.destinoCarga, { condominioId: intruso }),
    ).toEqual({ allowed: false, motivo: "carpeta_compartida" });
  });

  test("un legacyId repetido en dos conjuntos tampoco se carga, por ninguna vía", async () => {
    const esc = await montarConjuntos({ legacyId: "conjunto-de-prueba" });
    await otroConjunto(esc, "conjunto-de-prueba");
    for (const args of [
      { condominioId: esc.condominioId as string },
      { condominioLegacyId: "conjunto-de-prueba" },
    ]) {
      expect(await esc.como("plataforma").query(api.facturas.destinoCarga, args)).toEqual({
        allowed: false,
        motivo: "carpeta_compartida",
      });
    }
  });
});

describe("facturas.destinoCarga · los dos identificadores", () => {
  test("de conjuntos distintos: se rechaza", async () => {
    const esc = await montarConjuntos();
    // La plataforma tiene rol en los dos: lo único que falla es que no coinciden.
    expect(
      await esc.como("plataforma").query(api.facturas.destinoCarga, {
        condominioId: esc.condominioId,
        condominioLegacyId: "otro-conjunto",
      }),
    ).toEqual({ allowed: false, motivo: "no_coinciden" });
  });

  test("quien no tiene rol en uno de los dos no se entera de si coinciden", async () => {
    const esc = await montarConjuntos();
    expect(
      await esc.como("admin").query(api.facturas.destinoCarga, {
        condominioId: esc.condominioId,
        condominioLegacyId: "otro-conjunto",
      }),
    ).toEqual(SIN_PERMISO);
  });
});

describe("condominios.adminHome · la fuente de rol de Finanzas ('Subir facturas')", () => {
  test.each(PUEDEN)("%s: entra, sin legacyId", async (quien) => {
    const esc = await montarConjuntos();
    const home = await esc
      .como(quien)
      .query(api.condominios.adminHome, { condominioId: esc.condominioId });
    expect(home.allowed).toBe(true);
    expect(home.allowed && home.condominio.legacyId).toBeNull();
  });

  test.each(NO_PUEDEN)("%s: no entra", async (quien) => {
    const esc = await montarConjuntos();
    expect(
      await esc.como(quien).query(api.condominios.adminHome, { condominioId: esc.condominioId }),
    ).toEqual({ allowed: false });
  });
});
