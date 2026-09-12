/**
 * Genera un .xlsx (Office Open XML) sin dependencias extra.
 * Usa JSZip, que ya está en el proyecto.
 *
 * Hermano de `excel-lectura.ts`, que solo lee. Lo que sale de aquí tiene que
 * poder volver a entrar por allí, y eso impone dos reglas que NO son
 * negociables por mucho que se quiera adornar el archivo:
 *
 *  1. La fila 1 son los encabezados y nada puede ir encima. El lector toma
 *     como encabezados «la primera fila con algo», así que un título, un
 *     logotipo o una nota de instrucciones sobre la tabla se leerían como los
 *     nombres de las columnas y la carga fallaría entera.
 *  2. El texto del encabezado es la llave del emparejamiento. Se puede
 *     decorar con lo que `normalizarEncabezado` descarta —espacios y signos,
 *     de ahí el asterisco de obligatorio— pero no cambiar la palabra.
 *
 * Todo lo demás —estilos, anchos, paneles inmovilizados, filtros, mensajes de
 * ayuda, área de escritura preformateada— vive en partes del formato que el
 * lector ignora por completo, y por eso se puede usar sin tocar la carga.
 */
import JSZip from "jszip";

// ─────────────────────────────────────────────────────────────
// Paleta
// ─────────────────────────────────────────────────────────────

/**
 * Los mismos tonos del producto, traducidos a ARGB.
 *
 * Salen de los tokens de `globals.css` (`--primary`, `--border`, `--muted`,
 * `--muted-foreground`): un gris de matiz verdoso muy desaturado. Se copian
 * como constantes porque un .xlsx se abre en Excel, donde no hay CSS, pero se
 * dejan anotados para que al retocar el tema se sepa que esto también existe.
 */
const COLOR = {
  /** `--primary`: casi negro. Cabecera de columna obligatoria. */
  tinta: "FF181B18",
  /** Un escalón más claro. Cabecera de columna opcional. */
  tintaSuave: "FF3F463F",
  /** `--muted-foreground`: el gris del texto secundario. */
  apagado: "FF606660",
  /** `--border`. */
  linea: "FFD9DDD9",
  /** `--muted`: el fondo del área que hay que diligenciar. */
  fondoSuave: "FFF9FAF9",
  blanco: "FFFFFFFF",
} as const;

/** Alto de la fila de encabezados, en puntos. */
const ALTO_ENCABEZADO = 30;
/** Ancho mínimo y máximo de una columna, en caracteres. */
const ANCHO_MIN = 12;
const ANCHO_MAX = 52;
/** Cuántas filas en blanco se preformatean si no se pide otra cosa. */
const FILAS_VACIAS_POR_DEFECTO = 0;

// ─────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────

export type Valor = string | number;

export type ColumnaXlsx = {
  /**
   * El texto de la cabecera.
   *
   * Es la llave con la que la carga empareja las columnas: no se puede
   * cambiar la palabra. El asterisco de obligatorio lo pone esta función, y
   * es seguro porque el emparejamiento descarta los signos.
   */
  encabezado: string;
  /** Ancho en caracteres. Si no se dice, se calcula a partir del contenido. */
  ancho?: number;
  /** Pinta la cabecera en el tono fuerte y le añade el asterisco. */
  requerida?: boolean;
  /**
   * Texto que Excel muestra en un globo al seleccionar una celda de esta
   * columna. Es `type="none"`: informa y no rechaza nada, así que no puede
   * entrar en conflicto con la validación real, que vive en el servidor.
   */
  ayuda?: string;
  alinear?: "izquierda" | "centro" | "derecha";
  /**
   * Fuerza formato de texto en la columna.
   *
   * Para los seriales: sin esto, alguien escribe `0012345` y Excel guarda
   * `12345`. El ceros a la izquierda no se recupera, y el serial deja de
   * casar con la etiqueta pegada en el aparato.
   */
  formato?: "texto";
};

