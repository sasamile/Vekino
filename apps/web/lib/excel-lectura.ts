/**
 * Lee un .xlsx (Office Open XML) sin dependencias extra.
 *
 * Hermano de `excel-simple.ts`, que solo escribía. Se leen las celdas a mano
 * con JSZip —que ya está en el proyecto— en vez de traer SheetJS: un .xlsx es
 * un zip con XML dentro, y de todo ese formato aquí solo hacen falta los
 * valores de texto de la primera hoja. Añadir una dependencia de medio mega al
 * bundle del navegador para eso no sale a cuenta.
 *
 * Lo que NO hace, a propósito: fórmulas, fechas, formatos, varias hojas. Una
 * plantilla de inventario son cuatro columnas de texto.
 */
import JSZip from "jszip";

export class ArchivoExcelInvalido extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ArchivoExcelInvalido";
  }
}

/**
 * Recorre los elementos `<tag>` de un XML, con o sin cuerpo.
 *
 * Se hace con un bucle explícito y no con un solo regex del tipo
 * `<c[^>]*(?:\/>|>(.*?)<\/c>)`. Ese regex parece correcto y no lo es: con los
 * atributos codiciosos, una celda vacía autocerrada —`<c r="B2" s="3"/>`, que
 * es como Excel escribe una celda vacía con formato— hace que la alternativa
 * `\/>` falle y la otra tenga éxito tragándose la celda SIGUIENTE entera. El
 * resultado era que la descripción se importaba como serial, en silencio.
 *
 * Los atributos se recorren respetando las comillas para que un `>` dentro de
 * un valor no corte el tag antes de tiempo.
 */
function* elementos(
  xml: string,
  tag: string,
): Generator<{ attrs: string; cuerpo: string }> {
  const abre = new RegExp(
    `<${tag}\\b((?:"[^"]*"|'[^']*'|[^>"'])*?)(/?)>`,
    "g",
  );
  const cierre = `</${tag}>`;
  let m: RegExpExecArray | null;
  while ((m = abre.exec(xml)) !== null) {
    if (m[2] === "/") {
      yield { attrs: m[1] ?? "", cuerpo: "" };
      continue;
    }
    const ini = m.index + m[0].length;
    const fin = xml.indexOf(cierre, ini);
    if (fin === -1) {
      /* XML truncado: se devuelve lo que hay y se para. Mejor una fila
       * incompleta que la validación pueda rechazar que una excepción. */
      yield { attrs: m[1] ?? "", cuerpo: xml.slice(ini) };
      return;
    }
    yield { attrs: m[1] ?? "", cuerpo: xml.slice(ini, fin) };
    abre.lastIndex = fin + cierre.length;
  }
}

function atributo(attrs: string, nombre: string): string | null {
  return new RegExp(`\\s${nombre}="([^"]*)"`).exec(attrs)?.[1] ?? null;
}

