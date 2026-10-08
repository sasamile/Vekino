// Genera fixtures PDF anonimizados a partir de cuentas de cobro reales.
//
// Reconstruye cada página con pdf-lib colocando cada fragmento de texto en
// sus coordenadas originales (x, y) y su tamaño, que es lo único que usa el
// extractor de la web (apps/web/app/api/facturas/pdf-layout.ts). Los datos
// personales u operativos se reemplazan; montos, conceptos, meses y totales
// se conservan tal cual.
//
// Uso: node anonimizar.mjs <repo> <salida> <origenes.json>
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

const [, , REPO, SALIDA, CONFIG] = process.argv;
const req = (m) => import(pathToFileURL(path.join(REPO, "node_modules", m)).href);
const { getDocumentProxy } = await req("unpdf/dist/index.mjs");
const { PDFDocument, StandardFonts } = await req("pdf-lib/cjs/index.js").then((m) => m.default ?? m);

const fuentes = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
const informe = [];

const cerca = (a, b, tol = 1.6) => Math.abs(a - b) <= tol;

function reglasCdc(items, cfg) {
  const lbl = (s) => items.find((i) => i.str.trim() === s);
  const nombre = lbl("Nombre");
  const tel = lbl("Teléfono");
  const casaLbl = lbl("Casa");
  const nro = lbl("CUENTA DE COBRO Nro.");
  const casa = casaLbl && items.find((i) => cerca(i.y, casaLbl.y, 1) && i.x > 100 && i.x < 150);
  const casaOrig = casa?.str.trim() ?? cfg.casa ?? null;
  return (it) => {
    const s = it.str;
    if (nombre && cerca(it.y, nombre.y, 1.2) && it.x > 100 && it.x < 380) return "RESIDENTE DE PRUEBA";
    if (tel && cerca(it.y, tel.y, 1.2) && it.x > 100 && it.x < 380) return "0000000";
    if (nro && cerca(it.y, nro.y, 2) && it.x > nro.x + 50 && /^\d+$/.test(s.trim())) return cfg.nro;
    if (casaOrig && s.trim() === casaOrig) return cfg.casaNueva;
    if (/^MANZANA\s+\S+$/.test(s.trim())) return "MANZANA 9";
    if (/^Nit:/i.test(s.trim())) return "Nit: 900000000 - 0";
    if (it.y > 700 && /^\d{7,}$/.test(s.trim())) return "0000000000";
    if (it.y > 700 && it.y < 740 && !/CUENTA DE COBRO|DESARROLLO URBANO/.test(s) && s.trim() && !/^\d+$/.test(s.trim()))
      return "DATO DE PRUEBA";
    if (/@/.test(s)) return s.replace(/[\w.+-]+@[\w.-]+/g, "administracion@ejemplo.test");
    if (/\d{3}-\d{5}-\d/.test(s)) return s.replace(/\d{3}-\d{5}-\d/g, "000-00000-0");
    return s;
  };
}

function reglasArboleda(items, cfg) {
  const ident = items.find((i) => i.str.trim() === "IDENT:");
  const apto = items.find((i) => /^APTO:\s*\d+/.test(i.str.trim()));
  const aptoOrig = apto?.str.replace(/^APTO:\s*/, "").trim() ?? null;
  const n = items.find((i) => i.str.trim() === "N.");
  return (it) => {
    const s = it.str;
    if (ident && cerca(it.y, ident.y, 1.2) && it.x < 200) return "RESIDENTE DE PRUEBA";
    if (/^APTO:/.test(s.trim())) return `APTO: ${cfg.aptoNuevo}`;
    if (aptoOrig && s.trim() === aptoOrig) return cfg.aptoNuevo;
    if (n && cerca(it.y, n.y, 1.5) && it.x > n.x && /^[\d,]+$/.test(s.trim())) return cfg.nro;
    if (/^NIT:/i.test(s.trim())) return "NIT: 900.000.000 - 0";
    if (/^\d{3} \d{3} \d{3}$/.test(s.trim())) return "000 000 000";
    if (/Efecty \d+/.test(s)) return s.replace(/Efecty \d+/, "Efecty 00000");
    return s;
  };
}

for (const f of fuentes) {
  const bytes = new Uint8Array(fs.readFileSync(f.origen));
  const pdf = await getDocumentProxy(bytes);
  const salida = await PDFDocument.create();
  const helv = await salida.embedFont(StandardFonts.Helvetica);
  const reemplazos = new Map();
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const c = await page.getTextContent();
    const items = c.items
      .filter((i) => "str" in i && i.str)
      .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], size: Math.hypot(i.transform[2], i.transform[3]) || 8 }));
    const regla = f.formato === "cdc" ? reglasCdc(items, f) : reglasArboleda(items, f);
    const hoja = salida.addPage([vp.width, vp.height]);
    for (const it of items) {
      if (!it.str.trim()) continue; // los espacios sueltos no cambian la rejilla reconstruida
      let texto = regla(it);
      if (texto !== it.str) reemplazos.set(it.str, texto);
      // Caracteres fuera de WinAnsi: se sustituyen para que pdf-lib pueda dibujarlos.
      texto = [...texto].map((ch) => { try { helv.encodeText(ch); return ch; } catch { return "?"; } }).join("");
      hoja.drawText(texto, { x: it.x, y: it.y, size: it.size, font: helv });
    }
  }
  salida.setTitle("Fixture de prueba anonimizado");
  salida.setAuthor("Vekino — pruebas de facturación");
  salida.setProducer("pdf-lib");
  salida.setCreator("anonimizar.mjs");
  salida.setCreationDate(new Date("2026-10-08T00:00:00Z"));
  salida.setModificationDate(new Date("2026-10-08T00:00:00Z"));
  const out = await salida.save({ useObjectStreams: false });
  fs.writeFileSync(path.join(SALIDA, f.nombre), out);
  informe.push({ nombre: f.nombre, paginas: pdf.numPages, reemplazos: [...reemplazos.entries()].length });
}
console.log(JSON.stringify(informe, null, 1));
