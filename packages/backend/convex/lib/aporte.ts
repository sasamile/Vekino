/**
 * El aporte voluntario de areas comunes: el cupo de parqueadero.
 *
 * ── De donde sale el dato ────────────────────────────────────────────────
 * De ningun lado nuevo. Ya viene en las facturas que sube la administracion,
 * en la linea de concepto "CONT VOLUNTARIA AREAS COMUN" (en Ciudad del Campo,
 * codigo 005; el codigo no basta: ver `CONCEPTO_APORTE`). No hacia falta
 * inventar un modelo aparte: hacia falta leer el que ya existe.
 *
 * ── Como se mide la mora ─────────────────────────────────────────────────
 * Por plata, no por fechas. La factura dice cuanto debe de ese concepto; la
 * tarifa dice cuanto vale un mes. Dividiendo se sabe cuantos meses lleva.
 *
 * Es aproximado a proposito. La alternativa —seguir que factura esta pagada
 * y cuando vencia— necesita un dato de pagos que hoy no llega completo, y un
 * numero exacto calculado sobre informacion incompleta enganaria mas que
 * este, que al menos es honesto sobre lo que mide.
 *
 * Sin dependencias: se prueba con `node`, sin base de datos.
 */

/**
 * Como se reconoce el aporte en una linea de factura: por el TEXTO del
 * concepto, no por el codigo (Fase 4, F-10).
 *
 * El codigo 5 es "CONT. VOL. AREAS COMUNES" en Ciudad del Campo, pero en
 * Arboleda es "Parqueadero visitante": identificar el aporte por el codigo
 * metia en el reporte, y en el color del guarda, un concepto que no es el
 * cupo. Tampoco cualquier "aporte": Ciudad del Campo cobra un "APORTE
 * NAVIDENO" (codigo 7) que no tiene nada que ver con parquear.
 *
 * Textos reales que coinciden: "CONT. VOL. AREAS COMUNES", "CONT VOLUNTARIA
 * AREAS COMUN", "CONT VOLUNTARIA AREAS COM"; y las formas largas
 * "CONTRIBUCION VOLUNTARIA" y "APORTE VOLUNTARIO". Un conjunto que lo llame
 * distinto lo configura en `aporteVoluntario.conceptos` (opcional).
 */
export const CONCEPTO_APORTE =
  /\b(CONT|CONTRIB|CONTRIBUCION|APORTE)\s+(VOL|VOLUNTARIA|VOLUNTARIO)\b/;