export type OpcionesXlsx = {
  nombreArchivo: string;
  hoja?: string;
  /** Cadenas sueltas o columnas descritas; se pueden mezclar. */
  encabezados: readonly (string | ColumnaXlsx)[];
  filas: readonly Valor[][];
  /**
   * Filas de muestra, justo debajo de la cabecera y en cursiva gris.
   *
   * Se distinguen de `filas` solo por el estilo: para la carga son datos
   * normales, exactamente igual que antes. Lo que cambia es que quien abre la
   * plantilla ve de un vistazo que eso es un ejemplo y hay que reemplazarlo.
   */
  filasEjemplo?: readonly Valor[][];
  /**
   * Filas en blanco con el borde ya puesto, para que se vea dónde escribir.
   *
   * No afectan a la carga: el lector recorta la cola vacía justamente porque
   * Excel arrastra filas con formato y sin datos hasta el final del rango.
   */
  filasVacias?: number;
  /** Filtro desplegable en la cabecera. Por defecto, si hay datos. */
  autoFiltro?: boolean;
};

// ─────────────────────────────────────────────────────────────
// XML
// ─────────────────────────────────────────────────────────────

/**
 * Escapa para XML y tira los caracteres de control.
 *
 * Lo segundo importa en la exportación, no en la plantilla: una descripción
 * pegada desde un PDF puede traerse un `\x0b`, que es ilegal en XML 1.0 y
 * dejaría el archivo entero sin abrir. Mejor perder un carácter invisible que
 * el libro.
 */
