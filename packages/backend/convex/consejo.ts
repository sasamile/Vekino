import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireCondominioRole } from "./model/authz";

const WRITE_ROLES = ["administrador", "junta_directiva"] as const;

const cargoValidator = v.union(
  v.literal("presidente"),
  v.literal("vicepresidente"),
  v.literal("secretario"),
  v.literal("tesorero"),
  v.literal("vocal"),
  v.literal("fiscal"),
  v.literal("suplente")
);
const tipoValidator = v.union(v.literal("ordinaria"), v.literal("extraordinaria"));

// ─── Miembros ───────────────────────────────────────────────────────────────

export const listMiembros = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, []);
    return await ctx.db
      .query("consejoMiembros")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();
  },
});

export const createMiembro = mutation({
  args: {
    condominioId: v.id("condominios"),
    nombre: v.string(),
    cargo: cargoValidator,
    unidadNumero: v.optional(v.string()),
    telefono: v.optional(v.string()),
    email: v.optional(v.string()),
    periodoInicio: v.optional(v.string()),
    periodoFin: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...WRITE_ROLES]);
    const now = Date.now();
    return await ctx.db.insert("consejoMiembros", {
      condominioId: args.condominioId,
      nombre: args.nombre.trim(),
      cargo: args.cargo,
      unidadNumero: args.unidadNumero?.trim(),
      telefono: args.telefono?.trim(),
      email: args.email?.trim().toLowerCase(),
      periodoInicio: args.periodoInicio,
      periodoFin: args.periodoFin,
      activo: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateMiembro = mutation({
  args: {
    id: v.id("consejoMiembros"),
    nombre: v.optional(v.string()),
    cargo: v.optional(cargoValidator),
    unidadNumero: v.optional(v.string()),
    telefono: v.optional(v.string()),
    email: v.optional(v.string()),
    periodoInicio: v.optional(v.string()),
    periodoFin: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Miembro no encontrado.");
    await requireCondominioRole(ctx, existing.condominioId, [...WRITE_ROLES]);
    const { id, ...rest } = args;
    await ctx.db.patch(id, {
      ...rest,
      nombre: rest.nombre?.trim() ?? existing.nombre,
      email: rest.email !== undefined ? rest.email.trim().toLowerCase() : existing.email,
      updatedAt: Date.now(),
    });
  },
});

export const toggleMiembro = mutation({
  args: { id: v.id("consejoMiembros") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Miembro no encontrado.");
    await requireCondominioRole(ctx, existing.condominioId, [...WRITE_ROLES]);
    await ctx.db.patch(args.id, { activo: !existing.activo, updatedAt: Date.now() });
  },
});

export const removeMiembro = mutation({
  args: { id: v.id("consejoMiembros") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Miembro no encontrado.");
    await requireCondominioRole(ctx, existing.condominioId, [...WRITE_ROLES]);
    await ctx.db.delete(args.id);
  },
});

// ─── Sesiones ───────────────────────────────────────────────────────────────

export const listSesiones = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, []);
    return await ctx.db
      .query("consejoSesiones")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .collect();
  },
});

export const createSesion = mutation({
  args: {
    condominioId: v.id("condominios"),
    titulo: v.string(),
    tipo: tipoValidator,
    fecha: v.string(),
    asistentes: v.optional(v.number()),
    temas: v.optional(v.string()),
    acuerdos: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...WRITE_ROLES]);
    const now = Date.now();
    return await ctx.db.insert("consejoSesiones", {
      condominioId: args.condominioId,
      titulo: args.titulo.trim(),
      tipo: args.tipo,
      fecha: args.fecha,
      asistentes: args.asistentes,
      temas: args.temas?.trim(),
      acuerdos: args.acuerdos?.trim(),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const removeSesion = mutation({
  args: { id: v.id("consejoSesiones") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Sesión no encontrada.");
    await requireCondominioRole(ctx, existing.condominioId, [...WRITE_ROLES]);
    await ctx.db.delete(args.id);
  },
});
