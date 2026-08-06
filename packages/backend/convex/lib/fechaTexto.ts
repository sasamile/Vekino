/**
 * Interpretación de fechas y horas escritas por una persona en WhatsApp.
 *
 * Nadie escribe "15/09/2026" cuando quiere decir "el 20 de agosto" o "mañana".
 * Exigir un formato exacto es lo que hace que un bot se sienta bot, así que
 * aquí se acepta lo que la gente realmente escribe y solo se rinde cuando de
 * verdad es ambiguo.
 */

const MESES: Record<string, number> = {
  enero: 1, ene: 1,
  febrero: 2, feb: 2,
  marzo: 3, mar: 3,
  abril: 4, abr: 4,
  mayo: 5, may: 5,
  junio: 6, jun: 6,
  julio: 7, jul: 7,
  agosto: 8, ago: 8,
  septiembre: 9, setiembre: 9, sep: 9, sept: 9, set: 9,
  octubre: 10, oct: 10,
  noviembre: 11, nov: 11,
  diciembre: 12, dic: 12,
};

/** 0 = domingo, como en zonasComunes.horariosPorDia. */
const DIAS_SEMANA: Record<string, number> = {
  domingo: 0, dom: 0,
  lunes: 1, lun: 1,
  martes: 2, mar: 2,
  miercoles: 3, mier: 3, mie: 3,
  jueves: 4, jue: 4,
  viernes: 5, vie: 5,
  sabado: 6, sab: 6,
};

export function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Día de la semana (0=domingo) de una fecha ISO, sin líos de zona horaria. */
export function diaSemanaDeISO(fechaISO: string): number {
  return new Date(`${fechaISO}T12:00:00Z`).getUTCDay();
}

