// Genera cuentas de cobro SINTÉTICAS con el formato de Ciudad del Campo para
// la QA de Factory (docs/qa/QA-FACTORY-COMPROBANTES.md).
//
// Mismo método que apps/web/pruebas/facturacion/fixtures/anonimizar.mjs: cada
// fragmento de texto se dibuja con pdf-lib en sus coordenadas (x, y) y con su
// tamaño, que es lo único que usa el extractor de la web
// (apps/web/app/api/facturas/pdf-layout.ts). La plantilla es el fixture
// anonimizado `cdc-septiembre-saldo-anterior-negativo.pdf`: de él se conservan
// el membrete, los títulos y el pie; la casa, la fecha, el consecutivo, las
// filas, los Totales y los montos de pago salen de la especificación.
//
// Ningún dato es de una persona: el nombre es "RESIDENTE DE PRUEBA", el
// teléfono no se escribe y cada hoja dice que es un documento sintético.
//
// Uso: node generar-pdf.mjs <repo> <especificacion.json> <carpeta-salida>
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

const [, , REPO, SPEC, SALIDA] = process.argv;
const req = (m) => import(pathToFileURL(path.join(REPO, "node_modules", m)).href);
const { getDocumentProxy } = await req("unpdf/dist/index.mjs");
const { PDFDocument, StandardFonts } = await req("pdf-lib/cjs/index.js").then((m) => m.default ?? m);

const PLANTILLA = path.join(
  REPO,
  "apps/web/pruebas/facturacion/fixtures/cdc-septiembre-saldo-anterior-negativo.pdf",
);

