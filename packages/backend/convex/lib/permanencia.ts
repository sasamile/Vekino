/**
 * Aritmética de tramos de conexión.
 *
 * Todo aquí es puro: recibe números, devuelve números. Ni `ctx` ni base de
 * datos. Es a propósito — esta es la parte que decide si un acta se sostiene,
 * y quiero poder razonarla (y probarla) sin levantar Convex.
 *
 * Un TRAMO es un intervalo `[entroEn, salioEn)`. `salioEn: null` significa
 * "sigue conectado ahora mismo".
 */

export type Tramo = {
  entroEn: number;
  salioEn: number | null;
};

/** Ventana de la asamblea. `hasta: null` = todavía en curso. */
export type Ventana = {
  desde: number;
  hasta: number | null;
};

/**
 * Une tramos que se solapan o se tocan.
 *
 * Hace falta porque una misma unidad puede tener dos tramos abiertos a la
 * vez: el dueño entra por su cuenta y su apoderado entra por la suya. Sin
 * fusionar, ese minuto se contaría dos veces y la permanencia pasaría del
 * 100 %.
 */
export function fusionarTramos(tramos: Tramo[], ahora: number): Tramo[] {
  if (tramos.length === 0) return [];

  // Un tramo abierto se cierra "en ahora" solo para poder compararlo.
  const norm = tramos
    .map((t) => ({
      entroEn: t.entroEn,
      salioEn: t.salioEn,
      fin: t.salioEn ?? ahora,
    }))
    .filter((t) => t.fin >= t.entroEn)
    .sort((a, b) => a.entroEn - b.entroEn);

  const out: { entroEn: number; salioEn: number | null; fin: number }[] = [];
  for (const t of norm) {
    const ultimo = out[out.length - 1];
    if (ultimo && t.entroEn <= ultimo.fin) {
      // Se solapan: extiende el que ya estaba.
      if (t.fin > ultimo.fin) {
        ultimo.fin = t.fin;
        // Si alguno de los dos sigue abierto, el fusionado sigue abierto.
        ultimo.salioEn = t.salioEn === null ? null : t.salioEn;
      } else if (t.salioEn === null) {
        ultimo.salioEn = null;
      }
      continue;
    }
    out.push({ ...t });
  }

  return out.map((t) => ({ entroEn: t.entroEn, salioEn: t.salioEn }));
}

/**
 * Milisegundos conectados dentro de la ventana de la asamblea.
 *
 * Recorta a la ventana: lo que ocurrió antes de que la asamblea iniciara no
 * cuenta como permanencia. Espera tramos YA fusionados.
 */
export function msConectados(
  tramos: Tramo[],
  ventana: Ventana,
  ahora: number,
): number {
  const finVentana = ventana.hasta ?? ahora;
  if (finVentana <= ventana.desde) return 0;

  let total = 0;
  for (const t of tramos) {
    const ini = Math.max(t.entroEn, ventana.desde);
    const fin = Math.min(t.salioEn ?? ahora, finVentana);
    if (fin > ini) total += fin - ini;
  }
  return total;
}

/** ¿Había alguien conectado por esta unidad en el instante `t`? */
export function presenteEn(tramos: Tramo[], t: number, ahora: number): boolean {
  return tramos.some(
    (tr) => tr.entroEn <= t && (tr.salioEn ?? ahora) > t,
  );
}

/** Duración de la asamblea en milisegundos. */
export function duracionVentana(ventana: Ventana, ahora: number): number {
  const fin = ventana.hasta ?? ahora;
  return Math.max(0, fin - ventana.desde);
}

/**
 * Porcentaje de la asamblea que estuvo conectada la unidad, 0-100 con dos
 * decimales. Si la ventana aún no tiene duración devuelve 0 en vez de
 * dividir por cero.
 */
export function pctPermanencia(
  msConectado: number,
  msTotales: number,
): number {
  if (msTotales <= 0) return 0;
  const pct = (msConectado / msTotales) * 100;
  return Math.round(Math.min(100, pct) * 100) / 100;
}

/** "4 h 12 min" — para el acta y los reportes, no para calcular nada. */
export function formatearDuracion(ms: number): string {
  if (ms <= 0) return "0 min";
  const minutosTotales = Math.floor(ms / 60000);
  const horas = Math.floor(minutosTotales / 60);
  const minutos = minutosTotales % 60;
  if (horas === 0) return `${minutos} min`;
  if (minutos === 0) return `${horas} h`;
  return `${horas} h ${minutos} min`;
}
