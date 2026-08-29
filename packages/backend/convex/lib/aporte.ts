/**
 * El aporte voluntario de areas comunes: el cupo de parqueadero.
 *
 * ── De donde sale el dato ────────────────────────────────────────────────
 * De ningun lado nuevo. Ya viene en las facturas que sube la administracion,
 * en la linea de concepto "CONT VOLUNTARIA AREAS COMUN" (codigo 005). No
 * hacia falta inventar un modelo aparte: hacia falta leer el que ya existe.
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

/** Concepto en el que viene el aporte dentro de la factura. */
export const CODIGO_APORTE = 5;
export const CONCEPTO_APORTE = /CONT(RIBUCION)?\s*VOLUNTARIA/i;

/** Lo que se compara. Va configurado por condominio. */
export type TarifasAporte = {
  tarifaCarro: number;
  tarifaMoto: number;
  mesesParaMora: number;
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

/** Suma del aporte en una factura. Cero si esa factura no lo trae. */
export function aporteDeFactura(lineas: LineaFactura[]): number {
  return lineas
    .filter((l) => l.codigo === CODIGO_APORTE || CONCEPTO_APORTE.test(l.concepto))
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
