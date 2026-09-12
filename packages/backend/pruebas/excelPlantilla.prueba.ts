import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { construirXlsx } from "../../../apps/web/lib/excel-simple.ts";
import { leerXlsx } from "../../../apps/web/lib/excel-lectura.ts";
import {
  COLUMNAS_PLANTILLA,
  mapearColumnas,
} from "../convex/lib/inventario.ts";

/**
 * LA PLANTILLA DE LA CARGA MASIVA, DESPUES DE MAQUILLARLA.
 *
 * El archivo que se descarga se le puso bonito —cabecera oscura, anchos,
 * panel inmovilizado, area de escritura preformateada, globos de ayuda— y
 * todo eso vive en partes del .xlsx que el lector ignora. "Ignora" es una
 * afirmacion que hay que demostrar, no suponer: un estilo mal puesto no da
 * error, corre las columnas en silencio, que es justo el fallo que ya nos
 * mordio una vez con las celdas vacias autocerradas.
 *
 * Asi que esto es el round-trip completo y de verdad: se construye la MISMA
 * plantilla que descarga la pantalla —con el generador real, no con una copia
 * del XML— y se vuelve a leer con el lector real.
 */

const CABECERAS = COLUMNAS_PLANTILLA.map((c) => c.encabezado);
const EJEMPLO = COLUMNAS_PLANTILLA.map((c) => c.ejemplo);

/** La plantilla tal cual la arma `importar-dialog.tsx`. */
function opcionesDeLaPlantilla(filasVacias = 40) {
  return {
    nombreArchivo: "plantilla-inventario",
    hoja: "Inventario",
    encabezados: COLUMNAS_PLANTILLA.map((c) => ({
      encabezado: c.encabezado,
      requerida: c.requerida,
      ancho: 30,
      ayuda: `Ayuda de ${c.encabezado}`,
      ...(c.clave === "serial" ? { formato: "texto" as const } : {}),
    })),
    filas: [] as string[][],
    filasEjemplo: [EJEMPLO as unknown as string[]],
    filasVacias,
  };
}

async function comoBlob(opts: Parameters<typeof construirXlsx>[0]) {
  const bytes = await construirXlsx(opts);
  return new Blob([bytes as unknown as BlobPart]);
}

// ─────────────────────────────────────────────────────────────
// El round-trip
// ─────────────────────────────────────────────────────────────

test("la plantilla que se descarga se vuelve a leer entera", async () => {
  const hoja = await leerXlsx(await comoBlob(opcionesDeLaPlantilla()));

  /* Los encabezados llegan decorados, y esa es la gracia: el asterisco de
   * obligatorio es visible para quien abre el archivo e invisible para el
   * emparejamiento. */
  assert.equal(hoja.encabezados[0], "Nombre *");
  assert.deepEqual(mapearColumnas(hoja.encabezados), {
    nombre: 0,
    serial: 1,
    descripcion: 2,
    fotoUrl: 3,
  });
});

test("el asterisco empareja igual que el encabezado pelado", () => {
  assert.deepEqual(
    mapearColumnas(CABECERAS.map((h) => `${h} *`)),
    mapearColumnas(CABECERAS),
  );
});

test("la fila de ejemplo sigue siendo la fila 2 y con su contenido", async () => {
  const hoja = await leerXlsx(await comoBlob(opcionesDeLaPlantilla()));

  /* `filas[0]` es la fila 2 de Excel: el informe de errores dice "fila 2" y
   * quien lo lee abre el archivo por la fila 2. */
  assert.deepEqual(hoja.filas[0], EJEMPLO);
});

test("las 40 filas preformateadas no se cuelan como datos", async () => {
  const hoja = await leerXlsx(await comoBlob(opcionesDeLaPlantilla(40)));

  /* Si contaran, la carga vería 41 filas y el usuario recibiría cuarenta
   * "elemento sin nombre" por abrir la plantilla y no escribir nada. */
  assert.equal(hoja.filas.length, 1);
});

