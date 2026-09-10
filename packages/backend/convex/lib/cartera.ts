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

export type LineaFactura = {
  codigo: number;
  concepto: string;
  /** Lo que esta linea arrastra del periodo anterior. */
  saldoAnterior: number;
  /** El cargo nuevo del mes. */
  actual: number;
  /** `saldoAnterior + actual`. */
  total: number;
};

/**
 * Lo que hace falta de una factura para juzgar la cartera.
 *
 * `totalAPagar` NO es la cuota del mes: es la deuda acumulada a esa fecha,
 * arrastre incluido. Sin ese dato no se puede responder cuanto debe hoy la
 * unidad, y por eso entra aqui.
 */
export type FacturaCartera = {
  periodo: string;
  estado: EstadoFactura;
  /** Timestamp. Dia 15 del mes siguiente al periodo (ver el schema). */
  fechaVencimiento: number;
  /** La deuda acumulada que reclama esta factura. */
  totalAPagar: number;
  lineas: readonly LineaFactura[];
};

/**
 * Deuda que la factura declara arrastrar del periodo anterior.
 *
 * Vive aqui y no en `facturas.ts` porque la usan tres: la conciliacion, que
 * con ella decide el estado; el estado de cuenta, que con ella dice cuanto
 * quedo debiendo cada mes; y el saldo vigente. Es la misma cuenta; tenerla
 * repetida era la manera de que un dia dejaran de coincidir.
 */
export function saldoAnteriorDe(f: { lineas: readonly LineaFactura[] }): number {
  return f.lineas.reduce((s, l) => s + l.saldoAnterior, 0);
}

/**
 * Tres estados, y cada uno responde algo distinto.
 *
 * `sin_facturas` no es `al_dia`: en un conjunto al que no le han cargado la
 * cartera, decir "al dia" seria afirmar algo que nadie ha comprobado.
 *
 * `pendiente` es "debe, pero no esta incumpliendo": o la obligacion vigente
 * todavia no vence, o el ultimo periodo que vencio quedo cubierto.
 *
 * Hubo un cuarto, `con_saldo`, para "arrastra deuda vieja pero esta pagando".
 * Se quito: nombraba un saldo anterior que YA esta dentro del saldo vigente,
 * porque cada factura absorbe lo que quedo debiendo la anterior. Era contar
 * dos veces con palabras.
 */
export type EstadoCartera = "sin_facturas" | "al_dia" | "pendiente" | "en_mora";

