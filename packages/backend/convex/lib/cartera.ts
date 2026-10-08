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
  /** Codigo no numerico del documento (`CI`, `NCC`); entonces `codigo` es 0. */
  codigoTexto?: string;
  concepto: string;
  /** Lo que esta linea arrastra del periodo anterior. */
  saldoAnterior: number;
  /** El cargo nuevo del mes. */
  actual: number;
  /** `saldoAnterior + actual`. */
  total: number;
};

/**
 * Marca de una factura cuya lectura no se pudo tomar como cierta (el PDF no
 * cuadra, no trae el total, no se le leyo el periodo...). Ver
 * `lib/lecturaFactura.ts`. Mientras no la confirme la administracion, la
 * factura esta "en revision" (`enRevision`).
 */
export type LecturaDudosa = {
  motivos: readonly string[];
  confirmada?: unknown;
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
  /** El saldo anterior que imprime el documento (fila Totales), si lo trae. */
  saldoAnteriorDocumento?: number;
  lecturaDudosa?: LecturaDudosa | null;
};

/**
 * Deuda que la factura declara arrastrar del periodo anterior.
 *
 * Vive aqui y no en `facturas.ts` porque la usan tres: la conciliacion, que
 * con ella decide el estado; el estado de cuenta, que con ella dice cuanto
 * quedo debiendo cada mes; y el saldo vigente. Es la misma cuenta; tenerla
 * repetida era la manera de que un dia dejaran de coincidir.
 *
 * Si el documento imprime su propio saldo anterior (la fila Totales de
 * Ciudad del Campo) manda ese: las lineas pueden venir incompletas —una hoja
 * de continuacion— o sin la fila de un credito, y entonces su suma no es lo
 * que la contabilidad dijo que se debia.
 */
export function saldoAnteriorDe(f: {
  lineas: readonly LineaFactura[];
  saldoAnteriorDocumento?: number;
}): number {
  return f.saldoAnteriorDocumento ?? f.lineas.reduce((s, l) => s + l.saldoAnterior, 0);
}

/**
 * Si la factura esta en revision: su lectura se marco como dudosa y nadie de
 * la administracion la ha confirmado. Con ella no se paga, no se concilia y
 * no se decide "al dia" ni "mora".
 */
export function enRevision(f: { lecturaDudosa?: LecturaDudosa | null }): boolean {
  return !!f.lecturaDudosa && !f.lecturaDudosa.confirmada;
}

/** Tolerancia en pesos para considerar una deuda como saldada (redondeos). */
export const TOLERANCIA_PAGO = 1;

/**
 * El veredicto de la conciliacion sobre una factura, a partir de la factura
 * SIGUIENTE de su cadena: su saldo anterior dice cuanto quedo debiendo la
 * unidad.
 *
 *   saldo anterior == 0                 -> la anterior quedo PAGADA (o en saldo
 *                                          a favor, si su total era negativo)
 *   0 < saldo anterior < total anterior -> ABONADA (pago parcial)
 *   saldo anterior >= total anterior    -> VENCIDA (no pago; con intereses
 *                                          puede venir aun mayor)
 *
 * `null` si el par no se puede juzgar: alguna de las dos esta en revision, y
 * con un documento que no cuadra no se decide si la anterior se pago.
 *
 * Es la regla de `conciliarCadenaUnidad` (`facturas.ts`) y la del
 * re-procesamiento (`lib/reproceso.ts`): una sola, para que lo que se simula
 * sea lo que se aplica.
 */
