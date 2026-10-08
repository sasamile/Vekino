import { beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * RED DE SEGURIDAD DE FACTURACIÓN — LECTURA DE LOS PDF (Fase 0).
 *
 * Llama al `POST` REAL de /api/facturas/upload (extractor + agrupación +
 * parser de producción) con cuentas de cobro reales anonimizadas
 * (fixtures/README.md). Lo único simulado es S3 —no se sube nada— y la sesión.
 *
 * La "verdad" de cada documento es su propia fila "Totales" y su línea
 * "Pague sin descuento" (o "TOTAL A PAGAR" en Arboleda): lo que la
 * contabilidad imprimió. El parser se mide contra eso.
 *
 * Las pruebas de un defecto FALLAN hoy a propósito (F-04, F-15, F-07 de
 * docs/audits/AUDITORIA_FACTURACION.md); las "control" pasan hoy y deben
 * seguir pasando. Ver docs/audits/FASE-0-FACTURACION.md.
 */

const FIXTURES = join(import.meta.dir, "fixtures");

let subidas = [];
let sesion = "admin";

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

/*
 * Hoy la ruta no consulta la sesión. Si la Fase 1 la protege con
 * `@/lib/auth-server` (como /api/incidentes/reporte), este doble responde
 * "hay sesión de administración" en las pruebas del parser y "no hay sesión"
 * en la de F-07. Si la protección usa otro mecanismo, hay que ajustar aquí.
 */
const sinSesion = () => {
  throw new Error("No autenticado o perfil inexistente.");
};
mock.module("@/lib/auth-server", () => ({
  handler: async () => new Response(null, { status: 404 }),
  getToken: async () => (sesion ? "token-de-prueba" : undefined),
  isAuthenticated: async () => Boolean(sesion),
  preloadAuthQuery: async () => (sesion ? {} : sinSesion()),
  fetchAuthQuery: async () => (sesion ? { allowed: true } : sinSesion()),
  fetchAuthMutation: async () => (sesion ? null : sinSesion()),
  fetchAuthAction: async () => (sesion ? null : sinSesion()),
}));

const { POST } = await import("../../app/api/facturas/upload/route");

beforeEach(() => {
  subidas = [];
  sesion = "admin";
});

async function subir(archivo, { periodo = "2026-09" } = {}) {
  const form = new FormData();
  form.append(
    "pdf",
    new File([readFileSync(join(FIXTURES, archivo))], archivo, { type: "application/pdf" }),
  );
  form.append("condominioLegacyId", "condominio-de-prueba");
  form.append("periodo", periodo);
  const res = await POST(
    new Request("http://localhost/api/facturas/upload", { method: "POST", body: form }),
  );
  return { status: res.status, cuerpo: await res.json() };
}

async function leer(archivo) {
  const { status, cuerpo } = await subir(archivo);
  expect(status).toBe(200);
  expect(cuerpo.invoices).toHaveLength(1);
  return cuerpo.invoices[0];
}

const suma = (lineas, campo) => lineas.reduce((s, l) => s + l[campo], 0);

/** Lo que imprimió la contabilidad en cada documento (fila Totales / Pague sin descuento). */
const DOCUMENTO = {
  "cdc-control.pdf": {
    periodoLabel: "Abril / 2026",
    saldoAnterior: 252_650,
    esteMes: 360_000,
    total: 612_650,
    conDescuento: 572_650,
  },
  "cdc-anticipo-total-negativo.pdf": {
    periodoLabel: "Mayo / 2026",
    saldoAnterior: -760_000,
    esteMes: 360_000,
    total: -400_000,
    conDescuento: -440_000,
  },
  "cdc-nota-credito.pdf": {
    periodoLabel: "Mayo / 2026",
    saldoAnterior: -86_000,
    esteMes: 360_000,
    total: 274_000,
    conDescuento: 234_000,
  },
  "cdc-agosto-saldo-a-favor.pdf": {
    periodoLabel: "Agosto / 2026",
    saldoAnterior: -597_000,
    esteMes: 335_000,
    total: -262_000,
    conDescuento: -302_000,
  },
  "cdc-septiembre-saldo-anterior-negativo.pdf": {
    periodoLabel: "Septiembre / 2026",
    saldoAnterior: -262_000,
    esteMes: 335_000,
    total: 73_000,
    conDescuento: 33_000,
  },
  "cdc-filas-incompletas.pdf": {
    periodoLabel: "Junio / 2026",
    saldoAnterior: 10_097_050,
    esteMes: 360_000,
    total: 10_457_050,
    conDescuento: 10_417_050,
  },
  "cdc-pagina-sin-filas.pdf": {
    saldoAnterior: 8_114_750,
    esteMes: 360_000,
    total: 8_474_750,
    conDescuento: 8_434_750,
  },
  "arboleda-control.pdf": { periodoLabel: "01-junio-2026", total: 15_760 },
  "arboleda-saldo-a-favor.pdf": {
    periodoLabel: "01-septiembre-2026",
    total: -376_000,
    saldoAFavor: 376_000,
  },
};

describe("F04 · Ciudad del Campo — totales y saldos a favor", () => {
  test("F04-control · cdc-control: total, descuento, saldo anterior (filas de marzo) y cargos del mes (filas de abril) coinciden con el documento", async () => {
    const doc = DOCUMENTO["cdc-control.pdf"];
    const inv = await leer("cdc-control.pdf");
    expect({
      periodoLabel: inv.periodoLabel,
      total: inv.totalAPagar,
      conDescuento: inv.totalConDescuento,
      saldoAnterior: suma(inv.lineas, "saldoAnterior"),
      esteMes: suma(inv.lineas, "actual"),
    }).toEqual(doc);
  });

  test("F04-cdc-total-negativo (Caso A) · 'Pague sin descuento $-400.000' (anticipo) no se lee como $0", async () => {
    const inv = await leer("cdc-anticipo-total-negativo.pdf");
    expect(inv.totalAPagar).toBe(DOCUMENTO["cdc-anticipo-total-negativo.pdf"].total);
  });

  test("F04-cdc-total-negativo (Caso A) · agosto real de una casa con $262.000 a favor no se lee como $0", async () => {
    const inv = await leer("cdc-agosto-saldo-a-favor.pdf");
    expect(inv.totalAPagar).toBe(DOCUMENTO["cdc-agosto-saldo-a-favor.pdf"].total);
  });
});

describe("F04 · Ciudad del Campo — créditos y filas de meses anteriores", () => {
  test("F04-cdc-creditos (Caso B) · la fila 'CI ANTICIPO DE CLIENTE' ($-760.000) no se ignora", async () => {
    const inv = await leer("cdc-anticipo-total-negativo.pdf");
    expect(suma(inv.lineas, "saldoAnterior")).toBe(
      DOCUMENTO["cdc-anticipo-total-negativo.pdf"].saldoAnterior,
    );
  });

  test("F04-cdc-creditos (Caso B) · la fila 'NCC NOTA CREDITO CLIENTE' ($-270.000) no se ignora: saldo anterior $-86.000, no $184.000", async () => {
    const inv = await leer("cdc-nota-credito.pdf");
    expect(suma(inv.lineas, "saldoAnterior")).toBe(DOCUMENTO["cdc-nota-credito.pdf"].saldoAnterior);
  });

  test("F04-cdc-varias-filas (Caso C) · con filas de abril, de mayo y un crédito, separa saldo anterior, cargos del mes y total", async () => {
    const doc = DOCUMENTO["cdc-nota-credito.pdf"];
    const inv = await leer("cdc-nota-credito.pdf");
    expect({
      saldoAnterior: suma(inv.lineas, "saldoAnterior"),
      esteMes: suma(inv.lineas, "actual"),
      total: inv.totalAPagar,
    }).toEqual({ saldoAnterior: doc.saldoAnterior, esteMes: doc.esteMes, total: doc.total });
  });

  test("F04-saldo-anterior-fantasma · septiembre vigente de una casa real: el saldo anterior es $-262.000 (a favor), no $+335.000", async () => {
    const inv = await leer("cdc-septiembre-saldo-anterior-negativo.pdf");
    const doc = DOCUMENTO["cdc-septiembre-saldo-anterior-negativo.pdf"];
    // El total sí sale bien hoy; lo que falla es el desglose que ve el residente.
    expect(inv.totalAPagar).toBe(doc.total);
    expect(suma(inv.lineas, "saldoAnterior")).toBe(doc.saldoAnterior);
  });
});

describe("F04 · documentos incompletos o que no cuadran (Casos D y E)", () => {
  test("F04-pdf-sin-lineas (Caso D) · una página sin filas de conceptos no sale como factura válida sin advertencia", async () => {
    const { status, cuerpo } = await subir("cdc-pagina-sin-filas.pdf");
    expect(status).toBe(200);
    const inv = cuerpo.invoices[0];
    const leidaCompleta =
      inv !== undefined &&
      inv.lineas.length > 0 &&
      Math.abs(suma(inv.lineas, "total") - inv.totalAPagar) <= 1;
    expect(
      leidaCompleta || cuerpo.errors > 0,
      `salió con ${inv?.lineas.length} líneas, total ${inv?.totalAPagar} y ${cuerpo.errors} errores`,
    ).toBe(true);
  });

  /*
   * Caso E: saldo anterior + cargos del mes − créditos = total. Cada factura
   * que devuelve el parser debe cuadrar (Σ líneas = total a pagar) o venir
   * marcada en `parseErrors`. Hoy los desajustes salen sin aviso.
   */
  for (const archivo of Object.keys(DOCUMENTO)) {
    const control = archivo.includes("control");
    test(`${control ? "F04-control" : "F04-cuadre"} (Caso E) · ${archivo}: las líneas suman el total del documento, o la factura viene marcada`, async () => {
      const { cuerpo } = await subir(archivo);
      const inv = cuerpo.invoices[0];
      const totalLineas = inv ? suma(inv.lineas, "total") : null;
      const cuadra = inv !== undefined && Math.abs(totalLineas - inv.totalAPagar) <= 1;
      expect(
        cuadra || cuerpo.errors > 0,
        `las líneas suman ${totalLineas} y el total leído es ${inv?.totalAPagar} (documento: ${DOCUMENTO[archivo].total})`,
      ).toBe(true);
    });
  }
});

describe("F15 · Arboleda — total entre paréntesis y período", () => {
  test("F15-control · arboleda-control: período '01-junio-2026' y total $15.760", async () => {
    const inv = await leer("arboleda-control.pdf");
    expect({ periodoLabel: inv.periodoLabel, total: inv.totalAPagar }).toEqual(
      DOCUMENTO["arboleda-control.pdf"],
    );
  });

  test("F15-control · el saldo a favor de $376.000 se reconoce en saldoAFavor", async () => {
    const inv = await leer("arboleda-saldo-a-favor.pdf");
    expect(inv.saldoAFavor).toBe(DOCUMENTO["arboleda-saldo-a-favor.pdf"].saldoAFavor);
  });

  test("F15-arboleda-total-entre-parentesis · 'TOTAL A PAGAR $(376,000)' se lee como $-376.000, no como $0", async () => {
    const inv = await leer("arboleda-saldo-a-favor.pdf");
    expect(inv.totalAPagar).toBe(DOCUMENTO["arboleda-saldo-a-favor.pdf"].total);
  });

  test("F15-arboleda-periodo · el período de septiembre es '01-septiembre-2026', no el texto de la línea siguiente", async () => {
    const inv = await leer("arboleda-saldo-a-favor.pdf");
    expect(inv.periodoLabel).toBe(DOCUMENTO["arboleda-saldo-a-favor.pdf"].periodoLabel);
  });
});

describe("F07 · el endpoint de subida de facturas", () => {
  test("F07-subida-sin-sesion · sin sesión, /api/facturas/upload rechaza la petición y no escribe en S3", async () => {
    sesion = null;
    const { status } = await subir("cdc-control.pdf");
    expect([401, 403].includes(status), `sin sesión respondió ${status}`).toBe(true);
    expect(subidas).toHaveLength(0);
  });

  test("F07-s3-antes-de-confirmar · leer un PDF para la vista previa no publica nada en S3", async () => {
    await subir("cdc-control.pdf");
    expect(
      subidas.map((s) => s.Key),
      "la vista previa ya publicó (y pudo sobrescribir) el PDF de la factura",
    ).toEqual([]);
  });

  test("F07-s3-sobrescribe · dos lecturas del mismo período y la misma casa no reutilizan la misma llave de S3", async () => {
    await subir("cdc-control.pdf");
    await subir("cdc-nota-credito.pdf");
    const llaves = subidas.map((s) => s.Key);
    expect(new Set(llaves).size, `llaves: ${llaves.join(", ")}`).toBe(llaves.length);
  });
});
