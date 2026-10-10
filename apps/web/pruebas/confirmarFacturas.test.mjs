import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getFunctionName } from "convex/server";
import { rechazoDePeriodo } from "@vekino/backend/lecturaFactura";

/**
 * CONFIRMACIÓN DE UNA CARGA DE FACTURAS: /api/facturas/confirmar (Fase 2 de
 * la auditoría de facturación, docs/audits/FASE-2-FACTURACION.md).
 *
 * Es lo único que publica en S3 y escribe en la base. Aquí se prueba con
 * S3 y Convex simulados:
 *
 *   · misma sesión y permiso que la vista previa (401/403/500, sin escribir);
 *   · vuelve a leer el PDF y exige que sea el mismo de la vista previa (hash);
 *   · publica SOLO lo que se inserta o actualiza, con una llave propia de la
 *     importación y sin sobrescribir (`If-None-Match: *`);
 *   · guarda los números que lee el servidor, no los del navegador;
 *   · confirmar dos veces no vuelve a publicar ni a escribir.
 *
 * Proceso aparte en `test:facturacion`: simula `@/lib/auth-server` y S3 de
 * otra forma que las demás pruebas.
 */

const FIXTURES = join(import.meta.dir, "facturacion", "fixtures");
const pdf = (archivo) => readFileSync(join(FIXTURES, archivo));
const huella = (bytes) => createHash("sha256").update(bytes).digest("hex");

