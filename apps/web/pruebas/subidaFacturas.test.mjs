import { beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getFunctionName } from "convex/server";

/**
 * QUIÉN PUEDE USAR /api/facturas/upload (Fase 1 de la auditoría de
 * facturación, docs/audits/FASE-1-FACTURACION.md).
 *
 * La ruta lee el PDF y lo publica en S3, en la carpeta del conjunto. Hasta la
 * Fase 1 respondía a cualquiera. La prueba de la Fase 0 (F07-subida-sin-sesion,
 * en `pruebas/facturacion/parserFacturas.test.mjs`) cubre "sin sesión"; aquí,
 * el resto: sesión sin permiso, sesión inválida, fallo al validar, y que con
 * permiso todo sigue como antes.
 *
 * Archivo aparte —y proceso aparte en `test:facturacion`— porque simula
 * `@/lib/auth-server` de otra forma que las pruebas del parser, y en un mismo
 * proceso de `bun test` los dobles de módulos se pisan entre archivos.
 */

const PDF = readFileSync(join(import.meta.dir, "facturacion", "fixtures", "cdc-control.pdf"));

let subidas = [];
let consultas = [];
let haySesion = true;
/** Lo que responde Convex a `facturas.destinoCarga` (antes, `permisoSubida`). */
let permiso = async () => ({ allowed: true });

mock.module("@aws-sdk/client-s3", () => ({
  S3Client: class {
    async send(comando) {
      subidas.push(comando.input);
      return {};
    }
  },
  PutObjectCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const sinSesion = () => {
  throw new Error("No autenticado o perfil inexistente.");
};
mock.module("@/lib/auth-server", () => ({
  handler: async () => new Response(null, { status: 404 }),
  getToken: async () => (haySesion ? "token-de-prueba" : undefined),
  isAuthenticated: async () => haySesion,
  preloadAuthQuery: async () => sinSesion(),
  fetchAuthQuery: async (consulta, args) => {
    consultas.push({ nombre: getFunctionName(consulta), args });
    return await permiso();
  },
  fetchAuthMutation: async () => sinSesion(),
  fetchAuthAction: async () => sinSesion(),
}));

const { POST } = await import("../app/api/facturas/upload/route");

beforeEach(() => {
  subidas = [];
  consultas = [];
  haySesion = true;
  permiso = async () => ({ allowed: true });
});

async function subir() {
  const form = new FormData();
  form.append("pdf", new File([PDF], "cdc-control.pdf", { type: "application/pdf" }));
  form.append("condominioLegacyId", "conjunto-de-prueba");
  form.append("periodo", "2026-09");
  const res = await POST(
    new Request("http://localhost/api/facturas/upload", { method: "POST", body: form }),
  );
  return { status: res.status, cuerpo: await res.json() };
}

describe("F07 · /api/facturas/upload exige sesión y permiso sobre el conjunto", () => {
  test("sin sesión: 401, sin preguntar permisos ni tocar S3", async () => {
    haySesion = false;
    const { status } = await subir();
    expect(status).toBe(401);
    expect(consultas).toEqual([]);
    expect(subidas).toEqual([]);
  });

  test("con sesión pero sin rol en el conjunto (o de otro conjunto): 403 y nada en S3", async () => {
    permiso = async () => ({ allowed: false, motivo: "sin_permiso" });
    const { status, cuerpo } = await subir();
    expect(status).toBe(403);
    expect(cuerpo.error).toMatch(/permiso/);
    expect(subidas).toEqual([]);
  });

  test("hay cookie, pero Convex no reconoce a la persona: 401 y nada en S3", async () => {
    permiso = async () => ({ allowed: false, motivo: "sin_sesion" });
    expect((await subir()).status).toBe(401);
    expect(subidas).toEqual([]);
  });

  test("un token que Convex rechaza (error de autenticación): 401 y nada en S3", async () => {
    permiso = async () => sinSesion();
    expect((await subir()).status).toBe(401);
    expect(subidas).toEqual([]);
  });

  test("si no se puede validar el permiso, no pasa: 500 y nada en S3", async () => {
    permiso = async () => {
      throw new Error("fetch failed");
    };
    expect((await subir()).status).toBe(500);
    expect(subidas).toEqual([]);
  });

  /*
   * Hasta la Fase 1 esta prueba exigía que la vista previa publicara el PDF
   * en S3 (`…/2026-09/unidad-999.pdf`). La Fase 2 lo prohíbe —F07-s3-antes-de-
   * confirmar, #78 de la Fase 0— y mueve la publicación a /api/facturas/confirmar
   * (ver confirmarFacturas.test.mjs). Lo demás se mantiene: pregunta por ESE
   * conjunto y lee el PDF.
   */
  test("con permiso: pregunta por ESE conjunto y lee el PDF, sin publicar nada (S3 solo al confirmar)", async () => {
    const { status, cuerpo } = await subir();
    expect(status).toBe(200);
    /* Hallazgo 2: la ruta pregunta por `facturas.destinoCarga` (por
     * `condominioId` o, como aquí, por `condominioLegacyId`), no por
     * `permisoSubida`, que solo resuelve por `legacyId`. */
    expect(consultas).toEqual([
      { nombre: "facturas:destinoCarga", args: { condominioLegacyId: "conjunto-de-prueba" } },
    ]);
    expect(cuerpo.invoices).toHaveLength(1);
    expect(cuerpo.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(subidas).toEqual([]);
  });
});
