/**
 * Los periodos que se pueden elegir al cargar facturas.
 *
 * La lista estaba escrita a mano —"2026-01" hasta "2026-08"— y el 1 de
 * septiembre dejo de poderse cargar el mes en curso. Una lista de fechas
 * tecleada caduca sola, sin avisar y siempre en el peor momento: cuando toca
 * facturar.
 *
 * Se genera a partir de hoy, asi que no vuelve a pasar.
 */

/** Un Date → "AAAA-MM". */
export function periodoDe(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
}

/** Suma (o resta) meses a un periodo "AAAA-MM". */
export function sumarMeses(periodo: string, meses: number): string {
  const [a, m] = periodo.split("-").map(Number);
  if (!a || !m) return periodo;
  /* Se pasa por Date para no tener que arreglar a mano el salto de diciembre
   * a enero, que es donde estas cuentas se equivocan. */
  return periodoDe(new Date(a, m - 1 + meses, 1));
}

/**
 * Los periodos elegibles, del mas viejo al mas nuevo.
 *
 * `haciaAtras` cubre las cargas tardias y las correcciones de meses pasados.
 * `haciaAdelante` es uno a proposito: quien factura el 30 de agosto la cuota
 * de septiembre tiene que poder escogerla, y ese es exactamente el borde en
 * el que la lista escrita a mano dejaba a la administracion tirada.
 */
export function periodosElegibles(
  hoy: Date = new Date(),
  haciaAtras = 18,
  haciaAdelante = 1,
): string[] {
  const actual = periodoDe(hoy);
  const salida: string[] = [];
  for (let i = -haciaAtras; i <= haciaAdelante; i++) {
    salida.push(sumarMeses(actual, i));
  }
  return salida;
}
