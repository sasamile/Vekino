import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { displayNameFromUser } from "./displayName";

/**
 * DÓNDE ESTÁ CADA ELEMENTO.
 *
 * Las lecturas de custodia en un solo sitio, igual que `model/minuta.ts` y
 * `model/inventarioNovedad.ts`: las usan tanto el listado del inventario como
 * la ficha del elemento y las propias mutaciones de asignación, y tres copias
 * de "cuál es la activa" acabarían discrepando en el peor momento.
 *
 * La regla que sostiene todo el módulo: **como máximo una custodia activa por
 * elemento**. No se guarda en ninguna parte que lo esté — se comprueba con el
 * índice `by_item_devuelta`, que es lo que la hace verificable en una lectura
 * en vez de una esperanza depositada en que nadie escriba dos filas.
 */

type Ctx = QueryCtx | MutationCtx;

/**
 * La custodia abierta de un elemento, si la hay.
 *
 * Una sola lectura indexada. `first()` y no `unique()` a propósito: `unique()`
 * lanza si hubiera dos filas abiertas, y eso convertiría una inconsistencia
 * —que las mutaciones ya impiden— en una pantalla que no carga. Con `first()`
 * la ficha se pinta y el problema se ve; sin él, no se vería nada.
 */
export async function custodiaActiva(
  ctx: Ctx,
  itemId: Id<"inventarioItems">,
): Promise<Doc<"inventarioAsignaciones"> | null> {
  return await ctx.db
    .query("inventarioAsignaciones")
    .withIndex("by_item_devuelta", (q) =>
      q.eq("itemId", itemId).eq("devueltaEn", undefined),
    )
    .first();
}

/** El historial de custodias de un elemento, de la más reciente a la más antigua. */
export async function custodiasDeItem(
  ctx: Ctx,
  itemId: Id<"inventarioItems">,
  limite: number,
): Promise<Doc<"inventarioAsignaciones">[]> {
  return await ctx.db
    .query("inventarioAsignaciones")
    .withIndex("by_item", (q) => q.eq("itemId", itemId))
    .order("desc")
    .take(limite);
}

/**
 * Todas las custodias abiertas de una compañía, indexadas por elemento.
 *
 * ES LO QUE EVITA EL N+1 DEL LISTADO. Preguntar "¿dónde está?" elemento por
 * elemento serían mil lecturas para pintar una tabla de mil filas; así es una
 * sola, y encima acotada por lo que la compañía tiene FUERA, que siempre es
 * menos que su inventario entero.
 */
export async function custodiasActivasDeCompania(
  ctx: Ctx,
  companiaId: Id<"companiasSeguridad">,
  tope: number,
): Promise<{
  porItem: Map<Id<"inventarioItems">, Doc<"inventarioAsignaciones">>;
  /**
   * El mapa NO está completo: había más custodias abiertas que el tope.
   *
   * Hay que decirlo, y no es un detalle. Quien pregunte por un elemento que
   * se quedó fuera del mapa no puede recibir "está en la compañía": eso es
   * una respuesta FALSA sobre dónde está un objeto físico, que es peor que
   * no responder. Con esta bandera, la pantalla dice "no se sabe".
   */
  incompleto: boolean;
}> {
  /* Más recientes primero, igual que el listado de elementos: si hay que
   * quedarse con una parte, que sea la que el usuario está mirando. */
  const abiertas = await ctx.db
    .query("inventarioAsignaciones")
    .withIndex("by_compania_devuelta", (q) =>
      q.eq("companiaId", companiaId).eq("devueltaEn", undefined),
    )
    .order("desc")
    .take(tope + 1);

  const porItem = new Map<
    Id<"inventarioItems">,
    Doc<"inventarioAsignaciones">
  >();
  for (const a of abiertas.slice(0, tope)) porItem.set(a.itemId, a);
  return { porItem, incompleto: abiertas.length > tope };
}

/**
 * Nombres de conjuntos, cacheados dentro de una misma consulta.
 *
 * Una compañía atiende unos pocos conjuntos, así que un listado de mil
 * elementos repartidos entre cinco porterías cuesta cinco lecturas y no mil.
 * El nombre se resuelve al leer y no se copia en la fila: si el conjunto se
 * renombra, el listado tiene que decir el nombre de hoy. (El histórico es
 * otra cosa: ahí el nombre va copiado dentro del texto de la novedad, que es
 * lo que le da sentido meses después.)
 */
export function cacheDeCondominios(ctx: Ctx) {
  /**
   * Guarda la PROMESA y no el valor. Con `cache.set(id, await get(id))` el
   * `await` suspende ANTES de escribir en el mapa, así que dentro de un
   * `Promise.all` los quinientos llamadores comprueban `has()` de forma
   * síncrona, todos fallan y todos lanzan su lectura: el caché solo
   * deduplicaba si se le llamaba en serie, y aquí nadie lo hace. Medido:
   * 500 lecturas para un único conjunto.
   */
  const cache = new Map<
    Id<"condominios">,
    Promise<Doc<"condominios"> | null>
  >();
  return async (id: Id<"condominios">) => {
    if (!cache.has(id)) cache.set(id, ctx.db.get(id));
    return (await cache.get(id)) ?? null;
  };
}

/** La custodia tal como la consume la pantalla. */
export type VistaCustodia = {
  _id: Id<"inventarioAsignaciones">;
  condominioId: Id<"condominios">;
  condominioNombre: string;
  asignadaEn: number;
  asignadaPorNombre: string | null;
  observacionAsignacion: string | null;
  devueltaEn: number | null;
  devueltaPorNombre: string | null;
  observacionDevolucion: string | null;
  /** Derivado, nunca guardado: sigue abierta mientras no tenga devolución. */
  activa: boolean;
};

/**
 * Hidrata una custodia con los nombres que la pantalla necesita.
 *
 * Recibe los resolutores en vez de leer por su cuenta para que quien pinta una
 * lista los comparta y no repita la misma lectura por fila.
 */
export async function aVistaCustodia(
  ctx: Ctx,
  a: Doc<"inventarioAsignaciones">,
  condominio: (id: Id<"condominios">) => Promise<Doc<"condominios"> | null>,
  usuario: (id: Id<"users">) => Promise<Doc<"users"> | null>,
): Promise<VistaCustodia> {
  const [condo, quienAsigno, quienDevolvio] = await Promise.all([
    condominio(a.condominioId),
    usuario(a.asignadaPorUserId),
    a.devueltaPorUserId ? usuario(a.devueltaPorUserId) : Promise.resolve(null),
  ]);
  return {
    _id: a._id,
    condominioId: a.condominioId,
    condominioNombre: condo?.name ?? "(conjunto eliminado)",
    asignadaEn: a.asignadaEn,
    asignadaPorNombre: quienAsigno ? displayNameFromUser(quienAsigno) : null,
    observacionAsignacion: a.observacionAsignacion ?? null,
    devueltaEn: a.devueltaEn ?? null,
    devueltaPorNombre: quienDevolvio
      ? displayNameFromUser(quienDevolvio)
      : null,
    observacionDevolucion: a.observacionDevolucion ?? null,
    activa: a.devueltaEn == null,
  };
}

/** Mismo cacheo que el de conjuntos, para los actores del historial. */
export function cacheDeUsuarios(ctx: Ctx) {
  /* Misma trampa que en cacheDeCondominios: la promesa, no el valor. */
  const cache = new Map<Id<"users">, Promise<Doc<"users"> | null>>();
  return async (id: Id<"users">) => {
    if (!cache.has(id)) cache.set(id, ctx.db.get(id));
    return (await cache.get(id)) ?? null;
  };
}
