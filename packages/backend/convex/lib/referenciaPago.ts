/**
 * La referencia que ve el banco: el numero de la casa.
 *
 * Hasta ahora se enviaba el `numeroInterno` de la factura —el consecutivo que
 * heredamos del software contable: 11776—. Es unico, pero no dice nada: quien
 * abre el archivo de recaudo ve una lista de numeros que no puede cruzar con
 * ninguna casa sin volver a la base de datos.
 *
 * El numero de casa no lo elegimos nosotros: es lo que YA usa el convenio.
 * El portal publico del mismo conjunto pide "Numero de manzana y casa" y
 * muestra "Referencia: 409". Si por la API mandaramos otra cosa, el mismo
 * edificio llegaria al archivo de recaudo con dos numeraciones distintas
 * segun por donde pago cada residente, y conciliar seria imposible.
 *
 * El manual de Aval (pag. 31) define InvoiceNum como `Number(50)`: solo
 * digitos. Coincide con lo que pide el portal —"Solo se debe ingresar
 * informacion numerica"—, asi que la restriccion no estorba.
 *
 * QUE NO LLEVA, y por que: el periodo. La referencia dice QUIEN pago, no
 * CUANDO; el cuando lo pone la fecha del recaudo. El precio de esto es que
 * mientras una casa tenga una transaccion abierta, la pasarela rechaza la
 * siguiente de esa misma casa con error 27 hasta que la primera expire. El
 * portal del banco se comporta igual, y el residente ve un mensaje que se lo
 * explica en lugar de un codigo.
 */

/**
 * Torres en romano.
 *
 * Arboleda las nombra "T-I".."T-IV" y los apartamentos se repiten entre
 * torres: hay 44 numeros que aparecen dos veces. Sin la torre la referencia
 * no identificaria una unidad, identificaria cuatro. Ciudad del Campo son
 * casas sueltas y no entra por aqui.
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
 * La referencia, o `null` si la unidad no da un numero utilizable.
 *
 * Devuelve `null` en vez de inventarse algo: quien llama decide el respaldo
 * (hoy, el consecutivo contable de siempre). Una referencia a medias viajaria
 * al banco sin que nadie se entere.
 *
 * Donde hay torres, el apartamento se rellena a cuatro digitos. Sin ese
 * relleno "T-I apto 1001" y "T-II apto 001" darian los dos 11001.
 */
export function referenciaPago(args: {
  torre?: string | null;
  numero: string;
}): string | null {
  const apto = (args.numero ?? "").replace(/\D/g, "");
  if (!apto) return null;
  const t = numeroDeTorre(args.torre);
  return t > 0 ? `${t}${apto.padStart(4, "0")}` : String(Number(apto));
}

/** "Casa 513" · "Torre III apto 1001" — para el texto que ve quien paga. */
export function etiquetaUnidad(torre: string | null | undefined, numero: string): string {
  const t = numeroDeTorre(torre);
  const romano = Object.keys(ROMANOS).find((k) => ROMANOS[k] === t);
  return t > 0 ? `Torre ${romano ?? t} apto ${numero}` : `Casa ${numero}`;
}
