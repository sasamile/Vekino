import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { coberturaQueAmpara } from "./cobertura";
import { hasPlatformRole } from "./authz";

export type MinutaModulo =
  | "visitantes"
  | "paqueteria"
  | "reservas"
  | "novedades"
  | "minuta";

/** Roles que administran la portería del conjunto (los `ADMIN_ROLES` de `guardia.ts`). */
const ADMIN_PORTERIA = ["administrador", "junta_directiva"] as const;

/**
 * La plataforma o la administración del conjunto: cierran cualquier turno y
 * finalizan cualquier ronda.
 */
export function administraLaPorteria(
  user: Doc<"users">,
  membership: Doc<"memberships"> | null,
): boolean {
  return (
    hasPlatformRole(user, "superadmin", "admin") ||
    (membership?.roles ?? []).some((r) => (ADMIN_PORTERIA as readonly string[]).includes(r))
  );
}

// ─────────────────────────────────────────────────────────────
// Capacidad de turnos: la portería de siempre o turnos independientes
// ─────────────────────────────────────────────────────────────

/** Sin configurar, un turno a la vez: lo de siempre. */
export const CAPACIDAD_POR_DEFECTO = 1;
/** Tope de cordura del formulario: ninguna portería tiene cincuenta celadores a la vez. */
export const CAPACIDAD_MAXIMA = 50;

/**
 * Cuántos turnos pueden estar abiertos a la vez en el conjunto.
 *
 * La capacidad decide además CÓMO se opera:
 *   - 1: la portería de siempre. Hay un turno abierto, que es de la portería
 *     y lo comparten todos los que trabajan en ella (`turnoDelActorEntre`).
 *   - 2 o más: turnos independientes. Cada celador abre, opera y cierra el
 *     suyo, y nada de lo que hace cae en el turno o la ronda de otro.
 * Por eso `guardia.configurarVigilancia` no deja pasar de un modo al otro con
 * turnos abiertos: cambiaría bajo qué reglas siguen trabajando.
 */
export function capacidadDeTurnos(condominio: Doc<"condominios"> | null): number {
  return condominio?.vigilancia?.maxTurnosActivos ?? CAPACIDAD_POR_DEFECTO;
}

export function sonTurnosIndependientes(capacidad: number): boolean {
  return capacidad > 1;
}

/** Si `userId` es del turno: su titular o el compañero vinculado por usuario. */
export function esDelTurno(turno: Doc<"guardiaTurnos">, userId: Id<"users">): boolean {
  return turno.guardiaUserId === userId || turno.guardiaSecundarioUserId === userId;
}

/**
 * Los turnos abiertos del conjunto, del más antiguo al más nuevo.
 *
 * Son como mucho la capacidad, así que se leen todos. Leer el rango entero es
 * además lo que hace atómico el control de cupos: si dos mutaciones lo leen y
 * una inserta o cierra un turno en él, Convex repite la otra, que vuelve a
 * contar.
 */
export async function turnosAbiertos(
  ctx: QueryCtx | MutationCtx,
  condominioId: Id<"condominios">,
): Promise<Doc<"guardiaTurnos">[]> {
  return await ctx.db
    .query("guardiaTurnos")
    .withIndex("by_condominio_estado", (q) =>
      q.eq("condominioId", condominioId).eq("estado", "abierto"),
    )
    .collect();
}

/**
 * El turno abierto más antiguo del condominio, o null.
 *
 * Es "el" turno de la portería de siempre (capacidad 1). Con turnos
 * independientes no dice nada de nadie: para eso, `turnoDelActorEntre`.
 */
export async function turnoAbierto(
  ctx: QueryCtx | MutationCtx,
  condominioId: Id<"condominios">,
): Promise<Doc<"guardiaTurnos"> | null> {
  return await ctx.db
    .query("guardiaTurnos")
    .withIndex("by_condominio_estado", (q) =>
      q.eq("condominioId", condominioId).eq("estado", "abierto"),
    )
    .first();
}

/**
 * El turno bajo el que opera alguien, entre los abiertos del conjunto.
 *
 *   1. El suyo, si está en uno (titular o compañero vinculado).
 *   2. Si no está en ninguno: en la portería de siempre, el turno abierto —es
 *      de la portería, y quien trabaja en ella lo hace bajo ese turno, como
 *      el compañero escrito a mano—; con turnos independientes, ninguno.
 *      Nunca el de otro celador.
 */
export function turnoDelActorEntre(
  abiertos: Doc<"guardiaTurnos">[],
  capacidad: number,
  userId?: Id<"users">,
): Doc<"guardiaTurnos"> | null {
  const propio = userId ? abiertos.find((t) => esDelTurno(t, userId)) : undefined;
  if (propio) return propio;
  if (sonTurnosIndependientes(capacidad)) return null;
  return abiertos[0] ?? null;
}

/**
 * Ronda en curso del condominio, o null. En la portería de siempre hay como
 * mucho una.
 *
 * Se consulta por indice y no recorriendo el turno: cada evento de porteria
 * pasa por aqui, y esto tiene que costar lo mismo con diez rondas que con
 * diez mil.
 */