/** "Cont. Vol. Áreas Comunes" → "CONT VOL AREAS COMUNES". */
export function normalizarConcepto(concepto: string): string {
  return (concepto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/**
 * ¿Esta linea es del aporte voluntario?
 *
 * Con `conceptos` configurados para el conjunto, la linea es aporte si su
 * concepto empieza por alguno de ellos (sin importar mayusculas, tildes ni
 * puntuacion). Sin configuracion, por el texto (`CONCEPTO_APORTE`).
 */
export function esLineaDeAporte(
  linea: { concepto: string },
  conceptos?: readonly string[],
): boolean {
  const texto = normalizarConcepto(linea.concepto);
  const propios = (conceptos ?? []).map(normalizarConcepto).filter(Boolean);
  if (propios.length > 0) return propios.some((c) => texto.startsWith(c));
  return CONCEPTO_APORTE.test(texto);
}

/** Lo que se compara. Va configurado por condominio. */
export type TarifasAporte = {
  tarifaCarro: number;
  tarifaMoto: number;
  mesesParaMora: number;
  /** Textos del concepto del aporte en este conjunto, si no es el de siempre. */
  conceptos?: string[];
};

/** Valores de Ciudad del Campo, del comunicado de la administracion. */
export const TARIFAS_POR_DEFECTO: TarifasAporte = {
  tarifaCarro: 7000,
  tarifaMoto: 3000,
  mesesParaMora: 2, // "60 dias o mas"
};

/**
 * Los colores que ve el guarda.
 *
 * `azul` y `morado` son los dos que Adriana describio como "tienen
 * derecho". La unica lectura en la que ambos tienen derecho y aun asi se
 * distinguen es por tipo de vehiculo: la tarifa aprobada tiene exactamente
 * dos categorias, carro y moto, y en las facturas aparecen los dos montos.
 *
 * Si resulta ser otra cosa, se cambia aqui y en `colorDe`: el guarda y el
 * reporte no conocen el criterio, solo el color.
 */
export type ColorAporte = "rojo" | "azul" | "morado" | "gris";

export const SIGNIFICADO: Record<ColorAporte, string> = {
  rojo: "En mora — sin derecho a parquear",
  azul: "Al dia — carro",
  morado: "Al dia — moto",
  gris: "Sin aporte registrado",
};

export type LineaFactura = {
  codigo: number;
  concepto: string;
  saldoAnterior?: number;
  actual?: number;
  total: number;
};

/** Lo que se cobro del aporte EN EL MES de esa factura: `actual`. */
function cargoDeLinea(l: LineaFactura): number {
  return l.actual ?? (l.total || 0) - (l.saldoAnterior ?? 0);
}

/**
 * El cargo del aporte en el mes de una factura (`actual` de sus lineas).
 *
 * Es lo que se suma entre meses. El `total` de la linea trae ademas el saldo
 * anterior (lo que venia sin pagar de meses pasados): sumarlo mes a mes
 * contaba el mismo aporte varias veces —$7.000 de agosto y $7.000 de
 * septiembre daban $21.000 (#44); en Ciudad del Campo, $81,7 millones en vez
 * de $47,2—.
 */
export function cargoAporteDeFactura(
  lineas: LineaFactura[],
  conceptos?: readonly string[],
): number {
  return lineas
    .filter((l) => esLineaDeAporte(l, conceptos))
    .reduce((s, l) => s + cargoDeLinea(l), 0);
}

/**
 * Lo que la casa debe del aporte segun una factura: el `total` de sus lineas
 * (saldo anterior + mes). Es una DEUDA a esa fecha: no se suma entre meses;
 * la que vale es la de la ultima factura.
 */
export function deudaAporteDeFactura(
  lineas: LineaFactura[],
  conceptos?: readonly string[],
): number {
  return lineas
    .filter((l) => esLineaDeAporte(l, conceptos))
    .reduce((s, l) => s + (l.total || 0), 0);
}

export type EstadoAporte = {
  /** Lo que aparece en la ultima factura por este concepto. */
  montoUltimaFactura: number;
  /** Meses equivalentes, redondeados hacia abajo. */
  mesesEquivalentes: number;
  /** Meses de ATRASO: lo que excede el mes corriente. */
  mesesAtraso: number;
  enMora: boolean;
  color: ColorAporte;
  /** Con que tarifa se hizo la cuenta, para poder explicarlo en pantalla. */
  tarifaUsada: number;
  tipo: "carro" | "moto" | null;
};

/**
 * Estado del aporte de una casa.
 *
 * `tipo` sale de los vehiculos que tenga registrados: si hay carro se compara
 * contra la tarifa de carro, si solo hay motos contra la de moto. Cuando no
 * hay vehiculos registrados no se puede saber contra que dividir, y se
 * devuelve gris en vez de adivinar.
 */
export function estadoAporte(
  montoUltimaFactura: number,
  tipo: "carro" | "moto" | null,
  tarifas: TarifasAporte,
): EstadoAporte {
  const base = { montoUltimaFactura, tipo };

  if (!tipo || montoUltimaFactura <= 0) {
    return {
      ...base,
      mesesEquivalentes: 0,
      mesesAtraso: 0,
      enMora: false,
      color: "gris",
      tarifaUsada: 0,
    };
  }

  const tarifa = tipo === "carro" ? tarifas.tarifaCarro : tarifas.tarifaMoto;
  if (tarifa <= 0) {
    return {
      ...base,
      mesesEquivalentes: 0,
      mesesAtraso: 0,
      enMora: false,
      color: "gris",
      tarifaUsada: 0,
    };
  }

  const mesesEquivalentes = Math.floor(montoUltimaFactura / tarifa);
  /* Un mes en la factura es el mes corriente, no un atraso: se cobra por
   * adelantado. El atraso empieza a partir del segundo. */
  const mesesAtraso = Math.max(0, mesesEquivalentes - 1);
  const enMora = mesesAtraso >= tarifas.mesesParaMora;

  return {
    ...base,
    mesesEquivalentes,
    mesesAtraso,
    enMora,
    color: enMora ? "rojo" : tipo === "carro" ? "azul" : "morado",
    tarifaUsada: tarifa,
  };
}
