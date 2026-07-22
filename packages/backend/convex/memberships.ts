import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, mutation, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  requireCondominioRole,
  requirePlatformStaff,
  getMembership,
} from "./model/authz";
import {
  operationalRoleValidator,
  vinculoUnidadValidator,
} from "./model/roles";
import { resolveUserImage } from "./model/userImage";

function vinculoFromRoles(
  roles: string[],
): "propietario" | "apoderado" | "arrendatario" | "residente" {
  for (const r of ["propietario", "apoderado", "arrendatario", "residente"] as const) {
    if (roles.includes(r)) return r;
  }
  return "residente";
}

async function hydrateMembership(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any; storage: any },
  m: {
    _id: any;
    userId: any;
    roles: string[];
    isActive: boolean;
  },
) {
  const u = await ctx.db.get(m.userId);
  const links = await ctx.db
    .query("usuarioUnidad")
    .withIndex("by_membership", (q: any) => q.eq("membershipId", m._id))
    .collect();

  const unidades = (
    await Promise.all(
      links.map(async (link: any) => {
        const unidad = await ctx.db.get(link.unidadId);
        if (!unidad) return null;
        return {
          unidadId: unidad._id as Id<"unidades">,
          numero: unidad.numero as string,
          torre: (unidad.torre as string | undefined) ?? null,
          bloque: (unidad.bloque as string | undefined) ?? null,
          vinculo: link.vinculo as string,
          esPrincipal: link.esPrincipal as boolean,
        };
      }),
    )
  ).filter((x: any): x is NonNullable<typeof x> => x !== null);

  const image = await resolveUserImage(ctx, u);

  return {
    membershipId: m._id,
    userId: m.userId,
    name: u?.name ?? null,
    email: u?.email ?? null,
    telefono: u?.telefono ?? null,
    image,
    firstName: u?.firstName ?? null,
    lastName: u?.lastName ?? null,
    roles: m.roles,
    isActive: m.isActive,
    unidades,
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
          (m.telefono ?? "").toLowerCase().includes(needle) ||
          m.unidades.some(
            (u) =>
              u.numero.toLowerCase().includes(needle) ||
              (u.torre ?? "").toLowerCase().includes(needle) ||
              (u.bloque ?? "").toLowerCase().includes(needle),
          )
        );
      });
      const limit = Math.min(args.paginationOpts.numItems || 30, 60);
      return {
        page: filtered.slice(0, limit),
        isDone: true,
        continueCursor: "",
      };
    }

    const result = await ctx.db
      .query("memberships")
      .withIndex("by_condominio", (q) =>
        q.eq("condominioId", args.condominioId),
      )
      .order("desc")
      .paginate(args.paginationOpts);

    const page = await Promise.all(
      result.page
        .filter((m) => m.isActive)
        .map((m) => hydrateMembership(ctx, m)),
    );
    return { ...result, page };
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

/**
 * Crea o actualiza el perfil de un residente del condominio (sin contraseña).
 * Usado por la action `users.createCondoMember`.
 */
