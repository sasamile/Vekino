/**
 * Lectura de cuentas de cobro: lo que tiene que cumplir un documento para que
 * sus números entren a Vekino como ciertos.
 *
 * ── Por qué existe ───────────────────────────────────────────────────────
 * Vekino no calcula deudas: las copia del PDF que emite la contabilidad de
 * cada conjunto. Si el PDF se lee mal, falla todo lo que depende de él —el
 * estado de la factura anterior, la mora, lo que ve el residente— y nadie se
 * entera. Así pasó con los saldos a favor de Ciudad del Campo, que se leían
 * como $0, y con los totales que no se encontraban, que también quedaban en
 * $0 (auditoría de facturación, F-04 y F-15).
 *
 * La regla de aquí es una sola y la usan los dos lados: el parser de la web
 * (para avisar en la vista previa) y `facturas.bulkUpsert` (para no confiar a
 * ciegas en lo que mande el navegador). Un documento que no cuadra no se
 * guarda como cierto: entra marcado, con sus motivos, y no se puede pagar ni
 * juzgar con él hasta que la administración lo revise.
 *
 * Sin dependencias: se prueba con `node`, sin base de datos.
 */

// ─────────────────────────────────────────────────────────────
// Montos
// ─────────────────────────────────────────────────────────────

/**
 * Un monto como lo imprime Ciudad del Campo: miles con punto y dos decimales
 * también con punto. `10.097.050.00`, `-760.000.00`, `$-400.000.00`,
 * `500.00`. Los negativos son saldos a favor y créditos.
 *
 * `null` si el texto no es un monto en ese formato: quien llama decide qué
 * hacer, pero nunca se convierte en 0 por las buenas.
 */
export function leerMontoCdc(texto: string): number | null {
  const m = texto.trim().match(/^(-)?\$?\s*(-)?\s*(\d{1,3}(?:\.\d{3})*)\.(\d{2})$/);
  if (!m) return null;
  const valor = Number((m[3] ?? "").replace(/\./g, "")) + Number(m[4]) / 100;
  return m[1] || m[2] ? -valor : valor;
}

/**
 * Un monto como lo imprime Arboleda: enteros con miles separados por coma, y
 * los negativos entre paréntesis, como en contabilidad. `15,760`, `0`,
 * `$15,760`, `$(376,000)`, `(1,234,567)`. Se acepta también un signo menos.
 *
 * `null` si el texto no es un monto en ese formato.
 */
export function leerMontoArboleda(texto: string): number | null {
  let t = texto.trim().replace(/^\$\s*/, "");
  let negativo = false;
  if (/^\(.*\)$/.test(t)) {
    negativo = true;
    t = t.slice(1, -1).trim().replace(/^\$\s*/, "");
  }
  if (t.startsWith("-")) {
    negativo = !negativo;
    t = t.slice(1).trim();
  }
  if (!/^\d{1,3}(?:,\d{3})*$/.test(t)) return null;
  const valor = Number(t.replace(/,/g, ""));
  return negativo ? -valor : valor;
}

// ─────────────────────────────────────────────────────────────
// Período
// ─────────────────────────────────────────────────────────────

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
] as const;

/** `AAAA-MM`, el formato de `facturas.periodo`. */
export const PERIODO_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/;

