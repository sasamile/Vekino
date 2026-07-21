import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentAppUser, requireAppUser } from "./model/authz";

const platformValidator = v.union(
  v.literal("ios"),
  v.literal("android"),
  v.literal("web"),
);

/** Estado de push del usuario actual (si hay algún token activo). */
export const myStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) return { enabled: false, tokenCount: 0 };
    const tokens = await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const activos = tokens.filter((t) => t.enabled);
    return { enabled: activos.length > 0, tokenCount: activos.length };
  },
});

/** Registra o reactiva un token Expo Push del dispositivo. */
export const registerToken = mutation({
  args: {
    token: v.string(),
    platform: platformValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    const token = args.token.trim();
    if (!token) throw new Error("Token inválido.");

    const now = Date.now();
    const existente = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();

    if (existente) {
      await ctx.db.patch(existente._id, {
        userId: user._id,
        platform: args.platform,
        enabled: true,
        updatedAt: now,
      });
      return existente._id;
    }

    return await ctx.db.insert("pushTokens", {
      userId: user._id,
      token,
      platform: args.platform,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Desactiva un token (o todos los del usuario si no se pasa token). */
export const disableToken = mutation({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    const now = Date.now();
    if (args.token?.trim()) {
      const row = await ctx.db
        .query("pushTokens")
        .withIndex("by_token", (q) => q.eq("token", args.token!.trim()))
        .first();
      if (row && row.userId === user._id) {
        await ctx.db.patch(row._id, { enabled: false, updatedAt: now });
      }
      return;
    }
    const tokens = await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const t of tokens) {
      if (t.enabled) await ctx.db.patch(t._id, { enabled: false, updatedAt: now });
    }
  },
});