export async function rondaEnCurso(
  ctx: QueryCtx | MutationCtx,
  condominioId: Id<"condominios">,
): Promise<Doc<"guardiaRondas"> | null> {
  return await ctx.db
    .query("guardiaRondas")
    .withIndex("by_condominio_estado", (q) =>
      q.eq("condominioId", condominioId).eq("estado", "en_curso"),
    )
    .first();
}

/** Las rondas en curso del condominio: con turnos independientes, una por celador. */
export async function rondasEnCurso(
  ctx: QueryCtx | MutationCtx,
  condominioId: Id<"condominios">,
): Promise<Doc<"guardiaRondas">[]> {
  return await ctx.db
    .query("guardiaRondas")
    .withIndex("by_condominio_estado", (q) =>
      q.eq("condominioId", condominioId).eq("estado", "en_curso"),
    )
    .collect();
}

/** Bajo qué turno y qué ronda queda lo que hace alguien en la portería. */
export type Operacion = {
  capacidad: number;
  independientes: boolean;
  turno: Doc<"guardiaTurnos"> | null;
  ronda: Doc<"guardiaRondas"> | null;
};

/**
 * EL TURNO Y LA RONDA DE QUIEN OPERA. Lo usan `logMinuta` y cada mutación
 * que cuelga algo de un turno o de una ronda, para que la regla sea una sola.
 *
 * El turno, por `turnoDelActorEntre`. La ronda:
 *   - en la portería de siempre, la ronda en curso del conjunto, como hasta
 *     ahora: hay una sola y es la de todos;
 *   - con turnos independientes, la que ese celador tiene en curso DENTRO de
 *     su turno. La de un compañero no es suya, y una que dejó abierta en un
 *     turno anterior tampoco: no se le cuelga nada de lo de hoy.
 */
export async function operacionDe(
  ctx: QueryCtx | MutationCtx,
  condominioId: Id<"condominios">,
  userId?: Id<"users">,
): Promise<Operacion> {
  const [condominio, abiertos] = await Promise.all([
    ctx.db.get(condominioId),
    turnosAbiertos(ctx, condominioId),
  ]);
  const capacidad = capacidadDeTurnos(condominio);
  const independientes = sonTurnosIndependientes(capacidad);
  const turno = turnoDelActorEntre(abiertos, capacidad, userId);

  let ronda: Doc<"guardiaRondas"> | null = null;
  if (!independientes) {
    ronda = await rondaEnCurso(ctx, condominioId);
  } else if (turno && userId) {
    ronda =
      (await rondasEnCurso(ctx, condominioId)).find(
        (r) => r.turnoId === turno._id && r.guardiaUserId === userId,
      ) ?? null;
  }
  return { capacidad, independientes, turno, ronda };
}

/**
 * Registra un evento en la minuta digital (append-only).
 *
 * Réplica de la regla transversal de VekinoApi: casi toda acción de portería
 * genera automáticamente su entrada de minuta, sellada con el actor y ligada
 * al turno bajo el que opera (`operacionDe`), si hay uno.
 */
export async function logMinuta(
  ctx: MutationCtx,
  args: {
    condominioId: Id<"condominios">;
    modulo: MinutaModulo;
    tipo: string;
    unidad: string;
    resumen: string;
    estado?: "abierto" | "cerrado";
    actorUserId?: Id<"users">;
    actorNombre: string;
    turnoId?: Id<"guardiaTurnos">;
  },
): Promise<void> {
  const op = await operacionDe(ctx, args.condominioId, args.actorUserId);
  const turnoId = args.turnoId ?? op.turno?._id;
  /* La ronda se engancha sola. La especificacion pide que cada registro
   * quede asociado a la ronda activa, y este es el unico sitio por donde
   * pasan todos: pedirselo a cada mutacion garantizaria que alguna se
   * olvidara. Con turnos independientes, solo si la ronda es del turno del
   * evento: quien cierra el turno de un compañero no lo cuelga de su ronda. */
  const rondaId =
    op.ronda && (!op.independientes || op.ronda.turnoId === turnoId)
      ? op.ronda._id
      : undefined;
  /* El contexto del ACTOR, no el del turno: el turno es de la portería y
   * puede haberlo abierto otro guarda. Igual que la ronda, se sella aquí para
   * que ninguna mutación se olvide. Sin actor no hay de quién sellarlo. */
  const coberturaId = args.actorUserId
    ? await coberturaQueAmpara(ctx, args.actorUserId, args.condominioId)
    : null;
  await ctx.db.insert("minutaEventos", {
    condominioId: args.condominioId,
    turnoId,
    rondaId,
    modulo: args.modulo,
    tipo: args.tipo,
    unidad: args.unidad,
    resumen: args.resumen,
    estado: args.estado ?? "cerrado",
    actorUserId: args.actorUserId,
    actorNombre: args.actorNombre,
    ...(coberturaId ? { coberturaId } : {}),
    createdAt: Date.now(),
  });
}
