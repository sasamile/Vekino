/**
 * Lo que se calcula de una ronda: cuanto duro y que paso.
 *
 * Aparte del resto del modulo porque son cuentas, no accesos a la base: la
 * duracion y el orden de la linea de tiempo son justo lo que conviene poder
 * probar sin levantar nada.
 */

const MINUTO = 60_000;
const HORA = 60 * MINUTO;

/**
 * "1 hora y 3 minutos".
 *
 * En palabras y no en "01:03:00" porque esto va en el reporte que lee la
 * administracion, no en un panel de sistemas. Los segundos no aparecen: una
 * ronda no se mide asi y darlos sugiere una precision que no existe.
 */
export function duracionTexto(
  inicio: number | undefined,
  fin: number | undefined,
): string | null {
  if (inicio == null || fin == null || fin < inicio) return null;
  const total = fin - inicio;
  const horas = Math.floor(total / HORA);
  const minutos = Math.round((total % HORA) / MINUTO);
  /* 59 minutos y medio se redondean a 60, y "0 horas y 60 minutos" no lo
   * dice nadie. */
  const h = minutos === 60 ? horas + 1 : horas;
  const m = minutos === 60 ? 0 : minutos;

  const partes: string[] = [];
  if (h > 0) partes.push(`${h} ${h === 1 ? "hora" : "horas"}`);
  if (m > 0) partes.push(`${m} ${m === 1 ? "minuto" : "minutos"}`);
  if (partes.length === 0) return "menos de un minuto";
  return partes.join(" y ");
}

/** Milisegundos entre inicio y cierre, para ordenar y comparar. */
export function duracionMs(
  inicio: number | undefined,
  fin: number | undefined,
): number | null {
  if (inicio == null || fin == null || fin < inicio) return null;
  return fin - inicio;
}

export type Hito = {
  en: number;
  tipo: "inicio" | "novedad" | "vehiculo" | "evento" | "cierre";
  titulo: string;
  detalle?: string | null;
  quien?: string | null;
  fotos?: number;
};

/**
 * Ordena los hitos cronologicamente para el reporte.
 *
 * El inicio va primero y el cierre ultimo aunque compartan milisegundo con
 * otro registro: un evento que cae en el mismo instante que la apertura tiene
 * que leerse DESPUES de ella, o la linea de tiempo empieza por la mitad.
 */
export function ordenarLineaDeTiempo(hitos: Hito[]): Hito[] {
  const peso = (t: Hito["tipo"]) => (t === "inicio" ? 0 : t === "cierre" ? 2 : 1);
  return [...hitos].sort(
    (a, b) => a.en - b.en || peso(a.tipo) - peso(b.tipo),
  );
}

/** Los numeros del encabezado del reporte. */
export function contar(hitos: Hito[]): {
  novedades: number;
  vehiculos: number;
  eventos: number;
} {
  return {
    novedades: hitos.filter((h) => h.tipo === "novedad").length,
    vehiculos: hitos.filter((h) => h.tipo === "vehiculo").length,
    eventos: hitos.filter((h) => h.tipo === "evento").length,
  };
}

/**
 * El estado de una ronda vieja, que no tenia ninguno.
 *
 * Se lee como finalizada: desde luego no esta en curso, y dejarla sin estado
 * la sacaria de todos los listados.
 */
export function estadoDeRonda(
  estado: string | undefined,
): "en_curso" | "finalizada" {
  return estado === "en_curso" ? "en_curso" : "finalizada";
}
