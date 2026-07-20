#!/usr/bin/env node
/**
 * Inserta facturas extraídas en Convex vía bulkFacturas.
 *
 * Uso:
 *   EXTRAIDAS_JSON=... MAPPINGS_JSON=... node insert-facturas-convex.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.join(__dirname, "..", "packages", "backend");
const TMP_DIR = path.join(__dirname, ".tmp-facturas");
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const EXTRAIDAS_JSON = process.env.EXTRAIDAS_JSON;
const MAPPINGS_JSON = process.env.MAPPINGS_JSON;
const BATCH_SIZE = 10;

if (!EXTRAIDAS_JSON) {
  console.error("EXTRAIDAS_JSON es requerido");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// 1. Cargar mapeos de Convex
// ─────────────────────────────────────────────────────────────
let mappings;
if (MAPPINGS_JSON && fs.existsSync(MAPPINGS_JSON)) {
  mappings = JSON.parse(fs.readFileSync(MAPPINGS_JSON, "utf8"));
} else {
  console.log("📋 Obteniendo mapeos de Convex...");
  const raw = execSync(
    `bunx convex run migrations:getArboledaMappings '{"legacyDatabaseName":"condominio_arboleda_campestre"}'`,
    { cwd: BACKEND_DIR }
  ).toString();
  mappings = JSON.parse(raw);
  if (MAPPINGS_JSON) fs.writeFileSync(MAPPINGS_JSON, JSON.stringify(mappings, null, 2));
}

const condominioId = mappings.condominioId;
const unitMap = new Map(mappings.unitMap.map((u) => [u.legacyId, u.newId]));
const memberMap = new Map(mappings.memberMap.map((m) => [m.email, m.membershipId]));

console.log(`✓ condominioId: ${condominioId}`);
console.log(`✓ ${unitMap.size} unidades, ${memberMap.size} memberships`);

// ─────────────────────────────────────────────────────────────
// 2. Cargar facturas extraídas
// ─────────────────────────────────────────────────────────────
const extraidas = JSON.parse(fs.readFileSync(EXTRAIDAS_JSON, "utf8"));
console.log(`\n📥 ${extraidas.length} facturas para insertar\n`);

// ─────────────────────────────────────────────────────────────
// 3. Mapear IDs y preparar para Convex
// ─────────────────────────────────────────────────────────────
const preparadas = [];
const sinUnidad = [];

for (const f of extraidas) {
  const unidadId = unitMap.get(f.unidadLegacyId);
  if (!unidadId) {
    sinUnidad.push(f.numeroFactura);
    continue;
  }

  const membershipId = f.userEmail ? memberMap.get(f.userEmail) : undefined;

  preparadas.push({
    legacyId: f.legacyId,
    condominioId,
    unidadId,
    membershipId: membershipId || undefined,
    numeroFactura: f.numeroFactura,
    numeroInterno: String(f.numeroInterno || ""),
    periodo: f.periodo,
    periodoLabel: String(f.periodoLabel || ""),
    residenteNombre: String(f.resideName || "Residente"),
    apto: f.apto ? String(f.apto) : undefined,
    vrAdmon: Number(f.vrAdmon) || 0,
    lineas: f.lineas.map((l) => ({
      codigo: Number(l.codigo),
      concepto: String(l.concepto),
      saldoAnterior: Number(l.saldoAnterior) || 0,
      actual: Number(l.actual) || 0,
      total: Number(l.total) || 0,
    })),
    saldoAFavor: Number(f.saldoAFavor) || 0,
    totalAPagar: Number(f.totalAPagar) || 0,
    fechaEmision: Number(f.fechaEmision),
    fechaVencimiento: Number(f.fechaVencimiento),
    estado: "pendiente",
    pdfUrl: f.pdfUrl,
  });
}

if (sinUnidad.length > 0) {
  console.warn(`⚠️ ${sinUnidad.length} facturas sin unidad en Convex: ${sinUnidad.slice(0, 5).join(", ")}`);
}

// ─────────────────────────────────────────────────────────────
// 4. Insertar en Convex por lotes
// ─────────────────────────────────────────────────────────────
let totalInserted = 0;
let totalUpdated = 0;

for (let i = 0; i < preparadas.length; i += BATCH_SIZE) {
  const batch = preparadas.slice(i, i + BATCH_SIZE);
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;
  const totalBatches = Math.ceil(preparadas.length / BATCH_SIZE);

  process.stdout.write(`  Lote ${batchNum}/${totalBatches} (${batch.length} facturas)... `);

  const tmpFile = path.join(TMP_DIR, `batch-insert-${i}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify({ facturas: batch }));

  try {
    const result = execSync(
      `bunx convex run migrations:bulkFacturas "$(cat '${tmpFile}')"`,
      { cwd: BACKEND_DIR }
    ).toString();

    const parsed = JSON.parse(result.trim());
    totalInserted += parsed.inserted || 0;
    totalUpdated += parsed.updated || 0;
    console.log(`✓ +${parsed.inserted} nuevas, ~${parsed.updated} actualizadas`);
  } catch (e) {
    console.log(`✗ Error: ${e.message.slice(0, 80)}`);
  }
}

console.log(`\n✅ Inserción completada:`);
console.log(`   ${totalInserted} facturas insertadas`);
console.log(`   ${totalUpdated} facturas actualizadas`);
if (sinUnidad.length > 0) console.log(`   ${sinUnidad.length} omitidas (unidad no mapeada)`);
