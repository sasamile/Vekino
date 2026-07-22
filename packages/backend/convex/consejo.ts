import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  requireCondominioRole,
  getMembership,
  hasPlatformRole,
} from "./model/authz";
import { displayNameFromUser } from "./model/displayName";
import { scheduleDeleteS3Keys } from "./model/s3";

const VIEW_ROLES = ["administrador", "contadora", "junta_directiva"] as const;
const UPLOAD_ROLES = ["administrador", "contadora"] as const;
const ADMIN_ROLES = ["administrador"] as const;

const cargoValidator = v.union(
  v.literal("presidente"),
  v.literal("vicepresidente"),
  v.literal("secretario"),
  v.literal("tesorero"),
  v.literal("vocal"),
  v.literal("fiscal"),
  v.literal("suplente"),
);

const estadoDocValidator = v.union(
  v.literal("pendiente"),
  v.literal("en_revision"),
  v.literal("aprobado"),
  v.literal("reemplazado"),
);

type Ctx = QueryCtx | MutationCtx;

function slugBase(nombre: string) {
  const base = nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return base || "categoria";
}

async function uniqueSlug(
  ctx: Ctx,
  condominioId: Id<"condominios">,
  nombre: string,
  excludeId?: Id<"consejoCategorias">,
) {
  let slug = slugBase(nombre);
  let n = 0;
  while (true) {
    const found = await ctx.db
      .query("consejoCategorias")
      .withIndex("by_condominio_slug", (q) =>
        q.eq("condominioId", condominioId).eq("slug", slug),
      )
      .unique();
    if (!found || (excludeId && found._id === excludeId)) return slug;
    n += 1;
    slug = `${slugBase(nombre)}-${n}`;
  }
}

async function requireConsejoAccess(
  ctx: Ctx,
  condominioId: Id<"condominios">,
  roles: readonly string[],
) {
  const { user, membership } = await requireCondominioRole(
    ctx,
    condominioId,
    [],
  );
  if (hasPlatformRole(user, "superadmin", "admin")) {
    return { user, membership };
  }
  if (!membership?.isActive) throw new Error("Sin acceso al consejo.");
  const ok = roles.some((r) => membership.roles.includes(r as never));
  if (!ok) throw new Error("Sin permiso para esta acción en el consejo.");
  return { user, membership };
}

export const misPermisos = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    const user = await requireCondominioRole(ctx, args.condominioId, []).then(
      (r) => r.user,
    );
    const membership = await getMembership(ctx, user._id, args.condominioId);
    const roles = membership?.roles ?? [];
    const isPlatform = hasPlatformRole(user, "superadmin", "admin");
    const canView =
      isPlatform || VIEW_ROLES.some((r) => roles.includes(r));
    const canUpload =
      isPlatform || UPLOAD_ROLES.some((r) => roles.includes(r));
    const canManageCategorias =
      isPlatform || ADMIN_ROLES.some((r) => roles.includes(r));
    const canComment =
      isPlatform || VIEW_ROLES.some((r) => roles.includes(r));
    return { canView, canUpload, canManageCategorias, canComment, roles };
  },
});

export const resumen = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireConsejoAccess(ctx, args.condominioId, VIEW_ROLES);
    const docs = await ctx.db
      .query("consejoDocumentos")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();
    const cats = await ctx.db
      .query("consejoCategorias")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();
    const now = new Date();
    const mes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let comentarios = 0;
    for (const d of docs.slice(0, 80)) {
      const cs = await ctx.db
        .query("consejoDocumentoComentarios")
        .withIndex("by_documento", (q) => q.eq("documentoId", d._id))
        .collect();
      comentarios += cs.filter((c) => c.activo).length;
    }
    return {
      documentosEsteMes: docs.filter((d) => d.periodoMes === mes).length,
      totalDocumentos: docs.length,
      totalComentarios: comentarios,
      categoriasActivas: cats.filter((c) => c.activo).length,
    };
  },
});

// ─── Categorías ───────────────────────────────────────────────

