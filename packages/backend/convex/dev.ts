import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/** Inspecciona un usuario por email: rol de plataforma + membresías (dev). */
export const inspectUserByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .unique();
    if (!user) return { found: false };
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const withNames = await Promise.all(
      memberships.map(async (m) => {
        const c = await ctx.db.get(m.condominioId);
        return { condominio: c?.name ?? null, roles: m.roles };
      }),
    );
    return {
      found: true,
      name: user.name,
      email: user.email,
      platformRole: user.platformRole ?? null,
      hasAuthId: !!user.authId,
      memberships: withNames,
    };
  },
});

/** Conteo rápido de todas las tablas (dev). */
export const counts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [condominios, users, memberships, unidades, usuarioUnidad] =
      await Promise.all([
        ctx.db.query("condominios").collect(),
        ctx.db.query("users").collect(),
        ctx.db.query("memberships").collect(),
        ctx.db.query("unidades").collect(),
        ctx.db.query("usuarioUnidad").collect(),
      ]);
    return {
      condominios: condominios.length,
      users: users.length,
      memberships: memberships.length,
      unidades: unidades.length,
      usuarioUnidad: usuarioUnidad.length,
    };
  },
});

/**
 * Utilidades SOLO para desarrollo. Son `internalMutation` (no accesibles desde
 * el cliente). No usar en producción.
 */

/** Elimina un condominio por nombre exacto (solo dev / limpieza de pruebas). */
export const purgeCondominioByName = internalMutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("condominios").collect();
    let deleted = 0;
    for (const c of rows) {
      if (c.name === args.name) {
        await ctx.db.delete(c._id);
        deleted++;
      }
    }
    return { deleted };
  },
});

/** Elimina el perfil de aplicación de un usuario y sus membresías por email. */
export const purgeUserByEmail = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    if (!user) return { deleted: false };

    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const m of memberships) await ctx.db.delete(m._id);

    await ctx.db.delete(user._id);
    return { deleted: true, membershipsDeleted: memberships.length };
  },
});