export const upsertCondoMemberProfile = mutation({
  args: {
    condominioId: v.id("condominios"),
    email: v.string(),
    name: v.string(),
    telefono: v.optional(v.string()),
    roles: v.array(operationalRoleValidator),
    unidadIds: v.optional(v.array(v.id("unidades"))),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, ["administrador"]);

    const email = args.email.trim().toLowerCase();
    const name = args.name.trim();
    if (!email || !name) throw new Error("Nombre y correo son obligatorios.");
    if (args.roles.length === 0) {
      throw new Error("Selecciona al menos un rol.");
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    const now = Date.now();
    const telefono = args.telefono?.trim() || undefined;
    let userId: Id<"users">;
    let existed = false;

    if (existing) {
      userId = existing._id;
      existed = true;
      await ctx.db.patch(existing._id, {
        name,
        telefono,
        active: true,
        updatedAt: now,
      });
    } else {
      userId = await ctx.db.insert("users", {
        name,
        email,
        telefono,
        emailVerified: false,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    const membership = await getMembership(ctx, userId, args.condominioId);
    let membershipId: Id<"memberships">;
    if (membership) {
      membershipId = membership._id;
      await ctx.db.patch(membership._id, {
        roles: args.roles,
        isActive: true,
        updatedAt: now,
      });
    } else {
      membershipId = await ctx.db.insert("memberships", {
        userId,
        condominioId: args.condominioId,
        roles: args.roles,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (args.unidadIds !== undefined) {
      await replaceMemberUnidades(ctx, {
        condominioId: args.condominioId,
        membershipId,
        roles: args.roles,
        unidadIds: args.unidadIds,
      });
    }

    return { userId, membershipId, email, name, existed };
  },
});

/** Reemplaza los vínculos unidad ↔ miembro. */
export const setMemberUnidades = mutation({
  args: {
    condominioId: v.id("condominios"),
    membershipId: v.id("memberships"),
    unidadIds: v.array(v.id("unidades")),
    vinculo: v.optional(vinculoUnidadValidator),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, ["administrador"]);

    const membership = await ctx.db.get(args.membershipId);
    if (!membership || membership.condominioId !== args.condominioId) {
      throw new Error("Membresía no encontrada en este condominio.");
    }

    await replaceMemberUnidades(ctx, {
      condominioId: args.condominioId,
      membershipId: args.membershipId,
      roles: membership.roles,
      unidadIds: args.unidadIds,
      vinculo: args.vinculo,
    });
  },
});

async function replaceMemberUnidades(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  args: {
    condominioId: Id<"condominios">;
    membershipId: Id<"memberships">;
    roles: string[];
    unidadIds: Id<"unidades">[];
    vinculo?: "propietario" | "apoderado" | "arrendatario" | "residente";
  },
) {
  const existing = await ctx.db
    .query("usuarioUnidad")
    .withIndex("by_membership", (q: any) => q.eq("membershipId", args.membershipId))
    .collect();
  for (const link of existing) {
    await ctx.db.delete(link._id);
  }

  const vinculo = args.vinculo ?? vinculoFromRoles(args.roles);
  const now = Date.now();
  const unique = [...new Set(args.unidadIds)];

  for (let i = 0; i < unique.length; i++) {
    const unidadId = unique[i]!;
    const unidad = await ctx.db.get(unidadId);
    if (!unidad || unidad.condominioId !== args.condominioId) {
      throw new Error("Una de las unidades no pertenece a este condominio.");
    }
    await ctx.db.insert("usuarioUnidad", {
      membershipId: args.membershipId,
      unidadId,
      condominioId: args.condominioId,
      vinculo,
      esPrincipal: i === 0,
      createdAt: now,
    });
  }
}

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

/**
 * Desactiva representantes de asamblea que no tienen ninguna unidad vinculada.
 * (Limpieza de filas "Rep. asamblea" + "Sin unidad".)
 */
export const cleanupRepresentantesSinUnidad = mutation({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, ["administrador"]);
    return await deactivateRepresentantesSinUnidad(ctx, args.condominioId);
  },
});

/** Misma limpieza, invocable desde CLI (`convex run`). */
export const cleanupRepresentantesSinUnidadInternal = internalMutation({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    return await deactivateRepresentantesSinUnidad(ctx, args.condominioId);
  },
});

async function deactivateRepresentantesSinUnidad(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  condominioId: Id<"condominios">,
) {
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_condominio", (q: any) => q.eq("condominioId", condominioId))
    .collect();

  const removed: { membershipId: string; name: string | null; email: string | null }[] =
    [];
  const now = Date.now();

  for (const m of memberships) {
    if (!m.isActive) continue;
    if (!m.roles.includes("representante_asamblea")) continue;

    const links = await ctx.db
      .query("usuarioUnidad")
      .withIndex("by_membership", (q: any) => q.eq("membershipId", m._id))
      .collect();
    if (links.length > 0) continue;

    const user = await ctx.db.get(m.userId);
    await ctx.db.patch(m._id, {
      isActive: false,
      roles: [],
      updatedAt: now,
    });
    removed.push({
      membershipId: m._id as string,
      name: user?.name ?? null,
      email: user?.email ?? null,
    });
  }

  return { count: removed.length, removed };
}

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
