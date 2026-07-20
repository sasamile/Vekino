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

const estadoValidator = v.union(
  v.literal("pendiente"),
  v.literal("aprobada"),
  v.literal("rechazada"),
  v.literal("cancelada")
);

// ─── Zonas comunes ────────────────────────────────────────────

export const listZonas = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, []);
    return await ctx.db
      .query("zonasComunes")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();
  },
});

export const createZona = mutation({
  args: {
    condominioId: v.id("condominios"),
    nombre: v.string(),
    capacidad: v.optional(v.number()),
    descripcion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...ADMIN_ROLES]);
    const now = Date.now();
    return await ctx.db.insert("zonasComunes", {
      condominioId: args.condominioId,
      nombre: args.nombre.trim(),
      capacidad: args.capacidad,
      descripcion: args.descripcion?.trim(),
      activa: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const toggleZona = mutation({
  args: { id: v.id("zonasComunes") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Zona no encontrada.");
    await requireCondominioRole(ctx, existing.condominioId, [...ADMIN_ROLES]);
    await ctx.db.patch(args.id, { activa: !existing.activa, updatedAt: Date.now() });
  },
});

export const removeZona = mutation({
  args: { id: v.id("zonasComunes") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Zona no encontrada.");
    await requireCondominioRole(ctx, existing.condominioId, [...ADMIN_ROLES]);
    await ctx.db.delete(args.id);
  },
});

// ─── Reservas ─────────────────────────────────────────────────

export const listByCondominio = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, []);
    return await ctx.db
      .query("reservas")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .collect();
  },
});

/** Conteo liviano de reservas pendientes (home). Escanea como máximo 120 recientes. */
export const countPendientes = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, []);
    const recent = await ctx.db
      .query("reservas")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .take(120);
    return recent.filter((r) => r.estado === "pendiente").length;
  },
});

export const create = mutation({
  args: {
    condominioId: v.id("condominios"),
    unidadId: v.id("unidades"),
    zonaId: v.id("zonasComunes"),
    fecha: v.string(),
    horaInicio: v.string(),
    horaFin: v.string(),
    observaciones: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCondominioRole(ctx, args.condominioId, [...ADMIN_ROLES]);
    const zona = await ctx.db.get(args.zonaId);
    if (!zona) throw new Error("Zona no encontrada.");
    const unidad = await ctx.db.get(args.unidadId);
    if (!unidad) throw new Error("Unidad no encontrada.");
    const now = Date.now();
    return await ctx.db.insert("reservas", {
      condominioId: args.condominioId,
      unidadId: args.unidadId,
      zonaId: args.zonaId,
      zonaNombre: zona.nombre,
      unidadNumero: unidad.numero,
      solicitanteNombre: user.name,
      fecha: args.fecha,
      horaInicio: args.horaInicio,
      horaFin: args.horaFin,
      estado: "pendiente",
      observaciones: args.observaciones?.trim(),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateEstado = mutation({
  args: {
    id: v.id("reservas"),
    estado: estadoValidator,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Reserva no encontrada.");
    await requireCondominioRole(ctx, existing.condominioId, [...ADMIN_ROLES]);
    await ctx.db.patch(args.id, { estado: args.estado, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("reservas") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Reserva no encontrada.");
    await requireCondominioRole(ctx, existing.condominioId, [...ADMIN_ROLES]);
    await ctx.db.delete(args.id);
  },
});

// ─────────────────────────────────────────────────────────────
// API del propietario: crea y ve las reservas de SUS unidades.
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

/** Reservas de las unidades del usuario autenticado (más recientes primero). */
export const listMias = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) return [];
    const unidadIds = await misUnidadIds(ctx, user._id, args.condominioId);
    if (unidadIds.size === 0) return [];

    const reservas = await ctx.db
      .query("reservas")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .collect();

    return reservas.filter((r) => unidadIds.has(r.unidadId));
  },
});

/** El propietario crea una reserva para una de SUS unidades (queda pendiente). */
export const createMia = mutation({
  args: {
    condominioId: v.id("condominios"),
    unidadId: v.id("unidades"),
    zonaId: v.id("zonasComunes"),
    fecha: v.string(),
    horaInicio: v.string(),
    horaFin: v.string(),
    observaciones: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    const unidadIds = await misUnidadIds(ctx, user._id, args.condominioId);
    if (!unidadIds.has(args.unidadId)) {
      throw new Error("Esa unidad no está vinculada a tu cuenta.");
    }
    const zona = await ctx.db.get(args.zonaId);
    if (!zona || zona.condominioId !== args.condominioId) {
      throw new Error("Zona no encontrada.");
    }
    if (!zona.activa) throw new Error("Esa zona no está disponible.");
    const unidad = await ctx.db.get(args.unidadId);
    if (!unidad) throw new Error("Unidad no encontrada.");

    if (args.horaFin <= args.horaInicio) {
      throw new Error("La hora de fin debe ser posterior a la de inicio.");
    }

    const now = Date.now();
    return await ctx.db.insert("reservas", {
      condominioId: args.condominioId,
      unidadId: args.unidadId,
      zonaId: args.zonaId,
      zonaNombre: zona.nombre,
      unidadNumero: unidad.numero,
      solicitanteNombre: user.name,
      fecha: args.fecha,
      horaInicio: args.horaInicio,
      horaFin: args.horaFin,
      estado: "pendiente",
      observaciones: args.observaciones?.trim(),
      createdAt: now,
      updatedAt: now,
    });
  },
});