test("sin area preformateada el resultado es el mismo", async () => {
  const conArea = await leerXlsx(await comoBlob(opcionesDeLaPlantilla(40)));
  const sinArea = await leerXlsx(await comoBlob(opcionesDeLaPlantilla(0)));
  assert.deepEqual(conArea.encabezados, sinArea.encabezados);
  assert.deepEqual(conArea.filas, sinArea.filas);
});

test("lo que el usuario escribe debajo conserva su número de fila", async () => {
  /* Se simula la plantilla ya rellenada: el ejemplo borrado y datos a partir
   * de la fila 4, con la 3 en blanco. El lector tiene que devolver el hueco
   * para que "fila 5" siga siendo la fila 5 de Excel. */
  const hoja = await leerXlsx(
    await comoBlob({
      ...opcionesDeLaPlantilla(20),
      filasEjemplo: [],
      filas: [
        [],
        ["Radio A", "VK-1", "", ""],
        ["Radio B", "VK-2", "", ""],
      ],
    }),
  );

  assert.equal(hoja.filas.length, 3);
  assert.deepEqual(hoja.filas[0], ["", "", "", ""]);
  assert.deepEqual(hoja.filas[1], ["Radio A", "VK-1", "", ""]);
  assert.deepEqual(hoja.filas[2], ["Radio B", "VK-2", "", ""]);
});

test("una columna sin valor no corre a la siguiente", async () => {
  /* La regresión de siempre: la celda vacía ahora se escribe autocerrada
   * (`<c r="B2" s="7"/>`), que es exactamente la forma que rompía al lector
   * antiguo tragándose la celda siguiente. */
  const hoja = await leerXlsx(
    await comoBlob({
      ...opcionesDeLaPlantilla(0),
      filasEjemplo: [],
      filas: [["Radio", "", "Con descripción", "https://x.test/a.jpg"]],
    }),
  );
  assert.deepEqual(hoja.filas[0], [
    "Radio",
    "",
    "Con descripción",
    "https://x.test/a.jpg",
  ]);
});

// ─────────────────────────────────────────────────────────────
// El paquete
// ─────────────────────────────────────────────────────────────

/**
 * Comprueba que las etiquetas abren y cierran en orden.
 *
 * No es un validador de XSD —no lo hay aquí— pero coge lo que de verdad pasa
 * al escribir XML a mano: un bloque sin cerrar o cerrado fuera de sitio. Es
 * la diferencia entre un archivo que abre y el cartel de "Excel encontró
 * contenido ilegible".
 */
function etiquetasBalanceadas(xml: string): void {
  const sinDeclaracion = xml.replace(/<\?[^]*?\?>/g, "");
  const pila: string[] = [];
  const tag = /<(\/?)([A-Za-z_][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(sinDeclaracion)) !== null) {
    const [, cierra, nombre, , auto] = m;
    if (auto === "/") continue;
    if (cierra === "/") {
      const abierto = pila.pop();
      assert.equal(abierto, nombre, `</${nombre}> cierra a <${abierto}>`);
    } else {
      pila.push(nombre!);
    }
  }
  assert.deepEqual(pila, [], "quedaron etiquetas sin cerrar");
}

test("el libro trae las partes que Excel exige para los estilos", async () => {
  const zip = await JSZip.loadAsync(
    await construirXlsx(opcionesDeLaPlantilla()),
  );

  for (const parte of [
    "[Content_Types].xml",
    "_rels/.rels",
    "xl/workbook.xml",
    "xl/_rels/workbook.xml.rels",
    "xl/worksheets/sheet1.xml",
    "xl/styles.xml",
  ]) {
    assert.ok(zip.file(parte), `falta ${parte}`);
    etiquetasBalanceadas(await zip.file(parte)!.async("string"));
  }

  /* Una hoja de estilos sin declarar en [Content_Types] o sin relación desde
   * el libro es exactamente el archivo que Excel se ofrece a "reparar". */
  const tipos = await zip.file("[Content_Types].xml")!.async("string");
  assert.match(tipos, /PartName="\/xl\/styles\.xml"/);
  const rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  assert.match(rels, /Target="styles\.xml"/);
});

