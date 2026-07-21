import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  getCurrentAppUser,
  getMembership,
  hasPlatformRole,
  requireAppUser,
  requireCondominioRole,
  requirePlatformStaff,
} from "./model/authz";
import { displayNameFromUser } from "./model/displayName";

const categoriaValidator = v.union(
  v.literal("factura"),
  v.literal("acceso"),
  v.literal("app"),
  v.literal("otro"),
);

const estadoValidator = v.union(
  v.literal("abierto"),
  v.literal("en_gestion"),
  v.literal("resuelto"),
  v.literal("cerrado"),
);

/**
 * El residente pide ayuda (factura, acceso, app…).
 * Llega al administrador del condominio y a superadmins de plataforma.
 */
export const crear = mutation({
  args: {
    condominioId: v.optional(v.id("condominios")),
    categoria: categoriaValidator,
    asunto: v.string(),
    mensaje: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    const asunto = args.asunto.trim();
    const mensaje = args.mensaje.trim();
    if (!asunto || !mensaje) throw new Error("Asunto y mensaje son obligatorios.");

    let condominioNombre: string | undefined;
    if (args.condominioId) {
      const condo = await ctx.db.get(args.condominioId);
      if (!condo) throw new Error("Condominio no encontrado.");
      const isPlatform = hasPlatformRole(user, "superadmin", "admin");
      const membership = await getMembership(ctx, user._id, args.condominioId);
      if (!isPlatform && (!membership || !membership.isActive)) {
        throw new Error("No tienes acceso a este condominio.");
      }
      condominioNombre = condo.name;
    }

    const now = Date.now();
    return await ctx.db.insert("soporteTickets", {
      condominioId: args.condominioId,
      condominioNombre,
      userId: user._id,
      userNombre: displayNameFromUser(user),
      userEmail: user.email,
      categoria: args.categoria,
      asunto,
      mensaje,
      estado: "abierto",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Mis solicitudes de soporte. */
export const listMias = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) return [];
    return await ctx.db
      .query("soporteTickets")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(50);
  },
});

/** Tickets del condominio (admin / junta). */
export const listByCondominio = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [
      "administrador",
      "junta_directiva",
    ]);
    return await ctx.db
      .query("soporteTickets")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .take(100);
  },
});

/** Todos los tickets (superadmin / admin de plataforma). */
export const listAll = query({
  args: { soloAbiertos: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);
    const rows = await ctx.db.query("soporteTickets").order("desc").take(200);
    if (args.soloAbiertos) {
      return rows.filter((t) => t.estado === "abierto" || t.estado === "en_gestion");
    }
    return rows;
  },
});

/** Responder / cambiar estado (admin del condo o plataforma). */
export const responder = mutation({
  args: {
    id: v.id("soporteTickets"),
    respuesta: v.string(),
    estado: v.optional(estadoValidator),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.id);
    if (!ticket) throw new Error("Ticket no encontrado.");
    const user = await requireAppUser(ctx);
    const isPlatform = hasPlatformRole(user, "superadmin", "admin");

    if (!isPlatform) {
      if (!ticket.condominioId) {
        throw new Error("Solo plataforma puede atender tickets sin condominio.");
      }
      await requireCondominioRole(ctx, ticket.condominioId, [
        "administrador",
        "junta_directiva",
      ]);
    }

    const respuesta = args.respuesta.trim();
    if (!respuesta) throw new Error("La respuesta es obligatoria.");
    const now = Date.now();
    await ctx.db.patch(args.id, {
      respuesta,
      estado: args.estado ?? "resuelto",
      respondidoPorUserId: user._id,
      respondidoPorNombre: displayNameFromUser(user),
      respondidoAt: now,
      updatedAt: now,
    });
  },
});

export const setEstado = mutation({
  args: {
    id: v.id("soporteTickets"),
    estado: estadoValidator,
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.id);
    if (!ticket) throw new Error("Ticket no encontrado.");
    const user = await requireAppUser(ctx);
    const isPlatform = hasPlatformRole(user, "superadmin", "admin");
    if (!isPlatform) {
      if (!ticket.condominioId) throw new Error("Sin permiso.");
      await requireCondominioRole(ctx, ticket.condominioId, [
        "administrador",
        "junta_directiva",
      ]);
    }
    await ctx.db.patch(args.id, { estado: args.estado, updatedAt: Date.now() });
  },
});
