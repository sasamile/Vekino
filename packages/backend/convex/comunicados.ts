import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, mutation } from "./_generated/server";
import { requireCondominioRole } from "./model/authz";
import { resolveMediaUrl } from "./model/files";
import { scheduleDeleteS3Keys, s3KeyFromPublicUrl } from "./model/s3";

const audienciaValidator = v.union(
  v.literal("todos"),
  v.literal("propietario"),
  v.literal("arrendatario"),
  v.literal("residente"),
  v.literal("junta_directiva"),
  v.literal("guardia")
);
const prioridadValidator = v.union(
  v.literal("normal"),
  v.literal("importante"),
  v.literal("urgente")
);
const archivoValidator = v.object({
  storageId: v.optional(v.id("_storage")), // legacy
  url: v.optional(v.string()),
  s3Key: v.optional(v.string()),
  mimeType: v.string(),
  nombre: v.string(),
});

const ADMIN_ROLES = ["administrador", "junta_directiva", "contadora"] as const;

/** URL de subida — @deprecated usar api.files.generateUploadUrl (S3). */
export const generateUploadUrl = mutation({
  handler: async () => {
    throw new Error(
      "Las subidas van a S3. Usa api.files.generateUploadUrl (action).",
    );
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
            storageId: a.storageId as string | undefined,
            url: await resolveMediaUrl(ctx, a),
            s3Key: a.s3Key,
            mimeType: a.mimeType,
            nombre: a.nombre,
          })),
        );
        return { ...row, archivosItems };
      }),
    );

    return withUrls.sort((a, b) => {
      if (a.fijado !== b.fijado) return a.fijado ? -1 : 1;
      return b.createdAt - a.createdAt;
    });
  },
});

/** Página de comunicados con URLs solo de la página actual. */
export const listPage = query({
  args: {
    condominioId: v.id("condominios"),
    paginationOpts: paginationOptsValidator,
    q: v.optional(v.string()),
    prioridad: v.optional(
      v.union(v.literal("normal"), v.literal("importante"), v.literal("urgente")),
    ),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, []);
    const needle = args.q?.trim().toLowerCase() ?? "";
    const prioridad = args.prioridad;

    async function hydrate(row: any) {
      const archivosItems = await Promise.all(
        (row.archivos ?? []).map(async (a: any) => ({
          storageId: a.storageId as string | undefined,
          url: await resolveMediaUrl(ctx, a),
          s3Key: a.s3Key,
          mimeType: a.mimeType,
          nombre: a.nombre,
        })),
      );
      return { ...row, archivosItems };
    }

    if (needle || prioridad) {
      const scan = await ctx.db
        .query("comunicados")
        .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
        .order("desc")
        .take(250);
      const filtered = scan
        .filter((c) => {
          if (prioridad && c.prioridad !== prioridad) return false;
          if (!needle) return true;
          return (
            c.titulo.toLowerCase().includes(needle) ||
            c.cuerpo.toLowerCase().includes(needle) ||
            c.autorNombre.toLowerCase().includes(needle)
          );
        })
        .sort((a, b) => {
          if (a.fijado !== b.fijado) return a.fijado ? -1 : 1;
          return b.createdAt - a.createdAt;
        });
      const limit = Math.min(args.paginationOpts.numItems || 30, 60);
      const page = await Promise.all(filtered.slice(0, limit).map(hydrate));
      return { page, isDone: true, continueCursor: "" };
    }

    const result = await ctx.db
      .query("comunicados")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .paginate(args.paginationOpts);

    const page = await Promise.all(result.page.map(hydrate));
    return { ...result, page };
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

    const nextArchivos = args.archivos ?? existing.archivos ?? [];
    if (args.archivos) {
      const keep = new Set(
        nextArchivos
          .map((a) => a.s3Key?.trim() || s3KeyFromPublicUrl(a.url))
          .filter((k): k is string => Boolean(k)),
      );
      const toDelete = (existing.archivos ?? [])
        .map((a) => a.s3Key?.trim() || s3KeyFromPublicUrl(a.url))
        .filter((k): k is string => Boolean(k))
        .filter((k) => !keep.has(k));
      await scheduleDeleteS3Keys(ctx, toDelete);

      const keepStorage = new Set(
        nextArchivos
          .map((a) => a.storageId)
          .filter((id): id is NonNullable<typeof id> => Boolean(id)),
      );
      await Promise.all(
        (existing.archivos ?? [])
          .filter((a) => a.storageId && !keepStorage.has(a.storageId))
          .map((a) => ctx.storage.delete(a.storageId!).catch(() => {})),
      );
    }

    await ctx.db.patch(args.id, {
      titulo: args.titulo.trim(),
      cuerpo: args.cuerpo.trim(),
      audiencia: args.audiencia,
      prioridad: args.prioridad,
      fijado: args.fijado,
      archivos: nextArchivos,
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
    await Promise.all(
      (existing.archivos ?? [])
        .filter((a) => a.storageId)
        .map((a) => ctx.storage.delete(a.storageId!).catch(() => {})),
    );
    await scheduleDeleteS3Keys(
      ctx,
      (existing.archivos ?? []).map(
        (a) => a.s3Key?.trim() || s3KeyFromPublicUrl(a.url),
      ),
    );
    await ctx.db.delete(args.id);
  },
});
