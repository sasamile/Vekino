import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, mutation } from "./_generated/server";
import {
  requireCondominioRole,
  requirePlatformStaff,
  getMembership,
} from "./model/authz";
import { operationalRoleValidator } from "./model/roles";

async function hydrateMembership(
  ctx: { db: { get: (id: any) => Promise<any> } },
  m: {
    _id: any;
    userId: any;
    roles: string[];
    isActive: boolean;
  },
) {
  const u = await ctx.db.get(m.userId);
  return {
    membershipId: m._id,
    userId: m.userId,
    name: u?.name ?? null,
    email: u?.email ?? null,
    telefono: u?.telefono ?? null,
    firstName: u?.firstName ?? null,
    lastName: u?.lastName ?? null,
    roles: m.roles,
    isActive: m.isActive,
  };
}

/** Miembros de un condominio (admin del condominio o plataforma). */
export const listByCondominio = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [
      "administrador",
      "junta_directiva",
    ]);

    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_condominio", (q) =>
        q.eq("condominioId", args.condominioId),
      )
      .collect();

    const activos = memberships.filter((m) => m.isActive);
    return await Promise.all(activos.map((m) => hydrateMembership(ctx, m)));
  },
});

/**
 * Página de residentes (mobile/web). Sin filtros: paginación real.
 * Con `q` o `role`: escanea un lote acotado (máx. 250) y filtra en servidor.
 */
export const listPage = query({
  args: {
    condominioId: v.id("condominios"),
    paginationOpts: paginationOptsValidator,
    q: v.optional(v.string()),
    role: v.optional(operationalRoleValidator),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [
      "administrador",
      "junta_directiva",
    ]);

    const needle = args.q?.trim().toLowerCase() ?? "";
    const role = args.role;

    if (needle || role) {
      const scan = await ctx.db
        .query("memberships")
        .withIndex("by_condominio", (q) =>
          q.eq("condominioId", args.condominioId),
        )
        .order("desc")
        .take(250);

      const hydrated = await Promise.all(scan.map((m) => hydrateMembership(ctx, m)));
      const filtered = hydrated.filter((m) => {
        if (!m.isActive) return false;
        if (role && !m.roles.includes(role)) return false;
        if (!needle) return true;
        return (
          (m.name ?? "").toLowerCase().includes(needle) ||
          (m.email ?? "").toLowerCase().includes(needle) ||
          (m.telefono ?? "").toLowerCase().includes(needle)
        );
      });
      const limit = Math.min(args.paginationOpts.numItems || 30, 60);
      return {
        page: filtered.slice(0, limit),
        isDone: true,
        continueCursor: "",
      };
    }

    // Paginación real: tomamos un poco de más y filtramos inactivos.
    const want = Math.min(Math.max(args.paginationOpts.numItems || 30, 1), 60);
    let cursor = args.paginationOpts.cursor;
    const page: Awaited<ReturnType<typeof hydrateMembership>>[] = [];
    let isDone = false;
    let continueCursor = "";
    let guard = 0;

    while (page.length < want && !isDone && guard < 8) {
      guard += 1;
      const result = await ctx.db
        .query("memberships")
        .withIndex("by_condominio", (q) =>
          q.eq("condominioId", args.condominioId),
        )
        .order("desc")
        .paginate({ numItems: want, cursor });

      const hydrated = await Promise.all(
        result.page.filter((m) => m.isActive).map((m) => hydrateMembership(ctx, m)),
      );
      page.push(...hydrated);
      isDone = result.isDone;
      continueCursor = result.continueCursor;
      cursor = result.continueCursor;
      if (result.isDone) break;
    }

    return {
      page: page.slice(0, want),
      isDone,
      continueCursor,
    };
  },
});

/**
 * Asigna / actualiza roles de un usuario en un condominio. Crea la membresía
 * si no existe. Permitido a admin del condominio o plataforma.
 */
export const setRoles = mutation({
  args: {
    condominioId: v.id("condominios"),
    userId: v.id("users"),
    roles: v.array(operationalRoleValidator),
    representaAUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, ["administrador"]);

    const existing = await getMembership(ctx, args.userId, args.condominioId);
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        roles: args.roles,
        representaAUserId: args.representaAUserId,
        isActive: true,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("memberships", {
      userId: args.userId,
      condominioId: args.condominioId,
      roles: args.roles,
      representaAUserId: args.representaAUserId,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Actualiza perfil + roles de un miembro del condominio.
 * No elimina: solo edita.
 */
export const updateMember = mutation({
  args: {
    condominioId: v.id("condominios"),
    userId: v.id("users"),
    name: v.optional(v.string()),
    telefono: v.optional(v.string()),
    roles: v.optional(v.array(operationalRoleValidator)),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, ["administrador"]);

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("Usuario no encontrado.");

    const now = Date.now();
    const profilePatch: {
      name?: string;
      telefono?: string;
      updatedAt: number;
    } = { updatedAt: now };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("El nombre no puede estar vacío.");
      profilePatch.name = name;
    }
    if (args.telefono !== undefined) {
      profilePatch.telefono = args.telefono.trim() || undefined;
    }
    await ctx.db.patch(args.userId, profilePatch);

    if (args.roles !== undefined) {
      const existing = await getMembership(ctx, args.userId, args.condominioId);
      if (existing) {
        await ctx.db.patch(existing._id, {
          roles: args.roles,
          isActive: true,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("memberships", {
          userId: args.userId,
          condominioId: args.condominioId,
          roles: args.roles,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return args.userId;
  },
});

/** Desactiva la membresía de un usuario en un condominio y quita vínculos a unidades. */
export const deactivate = mutation({
  args: { membershipId: v.id("memberships") },
  handler: async (ctx, args) => {
    const membership = await ctx.db.get(args.membershipId);
    if (!membership) throw new Error("Membresía inexistente.");
    await requireCondominioRole(ctx, membership.condominioId, ["administrador"]);

    const links = await ctx.db
      .query("usuarioUnidad")
      .withIndex("by_membership", (q) => q.eq("membershipId", args.membershipId))
      .collect();
    for (const link of links) {
      await ctx.db.delete(link._id);
    }

    await ctx.db.patch(args.membershipId, {
      isActive: false,
      roles: [],
      updatedAt: Date.now(),
    });
  },
});

/** Asigna el rol de plataforma de un usuario (solo staff de plataforma). */
export const setPlatformRole = mutation({
  args: {
    userId: v.id("users"),
    platformRole: v.optional(
      v.union(v.literal("superadmin"), v.literal("admin")),
    ),
  },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);
    await ctx.db.patch(args.userId, {
      platformRole: args.platformRole,
      updatedAt: Date.now(),
    });
  },
});
