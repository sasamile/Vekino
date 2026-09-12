import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  ArchivoExcelInvalido,
  leerXlsx,
} from "../../../apps/web/lib/excel-lectura.ts";

/**
 * EL LECTOR DE .xlsx DE LA CARGA MASIVA.
 *
 * Vive en `apps/web` porque es codigo de navegador —lo unico que hace es
 * abrir el archivo que el usuario suelta en la pantalla—, pero se prueba
 * AQUI porque aqui esta el corredor: el proyecto ya ejecuta
 * `node --test pruebas/*.prueba.ts`, y montarle un segundo corredor a la app
 * web solo para esto seria cambiar la estrategia de pruebas del proyecto por
 * un fichero.
 *
 * `leerXlsx` no depende del navegador (recibe un Blob y lee su ArrayBuffer),
 * asi que corre igual aqui que alli. Lo que se fija es lo que de verdad
 * rompe una carga: que las celdas vacias que Excel OMITE no corran las demas
 * de columna.
 */

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colLetter(i: number): string {
  let n = i;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

/**
 * Un libro con el MISMO XML que produce `apps/web/lib/excel-simple.ts`.
 *
 * Es la mitad que importa del round-trip: la plantilla que se descarga tiene
 * que poder volver a entrar rellenada.
 */
async function comoLoEscribeVekino(
  encabezados: string[],
  filas: string[][],
): Promise<Blob> {
  const filasXml = [encabezados, ...filas]
    .map((fila, ri) => {
      const celdas = fila
        .map(
          (v, ci) =>
            `<c r="${colLetter(ci)}${ri + 1}" t="inlineStr"><is><t>${xmlEscape(v)}</t></is></c>`,
        )
        .join("");
      return `<row r="${ri + 1}">${celdas}</row>`;
    })
    .join("");

  const zip = new JSZip();
  const xl = zip.folder("xl")!;
  xl.folder("worksheets")!.file(
    "sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${filasXml}</sheetData></worksheet>`,
  );
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  return new Blob([buf]);
}

/**
 * Un libro como los que produce Excel de verdad: texto en `sharedStrings` y
 * celdas vacias directamente ausentes de la fila.
 */
async function comoLoEscribeExcel(): Promise<Blob> {
  const compartidas = [
    "Nombre",
    "Serial",
    "Descripcion",
    "Radio Motorola",
    "Linterna",
  ];
  const si = compartidas.map((s) => `<si><t>${s}</t></si>`).join("");
  const sheet = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="inlineStr"><is><t>VK-1</t></is></c></row>
<row r="3"><c r="A3" t="s"><v>4</v></c><c r="C3" t="inlineStr"><is><t>Recargable</t></is></c></row>
<row r="4"><c r="A4"/><c r="B4"/></row>
</sheetData></worksheet>`;

  const zip = new JSZip();
  const xl = zip.folder("xl")!;
  xl.file(
    "sharedStrings.xml",
    `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${si}</sst>`,
  );
  xl.folder("worksheets")!.file("sheet1.xml", sheet);
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  return new Blob([buf]);
}

// ─────────────────────────────────────────────────────────────

test("la plantilla que se descarga se puede volver a leer", async () => {
  const archivo = await comoLoEscribeVekino(
    ["Nombre", "Serial", "Descripcion", "Foto (URL)"],
    [["Radio Motorola", "VK-1042", "Con bateria", ""]],
  );
  const hoja = await leerXlsx(archivo);

  assert.deepEqual(hoja.encabezados, [
    "Nombre",
    "Serial",
    "Descripcion",
    "Foto (URL)",
  ]);
  assert.deepEqual(hoja.filas, [
    ["Radio Motorola", "VK-1042", "Con bateria", ""],
  ]);
});

test("las celdas que Excel omite NO corren las demas de columna", async () => {
  /* El fallo silencioso de esta clase de lector: Excel no escribe la celda
   * vacia, asi que una fila sin serial llega con dos celdas en vez de tres y,
   * si se leen por orden de aparicion, la descripcion se importa como serial.
   * Se coloca cada celda en la columna que dice su referencia (`r="C3"`). */
  const hoja = await leerXlsx(await comoLoEscribeExcel());

  assert.deepEqual(hoja.encabezados, ["Nombre", "Serial", "Descripcion"]);
  assert.deepEqual(hoja.filas[0], ["Radio Motorola", "VK-1", ""]);
  assert.deepEqual(hoja.filas[1], ["Linterna", "", "Recargable"]);
  /* La fila 4 del libro esta vacia y es la ultima: se recorta con la cola. */
  assert.equal(hoja.filas.length, 2);
});

test("el texto de Excel vive en sharedStrings y se resuelve", async () => {
  const hoja = await leerXlsx(await comoLoEscribeExcel());
  /* Sin resolver la tabla de cadenas, esto seria "0", "1", "2". */
  assert.equal(hoja.encabezados[0], "Nombre");
  assert.equal(hoja.filas[0]?.[0], "Radio Motorola");
});

test("los acentos y los signos escapados vuelven intactos", async () => {
  const archivo = await comoLoEscribeVekino(
    ["Nombre", "Descripción"],
    [["Radio & antena", "Batería <nueva>"]],
  );
  const hoja = await leerXlsx(archivo);
  assert.deepEqual(hoja.encabezados, ["Nombre", "Descripción"]);
  assert.deepEqual(hoja.filas, [["Radio & antena", "Batería <nueva>"]]);
});

test("un .csv disfrazado se rechaza como archivo invalido", async () => {
  /* Un error propio y no el de JSZip: la pantalla tiene que poder distinguir
   * "esto no es un Excel" de "este Excel trae filas malas". */
  await assert.rejects(
    () => leerXlsx(new Blob([Buffer.from("nombre,serial\nRadio,VK-1")])),
    (e: unknown) => e instanceof ArchivoExcelInvalido,
  );
});

test("un zip que no lleva hojas se rechaza como archivo invalido", async () => {
  const zip = new JSZip();
  zip.file("hola.txt", "nada");
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  await assert.rejects(
    () => leerXlsx(new Blob([buf])),
    (e: unknown) =>
      e instanceof ArchivoExcelInvalido && /hoja/i.test(e.message),
  );
});

test("una hoja sin una sola celda se rechaza como vacia", async () => {
  const archivo = await comoLoEscribeVekino([], []);
  await assert.rejects(
    () => leerXlsx(archivo),
    (e: unknown) => e instanceof ArchivoExcelInvalido && /vac/i.test(e.message),
  );
});

test("las filas en blanco de arriba no se toman por encabezado", async () => {
  const archivo = await comoLoEscribeVekino(
    ["", ""],
    [
      ["Nombre", "Serial"],
      ["Radio", "VK-1"],
    ],
  );
  const hoja = await leerXlsx(archivo);
  assert.deepEqual(hoja.encabezados, ["Nombre", "Serial"]);
  /* Los encabezados estan en la fila 2, asi que esa posicion queda en blanco
   * y "Radio" sigue estando donde dice la hoja: la fila 3, indice 1. Las
   * posiciones son absolutas justamente para que el informe de errores no
   * mande a nadie a la fila equivocada. */
  assert.deepEqual(hoja.filas, [["", ""], ["Radio", "VK-1"]]);
});

// ─────────────────────────────────────────────────────────────
// Regresiones del escaneo XML.
//
// Las tres salen del mismo error: un regex `<tag[^>]*(?:\/>|>(.*?)<\/tag>)`
// con los atributos codiciosos NO reconoce la forma autocerrada cuando hay
// mas contenido detras — la alternativa `\/>` falla y la otra tiene exito
// tragandose el elemento siguiente. Ninguna de las tres da error: devuelven
// datos cruzados en silencio, que es lo peor que puede hacer un importador.
// ─────────────────────────────────────────────────────────────

/** Libro con XML puesto a mano, para reproducir lo que escribe Excel. */
async function conHoja(sheet: string, sharedStrings?: string): Promise<Blob> {
  const zip = new JSZip();
  const xl = zip.folder("xl")!;
  if (sharedStrings) xl.file("sharedStrings.xml", sharedStrings);
  xl.folder("worksheets")!.file("sheet1.xml", sheet);
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  return new Blob([buf]);
}

test("una celda vacia autocerrada no se traga la celda siguiente", async () => {
  /* `<c r="B2" s="3"/>` es como Excel escribe una celda vacia CON FORMATO, y
   * pasa constantemente en una plantilla que alguien ha rellenado. El fallo
   * hacia que la descripcion entrara como serial. */
  const hoja = await conHoja(`<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>Nombre</t></is></c><c r="B1" t="inlineStr"><is><t>Serial</t></is></c><c r="C1" t="inlineStr"><is><t>Descripcion</t></is></c></row>
<row r="2"><c r="A2" t="inlineStr"><is><t>Radio</t></is></c><c r="B2" s="3"/><c r="C2" t="inlineStr"><is><t>Recargable</t></is></c></row>
</sheetData></worksheet>`);

  const leido = await leerXlsx(hoja);
  assert.deepEqual(leido.filas[0], ["Radio", "", "Recargable"]);
});

test("un <si/> vacio ocupa su indice y no desplaza las cadenas siguientes", async () => {
  /* Si se salta, `t="s"` con indice 2 devuelve la cadena 3: los nombres y los
   * seriales salen cruzados y nada falla a la vista. */
  const hoja = await conHoja(
    `<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>2</v></c></row>
<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c></row>
</sheetData></worksheet>`,
    `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Nombre</t></si><si/><si><t>Serial</t></si><si><t>Radio</t></si><si><t>VK-1042</t></si></sst>`,
  );

  const leido = await leerXlsx(hoja);
  assert.deepEqual(leido.encabezados, ["Nombre", "Serial"]);
  assert.deepEqual(leido.filas[0], ["Radio", "VK-1042"]);
});

test("una fila autocerrada no fusiona la siguiente", async () => {
  const hoja = await conHoja(`<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>Nombre</t></is></c></row>
<row r="2" ht="15" customHeight="1"/>
<row r="3"><c r="A3" t="inlineStr"><is><t>Radio</t></is></c></row>
</sheetData></worksheet>`);

  const leido = await leerXlsx(hoja);
  assert.deepEqual(leido.encabezados, ["Nombre"]);
  assert.deepEqual(leido.filas, [[""], ["Radio"]]);
});

test("las filas que Excel omite conservan su numero: filas[i] es la fila i+2", async () => {
  /* Excel no escribe las filas totalmente vacias. Numerando por orden de
   * aparicion, el informe diria "fila 4" de lo que en la hoja es la fila 7, y
   * quien va a corregirlo abre una fila que esta bien. */
  const hoja = await conHoja(`<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>Nombre</t></is></c></row>
<row r="2"><c r="A2" t="inlineStr"><is><t>Radio</t></is></c></row>
<row r="7"><c r="A7" t="inlineStr"><is><t>Linterna</t></is></c></row>
</sheetData></worksheet>`);

  const leido = await leerXlsx(hoja);
  assert.equal(leido.filas.length, 6);
  assert.deepEqual(leido.filas[0], ["Radio"]); // fila 2
  assert.deepEqual(leido.filas[5], ["Linterna"]); // fila 7
  for (const hueco of [1, 2, 3, 4]) {
    assert.deepEqual(leido.filas[hueco], [""]);
  }
});

test("la cola de filas vacias se recorta y no gasta el limite de la carga", async () => {
  /* Excel arrastra filas con formato hasta el final del rango usado. Contarlas
   * haria que un archivo de tres elementos dijera tener novecientas filas. */
  const filasVacias = Array.from(
    { length: 40 },
    (_, i) => `<row r="${i + 3}" ht="15"/>`,
  ).join("");
  const hoja = await conHoja(`<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>Nombre</t></is></c></row>
<row r="2"><c r="A2" t="inlineStr"><is><t>Radio</t></is></c></row>
${filasVacias}
</sheetData></worksheet>`);

  const leido = await leerXlsx(hoja);
  assert.deepEqual(leido.filas, [["Radio"]]);
});

test("un & escapado no se desescapa dos veces", async () => {
  /* El texto real de la celda es `a &lt; b` — el usuario escribio esos siete
   * caracteres, no un signo menor. El ampersand se desescapa el ULTIMO: al
   * reves, `&amp;lt;` daria `&lt;` y de ahi `<`, corrompiendo el texto. */
  const hoja = await conHoja(`<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>Nombre</t></is></c></row>
<row r="2"><c r="A2" t="inlineStr"><is><t>a &amp;lt; b</t></is></c></row>
</sheetData></worksheet>`);

  const leido = await leerXlsx(hoja);
  assert.deepEqual(leido.filas[0], ["a &lt; b"]);
});
