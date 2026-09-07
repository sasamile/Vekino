/**
 * Las cuentas del modelo de vigilancia: vigencias, solapes y capacidades.
 *
 * Aparte del resto del modulo porque no tocan la base. Que un contrato este
 * vigente, que dos asignaciones choquen o que un rol habilite una operacion
 * son decisiones que conviene poder probar sin levantar nada, igual que se
 * hizo con `lib/ronda.ts`.
 */

/**
 * Un dia de margen al final.
 *
 * El contrato que vence "el 31" cubre el 31 completo, no hasta las 00:00 de
 * ese dia. Es el mismo criterio que `model/authz.ts:vigentes()` aplica a los
 * vinculos de unidad, y tienen que coincidir: si no, un arrendatario y un
 * guarda con la misma fecha de fin dejarian de tener acceso en dias
 * distintos.
 */
export const FIN_DEL_DIA = 24 * 60 * 60 * 1000;

/** Periodo de validez. Sin `vigenciaHasta` es indefinido. */
export type Rango = {
  vigenciaDesde: number;
  vigenciaHasta?: number | undefined;
};

/** Estado derivado de las fechas. No se guarda: se calcula al leer. */
export type EstadoVigencia = "programada" | "vigente" | "terminada";

/** Instante en que el rango deja de cubrir. `Infinity` si es indefinido. */
function finDe(r: Rango): number {
  return r.vigenciaHasta == null ? Infinity : r.vigenciaHasta + FIN_DEL_DIA;
}

/**
 * Si el rango cubre este instante.
 *
 * Se filtra al leer y no con un cron a proposito: un cron se puede caer,
 * atrasar o no haber corrido todavia, y el dia que eso pase habria personal
 * de una compania sin contrato entrando a un conjunto. Filtrando al leer, el
 * corte es exacto.
 */
export function estaVigente(r: Rango, ahora: number = Date.now()): boolean {
  return r.vigenciaDesde <= ahora && ahora < finDe(r);
}

export function estadoVigencia(
  r: Rango,
  ahora: number = Date.now(),
): EstadoVigencia {
  if (ahora < r.vigenciaDesde) return "programada";
  if (ahora < finDe(r)) return "vigente";
  return "terminada";
}

/** Deja solo lo que cubre este instante. */
export function vigentes<T extends Rango>(
  items: readonly T[],
  ahora: number = Date.now(),
): T[] {
  return items.filter((i) => estaVigente(i, ahora));
}

/**
 * Si dos periodos se pisan en algun momento.
 *
 * Dos rangos que se tocan justo en el borde NO se solapan: un contrato que
 * termina el 30 de junio y otro que empieza el 1 de julio es un relevo
 * limpio, y tratarlo como conflicto obligaria a dejar un dia sin vigilancia.
 */
export function haySolape(a: Rango, b: Rango): boolean {
  return a.vigenciaDesde < finDe(b) && b.vigenciaDesde < finDe(a);
}

/**
 * Si el periodo `interno` cabe dentro de `externo`.
 *
 * Una asignacion no puede durar mas que el contrato que la ampara: asignar
 * un guarda hasta enero bajo un contrato que termina en diciembre promete un
 * acceso que el modelo va a negar, y el error aparece un mes despues en la
 * porteria en vez de al guardar.
 */
export function cabeDentro(interno: Rango, externo: Rango): boolean {
  return (
    interno.vigenciaDesde >= externo.vigenciaDesde &&
    finDe(interno) <= finDe(externo)
  );
}

// ─────────────────────────────────────────────────────────────
// Capacidades
//
// Reemplazan a las listas de roles sueltas que hoy declara cada modulo
// (`GUARD_ROLES` esta duplicada en guardia.ts, rondas.ts y aporte.ts, y
// novedades.ts tiene otra distinta). Con dos ejes de pertenencia la pregunta
// "puede operar aqui" deja de ser un rol: es rol + contrato + vigencia, y una
// lista de literales no puede expresar eso.
// ─────────────────────────────────────────────────────────────

