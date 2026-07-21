import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import {
  getCurrentAppUser,
  getMembership,
  requireAppUser,
  requirePlatformStaff,
  requireSuperadmin,
  hasPlatformRole,
} from "./model/authz";
import { subscriptionPlanValidator } from "./model/roles";
import { displayNameFromUser } from "./model/displayName";

/**
 * Condominios visibles para el usuario actual:
 *  - Plataforma (superadmin/admin): todos.
 *  - Resto: solo aquellos donde tiene membresía activa.
 */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAppUser(ctx);

    if (hasPlatformRole(user, "superadmin", "admin")) {
      return await ctx.db.query("condominios").order("desc").collect();
    }

    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const condos = await Promise.all(
      memberships
        .filter((m) => m.isActive)
        .map((m) => ctx.db.get(m.condominioId)),
    );
    return condos.filter((c) => c !== null);
  },
});

/**
 * Home del área de administración de UN condominio. Autoriza el acceso
 * (staff de plataforma, o miembro con rol administrativo del condominio) y
 * devuelve la info + conteos + los roles del usuario en ese condominio.
 */
export const adminHome = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) return { allowed: false as const };

    const condominio = await ctx.db.get(args.condominioId);
    if (!condominio) return { allowed: false as const };

    const isPlatform = hasPlatformRole(user, "superadmin", "admin");
    const membership = await getMembership(ctx, user._id, args.condominioId);
    const ADMIN_ROLES = ["administrador", "junta_directiva", "contadora"];
    const canAdmin =
      isPlatform ||
      (!!membership &&
        membership.isActive &&
        membership.roles.some((r) => ADMIN_ROLES.includes(r)));

    if (!canAdmin) return { allowed: false as const };

    // NOTA: esta consulta corre en el shell en CADA página del área admin.
    // Por eso NO lee membresías/unidades completas (serían ~cientos de docs por
    // navegación → gran gasto de E/S). Los conteos del dashboard se piden aparte
    // con `condominios.detail`, que solo se monta en la home del condominio.
    return {
      allowed: true as const,
      isPlatform,
      userName: displayNameFromUser(user),
      userImage: user.image ?? null,
      myRoles: membership?.roles ?? [],
      condominio: {
        _id: condominio._id,
        name: condominio.name,
        city: condominio.city ?? null,
        nit: condominio.nit ?? null,
        logo: condominio.logo ?? null,
        primaryColor: condominio.primaryColor ?? null,
        subscriptionPlan: condominio.subscriptionPlan ?? null,
        isActive: condominio.isActive,
        legacyId: condominio.legacyId ?? null,
        legacyDatabaseName: condominio.legacyDatabaseName ?? null,
      },
    };
  },
});

/** Control maestro: todos los condominios (solo plataforma). */
export const listAll = query({
  args: { onlyActive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);
    const all = await ctx.db.query("condominios").order("desc").collect();
    return args.onlyActive ? all.filter((c) => c.isActive) : all;
  },
});

export const get = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireAppUser(ctx);
    return await ctx.db.get(args.condominioId);
  },
});

/** Detalle + conteos (miembros, unidades) para la vista de condominio. */
export const detail = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireAppUser(ctx);
    const condominio = await ctx.db.get(args.condominioId);
    if (!condominio) return null;

    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_condominio", (q) =>
        q.eq("condominioId", args.condominioId),
      )
      .collect();
    const unidades = await ctx.db
      .query("unidades")
      .withIndex("by_condominio", (q) =>
        q.eq("condominioId", args.condominioId),
      )
      .collect();

    const occupiedCount = unidades.filter((u) => u.estado === "ocupada").length;

    return {
      condominio,
      memberCount: memberships.length,
      unidadCount: unidades.length,
      occupiedCount,
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    subdomain: v.optional(v.string()),
    nit: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    country: v.optional(v.string()),
    timezone: v.optional(v.string()),
    subscriptionPlan: v.optional(subscriptionPlanValidator),
    unitLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);
    const now = Date.now();
    return await ctx.db.insert("condominios", {
      ...args,
      country: args.country ?? "Colombia",
      timezone: args.timezone ?? "America/Bogota",
      subscriptionPlan: args.subscriptionPlan ?? "basico",
      activeModules: [],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    condominioId: v.id("condominios"),
    patch: v.object({
      name: v.optional(v.string()),
      subdomain: v.optional(v.string()),
      nit: v.optional(v.string()),
      address: v.optional(v.string()),
      city: v.optional(v.string()),
      logo: v.optional(v.string()),
      primaryColor: v.optional(v.string()),
      subscriptionPlan: v.optional(subscriptionPlanValidator),
      unitLimit: v.optional(v.number()),
      activeModules: v.optional(v.array(v.string())),
      avalPortalUrl: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);
    await ctx.db.patch(args.condominioId, {
      ...args.patch,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Helper interno para fijar la URL del portal de pagos AvalPayCenter de un
 * condominio (deep-link por convenio). Uso puntual desde CLI/soporte.
 */
export const setAvalPortalUrl = internalMutation({
  args: { condominioId: v.id("condominios"), url: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.condominioId, {
      avalPortalUrl: args.url,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

/** Activar / desactivar un condominio (control maestro). */
export const setActive = mutation({
  args: { condominioId: v.id("condominios"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    await requireSuperadmin(ctx);
    await ctx.db.patch(args.condominioId, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });
  },
});
