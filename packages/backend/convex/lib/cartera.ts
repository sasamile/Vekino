/**
 * Estado de cartera de una unidad: si debe, y desde cuando.
 *
 * ── De donde sale el dato ────────────────────────────────────────────────
 * De ningun lado nuevo. Ya esta en las facturas que carga la administracion:
 * el estado lo pone la conciliacion por saldo anterior (`facturas.ts`) y el
 * vencimiento viene en la propia factura. Aqui no se decide quien debe: se
 * lee lo que el modulo financiero ya decidio y se traduce a una frase que
 * sirva en una tabla.
 *
 * ── Que cuenta como sin pagar ────────────────────────────────────────────
 * Los tres estados que dejan saldo: `pendiente` (la ultima de la cadena, que
 * todavia no tiene una factura siguiente que la juzgue), `vencida` (la
 * siguiente arrastro la deuda entera) y `abonada` (pago parcial: abonar no es
 * pagar, la unidad sigue debiendo). `pagada` y `saldo_a_favor` estan saldadas.
 *
 * ── Como se miden los dias ───────────────────────────────────────────────
 * Contra el vencimiento, no contra la emision: una factura de septiembre que
 * vence el 15 de octubre no lleva un mes de mora el 20 de septiembre, lleva
 * cero. Y contra la MAS ANTIGUA sin pagar de las que ya vencieron, porque esa
 * es la que responde "cuanto lleva debiendo".
 *
 * ── Que NO hace ──────────────────────────────────────────────────────────
 * No bloquea nada. Devuelve informacion para que la administracion decida:
 * una unidad puede tener mora y un acuerdo de por medio, y esa decision es de
 * quien administra, no de esta funcion.
 *
 * Sin dependencias: se prueba con `node`, sin base de datos.
 */

export type EstadoFactura =
  | "pendiente"
  | "pagada"
  | "vencida"
  | "abonada"
  | "saldo_a_favor";

/** Lo minimo de una factura que hace falta para juzgar la cartera. */
export type FacturaCartera = {
  periodo: string;
  estado: EstadoFactura;
  /** Timestamp. Dia 15 del mes siguiente al periodo (ver el schema). */
  fechaVencimiento: number;
};

/**
 * `sin_facturas` no es lo mismo que `al_dia`, y por eso son dos.
 *
 * En un conjunto al que todavia no le han cargado la cartera, decir "al dia"
 * seria afirmar algo que nadie ha comprobado. Decir "sin facturas" es cierto.
 */
export type EstadoCartera = "sin_facturas" | "al_dia" | "pendiente" | "en_mora";

export type CarteraUnidad = {
  estado: EstadoCartera;
  /** Dias desde el vencimiento mas antiguo sin pagar. 0 si no hay mora. */
  diasMora: number;
  /** Cuantas facturas sin pagar tiene la unidad (vencidas o no). */
  facturasPendientes: number;
  /** Periodo de la factura que marca la mora, para poder explicarla. */
  periodoMasAntiguo: string | null;
  /** Su vencimiento. */
  vencimientoMasAntiguo: number | null;
};

const DIA = 24 * 60 * 60 * 1000;

const SIN_PAGAR: ReadonlySet<EstadoFactura> = new Set<EstadoFactura>([
  "pendiente",
  "vencida",
  "abonada",
]);

/** Si la factura deja saldo. Abonada tambien: abonar no es pagar. */
export function sinPagar(estado: EstadoFactura): boolean {
  return SIN_PAGAR.has(estado);
}

/** Dias completos entre el vencimiento y hoy. Negativo si aun no vence. */
export function diasDesde(vencimiento: number, ahora: number): number {
  return Math.floor((ahora - vencimiento) / DIA);
}

export function carteraDeUnidad(
  facturas: readonly FacturaCartera[],
  ahora: number,
): CarteraUnidad {
  const vacia: CarteraUnidad = {
    estado: "sin_facturas",
    diasMora: 0,
    facturasPendientes: 0,
    periodoMasAntiguo: null,
    vencimientoMasAntiguo: null,
  };

  if (facturas.length === 0) return vacia;

  const pendientes = facturas.filter((f) => sinPagar(f.estado));
  if (pendientes.length === 0) return { ...vacia, estado: "al_dia" };

  /* Las migradas quedaron con `fechaVencimiento` en 0 (`backfillFechas` las
   * arregla). Cuentan como deuda —lo son— pero no se les puede sacar una
   * antiguedad: contra el epoch darian cincuenta y seis anos de mora, un
   * numero falso y alarmante. Sin fecha, no hay dias. */
  const vencidas = pendientes
    .filter((f) => f.fechaVencimiento > 0 && diasDesde(f.fechaVencimiento, ahora) >= 1)
    .sort((a, b) => a.fechaVencimiento - b.fechaVencimiento);

  const parcial = { ...vacia, facturasPendientes: pendientes.length };

  /* Debe, pero todavia no le ha llegado la fecha. No es mora: es una cuenta
   * abierta dentro de plazo, y llamarla mora seria cobrarle a alguien un
   * atraso que no tiene. */
  if (vencidas.length === 0) return { ...parcial, estado: "pendiente" };

  const masAntigua = vencidas[0]!;
  return {
    ...parcial,
    estado: "en_mora",
    diasMora: diasDesde(masAntigua.fechaVencimiento, ahora),
    periodoMasAntiguo: masAntigua.periodo,
    vencimientoMasAntiguo: masAntigua.fechaVencimiento,
  };
}
