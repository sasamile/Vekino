/**
 * Genera el .xlsx de un REPORTE: un bloque de resumen arriba y la tabla debajo.
 *
 * Hermano de `excel-simple.ts`, que no sirve para esto a propósito: aquel arma
 * plantillas que vuelven a entrar por la carga masiva, y por eso exige los
 * encabezados en la fila 1 sin nada encima. Un reporte no se vuelve a cargar
 * —se lee y se cuadra contra la caja—, así que aquí sí cabe un resumen arriba.
 *
 * De allá se reutilizan el escape de XML, las letras de columna, el nombre de
 * hoja y la paleta. Lo que cambia es la disposición, y que las cifras, fechas
 * y horas se escriben como valores de Excel y no como texto: un "$260.000"
 * escrito como texto no se puede sumar ni filtrar, que es justo lo que se hace
 * con un reporte.
 */
import JSZip from "jszip";
import { COLOR, colLetter, nombreDeHoja, xmlEscape } from "./excel-simple.ts";

// ─────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────

/**
 * Cómo se escribe una columna.
 *
 * `fecha` espera "AAAA-MM-DD" y `hora` "HH:MM". Si el valor no tiene esa forma
 * se escribe como texto tal cual: mejor una celda sin formato que un dato
 * inventado.
 */
export type TipoColumna = "texto" | "moneda" | "entero" | "fecha" | "hora";

/** `null` y `""` son celda vacía. */
export type ValorReporte = string | number | null;

export type ColumnaReporte = {
  encabezado: string;
  tipo?: TipoColumna;
  /** Ancho en caracteres. Si no se dice, se calcula a partir del contenido. */
  ancho?: number;
};

export type IndicadorReporte = {
  etiqueta: string;
  valor: number;
  tipo: "moneda" | "entero";
};

export type OpcionesXlsxReporte = {
  nombreArchivo: string;
  hoja?: string;
  resumen: {
    titulo: string;
    subtitulo?: string;
    indicadores: readonly IndicadorReporte[];
    /** Líneas en gris bajo el resumen, para decir de dónde sale cada cifra. */
    notas?: readonly string[];
  };
  tabla: {
    titulo: string;
    columnas: readonly ColumnaReporte[];
    filas: readonly (readonly ValorReporte[])[];
  };
};

// ─────────────────────────────────────────────────────────────
// Fechas y horas como números de Excel
// ─────────────────────────────────────────────────────────────

/**
 * Día cero del sistema 1900 de Excel.
 *
 * Es el 30 y no el 31 de diciembre porque Excel cuenta un 29 de febrero de
 * 1900 que no existió; desde marzo de 1900 en adelante, que es todo lo que
 * importa aquí, este origen da el serial exacto.
 */
const EPOCA_EXCEL = Date.UTC(1899, 11, 30);
const MS_POR_DIA = 86_400_000;

/** "2026-09-16" → 46281. `null` si no es una fecha real ("2026-02-30"). */
export function fechaASerialExcel(fecha: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return null;
  const y = Number(m[1]);
  const mes = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mes - 1, d);
  const f = new Date(ms);
  /* `Date.UTC` no rechaza el 30 de febrero: lo pasa al 2 de marzo. */
  if (f.getUTCFullYear() !== y || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== d) {
    return null;
  }
  return Math.round((ms - EPOCA_EXCEL) / MS_POR_DIA);
}

/** "10:30" → 0,4375 (fracción del día). `null` si no es una hora del día. */
export function horaAFraccionExcel(hora: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return (h * 60 + min) / 1440;
}

// ─────────────────────────────────────────────────────────────
// Hoja de estilos
// ─────────────────────────────────────────────────────────────

const ALTO_TITULO = 24;
const ALTO_ENCABEZADO = 30;
const ANCHO_MIN = 10;
const ANCHO_MAX = 50;