function xmlEscape(s: string) {
  return s
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Escapa para un VALOR DE ATRIBUTO, que no es lo mismo que para texto.
 *
 * Un salto de línea dentro de un atributo es legal pero el parser lo
 * normaliza a un espacio, así que el globo de ayuda de dos líneas llegaría a
 * Excel aplastado en una. Como referencia de carácter sobrevive.
 */
function attrEscape(s: string) {
  return xmlEscape(s)
    .replace(/\r/g, "&#13;")
    .replace(/\n/g, "&#10;")
    .replace(/\t/g, "&#9;");
}

function colLetter(i: number) {
  let n = i;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function celda(ref: string, valor: Valor, estilo: number) {
  const s = estilo > 0 ? ` s="${estilo}"` : "";
  if (typeof valor === "number" && Number.isFinite(valor)) {
    return `<c r="${ref}"${s}><v>${valor}</v></c>`;
  }
  const texto = String(valor ?? "");
  /* Una celda vacía se escribe autocerrada, como hace Excel. El lector lo
   * soporta —fue justo el caso que lo rompía— y así el área preformateada no
   * infla el archivo con miles de `<is><t></t></is>`. */
  if (texto === "") return `<c r="${ref}"${s}/>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(texto)}</t></is></c>`;
}

/** Nombre de hoja admisible: Excel prohíbe `[]:*?/\` y más de 31 caracteres. */
function nombreDeHoja(bruto: string) {
  /* Los saltos de línea y tabuladores entran también: no son nombres de
   * hoja válidos, y colados en el atributo dejarían el libro sin abrir. */
  const limpio = bruto.replace(/[[\]:*?/\\\s]+/g, " ").trim();
  return (limpio || "Hoja1").slice(0, 31);
}

// ─────────────────────────────────────────────────────────────
// Hoja de estilos
// ─────────────────────────────────────────────────────────────

type ClaveEstilo = {
  fuente: 0 | 1 | 2;
  relleno: number;
  borde: 0 | 1 | 2;
  alinear: "izquierda" | "centro" | "derecha";
  ajustar?: boolean;
  texto?: boolean;
};

const HORIZONTAL = {
  izquierda: "left",
  centro: "center",
  derecha: "right",
} as const;

/**
 * Reparte índices de estilo bajo demanda.
 *
 * Se hace con un memo y no con una tabla fija porque las combinaciones
 * (tres alineaciones × cinco tipos de fila × formato de texto sí/no) se
 * multiplican rápido, y escribirlas todas a mano es la forma clásica de que
 * una celda acabe apuntando al índice equivocado.
 *
 * El orden de los bloques dentro de `styleSheet` —numFmts, fonts, fills,
 * borders, cellStyleXfs, cellXfs, cellStyles— es obligatorio: Excel no lo
 * reordena, lo rechaza.
 */
function hojaDeEstilos() {
  const xfs: string[] = [
    /* El 0 es el estilo por omisión del libro y tiene que quedarse donde
     * está: es al que apuntan las celdas sin `s`. */
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`,
  ];
  const memo = new Map<string, number>();

  function estilo(c: ClaveEstilo): number {
    const clave = `${c.fuente}|${c.relleno}|${c.borde}|${c.alinear}|${c.ajustar ? 1 : 0}|${c.texto ? 1 : 0}`;
    const ya = memo.get(clave);
    if (ya !== undefined) return ya;

    /* 49 es el formato incorporado `@`, o sea "texto". */
    const numFmtId = c.texto ? 49 : 0;
    const alineacion = `<alignment horizontal="${HORIZONTAL[c.alinear]}" vertical="center"${c.ajustar ? ' wrapText="1"' : ""}/>`;
    xfs.push(
      `<xf numFmtId="${numFmtId}" fontId="${c.fuente}" fillId="${c.relleno}" borderId="${c.borde}" xfId="0"` +
        ` applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">` +
        `${alineacion}</xf>`,
    );
    const i = xfs.length - 1;
    memo.set(clave, i);
    return i;
  }

  function xml() {
    const fuente = (extra: string, color: string) =>
      `<font>${extra}<sz val="11"/><color rgb="${color}"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>`;

    const solido = (rgb: string) =>
      `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;

    const lados = (rgb: string) =>
      ["left", "right", "top", "bottom"]
        .map((l) => `<${l} style="thin"><color rgb="${rgb}"/></${l}>`)
        .join("");

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    ${fuente("", COLOR.tinta)}
    ${fuente("<b/>", COLOR.blanco)}
    ${fuente("<i/>", COLOR.apagado)}
  </fonts>
  <fills count="5">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    ${solido(COLOR.tinta)}
    ${solido(COLOR.tintaSuave)}
    ${solido(COLOR.fondoSuave)}
  </fills>
  <borders count="3">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>${lados(COLOR.linea)}<diagonal/></border>
    <border>${lados(COLOR.tinta)}<diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;
  }

  return { estilo, xml };
}

// ─────────────────────────────────────────────────────────────
// Construcción del libro
// ─────────────────────────────────────────────────────────────

function normalizarColumnas(
  encabezados: readonly (string | ColumnaXlsx)[],
): ColumnaXlsx[] {
  return encabezados.map((h) =>
    typeof h === "string" ? { encabezado: h } : { ...h },
  );
}

/** Ancho a ojo: lo más largo que hay en la columna, con tope por los dos lados. */
function anchoDe(col: ColumnaXlsx, valores: Valor[]): number {
  if (col.ancho) return col.ancho;
  const largos = valores.map((v) => String(v ?? "").length);
  const cabecera = col.encabezado.length + (col.requerida ? 2 : 0);
  const mayor = Math.max(cabecera, ...(largos.length ? largos : [0]));
  return Math.min(ANCHO_MAX, Math.max(ANCHO_MIN, mayor + 3));
}

/**
 * Arma el .xlsx y devuelve sus bytes.
 *
 * Separado de `descargarXlsx` —que es solo el `<a download>`— para que se
 * pueda probar fuera del navegador: la prueba de regresión mete el resultado
 * directamente en `leerXlsx` y comprueba que la plantilla adornada se sigue
 * leyendo igual que la de antes.
 */
export async function construirXlsx(
  opts: OpcionesXlsx,
): Promise<Uint8Array> {
  const hoja = nombreDeHoja(opts.hoja ?? "Hoja1");
  const columnas = normalizarColumnas(opts.encabezados);
  const ejemplo = opts.filasEjemplo ?? [];
  const datos = opts.filas;
  const vacias = Math.max(0, opts.filasVacias ?? FILAS_VACIAS_POR_DEFECTO);
  const estilos = hojaDeEstilos();

  const ancho = columnas.length;
  const cuerpo = [...ejemplo, ...datos];

  /* Una columna es numérica si todo lo que lleva dentro son números. Sirve
   * para alinear a la derecha también su cabecera, que es lo que hace que una
   * tabla de cifras se lea. */
  const esNumerica = columnas.map((c, i) => {
    if (c.alinear || c.formato === "texto") return false;
    const vs = cuerpo.map((f) => f[i]).filter((v) => v !== "" && v != null);
    return vs.length > 0 && vs.every((v) => typeof v === "number");
  });

  const alineacionDe = (i: number): ColumnaXlsx["alinear"] =>
    columnas[i]?.alinear ?? (esNumerica[i] ? "derecha" : "izquierda");

  // ── Anchos ──────────────────────────────────────────────────
  const cols = columnas
    .map((c, i) => {
      const w = anchoDe(
        c,
        cuerpo.map((f) => f[i] ?? ""),
      );
      return `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
    })
    .join("");

  // ── Fila de encabezados ─────────────────────────────────────
  const celdasCabecera = columnas
    .map((c, i) => {
      const s = estilos.estilo({
        fuente: 1,
        relleno: c.requerida ? 2 : 3,
        borde: 2,
        alinear: alineacionDe(i)!,
        ajustar: true,
      });
      /* El asterisco es decoración pura: `normalizarEncabezado` tira espacios
       * y signos antes de emparejar, así que «Nombre *» y «Nombre» son la
       * misma columna para la carga. Hay prueba que lo fija. */
      const texto = c.requerida ? `${c.encabezado} *` : c.encabezado;
      return celda(`${colLetter(i)}1`, texto, s);
    })
    .join("");

  const filasXml: string[] = [
    `<row r="1" ht="${ALTO_ENCABEZADO}" customHeight="1">${celdasCabecera}</row>`,
  ];

  // ── Ejemplos, datos y área en blanco ────────────────────────
  const pintarFila = (
    valores: readonly Valor[],
    numero: number,
    tipo: "ejemplo" | "dato",
  ) => {
    const celdas = columnas
      .map((c, i) => {
        const v = valores[i] ?? "";
        const s = estilos.estilo({
          fuente: tipo === "ejemplo" ? 2 : 0,
          relleno: tipo === "ejemplo" ? 4 : 0,
          borde: 1,
          alinear: columnas[i]?.alinear ?? (typeof v === "number" ? "derecha" : alineacionDe(i)!),
          texto: c.formato === "texto",
        });
        return celda(`${colLetter(i)}${numero}`, v, s);
      })
      .join("");
    return `<row r="${numero}">${celdas}</row>`;
  };

  let fila = 2;
  for (const f of ejemplo) filasXml.push(pintarFila(f, fila++, "ejemplo"));
  for (const f of datos) filasXml.push(pintarFila(f, fila++, "dato"));

  const primeraVacia = fila;
  for (let k = 0; k < vacias; k += 1, fila += 1) {
    const celdas = columnas
      .map((c, i) =>
        celda(
          `${colLetter(i)}${fila}`,
          "",
          estilos.estilo({
            fuente: 0,
            relleno: 4,
            borde: 1,
            alinear: alineacionDe(i)!,
            texto: c.formato === "texto",
          }),
        ),
      )
      .join("");
    filasXml.push(`<row r="${fila}">${celdas}</row>`);
  }
  const ultimaFila = Math.max(1, fila - 1);
  const ultimaCol = colLetter(Math.max(0, ancho - 1));

  // ── Filtro ──────────────────────────────────────────────────
  const ultimaConDatos = 1 + ejemplo.length + datos.length;
  const conFiltro = opts.autoFiltro ?? datos.length > 0;
  const autoFilter =
    conFiltro && ancho > 0
      ? `<autoFilter ref="A1:${ultimaCol}${ultimaConDatos}"/>`
      : "";

  // ── Globos de ayuda ─────────────────────────────────────────
  /* `type="none"` con `showInputMessage`: Excel enseña el globo al entrar en
   * la celda y no valida nada. Deliberado — la validación de verdad está en
   * el servidor, y una regla duplicada aquí sería una segunda fuente de
   * verdad que envejece mal. */
  const conAyuda = columnas
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !!c.ayuda);
  const hasta = Math.max(ultimaFila, primeraVacia);
  const dataValidations = conAyuda.length
    ? `<dataValidations count="${conAyuda.length}">${conAyuda
        .map(({ c, i }) => {
          /* Los topes son de Excel: 32 caracteres de título y 255 de cuerpo.
           * Se recorta el texto CRUDO y se escapa después — al revés, un
           * corte a mitad de un `&amp;` deja el XML roto y el libro sin
           * abrir por un encabezado con una «y» comercial. */
          const titulo = ((c.requerida ? "Obligatorio · " : "") + c.encabezado)
            .slice(0, 32);
          const cuerpo = c.ayuda!.slice(0, 255);
          return `<dataValidation type="none" allowBlank="1" showInputMessage="1" showErrorMessage="0" promptTitle="${attrEscape(titulo)}" prompt="${attrEscape(cuerpo)}" sqref="${colLetter(i)}2:${colLetter(i)}${hasta}"/>`;
        })
        .join("")}</dataValidations>`
    : "";

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetPr><tabColor rgb="${COLOR.tinta}"/><pageSetUpPr fitToPage="1"/></sheetPr>
  <dimension ref="A1:${ultimaCol}${ultimaFila}"/>
  <sheetViews>
    <sheetView tabSelected="1" showGridLines="0" workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
      <selection pane="bottomLeft" activeCell="A2" sqref="A2"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${cols}</cols>
  <sheetData>${filasXml.join("")}</sheetData>
  ${autoFilter}
  ${dataValidations}
  <pageMargins left="0.4" right="0.4" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
  <pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;

  /* Repetir la cabecera en cada página al imprimir. Una plantilla de
   * inventario se imprime para llenarla a mano en la bodega, y sin esto la
   * segunda hoja es una rejilla sin nombres de columna. */
  const nombreEnFormula = hoja.replace(/'/g, "''");
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${attrEscape(hoja)}" sheetId="1" r:id="rId1"/>
  </sheets>
  <definedNames>
    <definedName name="_xlnm.Print_Titles" localSheetId="0">'${xmlEscape(nombreEnFormula)}'!$1:$1</definedName>
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
  /* Después de recorrer las celdas: los índices de estilo se reparten sobre
   * la marcha, así que la hoja de estilos solo está completa al final. */
  xl.file("styles.xml", estilos.xml());
  xl.folder("_rels")!.file("workbook.xml.rels", workbookRels);
  xl.folder("worksheets")!.file("sheet1.xml", sheet);

  /* `uint8array` y no `blob`: los bytes son los mismos y así la función sirve
   * igual en Node, donde corre la prueba de round-trip. */
  return zip.generateAsync({ type: "uint8array" });
}

export async function descargarXlsx(opts: OpcionesXlsx) {
  const bytes = await construirXlsx(opts);
  const blob = new Blob([bytes as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const nombre = opts.nombreArchivo.endsWith(".xlsx")
    ? opts.nombreArchivo
    : `${opts.nombreArchivo}.xlsx`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
}
