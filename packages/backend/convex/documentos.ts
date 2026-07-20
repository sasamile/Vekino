import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireCondominioRole } from "./model/authz";

const ADMIN_ROLES = ["administrador", "junta_directiva", "contadora"] as const;

const categoriaValidator = v.union(
  v.literal("reglamento"),
  v.literal("acta"),
  v.literal("contrato"),
  v.literal("comunicado"),
  v.literal("financiero"),
  v.literal("otro")
);

export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const listByCondominio = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, []);
    const docs = await ctx.db
      .query("documentos")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .collect();

    return await Promise.all(
      docs.map(async (doc) => ({
        ...doc,
        url: (await ctx.storage.getUrl(doc.storageId)) ?? "",
      }))
    );
  },
});

export const create = mutation({
  args: {
    condominioId: v.id("condominios"),
    nombre: v.string(),
    categoria: categoriaValidator,
    storageId: v.id("_storage"),
    mimeType: v.string(),
    tamanio: v.number(),
    descripcion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCondominioRole(ctx, args.condominioId, [...ADMIN_ROLES]);
    return await ctx.db.insert("documentos", {
      condominioId: args.condominioId,
      nombre: args.nombre.trim(),
      categoria: args.categoria,
      storageId: args.storageId,
      mimeType: args.mimeType,
      tamanio: args.tamanio,
      autorNombre: user.name,
      descripcion: args.descripcion?.trim(),
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("documentos") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Documento no encontrado.");
    await requireCondominioRole(ctx, existing.condominioId, [...ADMIN_ROLES]);
    await ctx.storage.delete(existing.storageId);
    await ctx.db.delete(args.id);
  },
});