test("los dos primeros rellenos son los que Excel reserva", async () => {
  const zip = await JSZip.loadAsync(
    await construirXlsx(opcionesDeLaPlantilla()),
  );
  const estilos = await zip.file("xl/styles.xml")!.async("string");

  /* Regla del formato, no capricho: si el índice 0 no es `none` y el 1 no es
   * `gray125`, Excel pinta los rellenos corridos una posición y la cabecera
   * sale del color equivocado. */
  const fills = /<fills[^>]*>([^]*?)<\/fills>/.exec(estilos)?.[1] ?? "";
  const patrones = [...fills.matchAll(/patternType="([a-z0-9]+)"/g)].map(
    (m) => m[1],
  );
  assert.equal(patrones[0], "none");
  assert.equal(patrones[1], "gray125");
});

test("ningún estilo apunta fuera de la tabla", async () => {
  const zip = await JSZip.loadAsync(
    await construirXlsx(opcionesDeLaPlantilla()),
  );
  const estilos = await zip.file("xl/styles.xml")!.async("string");
  const hoja = await zip.file("xl/worksheets/sheet1.xml")!.async("string");

  const cellXfs = /<cellXfs[^>]*>([^]*?)<\/cellXfs>/.exec(estilos)?.[1] ?? "";
  const cuantos = [...cellXfs.matchAll(/<xf\b/g)].length;
  assert.ok(cuantos > 1, "no se generó ningún estilo");

  /* El `count` declarado tiene que cuadrar con los `<xf>` de dentro. */
  assert.match(estilos, new RegExp(`<cellXfs count="${cuantos}">`));

  for (const m of hoja.matchAll(/\ss="(\d+)"/g)) {
    assert.ok(
      Number(m[1]) < cuantos,
      `la celda apunta al estilo ${m[1]} y solo hay ${cuantos}`,
    );
  }
});

test("la cabecera queda inmovilizada y el area util anotada", async () => {
  const zip = await JSZip.loadAsync(
    await construirXlsx(opcionesDeLaPlantilla(40)),
  );
  const hoja = await zip.file("xl/worksheets/sheet1.xml")!.async("string");

  assert.match(hoja, /<pane ySplit="1"[^>]*state="frozen"\/>/);
  assert.match(hoja, /<col min="1" max="1" width="30"/);
  /* 1 cabecera + 1 ejemplo + 40 en blanco. */
  assert.match(hoja, /<dimension ref="A1:D42"\/>/);
  /* Los globos no validan nada: `type="none"`. Una regla de verdad aquí sería
   * una segunda fuente de verdad frente a la del servidor. */
  assert.match(hoja, /<dataValidation type="none"/);
  assert.doesNotMatch(hoja, /showErrorMessage="1"/);
});

test("sin filas de datos no se pone filtro", async () => {
  const zip = await JSZip.loadAsync(
    await construirXlsx(opcionesDeLaPlantilla()),
  );
  const hoja = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  /* Un desplegable de filtro sobre un formulario en blanco solo estorba. */
  assert.doesNotMatch(hoja, /<autoFilter/);
});

test("la exportación sí lleva filtro sobre el rango con datos", async () => {
  const zip = await JSZip.loadAsync(
    await construirXlsx({
      nombreArchivo: "inventario",
      hoja: "Inventario",
      encabezados: ["Nombre", "Serial"],
      filas: [
        ["Radio", "VK-1"],
        ["Linterna", "VK-2"],
      ],
    }),
  );
  const hoja = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  assert.match(hoja, /<autoFilter ref="A1:B3"\/>/);
});