/** Convierte "C7" en el índice de columna 2 (base 0). */
function columnaDeReferencia(ref: string): number {
  const letras = /^([A-Z]+)/.exec(ref)?.[1];
  if (!letras) return 0;
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function desescapar(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    /* El ampersand, el último: si se desescapara primero, un `&amp;lt;` del
     * archivo original acabaría convertido en `<`. */
    .replace(/&amp;/g, "&");
}

/** Todo el texto de un nodo, concatenando los `<t>` que lleve dentro. */
function textoDe(xml: string): string {
  const partes = [...elementos(xml, "t")].map((e) => e.cuerpo);
  return desescapar(partes.join(""));
}

/**
 * La tabla de cadenas compartidas.
 *
 * Excel no guarda el texto en la celda: lo mete aquí una sola vez y la celda
 * apunta con un índice (`t="s"`). Sin esto, un archivo hecho con Excel se lee
 * como una hoja llena de números.
 *
 * El orden es el índice, así que un `<si/>` vacío TIENE que ocupar su sitio:
 * saltárselo desplaza todas las cadenas posteriores y cruza los nombres con
 * los seriales sin que nada falle a la vista.
 */
function leerCadenasCompartidas(xml: string | null): string[] {
  if (!xml) return [];
  return [...elementos(xml, "si")].map((e) => textoDe(e.cuerpo));
}

function valorDeCelda(
  attrs: string,
  cuerpo: string,
  compartidas: string[],
): string {
  const tipo = atributo(attrs, "t");

  if (tipo === "inlineStr") return textoDe(cuerpo);

  const v = [...elementos(cuerpo, "v")][0]?.cuerpo;
  if (v == null) return "";

  if (tipo === "s") {
    const i = Number(v);
    return Number.isInteger(i) ? (compartidas[i] ?? "") : "";
  }
  /* Booleanos y errores se devuelven tal cual: no aparecen en una plantilla de
   * inventario, y si aparecen es mejor que la validación los rechace con su
   * valor a la vista que que se conviertan en algo que parezca correcto. */
  return desescapar(v);
}

export type HojaLeida = {
  /** La fila de encabezados: la primera que tiene algo. */
  encabezados: string[];
  /**
   * Las filas de datos, en posiciones ABSOLUTAS: `filas[i]` es la fila `i + 2`
   * de la hoja tal como se ve en Excel.
   *
   * Importa porque el informe de errores dice "fila 47" y quien lo lee abre el
   * archivo por la fila 47. Excel OMITE del XML las filas totalmente vacías,
   * así que numerarlas por orden de aparición desplaza todo lo que venga
   * después del primer hueco y manda al usuario a corregir la fila equivocada.
   * Los huecos se rellenan con filas vacías, que la validación ya sabe saltar.
   */
  filas: string[][];
};

/**
 * Extrae la primera hoja del libro.
 *
 * Lanza `ArchivoExcelInvalido` cuando el archivo no es un .xlsx que se pueda
 * leer, para que la pantalla pueda distinguir "esto no es un Excel" de "este
 * Excel tiene filas malas", que son dos problemas distintos y se arreglan de
 * forma distinta.
 */
export async function leerXlsx(archivo: Blob): Promise<HojaLeida> {
  let zip: JSZip;
  try {
    /* Se pasa el ArrayBuffer y no el Blob: la ruta de Blob de JSZip depende de
     * FileReader, que solo existe en el navegador, y eso deja la función sin
     * poder probarse fuera de él. Con el buffer se comporta igual en los dos
     * sitios. */
    zip = await JSZip.loadAsync(await archivo.arrayBuffer());
  } catch {
    throw new ArchivoExcelInvalido(
      "No se pudo abrir el archivo. Asegúrate de que sea un .xlsx (no un .csv ni un .xls antiguo).",
    );
  }

  /* La primera hoja por orden de nombre. El orden real vive en workbook.xml y
   * sus relaciones; para un libro de una sola hoja —que es lo que produce la
   * plantilla— seguir esa cadena solo añade sitios donde fallar. */
  const nombresHoja = Object.keys(zip.files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort();
  if (nombresHoja.length === 0) {
    throw new ArchivoExcelInvalido(
      "El archivo no contiene ninguna hoja de cálculo.",
    );
  }

  const [hojaXml, cadenasXml] = await Promise.all([
    zip.file(nombresHoja[0]!)!.async("string"),
    zip.file("xl/sharedStrings.xml")?.async("string") ?? Promise.resolve(null),
  ]);
  const compartidas = leerCadenasCompartidas(cadenasXml);

  /* `matriz[k]` es la fila `k + 1` de la hoja. Sparse a propósito: se rellena
   * por el atributo `r` de cada fila y de cada celda, nunca por el orden en
   * que aparecen. */
  const matriz: string[][] = [];
  let siguientePorOrden = 0;

  for (const filaXml of elementos(hojaXml, "row")) {
    const r = atributo(filaXml.attrs, "r");
    const indiceFila = r ? Number(r) - 1 : siguientePorOrden;
    siguientePorOrden = indiceFila + 1;
    if (!Number.isInteger(indiceFila) || indiceFila < 0) continue;

    const fila: string[] = [];
    let siguienteColumna = 0;
    for (const celdaXml of elementos(filaXml.cuerpo, "c")) {
      const ref = atributo(celdaXml.attrs, "r");
      const col = ref ? columnaDeReferencia(ref) : siguienteColumna;
      siguienteColumna = col + 1;
      while (fila.length < col) fila.push("");
      fila[col] = valorDeCelda(celdaXml.attrs, celdaXml.cuerpo, compartidas);
    }
    matriz[indiceFila] = fila;
  }

  const noVacia = (f: string[] | undefined) =>
    !!f && f.some((c) => c.trim().length > 0);

  const primeraConDatos = matriz.findIndex(noVacia);
  if (primeraConDatos === -1) {
    throw new ArchivoExcelInvalido("El archivo está vacío.");
  }

  const encabezados = (matriz[primeraConDatos] ?? []).map((c) => c.trim());
  const ancho = encabezados.length;

  /* La fila de encabezados se vacía en su sitio en vez de recortarse, para que
   * las posiciones absolutas del resto no se muevan. Todo lo que hubiera
   * encima ya está vacío por definición: es la PRIMERA con datos. */
  matriz[primeraConDatos] = [];

  /* Se recorta la cola vacía. Excel arrastra filas con formato y sin datos
   * hasta el final del rango usado, y contarlas gastaría el límite de filas de
   * la carga en filas que no existen para el usuario. Los huecos de en medio
   * sí se conservan: son los que sostienen la numeración. */
  let ultima = matriz.length - 1;
  while (ultima >= 0 && !noVacia(matriz[ultima])) ultima -= 1;

  /* `slice(1)`: se quita solo la fila 1 de la hoja, de modo que el índice `i`
   * del resultado corresponda exactamente a la fila `i + 2` de Excel. */
  return {
    encabezados,
    filas: Array.from({ length: Math.max(0, ultima) }, (_, i) => {
      const fila = matriz[i + 1] ?? [];
      const alineada = fila.slice(0, ancho);
      while (alineada.length < ancho) alineada.push("");
      return alineada;
    }),
  };
}