export function veredictoConciliacion(
  anterior: { totalAPagar: number; lecturaDudosa?: LecturaDudosa | null },
  siguiente: {
    lineas: readonly LineaFactura[];
    saldoAnteriorDocumento?: number;
    lecturaDudosa?: LecturaDudosa | null;
  },
): EstadoFactura | null {
  if (enRevision(anterior) || enRevision(siguiente)) return null;
  const deuda = saldoAnteriorDe(siguiente);
  if (anterior.totalAPagar < 0 && deuda <= TOLERANCIA_PAGO) return "saldo_a_favor";
  if (deuda <= TOLERANCIA_PAGO) return "pagada";
  if (deuda < anterior.totalAPagar - TOLERANCIA_PAGO) return "abonada";
  return "vencida";
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
 *
 * `en_revision` no es un estado de deuda: es "no se puede decir". La factura
 * vigente —o la que decide la mora— tiene una lectura dudosa, y afirmar "al
 * dia" o "en mora" con ella seria afirmar lo que el documento no permite.
 */
export type EstadoCartera = "sin_facturas" | "al_dia" | "pendiente" | "en_mora" | "en_revision";

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

/** Las facturas del periodo mas reciente de la cadena. Normalmente una. */
function delUltimoPeriodo<F extends { periodo: string }>(cadena: readonly F[]): F[] {
  let ultimas: F[] = [];
  for (const f of cadena) {
    const orden = ultimas.length === 0 ? 1 : f.periodo.localeCompare(ultimas[0]!.periodo);
    if (orden > 0) ultimas = [f];
    else if (orden === 0) ultimas.push(f);
  }
  return ultimas;
}

/**
 * La factura vigente de una unidad: la del periodo mas reciente de su cadena.
 *
 * ── Por que esa ──────────────────────────────────────────────────────────
 * Cada factura absorbe lo que quedo debiendo la anterior (ver
 * `carteraDeUnidad`), asi que la ultima por periodo es la unica que dice
 * cuanto se debe hoy. Las demas son historial: aunque esten `vencida`,
 * `abonada` o `pendiente`, su saldo ya va dentro de una posterior, y
 * cobrarlas es cobrar dos veces lo mismo.
 *
 * ── Que NO la decide ─────────────────────────────────────────────────────
 * Ni el orden en que se cargaron, ni `_creationTime`, ni el id, ni el orden
 * en que llegaron los PDF: julio subido despues de septiembre sigue siendo
 * historial. Solo se compara el periodo, y el resultado no cambia aunque
 * `cadena` llegue en otro orden. Tampoco el estado: si la vigente esta
 * pagada la casa esta al dia, y no se retrocede a buscar una anterior sin
 * pagar.
 *
 * `null` si no hay facturas, o si dos comparten el periodo mas reciente (no
 * deberia pasar: es una por unidad y periodo). Elegir una de las dos seria
 * volver a depender del orden de carga, asi que no se adivina: nada se
 * ofrece para pagar hasta que la administracion lo revise.
 *
 * Es la definicion de toda la aplicacion: la usan el cobro
 * (`pagos.armarDatosTrn`, por `motivoNoPagable`), el bot y el agente
 * (`soportesPago.facturaVigenteDeUnidad`), la campana y la web y el movil
 * (por `resumenResidente`). Contencion de la Fase 1 de la auditoria de
 * facturacion: la Fase 3 la reemplaza por el modelo de obligaciones y pagos.
 */
export function facturaVigente<F extends { periodo: string }>(
  cadena: readonly F[],
): F | null {
  const ultimas = delUltimoPeriodo(cadena);
  return ultimas.length === 1 ? ultimas[0]! : null;
}

/** Por que no se puede pagar una factura. */
export type MotivoNoPagable =
  | "pagada"
  | "historica"
  | "vigente_ambigua"
  | "en_revision"
  | "sin_saldo";

/**
 * Si una factura se puede pagar hoy y, si no, por que.
 *
 * Solo se paga la vigente (`facturaVigente`) y solo si deja saldo. Una
 * historica no, este como este: lo que quedo debiendo ya lo cobra una
 * posterior. Es la regla del backend de pagos y la de los botones "Pagar",
 * para que lo que se ofrece y lo que se acepta no dejen de coincidir.
 *
 * Tampoco una vigente en revision: su total salio de una lectura dudosa del
 * PDF, y cobrarlo seria cobrar un numero que nadie ha verificado.
 *
 * `cadena` son TODAS las facturas de la unidad, `factura` incluida.
 */
export function motivoNoPagable(
  cadena: readonly { periodo: string }[],
  factura: {
    periodo: string;
    estado: EstadoFactura;
    totalAPagar: number;
    lecturaDudosa?: LecturaDudosa | null;
  },
): MotivoNoPagable | null {
  if (factura.estado === "pagada") return "pagada";
  const ultimas = delUltimoPeriodo(cadena);
  if (ultimas.length > 0 && factura.periodo.localeCompare(ultimas[0]!.periodo) < 0) {
    return "historica";
  }
  if (ultimas.length > 1) return "vigente_ambigua";
  if (enRevision(factura)) return "en_revision";
  if (!sinPagar(factura.estado) || factura.totalAPagar <= 0) return "sin_saldo";
  return null;
}

/**
 * Lo que se le responde a quien intenta pagar. Estables a proposito: el bot
 * y la web los reconocen por el texto. Sin ids ni detalles internos.
 */
export const MENSAJE_NO_PAGABLE: Readonly<Record<MotivoNoPagable, string>> = {
  pagada: "Esta factura ya está pagada.",
  historica:
    "Esta factura ya no está vigente: su saldo quedó incluido en la factura más reciente de la unidad.",
  vigente_ambigua:
    "Esta factura no se puede pagar en línea: la unidad tiene más de una factura del mismo período. Comunícate con la administración.",
  en_revision:
    "Esta factura está en revisión: la administración debe verificar su lectura antes de que se pueda pagar.",
  sin_saldo: "Esta factura no tiene saldo por pagar.",
};

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
 * Lo cubre tambien una factura POSTERIOR de la cadena que muestre pago,
 * porque absorbio ese saldo: agosto `vencida` que septiembre arrastro, y
 * septiembre `pagada`, es una casa que pago todo. Mirar solo a agosto la
 * dejaba en mora con saldo cero hasta que venciera septiembre (hallazgo de
 * la Fase 0 de la auditoria de facturacion). Y sin saldo no hay mora: la
 * mora es deber algo vencido, no haber debido.
 *
 * `vencida` no cuenta como cubierta, evidentemente. Y `pendiente` tampoco:
 * no es un estado de pago, es la ultima de la cadena, a la que todavia
 * ninguna factura posterior ha juzgado. Ausencia de veredicto, no constancia
 * de pago. Si contara, un conjunto que dejara de cargar facturas se veria
 * entero al dia mientras la deuda corre.
 *
 * Es una contencion sobre los estados que hoy pone la conciliacion: la Fase
 * 3 de la auditoria reemplaza esta inferencia por el modelo estructural de
 * obligaciones y pagos.
 *
 * ── Lecturas dudosas ─────────────────────────────────────────────────────
 * Si la vigente esta en revision (`enRevision`), o lo esta el periodo que
 * decidiria la mora, el estado es `en_revision`: ni "al dia" ni "mora" se
 * pueden afirmar con un documento cuyos numeros no cuadran. El saldo se
 * informa igual, como referencia para quien revisa.
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

  /* La obligacion vigente, la del periodo mas reciente (`facturaVigente`):
   * el orden de la cadena es el de la conciliacion, por periodo, que es como
   * el saldo pasa de una a otra. Si dos compartieran ese periodo —no deberia:
   * es una por unidad y periodo— no se elige por el orden de carga: se
   * reporta la que mas debe. */
  const ultimas = delUltimoPeriodo(facturas);

  /* Si la vigente estuviera `abonada` no se sabria cuanto se abono —eso lo
   * diria la siguiente, que no existe—, asi que se reporta el total. Preferir
   * pasarse a quedarse corto: una deuda subestimada en pantalla es peor que
   * una que el detalle matiza. */
  const saldoActual = Math.max(
    0,
    ...ultimas.map((f) => (conEvidenciaTotalDePago(f.estado) ? 0 : f.totalAPagar)),
  );

  const base: CarteraUnidad = {
    ...vacia,
    saldoActual,
    periodoActual: ultimas[0]!.periodo,
    estado: saldoActual > 0 ? "pendiente" : "al_dia",
  };

  if (ultimas.some(enRevision)) return { ...base, estado: "en_revision" };

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

  /* Nada ha vencido todavia: debe, pero dentro de plazo. */
  if (!ultimoVencido) return base;

  /* Lo que vencio quedo cubierto —por el mismo o por una posterior que lo
   * absorbio—, o ya no queda nada que deber. Llamarlo mora seria cobrarle un
   * atraso que no tiene. */
  const cubierto = facturas.some(
    (f) =>
      f.periodo.localeCompare(ultimoVencido.periodo) >= 0 && conEvidenciaDePago(f.estado),
  );
  if (cubierto || saldoActual === 0) return base;

  /* El periodo que decidiria la mora tiene una lectura dudosa: no se sabe. */
  if (enRevision(ultimoVencido)) return { ...base, estado: "en_revision" };

  return {
    ...base,
    estado: "en_mora",
    diasMora: diasDesde(ultimoVencido.fechaVencimiento, ahora),
    periodoEnMora: ultimoVencido.periodo,
    vencimientoEnMora: ultimoVencido.fechaVencimiento,
  };
}