/** Formatos propios. Los ids por debajo de 164 son de Excel y no se definen. */
const FORMATO = {
  /* Pesos sin decimales. El separador de miles lo pone la configuración
   * regional de quien abre el archivo: en Colombia sale "$ 260.000". */
  moneda: { id: 164, codigo: `"$ "#,##0` },
  fecha: { id: 165, codigo: "yyyy-mm-dd" },
  hora: { id: 166, codigo: "hh:mm" },
} as const;
/** Incorporados: 3 es `#,##0` y 49 es `@` (texto). */
const FORMATO_ENTERO = 3;
const FORMATO_TEXTO = 49;

const FUENTE = { normal: 0, cabecera: 1, nota: 2, titulo: 3, negrita: 4 } as const;
const RELLENO = { ninguno: 0, tinta: 2, suave: 3 } as const;
const BORDE = { ninguno: 0, linea: 1 } as const;

function xf(
  numFmtId: number,
  fuente: number,
  relleno: number,
  borde: number,
  horizontal: "left" | "center" | "right",
  o: { ajustar?: boolean; arriba?: boolean } = {},
) {
  return (
    `<xf numFmtId="${numFmtId}" fontId="${fuente}" fillId="${relleno}" borderId="${borde}" xfId="0"` +
    ` applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">` +
    `<alignment horizontal="${horizontal}" vertical="${o.arriba ? "top" : "center"}"${o.ajustar ? ' wrapText="1"' : ""}/>` +
    `</xf>`
  );
}

/**
 * Los estilos que usa el reporte, por nombre.
 *
 * El índice de cada uno se deriva del orden de este objeto, en lugar de
 * escribirse a mano: así una celda no puede quedar apuntando al estilo de al
 * lado cuando alguien añada uno en medio.
 */
const XFS = {
  titulo: xf(0, FUENTE.titulo, RELLENO.ninguno, BORDE.ninguno, "left"),
  nota: xf(0, FUENTE.nota, RELLENO.ninguno, BORDE.ninguno, "left"),
  cabecera: xf(0, FUENTE.cabecera, RELLENO.tinta, BORDE.linea, "left", { ajustar: true }),
  cabeceraCentro: xf(0, FUENTE.cabecera, RELLENO.tinta, BORDE.linea, "center", { ajustar: true }),
  cabeceraDerecha: xf(0, FUENTE.cabecera, RELLENO.tinta, BORDE.linea, "right", { ajustar: true }),
  texto: xf(FORMATO_TEXTO, FUENTE.normal, RELLENO.ninguno, BORDE.linea, "left", { ajustar: true, arriba: true }),
  moneda: xf(FORMATO.moneda.id, FUENTE.normal, RELLENO.ninguno, BORDE.linea, "right", { arriba: true }),
  entero: xf(FORMATO_ENTERO, FUENTE.normal, RELLENO.ninguno, BORDE.linea, "right", { arriba: true }),
  fecha: xf(FORMATO.fecha.id, FUENTE.normal, RELLENO.ninguno, BORDE.linea, "center", { arriba: true }),
  hora: xf(FORMATO.hora.id, FUENTE.normal, RELLENO.ninguno, BORDE.linea, "center", { arriba: true }),
  indicador: xf(0, FUENTE.negrita, RELLENO.suave, BORDE.linea, "left"),
  indicadorMoneda: xf(FORMATO.moneda.id, FUENTE.negrita, RELLENO.ninguno, BORDE.linea, "right"),
  indicadorEntero: xf(FORMATO_ENTERO, FUENTE.negrita, RELLENO.ninguno, BORDE.linea, "right"),
};
type NombreEstilo = keyof typeof XFS;
const NOMBRES_ESTILO = Object.keys(XFS) as NombreEstilo[];
/* +1: el 0 es el estilo por omisión del libro y tiene que quedarse primero. */
const E = Object.fromEntries(NOMBRES_ESTILO.map((k, i) => [k, i + 1])) as Record<NombreEstilo, number>;

