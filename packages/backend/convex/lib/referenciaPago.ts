/**
 * La referencia que ve el banco.
 *
 * Hasta ahora se enviaba el `numeroInterno` de la factura —el consecutivo que
 * heredamos del software contable: 11776—. Es unico, pero no dice nada: quien
 * abre el archivo de recaudo del banco ve una lista de numeros que no puede
 * cruzar con ninguna casa sin volver a la base de datos.
 *
 * Aqui se arma una referencia que se lee sola:
 *
 *     513202608   →   casa 513, periodo agosto de 2026
 *     31001202608 →   torre III apto 1001, agosto de 2026
 *
 * Dos reglas la gobiernan, y las dos vienen de afuera:
 *
 *  1. El manual de Aval (pag. 31) define InvoiceNum como `Number(50)`: SOLO
 *     digitos. Nada de guiones ni de "T-III", por legible que fuera.
 *
 *  2. Tiene que ser unica por factura. Si dos meses comparten referencia, la
 *     pasarela rechaza el segundo intento con error 27 —"transaccion en
 *     proceso"— y el archivo de recaudo del banco no permite distinguir cual
 *     de los dos meses se pago.
 *
 * De ahi el formato: unidad + periodo, con el periodo SIEMPRE al final y
 * SIEMPRE de seis digitos (AAAAMM). Esa longitud fija es lo que permite
 * leerla al reves sin ambiguedad, por larga que sea la parte de la unidad.
 */

/** Los seis digitos finales: AAAAMM. */
const LARGO_PERIODO = 6;

/**
 * Torres en romano.
 *
 * Arboleda las nombra "T-I".."T-IV" y los apartamentos se repiten entre
 * torres: hay 44 numeros que aparecen dos veces. Sin la torre la referencia
 * no identificaria una unidad, identificaria cuatro.
 */
const ROMANOS: Record<string, number> = {
  I: 1, II: 2, III: 3, IV: 4, V: 5,
  VI: 6, VII: 7, VIII: 8, IX: 9, X: 10,
};

/** "T-III" → 3 · "2" → 2 · "" → 0 (sin torre). */
export function numeroDeTorre(torre?: string | null): number {
  const t = (torre ?? "").trim().toUpperCase().replace(/^T[-\s.]*/, "");
  if (!t) return 0;
  if (ROMANOS[t] !== undefined) return ROMANOS[t]!;
  const digitos = t.replace(/\D/g, "");
  return digitos ? Number(digitos) : 0;
}

/**
 * La parte de la referencia que identifica la unidad.
 *
 * El apartamento se rellena a cuatro digitos cuando hay torre. Sin ese
 * relleno "T-I apto 1001" y "T-II apto 001" darian los dos 11001: el relleno
 * es lo que separa la torre del apartamento de forma fiable.
 */
export function claveUnidad(torre: string | null | undefined, numero: string): string {
  const apto = (numero ?? "").replace(/\D/g, "");
  const t = numeroDeTorre(torre);
  if (!apto) return "";
  return t > 0 ? `${t}${apto.padStart(4, "0")}` : String(Number(apto));
}

/** "2026-08" → "202608". Devuelve "" si no tiene la forma esperada. */
export function clavePeriodo(periodo: string): string {
  const d = (periodo ?? "").replace(/\D/g, "");
  return d.length === LARGO_PERIODO ? d : "";
}

/**
 * La referencia definitiva, o `null` si falta algo para construirla.
 *
 * Devuelve `null` en vez de inventarse algo a medias: quien llama decide el
 * respaldo (hoy, el `numeroInterno` de siempre). Una referencia incompleta
 * viajaria al banco sin que nadie se entere.
 */
export function referenciaPago(args: {
  torre?: string | null;
  numero: string;
  periodo: string;
}): string | null {
  const unidad = claveUnidad(args.torre, args.numero);
  const periodo = clavePeriodo(args.periodo);
  if (!unidad || !periodo) return null;
  return `${unidad}${periodo}`;
}

/**
 * El camino de vuelta: de la referencia del archivo de recaudo a la unidad.
 *
 * Existe para que conciliar un pago no dependa de tener la base de datos
 * delante, y para que las pruebas comprueben el formato de ida y de vuelta.
 */
export function descomponerReferencia(
  referencia: string,
): { unidad: string; periodo: string } | null {
  const d = (referencia ?? "").replace(/\D/g, "");
  if (d.length <= LARGO_PERIODO) return null;
  const periodo = d.slice(-LARGO_PERIODO);
  const mes = Number(periodo.slice(4));
  if (mes < 1 || mes > 12) return null;
  return {
    unidad: d.slice(0, -LARGO_PERIODO),
    periodo: `${periodo.slice(0, 4)}-${periodo.slice(4)}`,
  };
}

/** "Casa 513" · "Torre III apto 1001" — para el texto que ve quien paga. */
export function etiquetaUnidad(torre: string | null | undefined, numero: string): string {
  const t = numeroDeTorre(torre);
  const romano = Object.keys(ROMANOS).find((k) => ROMANOS[k] === t);
  return t > 0 ? `Torre ${romano ?? t} apto ${numero}` : `Casa ${numero}`;
}