// ─────────────────────────────────────────────────────────────
// Lo que ve el residente: la misma regla, por unidad
// ─────────────────────────────────────────────────────────────

/** Una unidad del residente, tal como se le muestra. */
export type UnidadResidente<F> = {
  unidadId: string;
  /** El mismo calculo que ve la administracion (`carteraDeUnidad`). */
  cartera: CarteraUnidad;
  /** La vigente (`facturaVigente`), pagada o no. */
  vigente: F | null;
  /** La vigente, si hoy se puede pagar (`motivoNoPagable`). */
  pagable: F | null;
};

export type ResumenResidente<F> = {
  /**
   * El de la unidad que peor esta: en mora, en revision, pendiente, al dia,
   * sin facturas.
   */
  estado: EstadoCartera;
  unidades: UnidadResidente<F>[];
  /** A lo sumo una por unidad: su vigente, cuando se puede pagar. */
  pagables: F[];
};

const PEOR_PRIMERO: readonly EstadoCartera[] = ["en_mora", "en_revision", "pendiente", "al_dia"];

/**
 * El estado de cuenta del residente, con la MISMA regla de la administracion.
 *
 * La web y el movil lo pintaban mirando el historial entero: bastaba una
 * factura vieja `vencida` —ya absorbida y saldada por las siguientes— para
 * mostrar "Vencida" a una casa al dia, y con la vigente pagada se ofrecia
 * pagar otra vez la anterior. Aqui no hay regla propia: por unidad, la
 * cartera sale de `carteraDeUnidad` y lo que se puede pagar de
 * `facturaVigente` + `motivoNoPagable`, que son las del backend.
 *
 * `facturas` son las del residente, de una o varias unidades, en cualquier
 * orden: tal como las entrega `facturas.listMia`.
 */