const ESTILO_DATO: Record<TipoColumna, number> = {
  texto: E.texto,
  moneda: E.moneda,
  entero: E.entero,
  fecha: E.fecha,
  hora: E.hora,
};

function estilosXml() {
  const fuente = (extra: string, tamano: number, color: string) =>
    `<font>${extra}<sz val="${tamano}"/><color rgb="${color}"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>`;
  const solido = (rgb: string) =>
    `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
  const lados = ["left", "right", "top", "bottom"]
    .map((l) => `<${l} style="thin"><color rgb="${COLOR.linea}"/></${l}>`)
    .join("");
  const formatos = Object.values(FORMATO)
    .map((f) => `<numFmt numFmtId="${f.id}" formatCode="${xmlEscape(f.codigo)}"/>`)
    .join("");

  /* El orden de los bloques —numFmts, fonts, fills, borders, cellStyleXfs,
   * cellXfs, cellStyles— es obligatorio: Excel no lo reordena, lo rechaza. */
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="${Object.keys(FORMATO).length}">${formatos}</numFmts>
  <fonts count="5">
    ${fuente("", 11, COLOR.tinta)}
    ${fuente("<b/>", 11, COLOR.blanco)}
    ${fuente("<i/>", 10, COLOR.apagado)}
    ${fuente("<b/>", 14, COLOR.tinta)}
    ${fuente("<b/>", 11, COLOR.tinta)}
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    ${solido(COLOR.tinta)}
    ${solido(COLOR.fondoSuave)}
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>${lados}<diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="${NOMBRES_ESTILO.length + 1}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>${NOMBRES_ESTILO.map((k) => XFS[k]).join("")}</cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;
}

// ─────────────────────────────────────────────────────────────
// Celdas
// ─────────────────────────────────────────────────────────────

function celda(ref: string, valor: ValorReporte, estilo: number) {
  const s = ` s="${estilo}"`;
  if (valor == null || valor === "") return `<c r="${ref}"${s}/>`;
  if (typeof valor === "number") {
    return Number.isFinite(valor) ? `<c r="${ref}"${s}><v>${valor}</v></c>` : `<c r="${ref}"${s}/>`;
  }
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(valor)}</t></is></c>`;
}

/** Convierte el valor según la columna. Lo que no encaja se deja como texto. */
function aCelda(tipo: TipoColumna, v: ValorReporte): { valor: ValorReporte; estilo: number } {
  const estilo = ESTILO_DATO[tipo];
  if (v == null || v === "") return { valor: null, estilo };
  if (tipo === "fecha" || tipo === "hora") {
    if (typeof v === "number") return { valor: v, estilo };
    const n = tipo === "fecha" ? fechaASerialExcel(v) : horaAFraccionExcel(v);
    return n == null ? { valor: v, estilo: E.texto } : { valor: n, estilo };
  }
  if (tipo === "moneda" || tipo === "entero") {
    return typeof v === "number" ? { valor: v, estilo } : { valor: v, estilo: E.texto };
  }
  return { valor: String(v), estilo };
}

/** Cuántos caracteres ocupa el valor ya formateado, para el ancho a ojo. */
function largoDe(tipo: TipoColumna, v: ValorReporte): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && (tipo === "moneda" || tipo === "entero")) {
    const digitos = String(Math.trunc(Math.abs(v))).length;
    return digitos + Math.floor((digitos - 1) / 3) + (tipo === "moneda" ? 2 : 0) + (v < 0 ? 1 : 0);
  }
  if (tipo === "fecha") return 10;
  if (tipo === "hora") return 5;
  return String(v)
    .split("\n")
    .reduce((max, linea) => Math.max(max, linea.length), 0);
}

/** Varias celdas con el mismo estilo; solo la primera lleva el valor (para combinar). */
function tramo(fila: number, desde: number, hasta: number, valor: ValorReporte, estilo: number) {
  let xml = "";
  for (let i = desde; i <= hasta; i += 1) {
    xml += celda(`${colLetter(i)}${fila}`, i === desde ? valor : null, estilo);
  }
  return xml;
}

