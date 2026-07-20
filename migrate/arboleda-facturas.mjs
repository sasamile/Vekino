#!/usr/bin/env node
/**
 * Migración de facturas de marzo 2026 — Arboleda Campestre
 *
 * Flujo:
 * 1. Lee facturas de marzo de CockroachDB (pdfUrl, unidadLegacyId, etc.)
 * 2. Descarga cada PDF
 * 3. Analiza el PDF con Claude visión → extrae tabla de conceptos
 * 4. Mapea unidadLegacyId → unidadId de Convex
 * 5. Inserta en Convex en lotes vía bulkFacturas
 *
 * Ejecutar:
 *   SRC_DB='postgresql://…' node migrate/arboleda-facturas.mjs
 */

import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";
import http from "http";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = path.join(__dirname, ".tmp-facturas");
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const SRC_DB = process.env.SRC_DB;
if (!SRC_DB) throw new Error("SRC_DB no definido");

const CONDOMINIO_DB_NAME = "condominio_arboleda_campestre";
const PERIODO = process.env.PERIODO || "2026-03";
const BATCH_SIZE = 10;
const MAX_FACTURAS = parseInt(process.env.MAX_FACTURAS || "999");

// ─────────────────────────────────────────────────────────────
// 1. Obtener mapeos de Convex
// ─────────────────────────────────────────────────────────────
console.log("📋 Obteniendo mapeos de Convex...");
const mappingsRaw = execSync(
  `bunx convex run migrations:getArboledaMappings '{"legacyDatabaseName":"${CONDOMINIO_DB_NAME}"}'`,
  { cwd: path.join(__dirname, "..", "packages", "backend") }
).toString();
const mappings = JSON.parse(mappingsRaw);

const condominioId = mappings.condominioId;
const unitMap = new Map(mappings.unitMap.map((u) => [u.legacyId, u.newId]));
const memberMap = new Map(mappings.memberMap.map((m) => [m.email, m.membershipId]));

console.log(`✓ condominioId: ${condominioId}`);
console.log(`✓ ${unitMap.size} unidades, ${memberMap.size} memberships`);

// ─────────────────────────────────────────────────────────────
// 2. Leer facturas de la BD vieja
// ─────────────────────────────────────────────────────────────
console.log(`\n📥 Leyendo facturas de ${PERIODO} de la BD vieja...`);
const client = new pg.Client({
  connectionString: SRC_DB.replace(/[?&]sslmode=[^&]*/i, ""),
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const { rows: facturas } = await client.query(
  `select
    f.id, f."numeroFactura", f.periodo,
    f."fechaEmision"::date "fechaEmision",
    f."fechaVencimiento"::date "fechaVencimiento",
    f."pdfUrl", u.id "unidadLegacyId", u.identificador unidad,
    coalesce(
      nullif(usr.name, ''),
      nullif(usr."firstName" || ' ' || coalesce(usr."lastName",''), ' '),
      'Residente'
    ) "resideName",
    coalesce(f.valor, 0) "vrAdmon",
    usr.email "userEmail"
  from factura f
  join unidad u on u.id = f."unidadId"
  left join "user" usr on usr.id = f."userId"
  where f.periodo = $1 and f."pdfUrl" is not null
  order by f."numeroFactura" asc
  limit $2`,
  [PERIODO, MAX_FACTURAS]
);
await client.end();

console.log(`✓ ${facturas.length} facturas encontradas`);

// ─────────────────────────────────────────────────────────────
// 3. Procesar cada factura: descargar PDF → analizar con IA
// ─────────────────────────────────────────────────────────────
console.log("\n🔍 Analizando PDFs con Claude visión...\n");

const Anthropic = (await import("@anthropic-ai/sdk")).default;
const anthropic = new Anthropic();

const extracted = [];
const errores = [];

for (let i = 0; i < facturas.length; i++) {
  const f = facturas[i];
  const { id, numeroFactura, periodo, fechaEmision, fechaVencimiento, pdfUrl,
    unidadLegacyId, unidad, resideName, vrAdmon, userEmail } = f;

  process.stdout.write(`[${i + 1}/${facturas.length}] ${numeroFactura} (${unidad})... `);

  try {
    // Descargar PDF si no está en caché
    const pdfPath = path.join(TMP_DIR, `${numeroFactura}.pdf`);
    if (!fs.existsSync(pdfPath)) {
      await downloadFile(pdfUrl, pdfPath);
    }

    // Analizar con Claude visión
    const pdfData = fs.readFileSync(pdfPath);
    const base64 = pdfData.toString("base64");

    const response = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "application/pdf", data: base64 },
            },
            {
              type: "text",
              text: `Esta es una CUENTA DE COBRO de un condominio colombiano.
Extrae EXACTAMENTE los valores que aparecen en la tabla de conceptos.

Devuelve SOLO un JSON válido (sin texto extra):
{
  "numeroInterno": "8956",
  "periodoLabel": "01-marzo-2026",
  "apto": "4201",
  "lineas": [
    {"codigo": 1, "concepto": "Saldo a favor", "saldoAnterior": 0, "actual": 0, "total": 0},
    {"codigo": 2, "concepto": "Administración de marzo", "saldoAnterior": 811000, "actual": 274000, "total": 1085000},
    {"codigo": 3, "concepto": "Intereses mora", "saldoAnterior": 19944, "actual": 15506, "total": 35450},
    {"codigo": 4, "concepto": "Retroactivo admon", "saldoAnterior": 0, "actual": 0, "total": 0},
    {"codigo": 5, "concepto": "Parqueadero visitante", "saldoAnterior": 0, "actual": 0, "total": 0},
    {"codigo": 6, "concepto": "Honorarios abogado", "saldoAnterior": 0, "actual": 0, "total": 0},
    {"codigo": 7, "concepto": "Multas y sanciones", "saldoAnterior": 0, "actual": 0, "total": 0}
  ],
  "saldoAFavor": 0,
  "totalAPagar": 1120450
}

REGLAS:
- Los valores son enteros (sin decimales ni puntos de miles)
- No inventes valores, extrae exactamente lo que dice el PDF
- Si un valor está en blanco o es 0, pon 0`,
            },
          ],
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No se encontró JSON en la respuesta");

    const data = JSON.parse(jsonMatch[0]);

    // Mapear IDs
    const unidadId = unitMap.get(unidadLegacyId);
    if (!unidadId) throw new Error(`Unidad ${unidadLegacyId} (${unidad}) no encontrada`);

    const membershipId = userEmail ? memberMap.get(userEmail) : undefined;

    // Calcular timestamps
    const emTs = new Date(fechaEmision + "T00:00:00-05:00").getTime();
    const vencTs = fechaVencimiento
      ? new Date(fechaVencimiento + "T00:00:00-05:00").getTime()
      : new Date(new Date(fechaEmision).getFullYear(), new Date(fechaEmision).getMonth() + 1, 15).getTime();

    extracted.push({
      legacyId: id,
      condominioId,
      unidadId,
      membershipId: membershipId || undefined,
      numeroFactura,
      numeroInterno: String(data.numeroInterno || ""),
      periodo,
      periodoLabel: String(data.periodoLabel || `01-${periodo.replace("2026-", "")}-2026`),
      residenteNombre: String(resideName),
      apto: data.apto ? String(data.apto) : undefined,
      vrAdmon: Number(vrAdmon) || 0,
      lineas: (data.lineas || []).map((l) => ({
        codigo: Number(l.codigo),
        concepto: String(l.concepto),
        saldoAnterior: Number(l.saldoAnterior) || 0,
        actual: Number(l.actual) || 0,
        total: Number(l.total) || 0,
      })),
      saldoAFavor: Number(data.saldoAFavor) || 0,
      totalAPagar: Number(data.totalAPagar) || 0,
      fechaEmision: emTs,
      fechaVencimiento: vencTs,
      estado: "pendiente",
      pdfUrl,
    });

    console.log(`✓ total=$${data.totalAPagar?.toLocaleString("es-CO")}`);
  } catch (e) {
    console.log(`✗ ${e.message}`);
    errores.push({ numeroFactura, error: e.message });
  }
}

