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
 * Cada estado dice una cosa distinta, y ninguno sobra.
 *
 * `sin_facturas` no es `al_dia`: en un conjunto al que no le han cargado la
 * cartera, decir "al dia" seria afirmar algo que nadie ha comprobado.
 *
 * `con_saldo` no es ninguno de los dos: la casa debe plata de meses viejos
 * pero cubrio el ultimo periodo que vencio. Llamarla "al dia" esconderia un
 * millon de pesos; llamarla "en mora" seria negar que esta pagando.
 */
export type EstadoCartera =
  | "sin_facturas"
  | "al_dia"
  | "pendiente"
  | "con_saldo"
  | "en_mora";

export type CarteraUnidad = {
  estado: EstadoCartera;
  /** Dias de la mora ACTUAL. 0 cuando no la hay, por vieja que sea la deuda. */
  diasMora: number;
  /** Facturas sin pagar, vencidas o no. Es la deuda historica, no la mora. */
  facturasPendientes: number;
  /** El periodo que provoca la mora actual. */
  periodoEnMora: string | null;
  /** Su vencimiento. */
  vencimientoEnMora: number | null;
  /** El ultimo periodo que ya vencio, sea cual sea su estado. */
  ultimoPeriodoVencido: string | null;
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

/**
 * Si la factura muestra que la casa respondio.
 *
 * OJO: no es lo contrario de `sinPagar`, y la diferencia es justo la regla de
 * negocio. `abonada` esta en los DOS conjuntos a proposito: deja saldo —por
 * eso suma a la deuda— y a la vez prueba que hubo un pago —por eso, si es el
 * ultimo periodo vencido, no hay mora—. Una casa que abona todos los meses
 * debe plata y esta cumpliendo; las dos cosas son ciertas al tiempo.
 *
 * `pendiente` no prueba nada: es la ultima de la cadena, a la que ninguna
 * factura posterior ha juzgado todavia. Ausencia de veredicto, no de deuda.
 */
export function conEvidenciaDePago(estado: EstadoFactura): boolean {
  return estado === "pagada" || estado === "abonada" || estado === "saldo_a_favor";
}

/** Dias completos entre el vencimiento y hoy. Negativo si aun no vence. */
export function diasDesde(vencimiento: number, ahora: number): number {
  return Math.floor((ahora - vencimiento) / DIA);
}

/**
 * Deuda historica y mora actual son dos preguntas, no una.
 *
 * ── Por que se mira el ULTIMO periodo vencido y no el mas antiguo ────────
 * Antes se tomaba la factura sin pagar mas vieja ya vencida. Respondia
 * "cuanto lleva debiendo", que es una pregunta legitima, pero no la que la
 * administracion hace frente a una solicitud de reserva: esa es "esta
 * cumpliendo ahora".
 *
 * El caso que lo destapo: una casa con la cuota de abril vencida desde hace
 * 116 dias, pero que en julio pago completo y que en agosto ya lleva 300.000
 * abonados antes siquiera de vencer. El sistema la marcaba con 116 dias de
 * mora. Es falso: arrastra deuda, pero esta pagando.
 *
 * Asi que la mora la decide el ultimo periodo que YA vencio. Si ese quedo
 * cubierto —pagado o abonado—, no hay mora actual por mucho saldo viejo que
 * quede; ese saldo sigue contandose aparte, en `facturasPendientes` y en el
 * estado de cuenta.
 *
 * ── Que cuenta como cubierto ─────────────────────────────────────────────
 * `pagada`, `abonada` y `saldo_a_favor`. Abonar cuenta a proposito: un pago
 * parcial sobre el ultimo periodo es justo la evidencia de que la casa esta
 * respondiendo.
 *
 * `vencida` no, evidentemente. Y `pendiente` tampoco: no es un estado de
 * pago, es la ultima de la cadena, a la que todavia ninguna factura
 * posterior ha juzgado. Es ausencia de veredicto, no constancia de pago. Si
 * contara como cubierta, un conjunto que dejara de cargar facturas se veria
 * entero al dia mientras la deuda corre.
 *
 * Por eso `conEvidenciaDePago` no es la negacion de `sinPagar`: una abonada
 * cuenta en los dos lados, y ahi esta toda la regla.
 */
export function carteraDeUnidad(
  facturas: readonly FacturaCartera[],
  ahora: number,
): CarteraUnidad {
  const vacia: CarteraUnidad = {
    estado: "sin_facturas",
    diasMora: 0,
    facturasPendientes: 0,
    periodoEnMora: null,
    vencimientoEnMora: null,
    ultimoPeriodoVencido: null,
  };

  if (facturas.length === 0) return vacia;

  const pendientes = facturas.filter((f) => sinPagar(f.estado));
  if (pendientes.length === 0) return { ...vacia, estado: "al_dia" };

  const base = { ...vacia, facturasPendientes: pendientes.length };

  /* Los periodos que ya vencieron, del mas viejo al mas nuevo. Se ordena por
   * vencimiento y no por el orden en que entraron a la base: lo que define
   * "el ultimo" es la fecha de la obligacion, no cuando alguien la cargo. El
   * periodo desempata para que dos vencimientos iguales no bailen.
   *
   * Las migradas con `fechaVencimiento` en 0 (`backfillFechas` las arregla)
   * quedan fuera: sin fecha no se puede decir si vencieron ni cuando. Siguen
   * contando como deuda, que es lo que son. */
  const yaVencidas = facturas
    .filter((f) => f.fechaVencimiento > 0 && diasDesde(f.fechaVencimiento, ahora) >= 1)
    .sort(
      (a, b) =>
        a.fechaVencimiento - b.fechaVencimiento || a.periodo.localeCompare(b.periodo),
    );

  /* Todo lo que ya vencio esta cubierto: lo unico que debe es de plazo
   * abierto. No es mora ni es saldo arrastrado —no hay nada "anterior"
   * pendiente—, es una cuenta corriente al dia. */
  const deudaYaVencida = yaVencidas.filter((f) => sinPagar(f.estado));
  if (deudaYaVencida.length === 0) return { ...base, estado: "pendiente" };

  /* Hay deuda de periodos que ya vencieron. Que sea mora ACTUAL o saldo
   * arrastrado lo decide el ultimo periodo vencido, no el primero. */
  const ultimo = yaVencidas[yaVencidas.length - 1]!;

  if (conEvidenciaDePago(ultimo.estado)) {
    return { ...base, estado: "con_saldo", ultimoPeriodoVencido: ultimo.periodo };
  }

  return {
    ...base,
    estado: "en_mora",
    diasMora: diasDesde(ultimo.fechaVencimiento, ahora),
    periodoEnMora: ultimo.periodo,
    vencimientoEnMora: ultimo.fechaVencimiento,
    ultimoPeriodoVencido: ultimo.periodo,
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
