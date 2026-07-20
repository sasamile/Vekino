#!/usr/bin/env node
/**
 * Parser de PDFs de facturas de Ciudad del Campo II.
 *
 * Formato distinto a Arboleda:
 * - Códigos de 3 dígitos (001, 005, 006, 008, 009…)
 * - Filas SIN asterisco = deuda meses anteriores (Saldo Anterior)
 * - Filas CON asterisco (*) = cargo mes actual
 * - Columnas: Concepto | Saldo Anterior | Mes | Este mes | Descto | Saldo
 * - Total final = "Pague sin descuento"
 * - Unidad = "Casa NNN  MANZANA N"
 *
 * Uso:
 *   PDF_DIR=... LISTA_JSON=... node parse-facturas-cdc.mjs 2>log.txt > extraidas.json
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import https from "https";
import http from "http";

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
        fs.unlinkSync(dest);
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

const PDF_DIR = process.env.PDF_DIR;
const LISTA_JSON = process.env.LISTA_JSON;

if (!PDF_DIR || !LISTA_JSON) {
  console.error("PDF_DIR y LISTA_JSON son requeridos");
  process.exit(1);
}

const lista = JSON.parse(fs.readFileSync(LISTA_JSON, "utf8"));
const resultados = [];
const errores = [];

for (let i = 0; i < lista.length; i++) {
  const row = lista[i];
  const { id, numeroFactura, periodo, fechaEmision, fechaVencimiento,
    pdfUrl, unidadLegacyId, unidad, resideName, vrAdmon, userEmail } = row;

  const pdfPath = path.join(PDF_DIR, `${numeroFactura}.pdf`);
  process.stderr.write(`[${i + 1}/${lista.length}] ${numeroFactura} (${unidad})... `);

  if (!fs.existsSync(pdfPath)) {
    if (pdfUrl) {
      try {
        process.stderr.write(`↓ descargando... `);
        await downloadFile(pdfUrl, pdfPath);
      } catch (e) {
        process.stderr.write(`✗ Descarga fallida: ${e.message}\n`);
        errores.push({ numeroFactura, error: `Descarga: ${e.message}` });
        continue;
      }
    } else {
      process.stderr.write(`✗ PDF no encontrado\n`);
      errores.push({ numeroFactura, error: "PDF no encontrado" });
      continue;
    }
  }

  try {
    const texto = execSync(`pdftotext -layout "${pdfPath}" -`, { encoding: "utf8" });
    const parsed = parseCdcLayout(texto, numeroFactura);

    const emTs = fechaEmision
      ? new Date(fechaEmision + "T00:00:00-05:00").getTime()
      : Date.now();
    const vencTs = fechaVencimiento
      ? new Date(fechaVencimiento + "T00:00:00-05:00").getTime()
      : (() => {
          const d = new Date((fechaEmision || new Date().toISOString().slice(0, 10)) + "T00:00:00-05:00");
          return new Date(d.getFullYear(), d.getMonth() + 1, 15).getTime();
        })();

    resultados.push({
      legacyId: id,
      numeroFactura,
      periodo,
      periodoLabel: parsed.periodoLabel,
      pdfUrl,
      unidadLegacyId,
      unidad,
      resideName: parsed.nombre || resideName || "Residente",
      userEmail: userEmail || null,
      vrAdmon: parsed.vrAdmon || 0,
      numeroInterno: parsed.numeroCuenta,
      apto: parsed.casa,
      lineas: parsed.lineas,
      saldoAFavor: 0,
      totalAPagar: parsed.totalAPagar,
      totalConDescuento: parsed.totalConDescuento,
      saldoAnteriorTotal: parsed.saldoAnteriorTotal,
      fechaEmision: emTs,
      fechaVencimiento: vencTs,
    });

    process.stderr.write(`✓ total=$${parsed.totalAPagar.toLocaleString("es-CO")}\n`);
  } catch (e) {
    process.stderr.write(`✗ ${e.message}\n`);
    errores.push({ numeroFactura, error: e.message });
  }
}

process.stderr.write(`\n✅ ${resultados.length} facturas extraídas, ${errores.length} errores\n`);
if (errores.length > 0) {
  errores.forEach((e) => process.stderr.write(`  ${e.numeroFactura}: ${e.error}\n`));
}

console.log(JSON.stringify(resultados, null, 2));

// ─────────────────────────────────────────────────────────────
// Parser específico para Ciudad del Campo II
// ─────────────────────────────────────────────────────────────
function parseCdcLayout(texto, numeroFactura) {
  // Número de cuenta de cobro
  const nroMatch = texto.match(/CUENTA DE COBRO Nro\.\s+(\d+)/i);
  const numeroCuenta = nroMatch ? nroMatch[1] : "";

  // Nombre del residente
  const nombreMatch = texto.match(/Nombre\s+(.+?)\s{3,}/);
  const nombre = nombreMatch ? nombreMatch[1].trim() : "";

  // Casa y manzana
  const casaMatch = texto.match(/Casa\s+(\S+)\s+MANZANA\s+(\S+)/i);
  const casa = casaMatch ? `${casaMatch[1]} M${casaMatch[2]}` : undefined;

  // Periodo label: buscar "Junio / 2026" en las líneas con asterisco (mes actual)
  let periodoLabel = "";
  const mesActualMatch = texto.match(/\*\s+\d{3}\s+.*?([A-Za-zé]+\s*\/\s*\d{4})/);
  if (mesActualMatch) periodoLabel = mesActualMatch[1].trim();

  // Total: "Pague sin descuento 16 - 30   $360.000.00"
  //        "Pague con descuento del 1 - 15  $340.000.00"
  let totalAPagar = 0;
  let totalConDescuento = undefined;
  const sinDesMatch = texto.match(/Pague sin descuento[^$\n]+\$([\d.,]+)/i);
  const conDesMatch = texto.match(/Pague con descuento[^$\n]+\$([\d.,]+)/i);
  if (sinDesMatch) {
    totalAPagar = parseNumCdc(sinDesMatch[1]);
  } else {
    // Fallback: última columna de "Totales"
    const totMatch = texto.match(/Totales\s+([\d.,]+)(?:\s+([\d.,]+))?\s+([\d.,]+)/i);
    if (totMatch) totalAPagar = parseNumCdc(totMatch[3] || totMatch[1]);
  }
  if (conDesMatch) totalConDescuento = parseNumCdc(conDesMatch[1]);

  // Tabla de conceptos
  // Filas con asterisco = mes actual; sin asterisco = deuda anterior
  // Patrón: [*] NNN  NOMBRE CONCEPTO  [saldo_anterior]  mes/año  [este_mes]  [descto]  saldo
  const lineas = [];
  const conceptMap = new Map(); // codigo -> {concepto, saldoAnterior, actual, total}

  // Mes pattern dentro de una línea de concepto: "Junio / 2026", "Marzo / 2026", etc.
  const MES_RE = /[A-Za-záéíóúñÁÉÍÓÚÑ]+\s*\/\s*\d{4}/;
  const NUM_RE = /\$?([\d]{1,3}(?:\.[\d]{3})+\.[\d]{2}|\d{4,}\.[\d]{2})/g;

  for (const linea of texto.split("\n")) {
    // Línea de concepto: [*] NNN  TEXTO...
    const matchLine = linea.match(/^\s*(\*?)\s*(\d{3})\s{2,}(.+)/);
    if (!matchLine) continue;

    const codigo = parseInt(matchLine[2], 10);
    const resto = matchLine[3];

    // Nombre del concepto: texto hasta los primeros 3+ espacios continuos
    const conceptoMatch = resto.match(/^(.+?)\s{3,}/);
    const concepto = conceptoMatch
      ? conceptoMatch[1].trim().replace(/\s+/g, " ")
      : resto.slice(0, 40).trim();

    // Separar en parte ANTES y DESPUÉS del patrón mes/año
    const mesMatch = MES_RE.exec(linea);
    const parteAntes = mesMatch ? linea.slice(0, mesMatch.index) : "";
    const parteDespues = mesMatch ? linea.slice(mesMatch.index + mesMatch[0].length) : linea;

    // Números antes del mes → Saldo Anterior; después → Este mes + Saldo
    const numsAntes = [...parteAntes.matchAll(NUM_RE)].map((m) => parseNumCdc(m[1]));
    const numsDespues = [...parteDespues.matchAll(NUM_RE)].map((m) => parseNumCdc(m[1]));

    if (!conceptMap.has(codigo)) {
      conceptMap.set(codigo, { concepto, saldoAnterior: 0, actual: 0, total: 0 });
    }
    const entry = conceptMap.get(codigo);

    if (numsAntes.length > 0) {
      // Fila de deuda anterior: número antes del mes = saldo adeudado
      const val = numsAntes[numsAntes.length - 1];
      entry.saldoAnterior += val;
      entry.total += val;
      // Ignorar numsDespues — es solo el reflejo del saldo, no cargo nuevo
    } else if (numsDespues.length > 0) {
      // Fila del mes actual: primer número = Este mes, último = Saldo
      entry.actual += numsDespues[0];
      entry.total += numsDespues[numsDespues.length - 1];
    }
  }

  // Convertir map a array ordenado por código
  const lineasArr = [...conceptMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([codigo, v]) => ({
      codigo,
      concepto: v.concepto,
      saldoAnterior: v.saldoAnterior,
      actual: v.actual,
      total: v.total,
    }));

  // vrAdmon = actual del concepto 001 (cuota de administración del mes)
  const admon = conceptMap.get(1);
  const vrAdmon = admon ? admon.actual : 0;

  // Saldo anterior total = suma de la columna "Totales" → primer número
  const totRow = texto.match(/Totales\s+([\d.,]+)/i);
  const saldoAnteriorTotal = totRow ? parseNumCdc(totRow[1]) : 0;

  return {
    numeroCuenta,
    nombre,
    casa,
    periodoLabel,
    vrAdmon,
    lineas: lineasArr,
    totalAPagar,
    totalConDescuento,
    saldoAnteriorTotal,
  };
}

function parseNumCdc(str) {
  if (!str) return 0;
  const s = String(str).trim().replace(/\$/g, "");
  // Formato colombiano: 314.000.00 (miles=puntos, centavos=últimos .XX, siempre 00)
  // Quitar los últimos 3 chars (.00) que son centavos, luego quitar puntos
  if (/\.\d{2}$/.test(s)) {
    return parseInt(s.slice(0, -3).replace(/\./g, ""), 10) || 0;
  }
  // Si termina en ,XX
  if (/,\d{2}$/.test(s)) {
    return parseInt(s.slice(0, -3).replace(/[.,]/g, ""), 10) || 0;
  }
  return parseInt(s.replace(/[.,]/g, ""), 10) || 0;
}
