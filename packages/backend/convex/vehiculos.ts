import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  requireCondominioRole,
  requireAppUser,
  getCurrentAppUser,
  getMembership,
} from "./model/authz";

const ADMIN_ROLES = ["administrador", "junta_directiva", "contadora"] as const;

const tipoValidator = v.union(
  v.literal("carro"),
  v.literal("moto"),
  v.literal("bicicleta"),
  v.literal("otro")
);

export const listByCondominio = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, []);
    const vehiculos = await ctx.db
      .query("vehiculos")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();

    const unidadIds = [...new Set(vehiculos.map((v) => v.unidadId))];
    const unidades = await Promise.all(unidadIds.map((id) => ctx.db.get(id)));
    const unidadMap = new Map(
      unidades.filter(Boolean).map((u) => [u!._id, u!.numero])
    );

    return vehiculos
      .map((v) => ({ ...v, unidadNumero: unidadMap.get(v.unidadId) ?? "—" }))
      .sort((a, b) => a.placa.localeCompare(b.placa));
  },
});

export const create = mutation({
  args: {
    condominioId: v.id("condominios"),
    unidadId: v.id("unidades"),
    placa: v.string(),
    tipo: tipoValidator,
    marca: v.optional(v.string()),
    color: v.optional(v.string()),
    observaciones: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...ADMIN_ROLES]);
    const now = Date.now();
    return await ctx.db.insert("vehiculos", {
      condominioId: args.condominioId,
      unidadId: args.unidadId,
      placa: args.placa.toUpperCase().trim(),
      tipo: args.tipo,
      marca: args.marca?.trim(),
      color: args.color?.trim(),
      observaciones: args.observaciones?.trim(),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("vehiculos"),
    unidadId: v.id("unidades"),
    placa: v.string(),
    tipo: tipoValidator,
    marca: v.optional(v.string()),
    color: v.optional(v.string()),
    observaciones: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Vehículo no encontrado.");
    await requireCondominioRole(ctx, existing.condominioId, [...ADMIN_ROLES]);
    await ctx.db.patch(args.id, {
      unidadId: args.unidadId,
      placa: args.placa.toUpperCase().trim(),
      tipo: args.tipo,
      marca: args.marca?.trim(),
      color: args.color?.trim(),
      observaciones: args.observaciones?.trim(),
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("vehiculos") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Vehículo no encontrado.");
    await requireCondominioRole(ctx, existing.condominioId, [...ADMIN_ROLES]);
    await ctx.db.delete(args.id);
  },
});

// ─────────────────────────────────────────────────────────────
// API del propietario: registra y ve los vehículos de SUS unidades.
// ─────────────────────────────────────────────────────────────

/** Unidades vinculadas al usuario en el condominio. */
async function misUnidadIds(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  condominioId: Id<"condominios">,
): Promise<Set<Id<"unidades">>> {
  const membership = await getMembership(ctx, userId, condominioId);
  if (!membership || !membership.isActive) return new Set();
  const links = await ctx.db
    .query("usuarioUnidad")
    .withIndex("by_membership", (q) => q.eq("membershipId", membership._id))
    .collect();
  return new Set(links.map((l) => l.unidadId));
}

/** Vehículos de las unidades del usuario autenticado. */
export const listMios = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) return [];
    const unidadIds = await misUnidadIds(ctx, user._id, args.condominioId);
    if (unidadIds.size === 0) return [];

    const vehiculos = await ctx.db
      .query("vehiculos")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();

    const mios = vehiculos.filter((veh) => unidadIds.has(veh.unidadId));
    const unidades = await Promise.all([...unidadIds].map((id) => ctx.db.get(id)));
    const numeros = new Map(
      unidades.filter(Boolean).map((u) => [u!._id, u!.numero]),
    );

    return mios
      .map((veh) => ({ ...veh, unidadNumero: numeros.get(veh.unidadId) ?? "—" }))
      .sort((a, b) => a.placa.localeCompare(b.placa));
  },
});

/** El propietario registra un vehículo en una de SUS unidades. */
export const createMio = mutation({
  args: {
    condominioId: v.id("condominios"),
    unidadId: v.id("unidades"),
    placa: v.string(),
    tipo: tipoValidator,
    marca: v.optional(v.string()),
    color: v.optional(v.string()),
    observaciones: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    const unidadIds = await misUnidadIds(ctx, user._id, args.condominioId);
    if (!unidadIds.has(args.unidadId)) {
      throw new Error("Esa unidad no está vinculada a tu cuenta.");
    }
    const placa = args.placa.toUpperCase().trim();
    if (!placa) throw new Error("La placa es obligatoria.");

    const now = Date.now();
    return await ctx.db.insert("vehiculos", {
      condominioId: args.condominioId,
      unidadId: args.unidadId,
      placa,
      tipo: args.tipo,
      marca: args.marca?.trim(),
      color: args.color?.trim(),
      observaciones: args.observaciones?.trim(),
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** El propietario elimina un vehículo de SUS unidades. */
export const removeMio = mutation({
  args: { id: v.id("vehiculos") },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    const veh = await ctx.db.get(args.id);
    if (!veh) throw new Error("Vehículo no encontrado.");
    const unidadIds = await misUnidadIds(ctx, user._id, veh.condominioId);
    if (!unidadIds.has(veh.unidadId)) throw new Error("No autorizado.");
    await ctx.db.delete(args.id);
  },
});