// ── S3 simulado: guarda lo publicado y respeta If-None-Match
let publicados;
let enS3;
mock.module("@aws-sdk/client-s3", () => ({
  S3Client: class {
    async send(comando) {
      const { Key, IfNoneMatch } = comando.input;
      if (IfNoneMatch === "*" && enS3.has(Key)) {
        const e = new Error("At least one of the pre-conditions you specified did not hold");
        e.name = "PreconditionFailed";
        e.$metadata = { httpStatusCode: 412 };
        throw e;
      }
      enS3.add(Key);
      publicados.push(comando.input);
      return {};
    }
  },
  PutObjectCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

// ── Convex simulado: lo justo de iniciarImportacion / bulkUpsert / finalizarImportacion
let haySesion;
let permiso;
let llamadas;
let importaciones;
let existentes; // unidadId de facturas que ya existen para el período
let fallarBulk;
const sinSesion = () => {
  throw new Error("No autenticado o perfil inexistente.");
};
mock.module("@/lib/auth-server", () => ({
  handler: async () => new Response(null, { status: 404 }),
  getToken: async () => (haySesion ? "token" : undefined),
  isAuthenticated: async () => haySesion,
  preloadAuthQuery: async () => sinSesion(),
  fetchAuthQuery: async () => await permiso(),
  fetchAuthAction: async () => sinSesion(),
  fetchAuthMutation: async (fn, args) => {
    const nombre = getFunctionName(fn);
    llamadas.push({ nombre, args });
    if (nombre === "facturas:iniciarImportacion") {
      const clave = `${args.hash}|${args.periodo}`;
      const previa = importaciones.get(clave);
      if (previa?.estado === "completada") {
        return { tipo: "repetida", importacionId: previa.id, resultado: previa.resultado, plan: [] };
      }
      const id = previa?.id ?? `imp${importaciones.size + 1}`;
      importaciones.set(clave, { id, estado: "en_curso" });
      return {
        tipo: "nueva",
        importacionId: id,
        resultado: null,
        plan: args.candidatas.map((c) => {
          // Como el backend: un documento de otro mes se rechaza.
          const motivo = rechazoDePeriodo(args.periodo, c.periodoLabel);
          if (motivo) return { indice: c.indice, accion: "rechazar", motivo };
          return {
            indice: c.indice,
            accion: existentes.has(c.unidadId) ? (args.soloNuevas ? "omitir" : "actualizar") : "insertar",
          };
        }),
      };
    }
    if (nombre === "facturas:bulkUpsert") {
      if (fallarBulk) throw new Error("Convex no respondió");
      return {
        inserted: args.facturas.length,
        updated: 0,
        skipped: 0,
        marcadas: 0,
        rechazadas: 0,
        rechazos: [],
        conciliacion: { pagadas: 0, abonadas: 0, vencidas: 0 },
      };
    }
    if (nombre === "facturas:finalizarImportacion") {
      const imp = [...importaciones.values()].find((i) => i.id === args.importacionId);
      imp.estado = args.estado;
      imp.resultado = { importacionId: imp.id, estado: args.estado, documentos: 0, insertadas: 0, actualizadas: 0, omitidas: 0, marcadas: 0, rechazadas: (args.sinUnidad ?? []).length, rechazos: [] };
      return imp.resultado;
    }
    throw new Error(`Mutación inesperada: ${nombre}`);
  },
}));

const { POST } = await import("../app/api/facturas/confirmar/route");

beforeEach(() => {
  publicados = [];
  enS3 = new Set();
  haySesion = true;
  /* Lo que responde `facturas.destinoCarga` (Hallazgo 2) para el conjunto
   * migrado de la prueba: su id y su carpeta, que es su `legacyId`. */
  permiso = async () => ({ allowed: true, condominioId: "condo-1", carpeta: "conjunto-de-prueba" });
  llamadas = [];
  importaciones = new Map();
  existentes = new Set();
  fallarBulk = false;
});

async function confirmar(archivo, opciones = {}) {
  const bytes = pdf(archivo);
  const form = new FormData();
  form.append("pdf", new File([bytes], archivo, { type: "application/pdf" }));
  form.append("condominioId", "condo-1");
  form.append("condominioLegacyId", "conjunto-de-prueba");
  form.append("periodo", opciones.periodo ?? "2026-09");
  form.append("hash", opciones.hash ?? huella(bytes));
  form.append("soloNuevas", opciones.soloNuevas === false ? "false" : "true");
  form.append("asignaciones", JSON.stringify(opciones.asignaciones ?? [{ indice: 0, unidadId: "u999" }]));
  const res = await POST(new Request("http://localhost/api/facturas/confirmar", { method: "POST", body: form }));
  return { status: res.status, cuerpo: await res.json() };
}

const DOS_CASAS = [
  { indice: 0, unidadId: "u999" },
  { indice: 1, unidadId: "u998" },
];

describe("F07 · la confirmación exige sesión, permiso y el mismo archivo", () => {
  test("sin sesión: 401, sin escribir nada", async () => {
    haySesion = false;
    expect((await confirmar("cdc-control.pdf")).status).toBe(401);
    expect(publicados).toEqual([]);
    expect(llamadas).toEqual([]);
  });

  test("sin rol en el conjunto: 403, sin escribir nada", async () => {
    permiso = async () => ({ allowed: false, motivo: "sin_permiso" });
    expect((await confirmar("cdc-control.pdf")).status).toBe(403);
    expect(publicados).toEqual([]);
    expect(llamadas).toEqual([]);
  });

  test("si no se puede validar el permiso: 500, sin escribir nada", async () => {
    permiso = async () => {
      throw new Error("fetch failed");
    };
    expect((await confirmar("cdc-control.pdf")).status).toBe(500);
    expect(publicados).toEqual([]);
  });

  test("un archivo distinto al de la vista previa se rechaza (409), sin escribir nada", async () => {
    const { status } = await confirmar("cdc-control.pdf", { hash: huella(pdf("cdc-nota-credito.pdf")) });
    expect(status).toBe(409);
    expect(publicados).toEqual([]);
    expect(llamadas).toEqual([]);
  });

  test("unidades asignadas inválidas: 400", async () => {
    const { status } = await confirmar("cdc-control.pdf", { asignaciones: [{ indice: 7, unidadId: "u1" }] });
    expect(status).toBe(400);
    expect(publicados).toEqual([]);
  });
});

describe("F07 · S3 solo al confirmar, con llaves que no se pisan", () => {
  test("publica una vez por factura que se inserta, con la llave de la importación y If-None-Match", async () => {
    const { status, cuerpo } = await confirmar("cdc-consolidado-con-continuacion.pdf", { asignaciones: DOS_CASAS });
    expect(status).toBe(200);
    expect(cuerpo.tipo).toBe("nueva");
    expect(cuerpo.publicadas).toBe(2);
    expect(publicados).toHaveLength(2);
    for (const p of publicados) {
      expect(p.Key).toMatch(/^condominios\/facturas\/conjunto-de-prueba\/2026-09\/imp1\/unidad-99[89]-[0-9a-f]{12}\.pdf$/);
      expect(p.IfNoneMatch).toBe("*");
      expect(p.ContentType).toBe("application/pdf");
    }
    expect(new Set(publicados.map((p) => p.Key)).size).toBe(2);
  });

  test("con 'solo nuevas', la factura que ya existe se omite y su PDF no se publica", async () => {
    existentes.add("u998");
    const { cuerpo } = await confirmar("cdc-consolidado-con-continuacion.pdf", { asignaciones: DOS_CASAS });
    expect(cuerpo.publicadas).toBe(1);
    expect(publicados.map((p) => p.Key)).toEqual([expect.stringContaining("unidad-999-")]);
  });

  test("sin 'solo nuevas', la existente se actualiza y se publica con una llave nueva", async () => {
    existentes.add("u998");
    const { cuerpo } = await confirmar("cdc-consolidado-con-continuacion.pdf", {
      asignaciones: DOS_CASAS,
      soloNuevas: false,
    });
    expect(cuerpo.publicadas).toBe(2);
  });

  test("la misma casa y el mismo período en dos importaciones no comparten llave", async () => {
    await confirmar("cdc-anticipo-total-negativo.pdf", { periodo: "2026-05" });
    await confirmar("cdc-nota-credito.pdf", { periodo: "2026-05" });
    const llaves = publicados.map((p) => p.Key);
    expect(llaves).toEqual([
      expect.stringMatching(/\/2026-05\/imp1\/unidad-999-/),
      expect.stringMatching(/\/2026-05\/imp2\/unidad-999-/),
    ]);
  });

  test("una factura de otro mes se rechaza y su PDF no se publica", async () => {
    const { status, cuerpo } = await confirmar("cdc-control.pdf", { periodo: "2026-05" });
    expect(status).toBe(200);
    expect(cuerpo.publicadas).toBe(0);
    expect(publicados).toEqual([]);
    // bulkUpsert la recibe sin PDF y la vuelve a rechazar por su cuenta.
    const f = llamadas.find((l) => l.nombre === "facturas:bulkUpsert").args.facturas[0];
    expect(f.pdfUrl).toBeUndefined();
  });

  test("un reintento que encuentra la llave ya publicada no la sobrescribe ni falla", async () => {
    await confirmar("cdc-control.pdf", { periodo: "2026-04" });
    const primera = publicados[0].Key;
    // La importación quedó "en curso" (p. ej. se cortó antes de cerrar) y se retoma.
    importaciones.get(`${huella(pdf("cdc-control.pdf"))}|2026-04`).estado = "fallida";
    const { status } = await confirmar("cdc-control.pdf", { periodo: "2026-04" });
    expect(status).toBe(200);
    expect(publicados.map((p) => p.Key)).toEqual([primera]);
  });
});

describe("idempotencia y números del servidor", () => {
  test("confirmar dos veces el mismo archivo: la segunda no publica ni guarda", async () => {
    await confirmar("cdc-control.pdf", { periodo: "2026-04" });
    const antes = { publicados: publicados.length, bulk: llamadas.filter((l) => l.nombre === "facturas:bulkUpsert").length };
    const { status, cuerpo } = await confirmar("cdc-control.pdf", { periodo: "2026-04" });
    expect(status).toBe(200);
    expect(cuerpo.tipo).toBe("repetida");
    expect(publicados).toHaveLength(antes.publicados);
    expect(llamadas.filter((l) => l.nombre === "facturas:bulkUpsert")).toHaveLength(antes.bulk);
  });

  test("lo que se guarda es lo que lee el servidor: total con signo, fila de crédito y saldo anterior de Totales", async () => {
    await confirmar("cdc-anticipo-total-negativo.pdf", { periodo: "2026-05" });
    const bulk = llamadas.find((l) => l.nombre === "facturas:bulkUpsert").args;
    const f = bulk.facturas[0];
    expect(f.totalAPagar).toBe(-400_000);
    expect(f.saldoAnteriorDocumento).toBe(-760_000);
    expect(f.saldoAFavor).toBe(400_000);
    expect(f.lineas.map((l) => l.codigoTexto ?? l.codigo)).toEqual([1, 8, 9, "CI"]);
    expect(f.motivosLectura).toEqual([]);
    expect(f.pdfUrl).toMatch(
      /^https:\/\/[^/]+\.amazonaws\.com\/condominios\/facturas\/conjunto-de-prueba\/2026-05\/imp1\/unidad-999-[0-9a-f]{12}\.pdf$/,
    );
    expect(bulk.importacionId).toBe("imp1");
    expect(bulk.skipExisting).toBe(true);
  });

  test("las facturas sin unidad no se envían y quedan registradas al cerrar", async () => {
    await confirmar("cdc-consolidado-con-continuacion.pdf", { asignaciones: [{ indice: 0, unidadId: "u999" }] });
    const bulk = llamadas.find((l) => l.nombre === "facturas:bulkUpsert").args;
    expect(bulk.facturas.map((f) => f.unidadId)).toEqual(["u999"]);
    const fin = llamadas.find((l) => l.nombre === "facturas:finalizarImportacion").args;
    expect(fin).toMatchObject({ estado: "completada", sinUnidad: [1] });
  });

  test("si guardar falla, la importación se cierra como fallida y responde 500", async () => {
    fallarBulk = true;
    const { status } = await confirmar("cdc-control.pdf", { periodo: "2026-04" });
    expect(status).toBe(500);
    const fin = llamadas.find((l) => l.nombre === "facturas:finalizarImportacion").args;
    expect(fin.estado).toBe("fallida");
  });
});
