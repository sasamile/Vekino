/**
 * Primera hoja de un .xlsx o .csv, como tabla de textos.
 *
 * Excel en Colombia suele ir con punto y coma; el que se descarga desde
 * Vekino usa celdas inline (no shared strings). Los dos tienen que entrar.
 */
import JSZip from "jszip";

export type Hoja = { encabezados: string[]; filas: string[][] };

export async function leerHoja(file: File): Promise<Hoja> {
  const nombre = file.name.toLowerCase();
  if (nombre.endsWith(".xls") && !nombre.endsWith(".xlsx")) {
    throw new Error("Guarda el archivo como .xlsx o .csv (Excel → Guardar como).");
  }
  if (nombre.endsWith(".csv") || nombre.endsWith(".txt")) {
    return parseCsv(await file.text());
  }
  return parseXlsx(await file.arrayBuffer());
}

function parseCsv(texto: string): Hoja {
  const raw = texto.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lineas = raw.split("\n").filter((l) => l.trim().length > 0);
  if (lineas.length === 0) throw new Error("El archivo está vacío.");
  const sep = (lineas[0] ?? "").includes(";") && !((lineas[0] ?? "").includes(","))
    ? ";"
    : ",";
  const tabla = lineas.map((l) => splitCsv(l, sep));
  return recortar(tabla);
}

function splitCsv(linea: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i]!;
    if (ch === '"') {
      if (inQuotes && linea[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === sep && !inQuotes) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

async function parseXlsx(buf: ArrayBuffer): Promise<Hoja> {
  const zip = await JSZip.loadAsync(buf);
  const sheetPath = await primeraHoja(zip);
  const sheetXml = await zip.file(sheetPath)?.async("string");
  if (!sheetXml) throw new Error("No se encontró la hoja del Excel.");
  const shared = await leerSharedStrings(zip);
  const tabla = celdasATabla(sheetXml, shared);
  return recortar(tabla);
}

async function primeraHoja(zip: JSZip): Promise<string> {
  const wb = await zip.file("xl/workbook.xml")?.async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!wb || !rels) {
    const fallback = Object.keys(zip.files).find((p) =>
      /xl\/worksheets\/sheet1\.xml$/i.test(p),
    );
    if (fallback) return fallback;
    throw new Error("El Excel no tiene una hoja que se pueda leer.");
  }
  const sheetId =
    wb.match(/<sheet[^>]*r:id="([^"]+)"/i)?.[1] ??
    wb.match(/<sheet[^>]*id="([^"]+)"/i)?.[1];
  const rel =
    sheetId &&
    rels.match(new RegExp(`Id="${sheetId}"[^>]*Target="([^"]+)"`, "i"));
  const target = rel?.[1] ?? "worksheets/sheet1.xml";
  const path = target.startsWith("/")
    ? target.slice(1)
    : target.startsWith("xl/")
      ? target
      : `xl/${target.replace(/^\.\//, "")}`;
  return path;
}

async function leerSharedStrings(zip: JSZip): Promise<string[]> {
  const xml = await zip.file("xl/sharedStrings.xml")?.async("string");
  if (!xml) return [];
  const out: string[] = [];
  const si = xml.match(/<si\b[\s\S]*?<\/si>/gi) ?? [];
  for (const bloque of si) {
    const textos = [...bloque.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/gi)].map((m) =>
      decodeXml(m[1] ?? ""),
    );
    out.push(textos.join(""));
  }
  return out;
}

function celdasATabla(sheetXml: string, shared: string[]): string[][] {
  const rows = sheetXml.match(/<row\b[^>]*>[\s\S]*?<\/row>/gi) ?? [];
  const tabla: string[][] = [];
  let maxCol = 0;
  for (const row of rows) {
    const rAttr = Number(row.match(/<row[^>]*\br="(\d+)"/i)?.[1] ?? tabla.length + 1);
    const idx = rAttr - 1;
    while (tabla.length <= idx) tabla.push([]);
    const fila = tabla[idx]!;
    const cells = row.match(/<c\b[^>]*>[\s\S]*?<\/c>|<c\b[^>]*\/>/gi) ?? [];
    for (const c of cells) {
      const ref = c.match(/\br="([A-Z]+)(\d+)"/i);
      const col = ref ? colIndex(ref[1]!) : fila.length;
      maxCol = Math.max(maxCol, col);
      fila[col] = valorCelda(c, shared);
    }
  }
  return tabla.map((f) => {
    const copia = [...f];
    while (copia.length <= maxCol) copia.push("");
    return copia.map((v) => v ?? "");
  });
}

function valorCelda(c: string, shared: string[]): string {
  const tipo = c.match(/\bt="([^"]+)"/)?.[1];
  if (tipo === "inlineStr") {
    const t = c.match(/<t[^>]*>([\s\S]*?)<\/t>/i)?.[1];
    return decodeXml(t ?? "").trim();
  }
  const v = c.match(/<v[^>]*>([\s\S]*?)<\/v>/i)?.[1] ?? "";
  if (tipo === "s") {
    const i = Number(v);
    return (shared[i] ?? "").trim();
  }
  return decodeXml(v).trim();
}

function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function recortar(tabla: string[][]): Hoja {
  const noVacias = tabla.filter((f) => f.some((c) => c.trim().length > 0));
  if (noVacias.length === 0) throw new Error("El archivo está vacío.");
  const encabezados = noVacias[0]!.map((c) => c.trim());
  const filas = noVacias.slice(1);
  return { encabezados, filas };
}