function sinTildes(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * El número de mes de un nombre en español: completo (`septiembre`,
 * `setiembre`) o abreviado como en la "Fecha" de Ciudad del Campo (`Septi`,
 * `Agost`, `Febre`). La abreviatura tiene que tener al menos 3 letras y no
 * puede ser ambigua.
 */
function mesDe(token: string): number | null {
  const t = sinTildes(token.toLowerCase()).replace(/\./g, "").trim();
  if (t.length < 3) return null;
  if (t.startsWith("set")) return 9;
  const candidatos = MESES.filter((m) => m.startsWith(t));
  return candidatos.length === 1 ? MESES.indexOf(candidatos[0]!) + 1 : null;
}

/**
 * El período (`AAAA-MM`) que declara la etiqueta del propio documento.
 *
 *   "Septiembre / 2026"   → 2026-09  (Ciudad del Campo, fila del mes)
 *   "01-septiembre-2026"  → 2026-09  (Arboleda, campo "Periodo:")
 *   "Septi. 01 / 2026"    → 2026-09  (Ciudad del Campo, campo "Fecha")
 *
 * `null` si el texto no tiene forma de período: nunca se adivina.
 */
export function normalizarPeriodo(etiqueta: string): string | null {
  const s = etiqueta.trim();
  const m =
    s.match(/^([A-Za-zÁÉÍÓÚáéíóúñÑ.]+)\s*\/\s*(\d{4})$/) ??
    s.match(/^\d{1,2}-([A-Za-zÁÉÍÓÚáéíóúñÑ]+)-(\d{4})$/) ??
    s.match(/^([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\.?\s+\d{1,2}\s*\/\s*(\d{4})$/);
  if (!m) return null;
  const mes = mesDe(m[1] ?? "");
  if (!mes) return null;
  return `${m[2]}-${String(mes).padStart(2, "0")}`;
}

/** "Septiembre / 2026" a partir de `2026-09`: la etiqueta canónica de un período. */
export function etiquetaDePeriodo(periodo: string): string {
  const [a, m] = periodo.split("-");
  const nombre = MESES[Number(m) - 1] ?? "";
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} / ${a}`;
}

// ─────────────────────────────────────────────────────────────
// Cuadre y motivos
// ─────────────────────────────────────────────────────────────

/** Pesos de diferencia que se toleran por redondeo. La misma de la conciliación. */
export const TOLERANCIA_CUADRE = 1;

/**
 * Por qué una lectura no se puede tomar como cierta. Códigos estables: se
 * guardan en la factura (`lecturaDudosa.motivos`) y la pantalla los traduce
 * con `MENSAJE_LECTURA`.
 */
export type MotivoLectura =
  | "total_no_leido"
  | "sin_lineas"
  | "lineas_no_cuadran"
  | "saldo_anterior_no_cuadra"
  | "totales_no_cuadran"
  | "periodo_no_leido"
  | "pagina_de_continuacion"
  | "formato_desconocido";

export const MENSAJE_LECTURA: Readonly<Record<MotivoLectura, string>> = {
  total_no_leido: "No se encontró el total a pagar en el documento.",
  sin_lineas: "El documento no trae filas de conceptos.",
  lineas_no_cuadran: "Las líneas no suman el total del documento.",
  saldo_anterior_no_cuadra:
    "El saldo anterior de las líneas no coincide con el de la fila Totales.",
  totales_no_cuadran: "La fila Totales no coincide con el total a pagar.",
  periodo_no_leido: "No se pudo leer el período del documento.",
  pagina_de_continuacion:
    "El documento empieza en una hoja de continuación: falta la primera hoja.",
  formato_desconocido: "El documento no tiene el formato de una cuenta de cobro conocida.",
};

const MOTIVOS: ReadonlySet<string> = new Set(Object.keys(MENSAJE_LECTURA));

/** Solo los códigos conocidos, sin repetir, en un orden estable. */
export function motivosValidos(motivos: readonly string[]): MotivoLectura[] {
  return [...new Set(motivos.filter((m) => MOTIVOS.has(m)))].sort() as MotivoLectura[];
}

/**
 * Lo que se comprueba con los números de la factura, sin el PDF: lo puede
 * repetir el backend con lo que le llega.
 *
 *   · hay filas de conceptos;
 *   · Σ líneas.total = total a pagar (±1);
 *   · Σ líneas.saldoAnterior = saldo anterior del documento (fila Totales),
 *     cuando el documento lo trae;
 *   · la etiqueta del período tiene forma de período.
 *
 * Lo que solo se ve en el PDF (que el total no estaba, que la fila Totales no
 * coincide con "Pague sin descuento", que el documento empieza en una hoja de
 * continuación) lo agrega el parser.
 */
export function validarLectura(f: {
  totalAPagar: number;
  lineas: readonly { saldoAnterior: number; total: number }[];
  saldoAnteriorDocumento?: number;
  periodoLabel: string;
}): MotivoLectura[] {
  const motivos: MotivoLectura[] = [];
  const suma = (campo: "saldoAnterior" | "total") =>
    f.lineas.reduce((s, l) => s + l[campo], 0);
  if (f.lineas.length === 0) motivos.push("sin_lineas");
  else if (Math.abs(suma("total") - f.totalAPagar) > TOLERANCIA_CUADRE) {
    motivos.push("lineas_no_cuadran");
  }
  if (
    f.saldoAnteriorDocumento !== undefined &&
    f.lineas.length > 0 &&
    Math.abs(suma("saldoAnterior") - f.saldoAnteriorDocumento) > TOLERANCIA_CUADRE
  ) {
    motivos.push("saldo_anterior_no_cuadra");
  }
  if (normalizarPeriodo(f.periodoLabel) === null) motivos.push("periodo_no_leido");
  return motivosValidos(motivos);
}

/**
 * Por qué una factura NO se guarda. A diferencia de los motivos de lectura,
 * aquí no hay duda que revisar: guardarla sería guardar algo que el propio
 * documento contradice.
 */
export type MotivoRechazo =
  | "periodo_no_coincide"
  | "periodo_invalido"
  | "unidad_ajena"
  | "documento_repetido"
  | "factura_duplicada";

export const MENSAJE_RECHAZO: Readonly<Record<MotivoRechazo, string>> = {
  periodo_no_coincide: "El período del documento no coincide con el período elegido.",
  periodo_invalido: "El período elegido no tiene la forma AAAA-MM.",
  unidad_ajena: "La unidad no pertenece a este conjunto.",
  /* Ciudad del Campo, septiembre de 2026: el PDF consolidado traía dos
   * estados de cuenta para la misma casa. Guardar uno —el que llegara
   * primero— es adivinar; se rechazan los dos y se revisa con la contabilidad. */
  documento_repetido:
    "El PDF trae más de un documento para esta unidad en el mismo período. Revísalo con la contabilidad.",
  factura_duplicada:
    "La unidad ya tiene más de una factura de este período. La administración debe revisarlas.",
};

/**
 * Por qué se rechaza una factura por su identidad, o `null` si se puede
 * guardar. La etiqueta que no se puede leer no rechaza: deja la factura en
 * revisión (`periodo_no_leido`), para no dejar a la unidad sin la factura del
 * período.
 */
export function rechazoDePeriodo(periodo: string, periodoLabel: string): MotivoRechazo | null {
  if (!PERIODO_VALIDO.test(periodo)) return "periodo_invalido";
  const delDocumento = normalizarPeriodo(periodoLabel);
  if (delDocumento !== null && delDocumento !== periodo) return "periodo_no_coincide";
  return null;
}

/**
 * El estado con el que entra una factura cuya lectura es cierta.
 *
 * `saldo_a_favor` si el total es negativo, o si es cero y el documento trae
 * saldo a favor; `pendiente` en otro caso. Una factura en revisión entra
 * siempre `pendiente`: sus números no son confiables para decidir otra cosa.
 */
export function estadoDeCarga(f: {
  totalAPagar: number;
  saldoAFavor: number;
}): "pendiente" | "saldo_a_favor" {
  return f.totalAPagar < 0 || (f.totalAPagar <= 0 && f.saldoAFavor > 0)
    ? "saldo_a_favor"
    : "pendiente";
}

/**
 * El numero de una factura NUEVA: "FAC-2026-10-104" (Fase 4, F-17).
 *
 * Antes era la posicion en el lote ("FAC-2026-10-0158"): el mismo documento
 * cambiaba de numero segun el orden en que viniera el PDF. Ahora sale del
 * periodo y de la casa que dice el documento —la identidad de la factura es
 * (conjunto, unidad, periodo)—: el mismo documento da siempre el mismo
 * numero. Las facturas que ya existen conservan el suyo (`escribirFactura`
 * no lo cambia al actualizar).
 *
 * Sin casa legible se usa la posicion, como antes.
 */
export function numeroFacturaDe(periodo: string, casa: string | null | undefined, posicion: number): string {
  const ident = (casa ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ident ? `FAC-${periodo}-${ident}` : `FAC-${periodo}-${String(posicion).padStart(4, "0")}`;
}
