import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  requireAppUser,
  requireCondominioRole,
  hasPlatformRole,
} from "./model/authz";

const WRITE_ROLES = [
  "administrador",
  "junta_directiva",
  "representante_asamblea",
] as const;

const tipoBitacora = v.union(
  v.literal("entrada"),
  v.literal("salida"),
  v.literal("palabra_concedida"),
  v.literal("palabra_retirada"),
  v.literal("votacion_abierta"),
  v.literal("votacion_cerrada"),
  v.literal("voto"),
  v.literal("chat"),
  v.literal("reaccion"),
  v.literal("grabacion_inicio"),
  v.literal("grabacion_fin"),
  v.literal("presidente_asignado"),
);

export type TipoBitacora =
  | "entrada"
  | "salida"
  | "palabra_concedida"
  | "palabra_retirada"
  | "votacion_abierta"
  | "votacion_cerrada"
  | "voto"
  | "chat"
  | "reaccion"
  | "grabacion_inicio"
  | "grabacion_fin"
  | "presidente_asignado";

/** Inserta un evento de bitácora (uso interno desde otras mutaciones). */
export async function registrarBitacora(
  ctx: MutationCtx,
  args: {
    condominioId: Id<"condominios">;
    asambleaId: Id<"asambleas">;
    tipo: TipoBitacora;
    nombre: string;
    detalle?: string;
    userId?: Id<"users">;
  },
) {
  await ctx.db.insert("salaBitacora", {
    condominioId: args.condominioId,
    asambleaId: args.asambleaId,
    tipo: args.tipo,
    nombre: args.nombre,
    detalle: args.detalle,
    userId: args.userId,
    createdAt: Date.now(),
  });
}

async function esMesa(
  ctx: MutationCtx,
  condominioId: Id<"condominios">,
  user: { _id: Id<"users">; platformRole?: string | null },
) {
  if (hasPlatformRole(user as never, "superadmin", "admin")) return true;
  try {
    await requireCondominioRole(ctx, condominioId, [...WRITE_ROLES]);
    return true;
  } catch {
    return false;
  }
}

/** Eventos de la reunión (mesa y residentes del condominio). */
export const listar = query({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return [];
    await requireCondominioRole(ctx, asamblea.condominioId, []);
    const filas = await ctx.db
      .query("salaBitacora")
      .withIndex("by_asamblea_created", (q) =>
        q.eq("asambleaId", args.asambleaId),
      )
      .order("asc")
      .take(2000);
    return filas.map((f) => ({
      _id: f._id,
      tipo: f.tipo,
      nombre: f.nombre,
      detalle: f.detalle ?? null,
      createdAt: f.createdAt,
    }));
  },
});

/** ¿Hay grabación activa? (badge para todos). */
export const grabacionActiva = query({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return null;
    try {
      await requireCondominioRole(ctx, asamblea.condominioId, []);
    } catch {
      return null;
    }
    const activa = await ctx.db
      .query("salaGrabacion")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .filter((q) => q.eq(q.field("estado"), "activa"))
      .first();
    if (!activa) return null;
    return {
      iniciadaPorNombre: activa.iniciadaPorNombre,
      startedAt: activa.startedAt,
    };
  },
});

/** La mesa marca el inicio de la grabación local. */
export const iniciarGrabacion = mutation({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    if (asamblea.estado !== "en_curso") {
      throw new Error("La sala no está abierta.");
    }
    const user = await requireAppUser(ctx);
    if (!(await esMesa(ctx, asamblea.condominioId, user))) {
      throw new Error("Solo la mesa puede grabar.");
    }
    const previas = await ctx.db
      .query("salaGrabacion")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .filter((q) => q.eq(q.field("estado"), "activa"))
      .collect();
    const ahora = Date.now();
    for (const p of previas) {
      await ctx.db.patch(p._id, { estado: "terminada", endedAt: ahora });
    }
    await ctx.db.insert("salaGrabacion", {
      condominioId: asamblea.condominioId,
      asambleaId: args.asambleaId,
      iniciadaPorUserId: user._id,
      iniciadaPorNombre: user.name,
      estado: "activa",
      startedAt: ahora,
    });
    await registrarBitacora(ctx, {
      condominioId: asamblea.condominioId,
      asambleaId: args.asambleaId,
      tipo: "grabacion_inicio",
      nombre: user.name,
      detalle: "Grabación de la reunión iniciada (video + audio)",
      userId: user._id,
    });
    return { ok: true as const };
  },
});

/** La mesa marca el fin de la grabación local. */
export const detenerGrabacion = mutation({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    const user = await requireAppUser(ctx);
    if (!(await esMesa(ctx, asamblea.condominioId, user))) {
      throw new Error("Solo la mesa puede grabar.");
    }
    const ahora = Date.now();
    const activas = await ctx.db
      .query("salaGrabacion")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .filter((q) => q.eq(q.field("estado"), "activa"))
      .collect();
    for (const a of activas) {
      await ctx.db.patch(a._id, { estado: "terminada", endedAt: ahora });
    }
    await registrarBitacora(ctx, {
      condominioId: asamblea.condominioId,
      asambleaId: args.asambleaId,
      tipo: "grabacion_fin",
      nombre: user.name,
      detalle: "Grabación de la reunión detenida",
      userId: user._id,
    });
    return { ok: true as const };
  },
});