// ─────────────────────────────────────────────────────────────
// 4. Insertar en Convex por lotes
// ─────────────────────────────────────────────────────────────
if (extracted.length === 0) {
  console.log("\n❌ Nada para insertar.");
  process.exit(1);
}

console.log(`\n📤 Insertando ${extracted.length} facturas en Convex...`);

let totalInserted = 0;
let totalUpdated = 0;

for (let i = 0; i < extracted.length; i += BATCH_SIZE) {
  const batch = extracted.slice(i, i + BATCH_SIZE);
  const batchJson = JSON.stringify({ facturas: batch });
  const tmpFile = path.join(TMP_DIR, `batch-${i}.json`);
  fs.writeFileSync(tmpFile, batchJson);

  try {
    const result = execSync(
      `bunx convex run migrations:bulkFacturas "$(cat '${tmpFile}')"`,
      { cwd: path.join(__dirname, "..", "packages", "backend") }
    ).toString();

    const parsed = JSON.parse(result);
    totalInserted += parsed.inserted || 0;
    totalUpdated += parsed.updated || 0;
    process.stdout.write(`  lote ${Math.floor(i / BATCH_SIZE) + 1}: +${parsed.inserted} insertadas, ~${parsed.updated} actualizadas\n`);
  } catch (e) {
    console.log(`  ✗ Error en lote ${Math.floor(i / BATCH_SIZE) + 1}: ${e.message}`);
  }
}

console.log(`\n✅ Migración de facturas completada:`);
console.log(`   ${totalInserted} facturas insertadas`);
console.log(`   ${totalUpdated} facturas actualizadas`);
if (errores.length > 0) {
  console.log(`   ${errores.length} errores:`);
  errores.forEach((e) => console.log(`   - ${e.numeroFactura}: ${e.error}`));
}

// ─────────────────────────────────────────────────────────────
// Helper: Descargar archivo HTTPS/HTTP
// ─────────────────────────────────────────────────────────────
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const lib = url.startsWith("https") ? https : http;
    lib
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(downloadFile(res.headers.location, dest));
        }
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      })
      .on("error", (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}
