import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { TipoNovedadItem } from "./roles";
import type { Cambio } from "../lib/inventario";
import { displayNameFromUser } from "./displayName";

/**
 * EL ÚNICO SITIO QUE ESCRIBE EN `inventarioNovedades`.
 *
 * Réplica de `model/minuta.ts:logMinuta` en el eje del inventario, y por el
 * mismo motivo que allí: cada operación sobre un elemento genera su entrada de
 * historial automáticamente, sellada con quién obró. Pedírselo a cada mutación
 * garantiza que la que se escriba dentro de tres meses se olvide, y un
 * historial con huecos es peor que no tenerlo — porque se confía en él.
 *
 * Append-only: no hay función para editar ni para borrar una novedad, y no la
 * habrá. Un historial que se puede reescribir no prueba nada.
 */
export async function logNovedadItem(
  ctx: MutationCtx,
  args: {
    itemId: Id<"inventarioItems">;
    companiaId: Id<"companiasSeguridad">;
    tipo: TipoNovedadItem;
    descripcion: string;
    cambios?: Cambio[];
    /** Quien obra. Se pasa ya resuelto: las mutaciones lo tienen del authz. */
    actor: Doc<"users">;
    /**
     * Reservados para la asignación a conjuntos y guardas (tareas 2 y 3).
     * Hoy nadie los pasa; están en la firma para que cuando llegue ese flujo
     * el historial no se bifurque en un mecanismo paralelo.
     */
    condominioId?: Id<"condominios">;
    guardaUserId?: Id<"users">;
  },
): Promise<Id<"inventarioNovedades">> {
  return await ctx.db.insert("inventarioNovedades", {
    itemId: args.itemId,
    companiaId: args.companiaId,
    tipo: args.tipo,
    descripcion: args.descripcion,
    /* Se omite si no hay nada que contar, en vez de guardar un array vacío:
     * `cambios: []` y "no se registraron cambios" se leen igual desde la
     * pantalla, y uno de los dos sobra. */
    ...(args.cambios && args.cambios.length > 0 ? { cambios: args.cambios } : {}),
    ...(args.condominioId ? { condominioId: args.condominioId } : {}),
    ...(args.guardaUserId ? { guardaUserId: args.guardaUserId } : {}),
    actorUserId: args.actor._id,
    actorNombre: displayNameFromUser(args.actor),
    createdAt: Date.now(),
  });
}

/**
 * El historial de un elemento, del más reciente al más antiguo.
 *
 * Por índice `by_item` y con tope: el detalle de un elemento con dos mil
 * movimientos no puede costar leerlos todos para pintar los veinte que caben
 * en la pantalla.
 */
export async function historialDeItem(
  ctx: QueryCtx,
  itemId: Id<"inventarioItems">,
  limite: number,
): Promise<Doc<"inventarioNovedades">[]> {
  return await ctx.db
    .query("inventarioNovedades")
    .withIndex("by_item", (q) => q.eq("itemId", itemId))
    .order("desc")
    .take(limite);
}
