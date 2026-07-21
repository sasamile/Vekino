import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

export type MinutaModulo =
  | "visitantes"
  | "paqueteria"
  | "reservas"
  | "novedades"
  | "minuta";

/** Turno de guardia abierto del condominio (máximo uno a la vez), o null. */
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
 * Registra un evento en la minuta digital (append-only).
 *
 * Réplica de la regla transversal de VekinoApi: casi toda acción de portería
 * genera automáticamente su entrada de minuta, sellada con el actor y ligada
 * al turno abierto si existe.
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
  const turnoId =
    args.turnoId ?? (await turnoAbierto(ctx, args.condominioId))?._id;
  await ctx.db.insert("minutaEventos", {
    condominioId: args.condominioId,
    turnoId,
    modulo: args.modulo,
    tipo: args.tipo,
    unidad: args.unidad,
    resumen: args.resumen,
    estado: args.estado ?? "cerrado",
    actorUserId: args.actorUserId,
    actorNombre: args.actorNombre,
    createdAt: Date.now(),
  });
}