export type CarteraUnidad = {
  estado: EstadoCartera;
  /** Lo que la unidad debe HOY. No la suma de saldos historicos. */
  saldoActual: number;
  /** El periodo de la obligacion vigente. */
  periodoActual: string | null;
  /** Dias de la mora ACTUAL. 0 cuando no la hay, por vieja que sea la deuda. */
  diasMora: number;
  /** El periodo que provoca la mora actual. */
  periodoEnMora: string | null;
  /** Su vencimiento. */
  vencimientoEnMora: number | null;
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

/**
 * Si la factura quedo saldada del todo. Para el dinero, no para la mora.
 *
 * `abonada` NO entra: dejo saldo. Es la contraparte de `conEvidenciaDePago`,
 * donde si entra, y esa asimetria es la regla: abonar prueba que la casa
 * responde, pero no borra lo que falta.
 */
export function conEvidenciaTotalDePago(estado: EstadoFactura): boolean {
  return estado === "pagada" || estado === "saldo_a_favor";
}

/** Dias completos entre el vencimiento y hoy. Negativo si aun no vence. */
export function diasDesde(vencimiento: number, ahora: number): number {
  return Math.floor((ahora - vencimiento) / DIA);
}

/**
 * Cuanto debe HOY la unidad, y si esta incumpliendo.
 *
 * ── Las facturas no son deudas sumables ──────────────────────────────────
 * Cada factura ABSORBE lo que quedo debiendo la anterior: su `totalAPagar`
 * no es la cuota del mes, es la deuda acumulada a esa fecha. Sumar los
 * saldos de las facturas viejas para saber cuanto debe una casa no es contar
 * dos veces: es resucitar deuda que ya se pago.
 *
 * El caso que lo destapo, una unidad real:
 *
 *   abril   deja 400.800 debiendo
 *     -> mayo los absorbe:  837.800 = 437.000 nuevos + 400.800 arrastrados
 *   mayo    deja 264.600
 *     -> junio los absorbe: 638.600 = 374.000 nuevos + 264.600 arrastrados
 *   junio   se paga COMPLETO -> saldo 0
 *
 * Sumando saldos salian 1.083.400. Lo cierto es que abril y mayo se pagaron
 * en junio y no se deben; lo vigente son los 380.000 de septiembre, que ya
 * llevan dentro los 38.000 que quedaron de agosto.
 *
 * ── De donde sale entonces el saldo vigente ──────────────────────────────
 * De la ultima factura de la cadena, porque el modelo garantiza que arrastra
 * todo lo anterior. Cuanto queda de ella lo diria la factura siguiente —su
 * saldo anterior—, pero esa todavia no existe, asi que lo dice su estado:
 * saldada si esta `pagada` o en `saldo_a_favor`, y el total entero si no.
 *
 * ── La mora es otra pregunta ─────────────────────────────────────────────
 * La decide el ultimo periodo que YA vencio, no el mas antiguo sin pagar.
 * Una casa que arrastra deuda pero cubrio —pago o abono— el ultimo periodo
 * vencido no esta incumpliendo hoy: debe plata y esta respondiendo, y las
 * dos cosas son ciertas al tiempo.
 *
 * `vencida` no cuenta como cubierta, evidentemente. Y `pendiente` tampoco:
 * no es un estado de pago, es la ultima de la cadena, a la que todavia
 * ninguna factura posterior ha juzgado. Ausencia de veredicto, no constancia
 * de pago. Si contara, un conjunto que dejara de cargar facturas se veria
 * entero al dia mientras la deuda corre.
 */
export function carteraDeUnidad(
  facturas: readonly FacturaCartera[],
  ahora: number,
): CarteraUnidad {
  const vacia: CarteraUnidad = {
    estado: "sin_facturas",
    saldoActual: 0,
    periodoActual: null,
    diasMora: 0,
    periodoEnMora: null,
    vencimientoEnMora: null,
  };

  if (facturas.length === 0) return vacia;

  /* La cadena de facturacion, en el mismo orden que usa la conciliacion: por
   * periodo. Es el orden en el que el saldo va pasando de una a otra. */
  const cadena = [...facturas].sort((a, b) => a.periodo.localeCompare(b.periodo));
  const vigente = cadena[cadena.length - 1]!;

  /* Si la vigente estuviera `abonada` no se sabria cuanto se abono —eso lo
   * diria la siguiente, que no existe—, asi que se reporta el total. Preferir
   * pasarse a quedarse corto: una deuda subestimada en pantalla es peor que
   * una que el detalle matiza. */
  const saldoActual = conEvidenciaTotalDePago(vigente.estado)
    ? 0
    : Math.max(0, vigente.totalAPagar);

  const base: CarteraUnidad = {
    ...vacia,
    saldoActual,
    periodoActual: vigente.periodo,
    estado: saldoActual > 0 ? "pendiente" : "al_dia",
  };

  /* Los periodos que ya vencieron, del mas viejo al mas nuevo. Se ordena por
   * vencimiento y no por el orden en que entraron a la base: lo que define
   * "el ultimo" es la fecha de la obligacion, no cuando alguien la cargo. El
   * periodo desempata para que dos vencimientos iguales no bailen.
   *
   * Las migradas con `fechaVencimiento` en 0 (`backfillFechas` las arregla)
   * quedan fuera: sin fecha no se puede decir si vencieron ni cuando. */
  const yaVencidas = facturas
    .filter((f) => f.fechaVencimiento > 0 && diasDesde(f.fechaVencimiento, ahora) >= 1)
    .sort(
      (a, b) =>
        a.fechaVencimiento - b.fechaVencimiento || a.periodo.localeCompare(b.periodo),
    );

  const ultimoVencido = yaVencidas[yaVencidas.length - 1];

  /* Nada ha vencido todavia, o lo que vencio quedo cubierto. Debe, pero
   * dentro de plazo: llamarlo mora seria cobrarle un atraso que no tiene. */
  if (!ultimoVencido || conEvidenciaDePago(ultimoVencido.estado)) return base;

  return {
    ...base,
    estado: "en_mora",
    diasMora: diasDesde(ultimoVencido.fechaVencimiento, ahora),
    periodoEnMora: ultimoVencido.periodo,
    vencimientoEnMora: ultimoVencido.fechaVencimiento,
  };
}

// ─────────────────────────────────────────────────────────────
// Estado de cuenta: la misma cadena, factura por factura
// ─────────────────────────────────────────────────────────────

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

export type FacturaCadena = FacturaCartera & { periodoLabel: string };

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
 * ── Esto es historial, no deuda ──────────────────────────────────────────
 * Estos saldos NO se suman: el de cada factura ya lo absorbio la siguiente.
 * Sirven para auditar como se llego hasta aqui. Cuanto se debe hoy lo dice
 * `carteraDeUnidad`, y sale de una sola factura: la vigente.
 *
 * Por lo mismo no se devuelven dias de vencida por factura. Ver "116 dias"
 * en abril y "85" en mayo invita a leerlos como dos moras que se acumulan,
 * cuando son la misma deuda contada dos veces. La mora es una y esta en
 * `carteraDeUnidad`.
 *
 * `cadena` debe venir ordenada del periodo mas viejo al mas nuevo.
 */
export function estadoCuentaDeCadena(
  cadena: readonly FacturaCadena[],
): FilaEstadoCuenta[] {
  return cadena.map((f, i) => {
    const siguiente = cadena[i + 1];
    const saldoPendiente = siguiente ? saldoAnteriorDe(siguiente) : null;

    /* Sin tope por arriba a proposito: con intereses, lo que se arrastra
     * puede superar el total del mes, y la conciliacion ya cuenta con ello.
     * Recortarlo mostraria una deuda menor que la real. */
    const abonado =
      saldoPendiente == null ? null : Math.max(0, f.totalAPagar - saldoPendiente);

    return {
      periodo: f.periodo,
      periodoLabel: f.periodoLabel,
      concepto: conceptoPrincipal(f.lineas, f.periodoLabel),
      estado: f.estado,
      fechaVencimiento: f.fechaVencimiento,
      totalAPagar: f.totalAPagar,
      saldoPendiente,
      abonado,
    };
  });
}
