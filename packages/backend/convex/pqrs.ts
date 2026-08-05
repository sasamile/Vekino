import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, mutation, internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getMembership, requireCondominioRole } from "./model/authz";

const GESTION_ROLES = ["administrador", "junta_directiva", "contadora"] as const;

const tipoValidator = v.union(
  v.literal("peticion"),
  v.literal("queja"),
  v.literal("reclamo"),
  v.literal("sugerencia"),
  v.literal("felicitacion")
);
const estadoValidator = v.union(
  v.literal("abierto"),
  v.literal("en_gestion"),
  v.literal("resuelto"),
  v.literal("cerrado")
);
const prioridadValidator = v.union(v.literal("baja"), v.literal("media"), v.literal("alta"));

export const listByCondominio = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, []);
    return await ctx.db
      .query("pqrs")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .collect();
  },
});

export const countsByCondominio = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, []);
    const rows = await ctx.db
      .query("pqrs")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .take(2000);
    return {
      total: rows.length,
      abierto: rows.filter((p) => p.estado === "abierto").length,
      en_gestion: rows.filter((p) => p.estado === "en_gestion").length,
      resuelto: rows.filter((p) => p.estado === "resuelto" || p.estado === "cerrado").length,
    };
  },
});

export const listPage = query({
  args: {
    condominioId: v.id("condominios"),
    paginationOpts: paginationOptsValidator,
    estado: v.optional(estadoValidator),
    tipo: v.optional(tipoValidator),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, []);
    const estado = args.estado;
    const tipo = args.tipo;

    if (estado || tipo) {
      const scan = await ctx.db
        .query("pqrs")
        .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
        .order("desc")
        .take(250);
      const filtered = scan.filter((p) => {
        if (estado && p.estado !== estado) return false;
        if (tipo && p.tipo !== tipo) return false;
        return true;
      });
      const limit = Math.min(args.paginationOpts.numItems || 30, 60);
      return {
        page: filtered.slice(0, limit),
        isDone: true,
        continueCursor: "",
      };
    }

    return await ctx.db
      .query("pqrs")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const get = query({
  args: { id: v.id("pqrs") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) return null;
    await requireCondominioRole(ctx, row.condominioId, []);
    return row;
  },
});

export const create = mutation({
  args: {
    condominioId: v.id("condominios"),
    tipo: tipoValidator,
    asunto: v.string(),
    descripcion: v.string(),
    unidadNumero: v.optional(v.string()),
    prioridad: v.optional(prioridadValidator),
    solicitanteNombre: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCondominioRole(ctx, args.condominioId, []);
    const now = Date.now();

    // Consecutivo del año
    const year = new Date(now).getFullYear();
    const existing = await ctx.db
      .query("pqrs")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();
    const countThisYear = existing.filter((p) => p.radicado.includes(`-${year}-`)).length;
    const radicado = `PQRS-${year}-${String(countThisYear + 1).padStart(4, "0")}`;

    return await ctx.db.insert("pqrs", {
      condominioId: args.condominioId,
      radicado,
      tipo: args.tipo,
      asunto: args.asunto.trim(),
      descripcion: args.descripcion.trim(),
      solicitanteNombre: args.solicitanteNombre?.trim() || user.name,
      solicitanteUserId: user._id,
      unidadNumero: args.unidadNumero?.trim(),
      estado: "abierto",
      prioridad: args.prioridad ?? "media",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setEstado = mutation({
  args: { id: v.id("pqrs"), estado: estadoValidator },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("PQRS no encontrado.");
    await requireCondominioRole(ctx, existing.condominioId, [...GESTION_ROLES]);
    const now = Date.now();
    await ctx.db.patch(args.id, {
      estado: args.estado,
      resueltoAt:
        (args.estado === "resuelto" || args.estado === "cerrado")
          ? (existing.resueltoAt ?? now)
          : undefined,
      updatedAt: now,
    });
  },
});

export const setPrioridad = mutation({
  args: { id: v.id("pqrs"), prioridad: prioridadValidator },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("PQRS no encontrado.");
    await requireCondominioRole(ctx, existing.condominioId, [...GESTION_ROLES]);
    await ctx.db.patch(args.id, { prioridad: args.prioridad, updatedAt: Date.now() });
  },
});

type Mensaje = {
  autorNombre: string;
  autorUserId?: Id<"users">;
  esAdmin: boolean;
  texto: string;
  createdAt: number;
};

/** Convierte la respuesta única legada en el primer mensaje del hilo. */
function hiloActual(p: Doc<"pqrs">): Mensaje[] {
  if (p.mensajes && p.mensajes.length > 0) return [...p.mensajes];
  if (p.respuesta) {
    return [
      {
        autorNombre: p.respondidoPor ?? "Administración",
        esAdmin: true,
        texto: p.respuesta,
        createdAt: p.updatedAt,
      },
    ];
  }
  return [];
}

/** La administración responde: agrega un mensaje del admin al hilo. */
export const responder = mutation({
  args: { id: v.id("pqrs"), respuesta: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("PQRS no encontrado.");
    const { user } = await requireCondominioRole(ctx, existing.condominioId, [...GESTION_ROLES]);
    const texto = args.respuesta.trim();
    if (!texto) throw new Error("La respuesta no puede estar vacía.");

    const mensajes = hiloActual(existing);
    const now = Date.now();
    mensajes.push({
      autorNombre: user.name,
      autorUserId: user._id,
      esAdmin: true,
      texto,
      createdAt: now,
    });

    await ctx.db.patch(args.id, {
      mensajes,
      respuesta: texto,
      respondidoPor: user.name,
      estado: existing.estado === "abierto" ? "en_gestion" : existing.estado,
      updatedAt: now,
    });
  },
});

/** El residente (solicitante) agrega un mensaje al hilo. */
export const comentar = mutation({
  args: { id: v.id("pqrs"), texto: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("PQRS no encontrado.");
    const { user } = await requireCondominioRole(ctx, existing.condominioId, []);

    const esGestion = false; // el residente comenta como no-admin
    if (existing.solicitanteUserId && existing.solicitanteUserId !== user._id) {
      throw new Error("Solo el solicitante puede comentar este PQRS.");
    }
    const texto = args.texto.trim();
    if (!texto) throw new Error("El mensaje no puede estar vacío.");

    const mensajes = hiloActual(existing);
    const now = Date.now();
    mensajes.push({
      autorNombre: user.name,
      autorUserId: user._id,
      esAdmin: esGestion,
      texto,
      createdAt: now,
    });
    await ctx.db.patch(args.id, { mensajes, updatedAt: now });
  },
});

export const remove = mutation({
  args: { id: v.id("pqrs") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("PQRS no encontrado.");
    await requireCondominioRole(ctx, existing.condominioId, [...GESTION_ROLES]);
    await ctx.db.delete(args.id);
  },
});

/** El residente edita su solicitud mientras esté abierta y sin respuesta de admin. */
export const actualizarMio = mutation({
  args: {
    id: v.id("pqrs"),
    tipo: v.optional(tipoValidator),
    asunto: v.string(),
    descripcion: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("PQRS no encontrado.");
    const { user } = await requireCondominioRole(ctx, existing.condominioId, []);
    if (existing.solicitanteUserId !== user._id) {
      throw new Error("Solo puedes editar tus propias solicitudes.");
    }
    if (existing.estado !== "abierto") {
      throw new Error("Solo puedes editar solicitudes abiertas.");
    }
    const hilo = hiloActual(existing);
    if (hilo.some((m) => m.esAdmin)) {
      throw new Error("Ya hay respuesta de la administración; no puedes editar.");
    }

    const asunto = args.asunto.trim();
    const descripcion = args.descripcion.trim();
    if (!asunto || !descripcion) {
      throw new Error("Asunto y descripción son obligatorios.");
    }

    await ctx.db.patch(args.id, {
      ...(args.tipo ? { tipo: args.tipo } : {}),
      asunto,
      descripcion,
      updatedAt: Date.now(),
    });
  },
});

/** El residente elimina una de SUS propias solicitudes. */
export const removeMio = mutation({
  args: { id: v.id("pqrs") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("PQRS no encontrado.");
    const { user } = await requireCondominioRole(ctx, existing.condominioId, []);
    if (existing.solicitanteUserId !== user._id) {
      throw new Error("Solo puedes eliminar tus propias solicitudes.");
    }
    await ctx.db.delete(args.id);
  },
});

/**
 * Crea un PQRS EN NOMBRE de un usuario ya identificado (bot de WhatsApp).
 * Sin ctx.auth: valida que el usuario esté activo y tenga membresía activa
 * en el condominio. Setea solicitanteUserId para que `comentar` funcione.
 */
export const crearInterno = internalMutation({
  args: {
    condominioId: v.id("condominios"),
    userId: v.id("users"),
    tipo: tipoValidator,
    asunto: v.string(),
    descripcion: v.string(),
    unidadNumero: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("Usuario no encontrado.");
    if (!user.active) throw new Error("El usuario está inactivo.");

    const membership = await getMembership(ctx, args.userId, args.condominioId);
    if (!membership || !membership.isActive) {
      throw new Error("El usuario no tiene una membresía activa en este condominio.");
    }

    const asunto = args.asunto.trim();
    const descripcion = args.descripcion.trim();
    if (!asunto || !descripcion) {
      throw new Error("Asunto y descripción son obligatorios.");
    }

    const now = Date.now();

    // Consecutivo del año (mismo algoritmo que `create`)
    const year = new Date(now).getFullYear();
    const existing = await ctx.db
      .query("pqrs")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();
    const countThisYear = existing.filter((p) => p.radicado.includes(`-${year}-`)).length;
    const radicado = `PQRS-${year}-${String(countThisYear + 1).padStart(4, "0")}`;

    const id = await ctx.db.insert("pqrs", {
      condominioId: args.condominioId,
      radicado,
      tipo: args.tipo,
      asunto,
      descripcion,
      solicitanteNombre: user.name,
      solicitanteUserId: user._id,
      unidadNumero: args.unidadNumero?.trim(),
      estado: "abierto",
      prioridad: "media",
      createdAt: now,
      updatedAt: now,
    });
    return { id, radicado };
  },
});