export const listCategorias = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireConsejoAccess(ctx, args.condominioId, VIEW_ROLES);
    const cats = await ctx.db
      .query("consejoCategorias")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();
    const withCounts = await Promise.all(
      cats.map(async (c) => {
        const docs = await ctx.db
          .query("consejoDocumentos")
          .withIndex("by_categoria", (q) => q.eq("categoriaId", c._id))
          .collect();
        return { ...c, documentosCount: docs.length };
      }),
    );
    return withCounts
      .filter((c) => c.activo)
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
  },
});

export const createCategoria = mutation({
  args: {
    condominioId: v.id("condominios"),
    nombre: v.string(),
    iconKey: v.optional(v.string()),
    colorKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireConsejoAccess(ctx, args.condominioId, ADMIN_ROLES);
    const nombre = args.nombre.trim();
    if (!nombre) throw new Error("El nombre es obligatorio.");
    const slug = await uniqueSlug(ctx, args.condominioId, nombre);
    const existing = await ctx.db
      .query("consejoCategorias")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();
    const now = Date.now();
    return await ctx.db.insert("consejoCategorias", {
      condominioId: args.condominioId,
      nombre,
      slug,
      iconKey: args.iconKey ?? "folder",
      colorKey: args.colorKey ?? "teal",
      orden: existing.length,
      activo: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateCategoria = mutation({
  args: {
    id: v.id("consejoCategorias"),
    nombre: v.string(),
  },
  handler: async (ctx, args) => {
    const cat = await ctx.db.get(args.id);
    if (!cat) throw new Error("Categoría no encontrada.");
    await requireConsejoAccess(ctx, cat.condominioId, ADMIN_ROLES);
    const nombre = args.nombre.trim();
    if (!nombre) throw new Error("El nombre es obligatorio.");
    const slug = await uniqueSlug(ctx, cat.condominioId, nombre, args.id);
    await ctx.db.patch(args.id, {
      nombre,
      slug,
      updatedAt: Date.now(),
    });
  },
});

/** Elimina categoría. Con `force` también borra sus documentos y archivos S3. */
export const removeCategoria = mutation({
  args: {
    id: v.id("consejoCategorias"),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const cat = await ctx.db.get(args.id);
    if (!cat) throw new Error("Categoría no encontrada.");
    await requireConsejoAccess(ctx, cat.condominioId, ADMIN_ROLES);
    const docs = await ctx.db
      .query("consejoDocumentos")
      .withIndex("by_categoria", (q) => q.eq("categoriaId", args.id))
      .collect();
    if (docs.length > 0 && !args.force) {
      throw new Error(
        `La categoría tiene ${docs.length} documento(s). Confirma para eliminarla con todo.`,
      );
    }
    for (const doc of docs) {
      await deleteDocumentoCascade(ctx, doc);
    }
    await ctx.db.delete(args.id);
  },
});

// ─── Documentos ───────────────────────────────────────────────

export const listDocumentos = query({
  args: {
    condominioId: v.id("condominios"),
    categoriaId: v.optional(v.id("consejoCategorias")),
  },
  handler: async (ctx, args) => {
    await requireConsejoAccess(ctx, args.condominioId, VIEW_ROLES);
    let docs: Doc<"consejoDocumentos">[];
    if (args.categoriaId) {
      docs = await ctx.db
        .query("consejoDocumentos")
        .withIndex("by_categoria", (q) => q.eq("categoriaId", args.categoriaId!))
        .collect();
    } else {
      docs = await ctx.db
        .query("consejoDocumentos")
        .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
        .collect();
    }
    const hydrated = await Promise.all(
      docs.map(async (d) => {
        const cat = await ctx.db.get(d.categoriaId);
        const comentarios = await ctx.db
          .query("consejoDocumentoComentarios")
          .withIndex("by_documento", (q) => q.eq("documentoId", d._id))
          .collect();
        return {
          ...d,
          categoriaNombre: cat?.nombre ?? "—",
          comentariosCount: comentarios.filter((c) => c.activo).length,
        };
      }),
    );
    return hydrated.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const getDocumento = query({
  args: { id: v.id("consejoDocumentos") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) return null;
    await requireConsejoAccess(ctx, doc.condominioId, VIEW_ROLES);
    const cat = await ctx.db.get(doc.categoriaId);
    const versiones = await ctx.db
      .query("consejoDocumentoVersiones")
      .withIndex("by_documento", (q) => q.eq("documentoId", args.id))
      .collect();
    const comentarios = await ctx.db
      .query("consejoDocumentoComentarios")
      .withIndex("by_documento", (q) => q.eq("documentoId", args.id))
      .collect();
    return {
      ...doc,
      categoriaNombre: cat?.nombre ?? "—",
      versiones: versiones.sort((a, b) => b.version - a.version),
      comentarios: comentarios
        .filter((c) => c.activo)
        .sort((a, b) => a.createdAt - b.createdAt),
    };
  },
});

export const createDocumento = mutation({
  args: {
    condominioId: v.id("condominios"),
    categoriaId: v.id("consejoCategorias"),
    titulo: v.string(),
    descripcion: v.optional(v.string()),
    periodoMes: v.optional(v.string()),
    fileUrl: v.string(),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    s3Key: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireConsejoAccess(
      ctx,
      args.condominioId,
      UPLOAD_ROLES,
    );
    const cat = await ctx.db.get(args.categoriaId);
    if (!cat || cat.condominioId !== args.condominioId || !cat.activo) {
      throw new Error("Categoría no válida.");
    }
    const titulo = args.titulo.trim();
    if (!titulo) throw new Error("El título es obligatorio.");
    const now = Date.now();
    return await ctx.db.insert("consejoDocumentos", {
      condominioId: args.condominioId,
      categoriaId: args.categoriaId,
      titulo,
      descripcion: args.descripcion?.trim(),
      periodoMes: args.periodoMes?.trim(),
      fileUrl: args.fileUrl,
      fileName: args.fileName,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      s3Key: args.s3Key,
      version: 1,
      estado: "pendiente",
      createdByUserId: user._id,
      createdByNombre: displayNameFromUser(user),
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Sube una nueva versión: archiva la actual y reemplaza el archivo (v1 → v2…). */
export const nuevaVersion = mutation({
  args: {
    id: v.id("consejoDocumentos"),
    fileUrl: v.string(),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    s3Key: v.optional(v.string()),
    nota: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) throw new Error("Documento no encontrado.");
    const { user } = await requireConsejoAccess(
      ctx,
      doc.condominioId,
      UPLOAD_ROLES,
    );
    const now = Date.now();
    await ctx.db.insert("consejoDocumentoVersiones", {
      condominioId: doc.condominioId,
      documentoId: doc._id,
      version: doc.version,
      fileUrl: doc.fileUrl,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      s3Key: doc.s3Key,
      subidoPorUserId: doc.createdByUserId,
      subidoPorNombre: doc.createdByNombre,
      createdAt: now,
    });
    await ctx.db.patch(doc._id, {
      fileUrl: args.fileUrl,
      fileName: args.fileName,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      s3Key: args.s3Key,
      version: doc.version + 1,
      estado: "pendiente",
      descripcion: args.nota?.trim()
        ? `${doc.descripcion ? doc.descripcion + "\n" : ""}[v${doc.version + 1}] ${args.nota.trim()}`
        : doc.descripcion,
      createdByUserId: user._id,
      createdByNombre: displayNameFromUser(user),
      updatedAt: now,
    });
    return { version: doc.version + 1 };
  },
});

/** Edita metadatos sin cambiar el archivo. */
export const updateDocumento = mutation({
  args: {
    id: v.id("consejoDocumentos"),
    titulo: v.optional(v.string()),
    descripcion: v.optional(v.string()),
    periodoMes: v.optional(v.string()),
    categoriaId: v.optional(v.id("consejoCategorias")),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) throw new Error("Documento no encontrado.");
    await requireConsejoAccess(ctx, doc.condominioId, UPLOAD_ROLES);

    if (args.categoriaId) {
      const cat = await ctx.db.get(args.categoriaId);
      if (!cat || cat.condominioId !== doc.condominioId || !cat.activo) {
        throw new Error("Categoría no válida.");
      }
    }

    const titulo =
      args.titulo !== undefined ? args.titulo.trim() : doc.titulo;
    if (!titulo) throw new Error("El título es obligatorio.");

    await ctx.db.patch(args.id, {
      titulo,
      descripcion:
        args.descripcion !== undefined
          ? args.descripcion.trim() || undefined
          : doc.descripcion,
      periodoMes:
        args.periodoMes !== undefined
          ? args.periodoMes.trim() || undefined
          : doc.periodoMes,
      categoriaId: args.categoriaId ?? doc.categoriaId,
      updatedAt: Date.now(),
    });
  },
});

export const setEstadoDocumento = mutation({
  args: {
    id: v.id("consejoDocumentos"),
    estado: estadoDocValidator,
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) throw new Error("Documento no encontrado.");
    await requireConsejoAccess(ctx, doc.condominioId, ADMIN_ROLES);
    await ctx.db.patch(args.id, { estado: args.estado, updatedAt: Date.now() });
  },
});

export const removeDocumento = mutation({
  args: { id: v.id("consejoDocumentos") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) throw new Error("Documento no encontrado.");
    await requireConsejoAccess(ctx, doc.condominioId, UPLOAD_ROLES);
    await deleteDocumentoCascade(ctx, doc);
  },
});

async function deleteDocumentoCascade(
  ctx: MutationCtx,
  doc: Doc<"consejoDocumentos">,
) {
  const versiones = await ctx.db
    .query("consejoDocumentoVersiones")
    .withIndex("by_documento", (q) => q.eq("documentoId", doc._id))
    .collect();
  const comentarios = await ctx.db
    .query("consejoDocumentoComentarios")
    .withIndex("by_documento", (q) => q.eq("documentoId", doc._id))
    .collect();
  await scheduleDeleteS3Keys(ctx, [
    doc.s3Key,
    ...versiones.map((v) => v.s3Key),
  ]);
  for (const c of comentarios) await ctx.db.delete(c._id);
  for (const v of versiones) await ctx.db.delete(v._id);
  await ctx.db.delete(doc._id);
}

// ─── Comentarios ──────────────────────────────────────────────

export const addComentario = mutation({
  args: {
    documentoId: v.id("consejoDocumentos"),
    contenido: v.string(),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentoId);
    if (!doc) throw new Error("Documento no encontrado.");
    const { user } = await requireConsejoAccess(
      ctx,
      doc.condominioId,
      VIEW_ROLES,
    );
    const contenido = args.contenido.trim();
    if (!contenido) throw new Error("El comentario no puede estar vacío.");
    const now = Date.now();
    return await ctx.db.insert("consejoDocumentoComentarios", {
      condominioId: doc.condominioId,
      documentoId: args.documentoId,
      userId: user._id,
      autorNombre: displayNameFromUser(user),
      contenido,
      activo: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ─── Miembros (catálogo de cargos, opcional) ──────────────────

export const listMiembros = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireConsejoAccess(ctx, args.condominioId, VIEW_ROLES);
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
  },
  handler: async (ctx, args) => {
    await requireConsejoAccess(ctx, args.condominioId, ADMIN_ROLES);
    const now = Date.now();
    return await ctx.db.insert("consejoMiembros", {
      condominioId: args.condominioId,
      nombre: args.nombre.trim(),
      cargo: args.cargo,
      unidadNumero: args.unidadNumero?.trim(),
      telefono: args.telefono?.trim(),
      email: args.email?.trim().toLowerCase(),
      activo: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const removeMiembro = mutation({
  args: { id: v.id("consejoMiembros") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Miembro no encontrado.");
    await requireConsejoAccess(ctx, existing.condominioId, ADMIN_ROLES);
    await ctx.db.delete(args.id);
  },
});

export const toggleMiembro = mutation({
  args: { id: v.id("consejoMiembros") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Miembro no encontrado.");
    await requireConsejoAccess(ctx, existing.condominioId, ADMIN_ROLES);
    await ctx.db.patch(args.id, {
      activo: !existing.activo,
      updatedAt: Date.now(),
    });
  },
});

const tipoSesionValidator = v.union(
  v.literal("ordinaria"),
  v.literal("extraordinaria"),
);

export const listSesiones = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireConsejoAccess(ctx, args.condominioId, VIEW_ROLES);
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
    tipo: tipoSesionValidator,
    fecha: v.string(),
    asistentes: v.optional(v.number()),
    temas: v.optional(v.string()),
    acuerdos: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireConsejoAccess(ctx, args.condominioId, ADMIN_ROLES);
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
    await requireConsejoAccess(ctx, existing.condominioId, ADMIN_ROLES);
    await ctx.db.delete(args.id);
  },
});