function sumarDias(fechaISO: string, dias: number): string {
  const d = new Date(`${fechaISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function diasEnMes(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Interpreta una fecha escrita libremente.
 *
 * Acepta: "15/09/2026", "15-9-26", "2026-09-15", "20 de agosto",
 * "20 ago", "20 de agosto de 2026", "hoy", "mañana", "pasado mañana",
 * "el sábado", "próximo viernes", "20/8".
 *
 * Sin año, elige la próxima ocurrencia futura (nadie reserva para el pasado).
 * Devuelve "YYYY-MM-DD" o null si de verdad no se entiende.
 */
export function parseFechaFlexible(
  entrada: string,
  hoyISO: string,
): string | null {
  const t = normalizarTexto(entrada).replace(/\s+/g, " ");
  if (!t) return null;

  const [hoyY, hoyM, hoyD] = hoyISO.split("-").map(Number) as [number, number, number];

  // Relativas
  if (/^hoy\b/.test(t)) return hoyISO;
  if (/^man+ana\b/.test(t) || /^el dia de man+ana\b/.test(t)) {
    return sumarDias(hoyISO, 1);
  }
  if (/^pasado man+ana\b/.test(t)) return sumarDias(hoyISO, 2);
  if (/^en (\d{1,3}) dias?\b/.test(t)) {
    const n = Number(t.match(/^en (\d{1,3}) dias?\b/)![1]);
    if (n > 0 && n < 366) return sumarDias(hoyISO, n);
  }

  // Día de la semana: "el sábado", "próximo viernes", "este lunes"
  const mDia = t.match(
    /^(?:el |este |esta |proximo |proxima |el proximo |la proxima )?(domingo|lunes|martes|miercoles|jueves|viernes|sabado|dom|lun|mar|mie|mier|jue|vie|sab)\b/,
  );
  if (mDia) {
    const objetivo = DIAS_SEMANA[mDia[1]!];
    if (objetivo !== undefined) {
      const actual = diaSemanaDeISO(hoyISO);
      let delta = (objetivo - actual + 7) % 7;
      // "el sábado" dicho un sábado = el próximo, no hoy.
      if (delta === 0) delta = 7;
      if (/proxim/.test(t) && delta < 7) delta += 0; // "próximo X" ya cae bien
      return sumarDias(hoyISO, delta);
    }
  }

  // ISO: 2026-09-15
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    return valida(y, mo, d) ? iso(y, mo, d) : null;
  }

  // Numérica con año: 15/09/2026, 15-9-26
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    const d = Number(m[1]), mo = Number(m[2]);
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    return valida(y, mo, d) ? iso(y, mo, d) : null;
  }

  // Numérica sin año: 20/8, 20-08
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    const d = Number(m[1]), mo = Number(m[2]);
    return proximaOcurrencia(d, mo, hoyY, hoyM, hoyD);
  }

  // Con nombre de mes: "20 de agosto", "20 ago", "20 de agosto de 2026",
  // "agosto 20"
  m = t.match(/^(\d{1,2})\s*(?:de\s+)?([a-z]+)(?:\s*(?:de\s+|del\s+)?(\d{2,4}))?$/);
  if (m) {
    const d = Number(m[1]);
    const mo = MESES[m[2]!];
    if (mo) {
      if (m[3]) {
        let y = Number(m[3]);
        if (y < 100) y += 2000;
        return valida(y, mo, d) ? iso(y, mo, d) : null;
      }
      return proximaOcurrencia(d, mo, hoyY, hoyM, hoyD);
    }
  }
  m = t.match(/^([a-z]+)\s+(\d{1,2})(?:\s*(?:de\s+|del\s+)?(\d{2,4}))?$/);
  if (m) {
    const mo = MESES[m[1]!];
    const d = Number(m[2]);
    if (mo) {
      if (m[3]) {
        let y = Number(m[3]);
        if (y < 100) y += 2000;
        return valida(y, mo, d) ? iso(y, mo, d) : null;
      }
      return proximaOcurrencia(d, mo, hoyY, hoyM, hoyD);
    }
  }

  return null;
}

function valida(y: number, mo: number, d: number): boolean {
  if (mo < 1 || mo > 12 || d < 1) return false;
  if (y < 2000 || y > 2100) return false;
  return d <= diasEnMes(y, mo);
}

/** Sin año: este año si aún no pasó, si no el siguiente. */
function proximaOcurrencia(
  d: number,
  mo: number,
  hoyY: number,
  hoyM: number,
  hoyD: number,
): string | null {
  if (mo < 1 || mo > 12 || d < 1) return null;
  let y = hoyY;
  if (mo < hoyM || (mo === hoyM && d < hoyD)) y = hoyY + 1;
  if (d > diasEnMes(y, mo)) return null;
  return iso(y, mo, d);
}

/**
 * Interpreta un rango horario escrito libremente.
 *
 * Acepta: "14:00-18:00", "2 a 6", "de 2 a 6 pm", "2pm a 6pm",
 * "de 9 de la mañana a 12", "14 a 18", "8:30 a 12:30".
 *
 * Con horas "peladas" (sin am/pm) usa el sentido común de una reserva:
 * 1–7 se entiende como tarde, 8–12 como mañana; y si el rango queda
 * invertido, se asume que el final es PM ("de 6 a 10" = 18:00–22:00).
 */
export function parseRangoHorasFlexible(entrada: string): [string, string] | null {
  const t = normalizarTexto(entrada)
    .replace(/\s+/g, " ")
    .replace(/\./g, "")
    .replace(/\bhoras?\b/g, "")
    .replace(/\bhrs?\b/g, "")
    .replace(/\bdesde\b/g, "")
    .replace(/\bde la manana\b/g, "am")
    .replace(/\bde la tarde\b/g, "pm")
    .replace(/\bde la noche\b/g, "pm")
    .replace(/\bmedio ?dia\b/g, "12pm")
    .replace(/\ba m\b/g, "am")
    .replace(/\bp m\b/g, "pm")
    .trim();

  const m = t.match(
    /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|a|hasta|al?)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/,
  );
  if (!m) return null;

  const h1 = Number(m[1]);
  const min1 = m[2] ?? "00";
  const mer1 = m[3] as "am" | "pm" | undefined;
  const h2 = Number(m[4]);
  const min2 = m[5] ?? "00";
  const mer2 = m[6] as "am" | "pm" | undefined;

  if (h1 > 24 || h2 > 24 || Number(min1) > 59 || Number(min2) > 59) return null;

  let inicio = aplicarMeridiano(h1, mer1 ?? mer2);
  let fin = aplicarMeridiano(h2, mer2 ?? mer1);
  if (inicio === null || fin === null) return null;

  // Rango invertido con horas peladas: "de 6 a 10" es 18:00–22:00.
  if (fin <= inicio && !mer2 && fin + 12 <= 23) fin += 12;
  if (fin <= inicio) return null;

  return [
    `${String(inicio).padStart(2, "0")}:${min1}`,
    `${String(fin).padStart(2, "0")}:${min2}`,
  ];
}

function aplicarMeridiano(h: number, mer: "am" | "pm" | undefined): number | null {
  if (h > 24) return null;
  if (mer === "am") return h === 12 ? 0 : h;
  if (mer === "pm") return h === 12 ? 12 : h + 12;
  // Sin am/pm: 13–24 ya viene en 24 h; 1–7 se entiende como tarde.
  if (h >= 13) return h === 24 ? 24 : h;
  if (h >= 1 && h <= 7) return h + 12;
  return h;
}
