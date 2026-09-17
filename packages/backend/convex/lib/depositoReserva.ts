/**
 * Cuanto se le devuelve al residente de su deposito.
 *
 * El deposito es una GARANTIA con tope, no una cuenta corriente: cubre los
 * danos hasta donde alcanza y nada mas. Si una silla rota vale $10.000 sobre
 * un deposito de $60.000, se devuelven $50.000. Si el dano vale $100.000, se
 * descuentan los $60.000 y se devuelve $0 — y los $40.000 restantes NO se
 * convierten en deuda dentro del sistema: se arreglan por fuera. Por eso el
 * excedente se informa pero no se guarda en ningun sitio que cobre.
 *
 * Antes la resolucion era binaria ("devuelto" / "no devuelto") y quien la
 * hacia decidia a ojo cuanto se quedaba el conjunto. Ahora el descuento sale
 * SOLO de incidentes valorados por la administracion, y esta es la unica
 * cuenta: la hacen las mutaciones al liquidar y las consultas que la ensenan
 * en pantalla, para que lo que ve el guarda sea lo que se registra.
 */

export type EstadoIncidente = "pendiente" | "valorado" | "descartado";

export type IncidenteLiquidable = {
  estado: EstadoIncidente;
  /** Solo cuenta si el incidente esta `valorado`. */
  valor?: number | null;
};

/** Lo que hace falta de un incidente para contar qué pasó. */
export type IncidenteDescrito = {
  descripcion?: string | null;
};

export type EstadoDepositoLiquidado = "devuelto" | "devuelto_parcial" | "no_devuelto";

export type Liquidacion = {
  /** Lo que se recibio de deposito. */
  deposito: number;
  /** Suma del valor de los incidentes valorados, sin tope. */
  totalIncidentes: number;
  /** Lo que se descuenta del deposito: nunca mas que el deposito. */
  totalDescuento: number;
  /** Lo que se le devuelve al residente. Nunca negativo. */
  saldoDevolucion: number;
  /** Lo que el deposito no alcanzo a cubrir. Informativo: no genera deuda. */
  excedenteNoCubierto: number;
  pendientes: number;
  valorados: number;
  descartados: number;
  /** Mientras haya incidentes sin valorar no se sabe cuanto devolver. */
  puedeLiquidar: boolean;
  /** Si hubo incidentes que cuentan, la devolucion tiene que explicar por que. */
  razonObligatoria: boolean;
  /** El estado en que queda el deposito si se liquida ahora. */
  estadoResultante: EstadoDepositoLiquidado;
};

/** Un valor de incidente aceptable: una cifra en pesos mayor a cero. */
export function esValorIncidenteValido(valor: number): boolean {
  return Number.isFinite(valor) && valor > 0;
}

/**
 * Lo que valen los incidentes de una reserva: la suma de los valorados.
 *
 * SIN tope: es el daño que la administración valoró, no lo que el depósito
 * alcanzó a cubrir (eso es `totalDescuento`). Los pendientes todavía no
 * tienen valor y los descartados no cuentan. La usan la liquidación y el
 * reporte, para que las dos digan la misma cifra.
 */
export function valorDeIncidentes(incidentes: readonly IncidenteLiquidable[]): number {
  let total = 0;
  for (const i of incidentes) {
    if (i.estado !== "valorado") continue;
    /* Un valor corrupto no puede sumar negativo y "devolver" mas de lo que
     * se recibio. */
    const v = i.valor ?? 0;
    if (Number.isFinite(v) && v > 0) total += v;
  }
  return total;
}

/**
 * Las descripciones de los incidentes de una reserva, en una sola celda.
 *
 * Acompaña a `valorDeIncidentes` en el reporte: aquella dice cuánto y esta
 * qué pasó. Van TODOS, no solo los valorados: un incidente pendiente o
 * descartado también ocurrió, y quien lee el reporte necesita saber de qué se
 * le habla aunque no descuente un peso. Cadena vacía cuando no hubo ninguno,
 * que es como el reporte deja las celdas sin información.
 */
export function descripcionDeIncidentes(incidentes: readonly IncidenteDescrito[]): string {
  /* Entre un incidente y el siguiente dentro de la misma celda. */
  const separador = " · ";
  return incidentes
    .map((i) => (i.descripcion ?? "").trim())
    .filter((d) => d !== "")
    .join(separador);
}

export function liquidarDeposito(
  deposito: number,
  incidentes: readonly IncidenteLiquidable[],
): Liquidacion {
  const base = Number.isFinite(deposito) && deposito > 0 ? deposito : 0;

  let pendientes = 0;
  let valorados = 0;
  let descartados = 0;
  for (const i of incidentes) {
    if (i.estado === "pendiente") pendientes++;
    else if (i.estado === "descartado") descartados++;
    else valorados++;
  }
  const totalIncidentes = valorDeIncidentes(incidentes);

  const totalDescuento = Math.min(totalIncidentes, base);
  const saldoDevolucion = base - totalDescuento;

  return {
    deposito: base,
    totalIncidentes,
    totalDescuento,
    saldoDevolucion,
    excedenteNoCubierto: totalIncidentes - totalDescuento,
    pendientes,
    valorados,
    descartados,
    puedeLiquidar: pendientes === 0,
    razonObligatoria: pendientes + valorados > 0,
    estadoResultante:
      totalDescuento === 0
        ? "devuelto"
        : saldoDevolucion === 0
          ? "no_devuelto"
          : "devuelto_parcial",
  };
}

/**
 * Lo devuelto y lo descontado de un deposito ya resuelto.
 *
 * Los depositos liquidados con incidentes guardan las cifras. Los anteriores
 * solo tienen el estado binario y se leen como siempre se leyeron: "devuelto"
 * es todo el monto y "no_devuelto" es nada. Asi el historico no se reescribe
 * ni queda en blanco.
 */
export function montosDeDepositoResuelto(dep: {
  monto: number;
  estado: string;
  montoDevuelto?: number;
  montoDescontado?: number;
}): { devuelto: number; descontado: number } | null {
  if (dep.estado === "registrado") return null;
  if (dep.montoDevuelto != null) {
    return {
      devuelto: dep.montoDevuelto,
      descontado: dep.montoDescontado ?? dep.monto - dep.montoDevuelto,
    };
  }
  if (dep.estado === "devuelto") return { devuelto: dep.monto, descontado: 0 };
  return { devuelto: 0, descontado: dep.monto };
}
