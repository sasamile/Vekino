#!/usr/bin/env node
/**
 * Parsea los PDFs de facturas de marzo usando pdftotext -layout + regex por columna.
 * No requiere API key. El formato es consistente (puntosoftware).
 *
 * Uso:
 *   PDF_DIR=... LISTA_JSON=... node parse-facturas-pdf.mjs 2>parse-log.txt > extraidas.json
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
      fs.unlinkSync(dest);
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
    const parsed = parsePdfLayout(texto, numeroFactura);

    // Timestamps (Colombia UTC-5)
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
      resideName: resideName || "Residente",
      userEmail: userEmail || null,
      vrAdmon: parsed.vrAdmon || 0,
      numeroInterno: parsed.numeroInterno,
      apto: parsed.apto,
      lineas: parsed.lineas,
      saldoAFavor: parsed.saldoAFavor,
      totalAPagar: parsed.totalAPagar,
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
  process.stderr.write("Errores:\n");
  errores.forEach((e) => process.stderr.write(`  ${e.numeroFactura}: ${e.error}\n`));
}

console.log(JSON.stringify(resultados, null, 2));

// ─────────────────────────────────────────────────────────────
// Parser usando pdftotext -layout (columnas alineadas)
// ─────────────────────────────────────────────────────────────
function parsePdfLayout(texto, numeroFactura) {
  // Número interno: "N.   8,956"
  const nMatch = texto.match(/N\.\s+([\d,]+)/);
  const numeroInterno = nMatch ? nMatch[1].replace(/,/g, "") : "";

  // Periodo label: "Periodo: 01-marzo-2026"
  const periodoMatch = texto.match(/Periodo:\s*([^\n]+)/);
  const periodoLabel = periodoMatch ? periodoMatch[1].trim() : "";

  // APTO
  const aptoMatch = texto.match(/APTO:\s*(\d+)/);
  const apto = aptoMatch ? aptoMatch[1] : undefined;

  // Vr. Admon
  const vrMatch = texto.match(/Vr\.\s*Admon\s+([\d.,]+)/);
  const vrAdmon = vrMatch ? parseNum(vrMatch[1]) : 0;

  // Total a pagar: "$1,120,450"
  const totalMatch = texto.match(/TOTAL A PAGAR\s+\$([\d,]+)/);
  const totalAPagar = totalMatch ? parseNum(totalMatch[1]) : 0;

  // ─── Tabla de conceptos ─────────────────────────────────────
  // Con -layout cada fila del concepto está alineada por columnas.
  // Usamos la sección que empieza con "Codigo" y va hasta "TOTAL A PAGAR"
  const tablaStart = texto.indexOf("Codigo");
  const tablaEnd = texto.indexOf("TOTAL A PAGAR");
  const tablaText = tablaStart >= 0 && tablaEnd > tablaStart
    ? texto.slice(tablaStart, tablaEnd)
    : texto;

  // Procesamos línea por línea buscando las que empiezan con un número de código (1-7)
  const lineasRaw = tablaText.split("\n");
  const lineas = [];

  // Definición de conceptos conocidos
  const conceptoLabels = {
    1: "Saldo a favor",
    2: null, // Dinámico ("Administración de marzo")
    3: "Intereses mora",
    4: "Retroactivo admón",
    5: "Parqueadero visitante",
    6: "Honorarios abogado",
    7: "Multas y sanciones",
  };

  for (const linea of lineasRaw) {
    // Buscamos línea que empieza con código 1-7 seguido de texto del concepto
    const matchCodigo = linea.match(/^\s{0,5}([1-7])\s{2,}(.+)/);
    if (!matchCodigo) continue;

    const codigo = parseInt(matchCodigo[1]);
    const resto = matchCodigo[2];

    // Extraer números de la parte derecha de la línea
    // Los números están alineados en columnas: SALDO ANTERIOR | ACTUAL | TOTAL
    // Tomamos todos los números de la línea
    const nums = [...resto.matchAll(/([\d,]+(?:\.\d+)?)/g)]
      .map((m) => parseNum(m[1]))
      .filter((n) => n > 0 || /\b0\b/.test(m => m));

    // Re-extraer más cuidadosamente
    const numMatches = [...resto.matchAll(/([\d,]+)/g)].map((m) => parseNum(m[1]));

    // Concepto label
    let conceptoLabel = conceptoLabels[codigo];
    if (codigo === 2) {
      // "ADMINISTRACION DE   marzo  811,000 ..."
      const admMatch = resto.match(/ADMINISTRACION DE\s+(\S+)/i);
      conceptoLabel = admMatch ? `Administración de ${admMatch[1]}` : "Administración";
    }
    if (!conceptoLabel) {
      // Extraer del texto antes de los números
      const textPart = resto.replace(/([\d,]+)/g, "").trim();
      conceptoLabel = textPart || `Concepto ${codigo}`;
    }

    // Asignar saldoAnterior, actual, total
    // Para el código 1 (Saldo a favor), en el PDF solo aparece el TOTAL (que es 0 generalmente)
    // Para los demás: saldoAnterior, actual, total en ese orden
    let saldoAnterior = 0, actual = 0, total = 0;

    if (codigo === 1) {
      // Solo un valor (total), los otros son 0
      total = numMatches[0] ?? 0;
    } else if (numMatches.length >= 3) {
      saldoAnterior = numMatches[0];
      actual = numMatches[1];
      total = numMatches[2];
    } else if (numMatches.length === 2) {
      actual = numMatches[0];
      total = numMatches[1];
    } else if (numMatches.length === 1) {
      total = numMatches[0];
    }

    lineas.push({ codigo, concepto: conceptoLabel, saldoAnterior, actual, total });
  }

  // Si no encontramos las 7 líneas, completar con los conceptos faltantes en 0
  const codigosEncontrados = new Set(lineas.map((l) => l.codigo));
  for (let c = 1; c <= 7; c++) {
    if (!codigosEncontrados.has(c)) {
      lineas.push({
        codigo: c,
        concepto: conceptoLabels[c] || `Concepto ${c}`,
        saldoAnterior: 0,
        actual: 0,
        total: 0,
      });
    }
  }

  // Ordenar por código
  lineas.sort((a, b) => a.codigo - b.codigo);

  // Saldo a favor es el total del concepto 1
  const linea1 = lineas.find((l) => l.codigo === 1);
  const saldoAFavor = linea1?.total ?? 0;

  return {
    numeroInterno,
    periodoLabel,
    apto,
    vrAdmon,
    lineas,
    saldoAFavor,
    totalAPagar,
  };
}

function parseNum(str) {
  if (!str && str !== 0) return 0;
  return parseInt(String(str).replace(/[,.\s]/g, ""), 10) || 0;
}
