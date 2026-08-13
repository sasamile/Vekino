import { getDocumentProxy } from "unpdf";

/**
 * Texto de un PDF conservando la disposición en columnas.
 *
 * Reemplaza a `pdftotext -layout`, que funcionaba en el portátil y NO existe
 * en el servidor: Vercel corre las funciones en un contenedor sin poppler, y
 * subir facturas fallaba en producción con "pdftotext: command not found".
 *
 * El `-layout` no era un capricho: los parsers de facturas leen columnas
 * separadas por varios espacios (`/^\s*(\d{3})\s{2,}(.+)/`). Una extracción
 * normal devuelve las palabras en orden de lectura, sin separación, y esas
 * expresiones dejan de encontrar nada — o sea, no basta con sacar el texto:
 * hay que reconstruir la rejilla.
 *
 * Lo que se hace: cada fragmento de texto viene con su posición en la página.
 * Se agrupan por altura para formar renglones y dentro de cada renglón se
 * rellena con espacios hasta la columna que le toca, calculada con el ancho
 * medio de un carácter. Es lo mismo que hace poppler.
 */

/**
 * Ancho de un carácter, en puntos PDF.
 *
 * No es una estimación: sale de medir la misma factura con las dos
 * herramientas. `pdftotext -layout` deja "Codigo" en la columna 0, el código
 * de servicio en la 3 y el nombre del servicio en la 12; en el PDF esos
 * fragmentos están en x=31.8, x=44.2 y x=80.2. Las tres cuentas dan 4.05.
 *
 * Importa al carácter: el parser de la tabla busca el código dentro de los
 * cinco primeros caracteres (`/^\s{0,5}([1-7])\s{2,}/`). Con un ancho de 4.9
 * el código caía en la columna 9 y no encontraba una sola línea.
 */
const ANCHO_CARACTER = 4.05;

/** Dos fragmentos a menos de esto de diferencia vertical son el mismo renglón. */
const TOLERANCIA_RENGLON = 3;

type Fragmento = { x: number; y: number; texto: string };

export async function extraerTextoConLayout(
  pdfBytes: Uint8Array,
): Promise<string> {
  /* `getDocumentProxy` de unpdf trae una compilación de pdf.js pensada para
   * entornos sin navegador: no toca el DOM ni pide workers, que es lo que
   * rompe a pdf.js "normal" dentro de una función serverless. */
  const pdf = await getDocumentProxy(pdfBytes);
  const paginas: string[] = [];

  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const contenido = await pagina.getTextContent();

    const fragmentos: Fragmento[] = [];
    for (const item of contenido.items) {
      /* Los separadores de línea que mete pdf.js no traen posición y no
       * aportan nada: los renglones se deducen de las coordenadas. */
      if (!("str" in item) || !item.str) continue;
      const t = item.transform as number[];
      fragmentos.push({ x: t[4] ?? 0, y: t[5] ?? 0, texto: item.str });
    }

    /* El margen izquierdo pasa a ser la columna 0, como hace poppler. Sin
     * esto todo sale corrido hacia la derecha por el ancho del margen, y el
     * parser —que cuenta caracteres desde el principio de la línea— falla. */
    const margen = fragmentos.length
      ? Math.min(...fragmentos.map((f) => f.x))
      : 0;

    /* De arriba abajo (en PDF la Y crece hacia arriba) y de izquierda a
     * derecha, que es el orden en que se lee una factura. */
    fragmentos.sort((a, b) => b.y - a.y || a.x - b.x);

    const renglones: Fragmento[][] = [];
    for (const f of fragmentos) {
      const ultimo = renglones[renglones.length - 1];
      const mismaAltura =
        ultimo && Math.abs((ultimo[0]?.y ?? 0) - f.y) <= TOLERANCIA_RENGLON;
      if (mismaAltura) ultimo!.push(f);
      else renglones.push([f]);
    }

    const lineas = renglones.map((renglon) => {
      renglon.sort((a, b) => a.x - b.x);
      let linea = "";
      for (const f of renglon) {
        const columna = Math.round((f.x - margen) / ANCHO_CARACTER);
        /* Siempre al menos un espacio entre fragmentos: sin esto, dos celdas
         * pegadas de la tabla se fundirían en una sola palabra y el parser
         * leería "marzo811,000". */
        if (columna > linea.length) linea += " ".repeat(columna - linea.length);
        else if (linea.length > 0) linea += " ";
        linea += f.texto;
      }
      return linea.trimEnd();
    });

    paginas.push(lineas.join("\n"));
  }

  /* Salto de página como poppler: los parsers separan facturas por página. */
  return paginas.join("\n\f\n");
}