export function resumenResidente<F extends FacturaCartera & { unidadId: string }>(
  facturas: readonly F[],
  ahora: number,
): ResumenResidente<F> {
  const porUnidad = new Map<string, F[]>();
  for (const f of facturas) {
    const cadena = porUnidad.get(f.unidadId);
    if (cadena) cadena.push(f);
    else porUnidad.set(f.unidadId, [f]);
  }

  const unidades = [...porUnidad.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([unidadId, cadena]): UnidadResidente<F> => {
      const vigente = facturaVigente(cadena);
      return {
        unidadId,
        cartera: carteraDeUnidad(cadena, ahora),
        vigente,
        pagable: vigente && motivoNoPagable(cadena, vigente) === null ? vigente : null,
      };
    });

  return {
    estado:
      PEOR_PRIMERO.find((e) => unidades.some((u) => u.cartera.estado === e)) ??
      "sin_facturas",
    unidades,
    pagables: unidades.flatMap((u) => (u.pagable ? [u.pagable] : [])),
  };
}

// ─────────────────────────────────────────────────────────────
// Estado de cuenta: la misma cadena, factura por factura
// ─────────────────────────────────────────────────────────────

export type FacturaCadena = FacturaCartera & { periodoLabel: string };

export type FilaEstadoCuenta = {
  periodo: string;
  periodoLabel: string;
  estado: EstadoFactura;
  fechaVencimiento: number;
  totalAPagar: number;
};

/**
 * Las facturas de una unidad, una por una, tal como las dejo la conciliacion.
 *
 * ── Esto es historial, no deuda ──────────────────────────────────────────
 * Sirve para auditar como se llego hasta aqui. Cuanto se debe hoy lo dice
 * `carteraDeUnidad`, y sale de una sola factura: la vigente.
 *
 * Por lo mismo no se devuelven dias de vencida por factura. Ver "116 dias"
 * en abril y "85" en mayo invita a leerlos como dos moras que se acumulan,
 * cuando son la misma deuda contada dos veces. La mora es una y esta en
 * `carteraDeUnidad`.
 *
 * Tampoco se devuelven concepto, abono ni saldo por factura: el estado de
 * cuenta ya no los muestra. Si quedo pagada, abonada o vencida lo dice el
 * estado que puso la conciliacion.
 *
 * `cadena` debe venir ordenada del periodo mas viejo al mas nuevo.
 */
export function estadoCuentaDeCadena(
  cadena: readonly FacturaCadena[],
): FilaEstadoCuenta[] {
  return cadena.map((f) => ({
    periodo: f.periodo,
    periodoLabel: f.periodoLabel,
    estado: f.estado,
    fechaVencimiento: f.fechaVencimiento,
    totalAPagar: f.totalAPagar,
  }));
}