// ── Montos con el formato del documento: 1.234.567.00, -597.000.00, $33.000.00
function monto(n, { pesos = false } = {}) {
  const neg = n < 0;
  const miles = Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${pesos ? "$" : ""}${neg ? "-" : ""}${miles}.00`;
}

// ── Plantilla: lo que se conserva de la hoja (todo menos la zona variable)
const plantilla = await getDocumentProxy(new Uint8Array(fs.readFileSync(PLANTILLA)));
const hojaBase = await plantilla.getPage(1);
const vp = hojaBase.getViewport({ scale: 1 });
const itemsBase = (await hojaBase.getTextContent()).items
  .filter((i) => "str" in i && i.str.trim())
  .map((i) => ({
    str: i.str,
    x: i.transform[4],
    y: i.transform[5],
    size: Math.hypot(i.transform[2], i.transform[3]) || 8,
  }));

const cerca = (a, b, tol = 1.2) => Math.abs(a - b) <= tol;
// Zona variable: filas de la tabla (y entre 515 y 600), Totales, la fila del
// descuento y los montos de "Pague con/sin descuento". El resto se conserva.
function seConserva(it) {
  if (it.y < 600 && it.y > 490) return false; // tabla, Totales y "Total inmueble"
  if (it.x > 550 && it.y > 450 && it.y < 490) return false; // $ con / sin descuento
  return true;
}

// Columnas (borde derecho de cada monto, medido en la plantilla)
const COL = {
  prefijo: 28.1,
  codigo: 50.6,
  concepto: 86.6,
  saldoAnteriorDer: 301.9,
  mes: 310.1,
  esteMesDer: 460.9,
  desctoDer: 522.4,
  saldoDer: 599.6,
  totalesLbl: 161.6,
  totSaldoAntDer: 296.7,
  totMesDer: 455.6,
  totTotalDer: 594.4,
  descTotalDer: 517.2,
};

async function hoja(salida, helv, f) {
  const page = salida.addPage([vp.width, vp.height]);
  const dibujar = (texto, x, y, size) => {
    const limpio = [...texto]
      .map((ch) => {
        try {
          helv.encodeText(ch);
          return ch;
        } catch {
          return "?";
        }
      })
      .join("");
    page.drawText(limpio, { x, y, size, font: helv });
  };
  const derecha = (texto, xDer, y, size = 8) =>
    dibujar(texto, xDer - helv.widthOfTextAtSize(texto, size), y, size);

  // Membrete, títulos y pie de la plantilla, con los campos de la cuenta
  for (const it of itemsBase) {
    if (!seConserva(it)) continue;
    let s = it.str;
    const t = s.trim();
    if (t === "90003") s = f.nro; // CUENTA DE COBRO Nro.
    else if (t === "999") s = f.casa; // casa, referencia de pago
    else if (t === "MANZANA 9") s = `MANZANA ${f.manzana ?? "9"}`;
    else if (/^Septi\. 01 \/ 2026$/.test(t)) s = f.fecha;
    dibujar(s, it.x, it.y, it.size);
  }

  // Filas de conceptos
  let y = 590.8;
  for (const r of f.filas) {
    if (r.prefijo) dibujar(r.prefijo, COL.prefijo, y - 1, 10);
    dibujar(r.codigo, COL.codigo, y, 8);
    dibujar(r.concepto, COL.concepto, y, 8);
    if (r.saldoAnterior !== undefined) derecha(monto(r.saldoAnterior), COL.saldoAnteriorDer, y);
    dibujar(r.mes, COL.mes, y, 8);
    if (r.esteMes !== undefined) derecha(monto(r.esteMes), COL.esteMesDer, y);
    if (r.descto !== undefined) derecha(monto(r.descto), COL.desctoDer, y);
    derecha(monto(r.saldo), COL.saldoDer, y);
    y -= 14;
  }

  // Totales: saldo anterior · mes · total
  const yTot = Math.min(517, y - 4);
  dibujar("Totales", COL.totalesLbl, yTot, 8);
  derecha(monto(f.totales.saldoAnterior), COL.totSaldoAntDer, yTot - 0.5);
  derecha(monto(f.totales.mes), COL.totMesDer, yTot - 0.5);
  derecha(monto(f.totales.total), COL.totTotalDer, yTot - 0.5);

  // Fila del descuento y "Total inmueble"
  const yInm = yTot - 19.2;
  if (f.descuento) derecha(monto(f.descuento), COL.descTotalDer, yInm);
  derecha(monto(f.totales.total), COL.totTotalDer, yInm);
  dibujar("Total inmueble", 319.1, yInm - 0.3, 8);
  dibujar(f.casa, 391.9, yInm - 0.8, 8);

  // Montos de pago (los textos "Pague con/sin descuento" vienen de la plantilla)
  derecha(monto(f.conDescuento, { pesos: true }), COL.saldoDer, 477.5);
  derecha(monto(f.sinDescuento, { pesos: true }), COL.saldoDer, 459.5);

  // Marca de documento sintético (no tiene montos ni palabras que lea el parser)
  dibujar("DOCUMENTO SINTETICO DE PRUEBA - QA VEKINO (CONJUNTO FACTORY) - SIN VALIDEZ", 32.6, 240, 10);
  dibujar(`Caso: ${f.caso}`, 32.6, 225, 10);
}

const spec = JSON.parse(fs.readFileSync(SPEC, "utf8"));
fs.mkdirSync(SALIDA, { recursive: true });
const informe = [];
for (const doc of spec) {
  const salida = await PDFDocument.create();
  const helv = await salida.embedFont(StandardFonts.Helvetica);
  for (const f of doc.facturas) await hoja(salida, helv, f);
  salida.setTitle(`QA Factory - ${doc.nombre}`);
  salida.setAuthor("Vekino - QA de facturación (sintético)");
  salida.setProducer("pdf-lib");
  salida.setCreator("qa/factory/generar-pdf.mjs");
  salida.setCreationDate(new Date("2026-10-09T00:00:00Z"));
  salida.setModificationDate(new Date("2026-10-09T00:00:00Z"));
  const bytes = await salida.save({ useObjectStreams: false });
  const destino = path.join(SALIDA, doc.nombre);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, bytes);
  informe.push({ archivo: doc.nombre, hojas: doc.facturas.length });
}
console.log(JSON.stringify(informe));
