/**
 * Horarios que cruzan la medianoche.
 *
 * El salon social abre a las 09:00 y cierra a las 02:00 del dia siguiente.
 * Todo el modulo de reservas asumia que la hora de fin es mayor que la de
 * inicio, y con esa premisa tres cosas fallaban a la vez:
 *
 *  1. No se podia ni configurar la zona: "la hora de fin debe ser mayor que
 *     la de inicio". Es el sintoma que se ve.
 *
 *  2. Una franja 09:00-02:00 dejaba pasar cualquier reserva que empezara
 *     tarde y rechazaba las de media manana, porque comparaba "12:00" <=
 *     "02:00" como texto.
 *
 *  3. Lo peor y lo invisible: el solape. Dos reservas de viernes 23:00-01:00
 *     y sabado 00:00-02:00 se pisan una hora, pero como se guardan con
 *     FECHAS distintas y se comparaban solo entre si, el sistema las daba
 *     por compatibles y aprobaba las dos. Dos familias en el mismo salon.
 *
 * La solucion es dejar de comparar textos y pasar a minutos absolutos: cada
 * instante es "dia * 1440 + minuto del dia", asi una reserva que termina a
 * la 01:00 del sabado es un numero mayor que una que empieza el viernes a
 * las 23:00, y el solape se calcula con la resta de siempre.
 *
 * Sin `ctx` ni dependencias: se puede probar sin levantar Convex.
 */

const MINUTOS_POR_DIA = 24 * 60;

/** "HH:MM" → minutos desde medianoche. `null` si no tiene esa forma. */
export function aMinutos(hora: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hora ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 24 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Un rango horario en minutos, con el fin siempre por delante del inicio.
 *
 * Cuando el fin no supera al inicio se entiende que cae al dia siguiente y
 * se le suman 24 horas. Es la unica regla del archivo, y de ella sale todo
 * lo demas.
 */
export function rango(
  horaInicio: string,
  horaFin: string,
): { inicio: number; fin: number } | null {
  const inicio = aMinutos(horaInicio);
  const fin = aMinutos(horaFin);
  if (inicio == null || fin == null) return null;
  /* 09:00-09:00 no es "cero horas", es "todo el dia": es como se escribe una
   * zona 24 h, y tratarlo como vacio dejaria la zona inservible. */
  return { inicio, fin: fin <= inicio ? fin + MINUTOS_POR_DIA : fin };
}

/** ¿Termina al dia siguiente? (para avisarlo en pantalla). */
export function cruzaMedianoche(horaInicio: string, horaFin: string): boolean {
  const r = rango(horaInicio, horaFin);
  return r != null && r.fin > MINUTOS_POR_DIA;
}

/** "2026-09-04" → indice de dia, para poder sumar y restar fechas. */
export function indiceDeDia(fecha: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? "")) return null;
  const t = Date.parse(fecha + "T00:00:00Z");
  return Number.isNaN(t) ? null : Math.floor(t / 86_400_000);
}

/**
 * El rango de una reserva en minutos absolutos desde una fecha de referencia.
 *
 * Es lo que permite comparar una reserva del viernes con una del sabado sin
 * que la medianoche las separe artificialmente.
 */
export function rangoAbsoluto(
  fecha: string,
  horaInicio: string,
  horaFin: string,
): { inicio: number; fin: number } | null {
  const dia = indiceDeDia(fecha);
  const r = rango(horaInicio, horaFin);
  if (dia == null || r == null) return null;
  const base = dia * MINUTOS_POR_DIA;
  return { inicio: base + r.inicio, fin: base + r.fin };
}

/** Solape de intervalos abiertos: tocarse en un extremo no es pisarse. */
export function seSolapan(
  a: { inicio: number; fin: number },
  b: { inicio: number; fin: number },
): boolean {
  return a.inicio < b.fin && b.inicio < a.fin;
}

/**
 * ¿La reserva cabe entera dentro de alguna franja de apertura de su dia?
 *
 * Las franjas se anclan al dia de la reserva; si la franja cruza la
 * medianoche, su final ya viene desplazado al dia siguiente y una reserva
 * que termina a la 01:00 encaja sin trucos.
 */
export function cabeEnAlgunaFranja(
  reserva: { inicio: number; fin: number },
  franjas: { horaInicio: string; horaFin: string }[],
): boolean {
  return franjas.some((f) => {
    const r = rango(f.horaInicio, f.horaFin);
    return r != null && reserva.inicio >= r.inicio && reserva.fin <= r.fin;
  });
}

/** Las fechas que hay que mirar para detectar solapes con la del dia dado. */
export function fechasVecinas(fecha: string): string[] {
  const dia = indiceDeDia(fecha);
  if (dia == null) return [fecha];
  const iso = (d: number) =>
    new Date(d * 86_400_000).toISOString().slice(0, 10);
  /* La vispera importa: una reserva del viernes que termina a la 01:00 del
   * sabado se guarda con fecha del VIERNES, y sin mirar atras una reserva
   * del sabado a las 00:30 no la veria. */
  return [iso(dia - 1), fecha, iso(dia + 1)];
}