export const CAPACIDADES = [
  /** Abrir y cerrar turno, minuta, rondas, visitantes, paqueteria, novedades. */
  "porteria.operar",
  /** Leer todo lo de porteria sin escribir. */
  "porteria.ver",
  /** Zonas de ronda, plantillas de checklist, motivos de vehiculo. */
  "porteria.configurar",
  /** Mover una novedad a cobrada o descartada. */
  "porteria.gestionar",
  /** Alta, baja y roles del personal de una compania. */
  "seguridad.personal",
  /** Crear y terminar asignaciones bajo un contrato. */
  "seguridad.asignar",
  /** Crear, suspender y terminar contratos compania <-> conjunto. */
  "seguridad.contratar",
] as const;

export type Capacidad = (typeof CAPACIDADES)[number];

/** Rol operativo dentro de un conjunto, tal como vive en `memberships.roles`. */
type RolConjunto = string;

/**
 * Lo que habilita cada rol del eje residencial.
 *
 * Replica lo que hoy hacen las constantes locales: GUARD_ROLES incluye a
 * administrador y junta_directiva, no solo a guardia.
 */
const POR_ROL_CONJUNTO: Record<string, readonly Capacidad[]> = {
  administrador: [
    "porteria.operar",
    "porteria.ver",
    "porteria.configurar",
    "porteria.gestionar",
  ],
  junta_directiva: ["porteria.operar", "porteria.ver", "porteria.configurar"],
  guardia: ["porteria.operar", "porteria.ver"],
  contadora: [],
};

/**
 * Lo que habilita el rol con el que alguien esta asignado a un conjunto.
 *
 * El guarda de compania recibe hoy lo mismo que el guarda directo. La
 * distincion existe como costura —son dos tablas distintas— pero no se
 * estrecha todavia: hacerlo bien exige decidir que datos personales de los
 * residentes puede tratar un tercero, y eso es una decision legal (Ley 1581)
 * que no corresponde tomar aqui. Cuando se tome, se cambia esta tabla y no
 * ciento noventa llamadas.
 */
const POR_ROL_ASIGNACION: Record<string, readonly Capacidad[]> = {
  guardia: ["porteria.operar", "porteria.ver"],
  supervisor: ["porteria.ver", "seguridad.asignar"],
};

/** Lo que habilita pertenecer a una compania, sin mirar conjunto alguno. */
const POR_ROL_COMPANIA: Record<string, readonly Capacidad[]> = {
  admin_compania: ["seguridad.personal", "seguridad.asignar"],
  supervisor: [],
  guardia: [],
};

function desde(
  tabla: Record<string, readonly Capacidad[]>,
  roles: readonly string[],
): Set<Capacidad> {
  const out = new Set<Capacidad>();
  for (const rol of roles) {
    for (const cap of tabla[rol] ?? []) out.add(cap);
  }
  return out;
}

export function capacidadesDeRolesConjunto(
  roles: readonly RolConjunto[],
): Set<Capacidad> {
  return desde(POR_ROL_CONJUNTO, roles);
}

export function capacidadesDeRolAsignacion(rol: string): Set<Capacidad> {
  return desde(POR_ROL_ASIGNACION, [rol]);
}

export function capacidadesDeRolesCompania(
  roles: readonly string[],
): Set<Capacidad> {
  return desde(POR_ROL_COMPANIA, roles);
}

/** El staff de plataforma mantiene el paso libre que ya tiene hoy. */
export function capacidadesDePlataforma(): Set<Capacidad> {
  return new Set(CAPACIDADES);
}

export function unir(...conjuntos: Set<Capacidad>[]): Set<Capacidad> {
  const out = new Set<Capacidad>();
  for (const c of conjuntos) for (const x of c) out.add(x);
  return out;
}
