import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireCondominioRole } from "./model/authz";

const WRITE_ROLES = ["administrador", "junta_directiva", "contadora", "guardia"] as const;
const ADMIN_ROLES = ["administrador", "junta_directiva", "contadora"] as const;

const tipoValidator = v.union(
  v.literal("visita"),
  v.literal("paquete"),
  v.literal("incidente"),
  v.literal("mantenimiento"),
  v.literal("otro")
);
const turnoValidator = v.union(
  v.literal("mañana"),
  v.literal("tarde"),
  v.literal("noche")
);

export const listByCondominio = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, []);
    return await ctx.db
      .query("novedades")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    condominioId: v.id("condominios"),
    tipo: tipoValidator,
    descripcion: v.string(),
    unidadNumero: v.optional(v.string()),
    turno: turnoValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await requireCondominioRole(ctx, args.condominioId, [...WRITE_ROLES]);
    return await ctx.db.insert("novedades", {
      condominioId: args.condominioId,
      tipo: args.tipo,
      descripcion: args.descripcion.trim(),
      unidadNumero: args.unidadNumero?.trim(),
      autorNombre: user.name,
      turno: args.turno,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("novedades") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Novedad no encontrada.");
    await requireCondominioRole(ctx, existing.condominioId, [...ADMIN_ROLES]);
    await ctx.db.delete(args.id);
  },
});
