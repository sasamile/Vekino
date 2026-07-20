#!/usr/bin/env node
/**
 * Lee todas las facturas CDC de Convex que tienen pdfUrl,
 * descarga el PDF, extrae totalConDescuento y actualiza el registro.
 *
 * Uso:
 *   node fix-descuento-cdc.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import https from "https";
import http from "http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.join(__dirname, "..", "packages", "backend");
const TMP_DIR = path.join(__dirname, ".tmp-descuento");
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const proto = url.startsWith("https") ? https : http;
    proto.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(dest); } catch {}
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", (e) => {
      try { fs.unlinkSync(dest); } catch {}
      reject(e);
    });
  });
}

function parseNumCdc(str) {
  if (!str) return 0;
  const s = String(str).trim().replace(/\$/g, "");
  if (/\.\d{2}$/.test(s)) return parseInt(s.slice(0, -3).replace(/\./g, ""), 10) || 0;
  if (/,\d{2}$/.test(s)) return parseInt(s.slice(0, -3).replace(/[.,]/g, ""), 10) || 0;
  return parseInt(s.replace(/[.,]/g, ""), 10) || 0;
}

// 1. Obtener todas las facturas CDC de Convex (con pdfUrl y legacyId)
console.log("📋 Leyendo facturas CDC de Convex...");
const rawFacturas = execSync(
  `bunx convex run migrations:listCdcFacturasForFix`,
  { cwd: BACKEND_DIR }
).toString();
const facturas = JSON.parse(rawFacturas);
console.log(`✓ ${facturas.length} facturas CDC con pdfUrl\n`);

let updated = 0;
let sinDescuento = 0;
let errores = 0;

for (let i = 0; i < facturas.length; i++) {
  const f = facturas[i];
  const pdfPath = path.join(TMP_DIR, `${f._id}.pdf`);
  process.stdout.write(`[${i + 1}/${facturas.length}] ${f.numeroFactura}... `);

  try {
    // Descargar PDF si no existe en cache
    if (!fs.existsSync(pdfPath)) {
      await downloadFile(f.pdfUrl, pdfPath);
    }

    const texto = execSync(`pdftotext -layout "${pdfPath}" -`, { encoding: "utf8" });

    // Extraer precio con descuento
    const conDesMatch = texto.match(/Pague con descuento[^$\n]+\$([\d.,]+)/i);
    if (!conDesMatch) {
      process.stdout.write(`— sin línea de descuento\n`);
      sinDescuento++;
      continue;
    }

    const totalConDescuento = parseNumCdc(conDesMatch[1]);

    // Actualizar en Convex
    const payload = JSON.stringify({ id: f._id, totalConDescuento });
    execSync(
      `bunx convex run migrations:setTotalConDescuento '${payload}'`,
      { cwd: BACKEND_DIR }
    );

    process.stdout.write(`✓ descuento=$${totalConDescuento.toLocaleString("es-CO")}\n`);
    updated++;
  } catch (e) {
    process.stdout.write(`✗ ${e.message.slice(0, 80)}\n`);
    errores++;
  }
}

console.log(`\n✅ Completado:`);
console.log(`   ${updated} facturas actualizadas con totalConDescuento`);
console.log(`   ${sinDescuento} sin línea de descuento (Arboleda o sin campo)`);
console.log(`   ${errores} errores`);
