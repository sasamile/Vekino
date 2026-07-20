#!/usr/bin/env node
/**
 * Inserta facturas de Ciudad del Campo II en Convex.
 * Uso:
 *   EXTRAIDAS_JSON=... node insert-facturas-cdc.mjs
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
const LEGACY_DB = "ciudad_del_campo_ii";
const BATCH_SIZE = 10;

if (!EXTRAIDAS_JSON) {
  console.error("EXTRAIDAS_JSON es requerido");
  process.exit(1);
}

// 1. Mapeos
console.log("📋 Obteniendo mapeos de Convex...");
const raw = execSync(
  `bunx convex run migrations:getArboledaMappings '{"legacyDatabaseName":"${LEGACY_DB}"}'`,
  { cwd: BACKEND_DIR }
).toString();
const mappings = JSON.parse(raw);

const condominioId = mappings.condominioId;
const unitMap = new Map(mappings.unitMap.map((u) => [u.legacyId, u.newId]));
const memberMap = new Map(mappings.memberMap.map((m) => [m.email, m.membershipId]));

console.log(`✓ condominioId: ${condominioId}`);
console.log(`✓ ${unitMap.size} unidades, ${memberMap.size} memberships`);

// 2. Cargar extraídas
const extraidas = JSON.parse(fs.readFileSync(EXTRAIDAS_JSON, "utf8"));
console.log(`\n📥 ${extraidas.length} facturas para insertar\n`);

// 3. Mapear IDs
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
    saldoAFavor: 0,
    totalAPagar: Number(f.totalAPagar) || 0,
    totalConDescuento: f.totalConDescuento != null ? Number(f.totalConDescuento) : undefined,
    fechaEmision: Number(f.fechaEmision),
    fechaVencimiento: Number(f.fechaVencimiento),
    estado: "pendiente",
    pdfUrl: f.pdfUrl,
  });
}

if (sinUnidad.length > 0) {
  console.warn(`⚠️  ${sinUnidad.length} facturas sin unidad en Convex`);
}

// 4. Insertar por lotes
let totalInserted = 0;
let totalUpdated = 0;

for (let i = 0; i < preparadas.length; i += BATCH_SIZE) {
  const batch = preparadas.slice(i, i + BATCH_SIZE);
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;
  const totalBatches = Math.ceil(preparadas.length / BATCH_SIZE);

  process.stdout.write(`  Lote ${batchNum}/${totalBatches} (${batch.length})... `);

  const tmpFile = path.join(TMP_DIR, `batch-cdc-${i}.json`);
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
    console.log(`✗ ${e.message.slice(0, 100)}`);
  }
}

console.log(`\n✅ Inserción completada:`);
console.log(`   ${totalInserted} facturas insertadas`);
console.log(`   ${totalUpdated} facturas actualizadas`);
if (sinUnidad.length > 0) console.log(`   ${sinUnidad.length} omitidas (unidad no mapeada)`);
