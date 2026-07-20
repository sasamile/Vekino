import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  requireAppUser,
  getCurrentAppUser,
  getMembership,
} from "./model/authz";

const tipoDocValidator = v.union(
  v.literal("CC"),
  v.literal("CE"),
  v.literal("NIT"),
  v.literal("PASAPORTE"),
  v.literal("OTRO")
);
const tipoValidator = v.union(
  v.literal("visitante"),
  v.literal("empresa"),
  v.literal("domicilio")
);

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

// ─────────────────────────────────────────────────────────────
// API del propietario
// ─────────────────────────────────────────────────────────────

/** Visitantes de las unidades del usuario (autorizados por él o registrados a su unidad). */
export const listMios = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) return [];
    const unidadIds = await misUnidadIds(ctx, user._id, args.condominioId);
    if (unidadIds.size === 0) return [];

    const visitantes = await ctx.db
      .query("visitantes")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .collect();

    return visitantes.filter((vis) => unidadIds.has(vis.unidadId)).slice(0, 100);
  },
});

/** El propietario autoriza un visitante esperado para su unidad (queda pendiente + QR). */
export const crearMio = mutation({
  args: {
    condominioId: v.id("condominios"),
    unidadId: v.id("unidades"),
    nombre: v.string(),
    documento: v.string(),
    tipoDocumento: tipoDocValidator,
    tipo: tipoValidator,
    placa: v.optional(v.string()),
    fechaVisitaInicio: v.optional(v.number()),
    fechaVisitaFin: v.optional(v.number()),
    observaciones: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"visitantes">> => {
    const user = await requireAppUser(ctx);
    const unidadIds = await misUnidadIds(ctx, user._id, args.condominioId);
    if (!unidadIds.has(args.unidadId)) {
      throw new Error("Esa unidad no está vinculada a tu cuenta.");
    }
    const nombre = args.nombre.trim();
    const documento = args.documento.trim();
    if (!nombre || !documento) throw new Error("Nombre y documento son obligatorios.");

    const unidad = await ctx.db.get(args.unidadId);
    const membership = await getMembership(ctx, user._id, args.condominioId);
    const now = Date.now();

    return await ctx.db.insert("visitantes", {
      condominioId: args.condominioId,
      unidadId: args.unidadId,
      unidadNumero: unidad?.numero,
      autorizadoPorUserId: user._id,
      membershipId: membership?._id,
      nombre,
      documento,
      tipoDocumento: args.tipoDocumento,
      tipo: args.tipo,
      placa: args.placa?.toUpperCase().trim() || undefined,
      fechaVisitaInicio: args.fechaVisitaInicio,
      fechaVisitaFin: args.fechaVisitaFin,
      estado: "pendiente",
      observaciones: args.observaciones?.trim() || undefined,
      qrInvalidado: false,
      registradoPorGuardia: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** El propietario elimina una autorización de visitante de su unidad. */
export const removeMio = mutation({
  args: { id: v.id("visitantes") },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    const vis = await ctx.db.get(args.id);
    if (!vis) throw new Error("Visitante no encontrado.");
    const unidadIds = await misUnidadIds(ctx, user._id, vis.condominioId);
    if (!unidadIds.has(vis.unidadId)) throw new Error("No autorizado.");
    await ctx.db.delete(args.id);
  },
});

/** Un visitante puntual (para mostrar el QR después de crear). */
export const getMio = query({
  args: { id: v.id("visitantes") },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) return null;
    const vis = await ctx.db.get(args.id);
    if (!vis) return null;
    const unidadIds = await misUnidadIds(ctx, user._id, vis.condominioId);
    if (!unidadIds.has(vis.unidadId)) return null;
    return vis;
  },
});
