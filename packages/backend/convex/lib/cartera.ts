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

// ─────────────────────────────────────────────────────────────
// Estado de cuenta: la misma cadena, factura por factura
// ─────────────────────────────────────────────────────────────

export type LineaFactura = {
  codigo: number;
  concepto: string;
  saldoAnterior: number;
  actual: number;
  total: number;
};

/**
 * Deuda que la factura declara arrastrar del periodo anterior.
 *
 * Vive aqui y no en `facturas.ts` porque ahora la usan dos: la conciliacion,
 * que con ella decide el estado, y el estado de cuenta, que con ella dice
 * cuanto quedo debiendo cada mes. Es la misma cuenta; tenerla dos veces era
 * la manera de que un dia dejaran de coincidir.
 */
export function saldoAnteriorDe(f: { lineas: readonly LineaFactura[] }): number {
  return f.lineas.reduce((s, l) => s + l.saldoAnterior, 0);
}

/**
 * El concepto que resume la factura.
 *
 * Se elige la linea que mas pesa en el mes y no un codigo fijo, porque el
 * codigo no significa lo mismo segun de donde venga la factura: el importador
 * de PDF pone la administracion en el 2 y el alta manual la pone en el 1.
 * Mirar el monto acierta con las dos, y con las que vengan.
 */
export function conceptoPrincipal(
  lineas: readonly LineaFactura[],
  periodoLabel: string,
): string {
  let mejor: LineaFactura | null = null;
  for (const l of lineas) {
    if (l.actual <= 0) continue;
    if (!mejor || l.actual > mejor.actual) mejor = l;
  }
  /* Las facturas migradas llegaron sin lineas. El periodo no es un concepto,
   * pero es cierto, que es mas de lo que seria inventarse uno. */
  return mejor?.concepto ?? periodoLabel;
}

export type FacturaCadena = FacturaCartera & {
  periodoLabel: string;
  totalAPagar: number;
  lineas: readonly LineaFactura[];
};

export type FilaEstadoCuenta = {
  periodo: string;
  periodoLabel: string;
  concepto: string;
  estado: EstadoFactura;
  fechaVencimiento: number;
  totalAPagar: number;
  /** Lo que quedo debiendo. `null` en la ultima: nadie la ha juzgado aun. */
  saldoPendiente: number | null;
  /** Lo que alcanzo a pagar. `null` por lo mismo. */
  abonado: number | null;
  /** Dias vencida, si lo esta. */
  diasVencida: number | null;
};

/**
 * Cuanto pago y cuanto quedo debiendo cada factura de una unidad.
 *
 * ── De donde sale el abono ───────────────────────────────────────────────
 * No hay un campo "abonado" en la base, y no hace falta inventarlo: la
 * factura del mes siguiente ya lo dice. Su saldo anterior ES lo que quedo
 * debiendo la anterior, y es exactamente el numero con el que la conciliacion
 * decide si aquella quedo pagada, abonada o vencida. Lo que se paga sale de
 * restar: total menos lo que sigue debiendo.
 *
 * ── La ultima no se sabe ─────────────────────────────────────────────────
 * La ultima de la cadena todavia no tiene una factura siguiente que la juzgue,
 * asi que su saldo es desconocido, no cero. Se devuelve `null` para que la
 * pantalla ponga un guion en vez de afirmar algo que nadie ha comprobado.
 *
 * `cadena` debe venir ordenada del periodo mas viejo al mas nuevo.
 */
export function estadoCuentaDeCadena(
  cadena: readonly FacturaCadena[],
  ahora: number,
): FilaEstadoCuenta[] {
  return cadena.map((f, i) => {
    const siguiente = cadena[i + 1];
    const saldoPendiente = siguiente ? saldoAnteriorDe(siguiente) : null;

    /* Sin tope por arriba a proposito: con intereses, lo que se arrastra
     * puede superar el total del mes, y la conciliacion ya cuenta con ello.
     * Recortarlo mostraria una deuda menor que la real. */
    const abonado =
      saldoPendiente == null ? null : Math.max(0, f.totalAPagar - saldoPendiente);

    const dias =
      sinPagar(f.estado) && f.fechaVencimiento > 0
        ? diasDesde(f.fechaVencimiento, ahora)
        : 0;

    return {
      periodo: f.periodo,
      periodoLabel: f.periodoLabel,
      concepto: conceptoPrincipal(f.lineas, f.periodoLabel),
      estado: f.estado,
      fechaVencimiento: f.fechaVencimiento,
      totalAPagar: f.totalAPagar,
      saldoPendiente,
      abonado,
      diasVencida: dias >= 1 ? dias : null,
    };
  });
}