// ─────────────────────────────────────────────────────────────
// Construcción del libro
// ─────────────────────────────────────────────────────────────

/**
 * Arma el .xlsx y devuelve sus bytes.
 *
 * Separado de `descargarXlsxReporte` para poder probarlo fuera del navegador.
 */
export async function construirXlsxReporte(opts: OpcionesXlsxReporte): Promise<Uint8Array> {
  const hoja = nombreDeHoja(opts.hoja ?? "Reporte");
  const { columnas, filas } = opts.tabla;
  const { indicadores } = opts.resumen;

  /* La etiqueta del indicador ocupa las primeras columnas combinadas y el
   * valor va en la siguiente. Se combinan porque la primera columna de la
   * tabla es una fecha, estrecha, y "Alquiler pactado estimado" no cabe. */
  const tramoEtiqueta = Math.max(1, Math.min(3, columnas.length - 1));
  const colValor = tramoEtiqueta;

  // ── Anchos ──────────────────────────────────────────────────
  const anchos = columnas.map((c, i) => {
    if (c.ancho) return c.ancho;
    const tipo = c.tipo ?? "texto";
    const contenido = filas.reduce((max, f) => Math.max(max, largoDe(tipo, f[i] ?? null)), 0);
    return Math.min(ANCHO_MAX, Math.max(ANCHO_MIN, c.encabezado.length + 2, contenido + 2));
  });
  while (anchos.length <= colValor) anchos.push(ANCHO_MIN);

  const etiquetaMax = indicadores.reduce((max, ind) => Math.max(max, ind.etiqueta.length), "Indicador".length) + 4;
  const anchoEtiqueta = anchos.slice(0, tramoEtiqueta).reduce((s, w) => s + w, 0);
  if (anchoEtiqueta < etiquetaMax) {
    anchos[tramoEtiqueta - 1] = (anchos[tramoEtiqueta - 1] ?? 0) + (etiquetaMax - anchoEtiqueta);
  }
  const valorMax = indicadores.reduce((max, ind) => Math.max(max, largoDe(ind.tipo, ind.valor)), "Valor".length) + 4;
  anchos[colValor] = Math.max(anchos[colValor] ?? 0, valorMax);

  const cols = anchos
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("");

  // ── Filas ───────────────────────────────────────────────────
  const filasXml: string[] = [];
  const combinadas: string[] = [];
  let n = 1;
  const agregar = (celdas: string, alto?: number) => {
    const ht = alto ? ` ht="${alto}" customHeight="1"` : "";
    filasXml.push(`<row r="${n}"${ht}>${celdas}</row>`);
    n += 1;
  };
  const combinarEtiqueta = () => {
    if (tramoEtiqueta > 1) combinadas.push(`A${n}:${colLetter(tramoEtiqueta - 1)}${n}`);
  };

  // Resumen
  agregar(celda(`A${n}`, opts.resumen.titulo, E.titulo), ALTO_TITULO);
  if (opts.resumen.subtitulo) agregar(celda(`A${n}`, opts.resumen.subtitulo, E.nota));
  combinarEtiqueta();
  agregar(
    tramo(n, 0, tramoEtiqueta - 1, "Indicador", E.cabecera) +
      celda(`${colLetter(colValor)}${n}`, "Valor", E.cabeceraDerecha),
    ALTO_ENCABEZADO,
  );
  for (const ind of indicadores) {
    combinarEtiqueta();
    agregar(
      tramo(n, 0, tramoEtiqueta - 1, ind.etiqueta, E.indicador) +
        celda(`${colLetter(colValor)}${n}`, ind.valor, ind.tipo === "moneda" ? E.indicadorMoneda : E.indicadorEntero),
    );
  }
  for (const nota of opts.resumen.notas ?? []) agregar(celda(`A${n}`, nota, E.nota));

  // Una fila en blanco separa el resumen de la tabla.
  n += 1;

  // Tabla
  agregar(celda(`A${n}`, opts.tabla.titulo, E.titulo), ALTO_TITULO);
  const filaCabecera = n;
  agregar(
    columnas
      .map((c, i) => {
        const tipo = c.tipo ?? "texto";
        const estilo =
          tipo === "moneda" || tipo === "entero"
            ? E.cabeceraDerecha
            : tipo === "fecha" || tipo === "hora"
              ? E.cabeceraCentro
              : E.cabecera;
        return celda(`${colLetter(i)}${n}`, c.encabezado, estilo);
      })
      .join(""),
    ALTO_ENCABEZADO,
  );
  for (const f of filas) {
    agregar(
      columnas
        .map((c, i) => {
          const { valor, estilo } = aCelda(c.tipo ?? "texto", f[i] ?? null);
          return celda(`${colLetter(i)}${n}`, valor, estilo);
        })
        .join(""),
    );
  }
  const ultimaFila = n - 1;
  const ultimaCol = colLetter(anchos.length - 1);
  const ultimaColTabla = colLetter(Math.max(0, columnas.length - 1));

  // ── Filtro y combinadas ─────────────────────────────────────
  const rangoTabla = `$A$${filaCabecera}:$${ultimaColTabla}$${ultimaFila}`;
  const conFiltro = filas.length > 0 && columnas.length > 0;
  const autoFilter = conFiltro
    ? `<autoFilter ref="A${filaCabecera}:${ultimaColTabla}${ultimaFila}"/>`
    : "";
  const mergeCells = combinadas.length
    ? `<mergeCells count="${combinadas.length}">${combinadas.map((r) => `<mergeCell ref="${r}"/>`).join("")}</mergeCells>`
    : "";

  /* El orden de los hijos de <worksheet> también es obligatorio: autoFilter
   * antes que mergeCells, y los dos antes de los márgenes. */
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetPr><tabColor rgb="${COLOR.tinta}"/><pageSetUpPr fitToPage="1"/></sheetPr>
  <dimension ref="A1:${ultimaCol}${ultimaFila}"/>
  <sheetViews>
    <sheetView tabSelected="1" showGridLines="0" workbookViewId="0">
      <selection activeCell="A1" sqref="A1"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${cols}</cols>
  <sheetData>${filasXml.join("")}</sheetData>
  ${autoFilter}
  ${mergeCells}
  <pageMargins left="0.4" right="0.4" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
  <pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;

  /* Al imprimir se repite la cabecera de la tabla en cada página. */
  const enFormula = `'${xmlEscape(hoja.replace(/'/g, "''"))}'`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${xmlEscape(hoja)}" sheetId="1" r:id="rId1"/>
  </sheets>
  <definedNames>
    ${conFiltro ? `<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${enFormula}!${rangoTabla}</definedName>` : ""}
    <definedName name="_xlnm.Print_Titles" localSheetId="0">${enFormula}!$${filaCabecera}:$${filaCabecera}</definedName>
  </definedNames>
</workbook>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypes);
  zip.folder("_rels")!.file(".rels", rels);
  const xl = zip.folder("xl")!;
  xl.file("workbook.xml", workbook);
  xl.file("styles.xml", estilosXml());
  xl.folder("_rels")!.file("workbook.xml.rels", workbookRels);
  xl.folder("worksheets")!.file("sheet1.xml", sheet);

  return zip.generateAsync({ type: "uint8array" });
}

export async function descargarXlsxReporte(opts: OpcionesXlsxReporte) {
  const bytes = await construirXlsxReporte(opts);
  const blob = new Blob([bytes as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const nombre = opts.nombreArchivo.endsWith(".xlsx") ? opts.nombreArchivo : `${opts.nombreArchivo}.xlsx`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
}
