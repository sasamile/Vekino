import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireCondominioRole } from "./model/authz";

const audienciaValidator = v.union(
  v.literal("todos"),
  v.literal("propietario"),
  v.literal("arrendatario"),
  v.literal("residente"),
  v.literal("junta_directiva")
);
const prioridadValidator = v.union(
  v.literal("normal"),
  v.literal("importante"),
  v.literal("urgente")
);
const archivoValidator = v.object({
  storageId: v.id("_storage"),
  mimeType: v.string(),
  nombre: v.string(),
});

const ADMIN_ROLES = ["administrador", "junta_directiva", "contadora"] as const;

/** URL de subida de archivo (Convex File Storage). */
export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/** Lista los comunicados del condominio: fijados primero, luego más recientes. */
export const listByCondominio = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, []); // cualquier miembro
    const rows = await ctx.db
      .query("comunicados")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();

    const withUrls = await Promise.all(
      rows.map(async (row) => {
        const archivosItems = await Promise.all(
          (row.archivos ?? []).map(async (a) => ({
            storageId: a.storageId as string,
            mimeType: a.mimeType,
            nombre: a.nombre,
            url: (await ctx.storage.getUrl(a.storageId)) ?? "",
          }))
        );
        return { ...row, archivosItems };
      })
    );

    return withUrls.sort((a, b) => {
      if (a.fijado !== b.fijado) return a.fijado ? -1 : 1;
      return b.createdAt - a.createdAt;
    });
  },
});

/** Últimos avisos para home (sin .collect() completo ni URLs de archivos). */
export const listRecent = query({
  args: {
    condominioId: v.id("condominios"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, []);
    const limit = Math.min(Math.max(args.limit ?? 5, 1), 20);
    const rows = await ctx.db
      .query("comunicados")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .take(40);

    return rows
      .sort((a, b) => {
        if (a.fijado !== b.fijado) return a.fijado ? -1 : 1;
        return b.createdAt - a.createdAt;
      })
      .slice(0, limit)
      .map((row) => ({
        _id: row._id,
        titulo: row.titulo,
        prioridad: row.prioridad,
        fijado: row.fijado,
        createdAt: row.createdAt,
      }));
  },
});

/** Crea un comunicado (solo roles administrativos). */
export const create = mutation({
  args: {
    condominioId: v.id("condominios"),
    titulo: v.string(),
    cuerpo: v.string(),
    audiencia: audienciaValidator,
    prioridad: prioridadValidator,
    fijado: v.boolean(),
    archivos: v.optional(v.array(archivoValidator)),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCondominioRole(ctx, args.condominioId, [
      ...ADMIN_ROLES,
    ]);
    const now = Date.now();
    return await ctx.db.insert("comunicados", {
      condominioId: args.condominioId,
      autorUserId: user._id,
      autorNombre: user.name,
      titulo: args.titulo.trim(),
      cuerpo: args.cuerpo.trim(),
      audiencia: args.audiencia,
      prioridad: args.prioridad,
      fijado: args.fijado,
      archivos: args.archivos ?? [],
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Edita un comunicado. */
export const update = mutation({
  args: {
    id: v.id("comunicados"),
    titulo: v.string(),
    cuerpo: v.string(),
    audiencia: audienciaValidator,
    prioridad: prioridadValidator,
    fijado: v.boolean(),
    archivos: v.optional(v.array(archivoValidator)),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Comunicado no encontrado.");
    await requireCondominioRole(ctx, existing.condominioId, [...ADMIN_ROLES]);
    await ctx.db.patch(args.id, {
      titulo: args.titulo.trim(),
      cuerpo: args.cuerpo.trim(),
      audiencia: args.audiencia,
      prioridad: args.prioridad,
      fijado: args.fijado,
      archivos: args.archivos ?? existing.archivos ?? [],
      updatedAt: Date.now(),
    });
  },
});

/** Fija / desfija un comunicado. */
export const togglePin = mutation({
  args: { id: v.id("comunicados") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Comunicado no encontrado.");
    await requireCondominioRole(ctx, existing.condominioId, [...ADMIN_ROLES]);
    await ctx.db.patch(args.id, {
      fijado: !existing.fijado,
      updatedAt: Date.now(),
    });
  },
});

/** Elimina un comunicado y sus archivos adjuntos. */
export const remove = mutation({
  args: { id: v.id("comunicados") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Comunicado no encontrado.");
    await requireCondominioRole(ctx, existing.condominioId, [...ADMIN_ROLES]);
    // Eliminar archivos del storage
    await Promise.all(
      (existing.archivos ?? []).map((a) => ctx.storage.delete(a.storageId))
    );
    await ctx.db.delete(args.id);
  },
});
