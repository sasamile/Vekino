import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { execSync } from "child_process";
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

// ─── S3 ────────────────────────────────────────────────────────────────────────
const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
const BUCKET = process.env.AWS_S3_BUCKET_NAME ?? "vekino";

async function uploadPdfToS3(
  pdfBytes: Uint8Array,
  condominioLegacyId: string,
  periodo: string,
  unidadNum: string,
): Promise<string> {
  const key = `condominios/facturas/${condominioLegacyId}/${periodo}/unidad-${unidadNum}.pdf`;
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: pdfBytes,
      ContentType: "application/pdf",
    }),
  );
  return `https://${BUCKET}.s3.us-east-1.amazonaws.com/${key}`;
}

// ─── PDF split & text extraction ───────────────────────────────────────────────

/** Extrae texto de bytes PDF usando pdftotext -layout (requiere poppler). */
function extractText(pdfBytes: Uint8Array): string {
  const tmp = join(tmpdir(), `factura-${randomUUID()}.pdf`);
  try {
    writeFileSync(tmp, pdfBytes);
    return execSync(`pdftotext -layout "${tmp}" -`, { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

/** True si la página contiene una cabecera de nueva factura. */
function isInvoiceStart(text: string): boolean {
  return /CUENTA DE COBRO/i.test(text);
}

/** Detecta el formato de la factura a partir del texto. */
type Format = "arboleda" | "cdc";
function detectFormat(text: string): Format {
  return /DESARROLLO URBANO CIUDAD DEL CAMPO/i.test(text) ? "cdc" : "arboleda";
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

function parseNum(str: string): number {
  if (!str) return 0;
  return parseInt(String(str).replace(/[,.\s]/g, ""), 10) || 0;
}

function parseNumCdc(str: string): number {
  if (!str) return 0;
  const s = String(str).trim().replace(/\$/g, "");
  if (/\.\d{2}$/.test(s)) return parseInt(s.slice(0, -3).replace(/\./g, ""), 10) || 0;
  if (/,\d{2}$/.test(s)) return parseInt(s.slice(0, -3).replace(/[.,]/g, ""), 10) || 0;
  return parseInt(s.replace(/[.,]/g, ""), 10) || 0;
}

interface ParsedLine { codigo: number; concepto: string; saldoAnterior: number; actual: number; total: number; }
interface ParsedInvoice {
  format: Format;
  unitIdentifier: string; // para matching con unidades en Convex
  residenteNombre: string;
  numeroInterno: string;
  periodoLabel: string;
  apto?: string;
  vrAdmon: number;
  lineas: ParsedLine[];
  saldoAFavor: number;
  totalAPagar: number;
  totalConDescuento?: number;
}

function parseArboleda(text: string): ParsedInvoice {
  const nMatch = text.match(/N\.\s+([\d,]+)/);
  const numeroInterno = nMatch ? (nMatch[1] ?? "").replace(/,/g, "") : "";
  const periodoMatch = text.match(/Periodo:\s*([^\n]+)/);
  const periodoLabel = periodoMatch ? (periodoMatch[1] ?? "").trim() : "";
  const aptoMatch = text.match(/APTO:\s*(\d+)/);
  const apto = aptoMatch ? aptoMatch[1] : undefined;
  const vrMatch = text.match(/Vr\.\s*Admon\s+([\d.,]+)/);
  const vrAdmon = vrMatch ? parseNum(vrMatch[1] ?? "") : 0;
  const totalMatch = text.match(/TOTAL A PAGAR\s+\$([\d,]+)/);
  const totalAPagar = totalMatch ? parseNum(totalMatch[1] ?? "") : 0;

  // Resident name (look for "Señor(es):" or before APTO)
  const nameMatch = text.match(/Se[ñn]or(?:es)?[:\s]+([A-ZÁÉÍÓÚÑ ]+?)(?:\n|\s{3,})/i);
  const residenteNombre = nameMatch ? (nameMatch[1] ?? "").trim() : "Residente";

  const tablaStart = text.indexOf("Codigo");
  const tablaEnd = text.indexOf("TOTAL A PAGAR");
  const tablaText = tablaStart >= 0 && tablaEnd > tablaStart ? text.slice(tablaStart, tablaEnd) : text;
  const conceptoLabels: Record<number, string | null> = {
    1: "Saldo a favor", 2: null, 3: "Intereses mora",
    4: "Retroactivo admón", 5: "Parqueadero visitante",
    6: "Honorarios abogado", 7: "Multas y sanciones",
  };
  const lineas: ParsedLine[] = [];
  for (const linea of tablaText.split("\n")) {
    const m = linea.match(/^\s{0,5}([1-7])\s{2,}(.+)/);
    if (!m) continue;
    const codigo = parseInt(m[1] ?? "0");
    const resto = m[2] ?? "";
    const numMatches = [...resto.matchAll(/([\d,]+)/g)].map((x) => parseNum(x[1] ?? "0"));
    let conceptoLabel: string | null = conceptoLabels[codigo] ?? null;
    if (codigo === 2) {
      const admMatch = resto.match(/ADMINISTRACION DE\s+(\S+)/i);
      conceptoLabel = admMatch ? `Administración de ${admMatch[1] ?? ""}` : "Administración";
    }
    if (!conceptoLabel) {
      const textPart = resto.replace(/([\d,]+)/g, "").trim();
      conceptoLabel = textPart || `Concepto ${codigo}`;
    }
    let saldoAnterior = 0, actual = 0, total = 0;
    if (codigo === 1) { total = numMatches[0] ?? 0; }
    else if (numMatches.length >= 3) { saldoAnterior = numMatches[0] ?? 0; actual = numMatches[1] ?? 0; total = numMatches[2] ?? 0; }
    else if (numMatches.length === 2) { actual = numMatches[0] ?? 0; total = numMatches[1] ?? 0; }
    else if (numMatches.length === 1) { total = numMatches[0] ?? 0; }
    lineas.push({ codigo, concepto: conceptoLabel, saldoAnterior, actual, total });
  }
  const codigosEncontrados = new Set(lineas.map((l) => l.codigo));
  for (let c = 1; c <= 7; c++) {
    if (!codigosEncontrados.has(c)) {
      lineas.push({ codigo: c, concepto: conceptoLabels[c] || `Concepto ${c}`, saldoAnterior: 0, actual: 0, total: 0 });
    }
  }
  lineas.sort((a, b) => a.codigo - b.codigo);
  const linea1 = lineas.find((l) => l.codigo === 1);

  // Unit identifier from APTO or from "T-X NNN" pattern
  const unitId = apto ?? residenteNombre;

  return {
    format: "arboleda", unitIdentifier: apto ?? "", residenteNombre,
    numeroInterno, periodoLabel, apto, vrAdmon,
    lineas, saldoAFavor: linea1?.total ?? 0, totalAPagar,
  };
}

function parseCdc(text: string): ParsedInvoice {
  const nroMatch = text.match(/CUENTA DE COBRO Nro\.\s+(\d+)/i);
  const numeroInterno = nroMatch?.[1] ?? "";
  const nombreMatch = text.match(/Nombre\s+(.+?)\s{3,}/);
  const residenteNombre = nombreMatch?.[1]?.trim() ?? "";
  const casaMatch = text.match(/Casa\s+(\S+)\s+MANZANA\s+(\S+)/i);
  const casa = casaMatch ? `${casaMatch[1] ?? ""} M${casaMatch[2] ?? ""}` : undefined;
  const unitNum = casaMatch?.[1] ?? "";
  const mesActualMatch = text.match(/\*\s+\d{3}\s+.*?([A-Za-záéíóúñÁÉÍÓÚÑ]+\s*\/\s*\d{4})/);
  const periodoLabel = mesActualMatch?.[1]?.trim() ?? "";
  let totalAPagar = 0;
  let totalConDescuento: number | undefined;
  const sinDesMatch = text.match(/Pague sin descuento[^$\n]+\$([\d.,]+)/i);
  const conDesMatch = text.match(/Pague con descuento[^$\n]+\$([\d.,]+)/i);
  if (sinDesMatch?.[1]) totalAPagar = parseNumCdc(sinDesMatch[1]);
  else {
    const totMatch = text.match(/Totales\s+([\d.,]+)(?:\s+([\d.,]+))?\s+([\d.,]+)/i);
    if (totMatch) totalAPagar = parseNumCdc(totMatch[3] ?? totMatch[1] ?? "0");
  }
  if (conDesMatch?.[1]) totalConDescuento = parseNumCdc(conDesMatch[1]);

  const MES_RE = /[A-Za-záéíóúñÁÉÍÓÚÑ]+\s*\/\s*\d{4}/;
  const NUM_RE = /\$?([\d]{1,3}(?:\.[\d]{3})+\.[\d]{2}|\d{4,}\.[\d]{2})/g;
  const conceptMap = new Map<number, { concepto: string; saldoAnterior: number; actual: number; total: number }>();

  for (const linea of text.split("\n")) {
    const matchLine = linea.match(/^\s*(\*?)\s*(\d{3})\s{2,}(.+)/);
    if (!matchLine) continue;
    const codigo = parseInt(matchLine[2] ?? "0", 10);
    const resto = matchLine[3] ?? "";
    const conceptoMatch = resto.match(/^(.+?)\s{3,}/);
    const concepto = conceptoMatch?.[1]?.trim().replace(/\s+/g, " ") ?? resto.slice(0, 40).trim();
    const mesMatch = MES_RE.exec(linea);
    const parteAntes = mesMatch ? linea.slice(0, mesMatch.index) : "";
    const parteDespues = mesMatch ? linea.slice(mesMatch.index + mesMatch[0].length) : linea;
    const numsAntes = [...parteAntes.matchAll(NUM_RE)].map((m) => parseNumCdc(m[1] ?? "0"));
    const numsDespues = [...parteDespues.matchAll(NUM_RE)].map((m) => parseNumCdc(m[1] ?? "0"));
    if (!conceptMap.has(codigo)) conceptMap.set(codigo, { concepto, saldoAnterior: 0, actual: 0, total: 0 });
    const entry = conceptMap.get(codigo)!;
    if (numsAntes.length > 0) {
      const val = numsAntes[numsAntes.length - 1] ?? 0;
      entry.saldoAnterior += val; entry.total += val;
    } else if (numsDespues.length > 0) {
      entry.actual += numsDespues[0] ?? 0; entry.total += numsDespues[numsDespues.length - 1] ?? 0;
    }
  }

  const lineas: ParsedLine[] = [...conceptMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([codigo, v]) => ({ codigo, concepto: v.concepto, saldoAnterior: v.saldoAnterior, actual: v.actual, total: v.total }));

  const admon = conceptMap.get(1);
  const vrAdmon = admon ? admon.actual : 0;

  return {
    format: "cdc", unitIdentifier: unitNum, residenteNombre,
    numeroInterno, periodoLabel, apto: casa, vrAdmon,
    lineas, saldoAFavor: 0, totalAPagar, totalConDescuento,
  };
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("pdf") as File | null;
    const condominioLegacyId = form.get("condominioLegacyId") as string;
    const periodo = form.get("periodo") as string;

    if (!file || !condominioLegacyId || !periodo) {
      return NextResponse.json({ error: "Faltan campos: pdf, condominioLegacyId, periodo" }, { status: 400 });
    }

    const pdfBytes = new Uint8Array(await file.arrayBuffer());
    const doc = await PDFDocument.load(pdfBytes);
    const pageCount = doc.getPageCount();

    // 1. Extraer texto por página
    const pageTexts: string[] = [];
    for (let i = 0; i < pageCount; i++) {
      const singleDoc = await PDFDocument.create();
      const [page] = await singleDoc.copyPages(doc, [i]);
      singleDoc.addPage(page);
      const singleBytes = await singleDoc.save();
      pageTexts.push(extractText(singleBytes));
    }

    // 2. Agrupar páginas por factura (páginas sin cabecera = continúan la anterior)
    const invoiceGroups: number[][] = [];
    for (let i = 0; i < pageCount; i++) {
      if (i === 0 || isInvoiceStart(pageTexts[i] ?? "")) {
        invoiceGroups.push([i]);
      } else {
        invoiceGroups[invoiceGroups.length - 1]!.push(i);
      }
    }

    // 3. Procesar cada grupo
    const results: Array<{
      parsed: ParsedInvoice;
      pdfUrl: string;
      pageCount: number;
      pdfBytes?: number[]; // base64 enviado como array de bytes no, mejor URL
    }> = [];
    const errors: Array<{ pages: number[]; error: string }> = [];

    for (const group of invoiceGroups) {
      try {
        // Construir PDF del grupo
        const groupDoc = await PDFDocument.create();
        const copiedPages = await groupDoc.copyPages(doc, group);
        copiedPages.forEach((p) => groupDoc.addPage(p));
        const groupBytes = await groupDoc.save();

        // Texto completo del grupo
        const groupText = group.map((i) => pageTexts[i]).join("\n");
        const format = detectFormat(groupText);
        const parsed = format === "cdc" ? parseCdc(groupText) : parseArboleda(groupText);

        // Subir a S3
        const unitForPath = parsed.unitIdentifier || `page-${(group[0] ?? 0) + 1}`;
        const pdfUrl = await uploadPdfToS3(groupBytes, condominioLegacyId, periodo, unitForPath);

        results.push({ parsed, pdfUrl, pageCount: group.length });
      } catch (e: any) {
        errors.push({ pages: group.map((i) => i + 1), error: e.message });
      }
    }

    return NextResponse.json({
      total: invoiceGroups.length,
      processed: results.length,
      errors: errors.length,
      invoices: results.map((r) => ({ ...r.parsed, pdfUrl: r.pdfUrl, pageCount: r.pageCount })),
      parseErrors: errors,
    });
  } catch (e: any) {
    console.error("[facturas/upload]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