// ─────────────────────────────────────────────────────────────
// Contenido que no debería tumbar el archivo
// ─────────────────────────────────────────────────────────────

test("los números siguen saliendo como números", async () => {
  const zip = await JSZip.loadAsync(
    await construirXlsx({
      nombreArchivo: "x",
      encabezados: ["Cosa", "Cuantas"],
      filas: [["Radio", 12]],
    }),
  );
  const hoja = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  assert.match(hoja, /<c r="B2"[^>]*><v>12<\/v><\/c>/);

  const leida = await leerXlsx(
    new Blob([
      (await construirXlsx({
        nombreArchivo: "x",
        encabezados: ["Cosa", "Cuantas"],
        filas: [["Radio", 12]],
      })) as unknown as BlobPart,
    ]),
  );
  assert.deepEqual(leida.filas[0], ["Radio", "12"]);
});

test("un carácter de control pegado desde fuera no rompe el libro", async () => {
  /* `\\x0b` es ilegal en XML 1.0. Antes se colaba tal cual y el archivo
   * entero no abría; ahora se cae el carácter invisible y no el libro. */
  const bytes = await construirXlsx({
    nombreArchivo: "x",
    encabezados: ["Nombre"],
    filas: [["Radio\u000BMotorola"]],
  });
  const hoja = await leerXlsx(new Blob([bytes as unknown as BlobPart]));
  assert.deepEqual(hoja.filas[0], ["RadioMotorola"]);
});

test("los signos que Excel no admite en el nombre de hoja se limpian", async () => {
  const zip = await JSZip.loadAsync(
    await construirXlsx({
      nombreArchivo: "x",
      hoja: "Inventario [2024]/enero",
      encabezados: ["Nombre"],
      filas: [["Radio"]],
    }),
  );
  const libro = await zip.file("xl/workbook.xml")!.async("string");
  assert.match(libro, /name="Inventario 2024 enero"/);
  /* El nombre saneado es el que tiene que ir también en Print_Titles: si no
   * coinciden, la fórmula apunta a una hoja que no existe. */
  assert.match(libro, /'Inventario 2024 enero'!\$1:\$1/);
});

test("un encabezado con signos no rompe el globo de ayuda", async () => {
  /* Dos fallos de verdad que hubo aquí: el título del globo se recortaba a 32
   * caracteres DESPUÉS de escapar —partiendo un `&amp;` por la mitad y
   * dejando el libro sin abrir— y el salto de línea del texto de ayuda se
   * perdía porque un atributo XML normaliza los saltos literales a espacios. */
  const largo = "Peso & medida en pulgadas del soporte lateral izquierdo";
  const zip = await JSZip.loadAsync(
    await construirXlsx({
      nombreArchivo: "x",
      hoja: "Inventario",
      encabezados: [
        {
          encabezado: largo,
          requerida: true,
          ayuda: "Primera línea\nSegunda línea",
        },
      ],
      filas: [["Radio"]],
    }),
  );
  const hoja = await zip.file("xl/worksheets/sheet1.xml")!.async("string");

  etiquetasBalanceadas(hoja);
  /* El recorte cae sobre el texto crudo, así que la entidad sale entera. */
  assert.match(hoja, /promptTitle="Obligatorio · Peso &amp; medida en p"/);
  assert.match(hoja, /prompt="Primera línea&#10;Segunda línea"/);
});

test("el titulo del globo respeta el tope de Excel", async () => {
  const zip = await JSZip.loadAsync(
    await construirXlsx({
      nombreArchivo: "x",
      encabezados: [
        { encabezado: "x".repeat(80), requerida: true, ayuda: "y".repeat(400) },
      ],
      filas: [["a"]],
    }),
  );
  const hoja = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  const titulo = /promptTitle="([^"]*)"/.exec(hoja)![1]!;
  const cuerpo = /prompt="([^"]*)"/.exec(hoja)![1]!;
  assert.equal(titulo.length, 32);
  assert.equal(cuerpo.length, 255);
});
