import { v } from "convex/values";
import { query, mutation, action, internalMutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { authComponent, createAuth } from "./auth";
import {
  getCurrentAppUser,
  requireAppUser,
  requirePlatformStaff,
  requireCondominioRole,
} from "./model/authz";
import { tipoDocumentoValidator } from "./model/roles";
import { resolveUserImage } from "./model/userImage";
import { scheduleDeleteS3Keys, s3KeyFromPublicUrl } from "./model/s3";

/**
 * Estado de sesión + perfil + membresías del usuario actual.
 * Es la consulta que el frontend usa para saber "quién soy y qué puedo hacer".
 */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) return null;

    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const withCondominio = await Promise.all(
      memberships
        .filter((m) => m.isActive)
        .map(async (m) => {
          const condominio = await ctx.db.get(m.condominioId);
          return {
            membershipId: m._id,
            condominioId: m.condominioId,
            condominioName: condominio?.name ?? null,
            condominioSubdomain: condominio?.subdomain ?? null,
            condominioLogo: condominio?.logo ?? null,
            condominioPrimaryColor: condominio?.primaryColor ?? null,
            roles: m.roles,
          };
        }),
    );

    return {
      id: user._id,
      name: user.name,
      email: user.email,
      image: await resolveUserImage(ctx, user),
      firstName: user.firstName,
      lastName: user.lastName,
      telefono: user.telefono,
      active: user.active,
      platformRole: user.platformRole ?? null,
      isSuperadmin: user.platformRole === "superadmin",
      memberships: withCondominio,
    };
  },
});

/**
 * Crea (o enlaza) el perfil de aplicación del usuario autenticado con Better
 * Auth. Idempotente: se puede llamar en cada login sin duplicar.
 */
export const ensureProfile = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("No autenticado.");

    // ¿Ya existe perfil enlazado por authId?
    const existing = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
      .unique();
    if (existing) return existing._id;

    const authUser = await authComponent.getAuthUser(ctx);
    const email = authUser?.email ?? identity.email ?? "";

    // ¿Existe un perfil por email (p.ej. importado en la migración) sin authId?
    if (email) {
      const byEmail = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();
      if (byEmail && !byEmail.authId) {
        await ctx.db.patch(byEmail._id, {
          authId: identity.subject,
          updatedAt: Date.now(),
        });
        return byEmail._id;
      }
    }

    const now = Date.now();
    return await ctx.db.insert("users", {
      authId: identity.subject,
      name: authUser?.name ?? identity.name ?? email,
      email,
      emailVerified: authUser?.emailVerified ?? false,
      image: authUser?.image ?? undefined,
      active: true,
      platformRole: undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Actualiza datos de perfil del propio usuario. */
export const updateMyProfile = mutation({
  args: {
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    telefono: v.optional(v.string()),
    tipoDocumento: v.optional(tipoDocumentoValidator),
    numeroDocumento: v.optional(v.string()),
    image: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    await ctx.db.patch(user._id, { ...args, updatedAt: Date.now() });
    return user._id;
  },
});

/** URL firmada para subir avatar — @deprecated usar api.files.generateUploadUrl (S3). */
export const generateAvatarUploadUrl = mutation({
  args: {},
  handler: async () => {
    throw new Error(
      "Las subidas van a S3. Usa api.files.generateUploadUrl (action).",
    );
  },
});

/** Guarda el avatar (URL S3 preferida; storageId legacy). Borra la foto anterior de S3. */
export const setMyAvatar = mutation({
  args: {
    storageId: v.optional(v.id("_storage")),
    url: v.optional(v.string()),
    s3Key: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    let image = args.url?.trim();
    if (!image && args.storageId) {
      image = (await ctx.storage.getUrl(args.storageId)) ?? undefined;
    }
    if (!image) throw new Error("No se pudo obtener la URL del avatar.");

    const newKey =
      args.s3Key?.trim() || s3KeyFromPublicUrl(image) || undefined;
    const oldKey =
      user.imageS3Key?.trim() || s3KeyFromPublicUrl(user.image) || undefined;

    if (oldKey && oldKey !== newKey) {
      try {
        await scheduleDeleteS3Keys(ctx, [oldKey]);
      } catch {
        /* no bloquear el cambio de avatar si falla el borrado async */
      }
    }
    if (user.imageStorageId && user.imageStorageId !== args.storageId) {
      await ctx.storage.delete(user.imageStorageId).catch(() => {});
    }

    await ctx.db.patch(user._id, {
      image,
      // Con S3 limpiamos el storage legacy para que resolveUserImage no lo priorice.
      imageStorageId: args.storageId ?? undefined,
      imageS3Key: newKey,
      updatedAt: Date.now(),
    });
    return { image };
  },
});

/** Quita el avatar del perfil y borra el objeto en S3. */
export const clearMyAvatar = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAppUser(ctx);
    const oldKey =
      user.imageS3Key?.trim() || s3KeyFromPublicUrl(user.image) || undefined;
    if (oldKey) await scheduleDeleteS3Keys(ctx, [oldKey]);
    if (user.imageStorageId) {
      await ctx.storage.delete(user.imageStorageId).catch(() => {});
    }
    await ctx.db.patch(user._id, {
      image: undefined,
      imageStorageId: undefined,
      imageS3Key: undefined,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Anonimiza el perfil del usuario y corta su acceso, CONSERVANDO el historial
 * del condominio (facturas, pagos, asambleas siguen atados a la unidad).
 *
 * Qué hace:
 * - Perfil `users`: se anonimiza (nombre/correo/teléfono/documento/foto) y queda
 *   `active: false` con `authId` vacío → ya no resuelve como usuario logueado.
 *   NO se borra la fila para no romper las referencias del historial.
 * - Membresías: se desactivan (no se borran) → la unidad conserva su historia.
 * - Tokens push: se borran → deja de recibir notificaciones.
 * - Avatar: se borra el archivo real de S3 / storage.
 *
 * El borrado REAL de la cuenta (identidad Better Auth) lo hace `deleteMyAccount`.
 * Interno: lo invoca esa action pasando el authId ya resuelto.
 */
export const anonymizeUserRecords = internalMutation({
  args: { authId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", args.authId))
      .unique();
    if (!user) return { email: null as string | null, done: false };

    const now = Date.now();

    // Membresías: desactivar, no borrar (conserva el historial de la unidad).
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const m of memberships) {
      if (m.isActive) {
        await ctx.db.patch(m._id, { isActive: false, updatedAt: now });
      }
    }

    // Tokens de notificaciones push: sí se borran.
    const tokens = await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const t of tokens) await ctx.db.delete(t._id);

    // Avatar (S3 + storage legacy): se borra el archivo real.
    const s3Key =
      user.imageS3Key?.trim() || s3KeyFromPublicUrl(user.image) || undefined;
    if (s3Key) {
      try {
        await scheduleDeleteS3Keys(ctx, [s3Key]);
      } catch {
        /* no bloquear el borrado si falla la limpieza async del avatar */
      }
    }
    if (user.imageStorageId) {
      await ctx.storage.delete(user.imageStorageId).catch(() => {});
    }

    const email = user.email;

    // Anonimiza los datos personales. El correo tumba debe ser ÚNICO: el índice
    // by_email se consulta con .unique() en varios sitios y correos repetidos
    // (p.ej. "") harían fallar esas consultas.
    await ctx.db.patch(user._id, {
      authId: undefined,
      name: "Usuario eliminado",
      email: `eliminado-${user._id}@cuenta-eliminada.invalid`,
      emailVerified: false,
      firstName: undefined,
      lastName: undefined,
      telefono: undefined,
      tipoDocumento: undefined,
      numeroDocumento: undefined,
      image: undefined,
      imageStorageId: undefined,
      imageS3Key: undefined,
      active: false,
      updatedAt: now,
    });

    return { email, done: true };
  },
});

/**
 * Elimina la cuenta del usuario autenticado (Guideline 5.1.1 de Apple).
 *
 * 1) Anonimiza el perfil y corta el acceso (`anonymizeUserRecords`), dejando
 *    intacto el historial del condominio (facturas/pagos atados a la unidad).
 * 2) Elimina la identidad en Better Auth (sesiones + cuentas + usuario): esto es
 *    lo que hace que la cuenta quede REALMENTE eliminada y la persona no pueda
 *    volver a iniciar sesión — que es lo que exige Apple (desactivar no basta).
 *
 * Es irreversible: el admin tendría que crear una cuenta nueva.
 */
export const deleteMyAccount = action({
  args: {},
  handler: async (ctx): Promise<{ ok: true }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("No autenticado.");

    const result: { email: string | null; done: boolean } =
      await ctx.runMutation(internal.users.anonymizeUserRecords, {
        authId: identity.subject,
      });

    const auth = createAuth(ctx);
    const authCtx = await auth.$context;
    const ia = authCtx.internalAdapter;

    // La identidad de Better Auth: el subject del JWT es su user id. Como
    // respaldo, se busca por email (patrón probado en authMigrate).
    const deleteAuthUser = async (authUserId: string) => {
      await ia.deleteUserSessions(authUserId);
      await ia.deleteAccounts(authUserId);
      await ia.deleteUser(authUserId);
    };

    try {
      await deleteAuthUser(identity.subject);
    } catch {
      if (result.email) {
        const found = await ia.findUserByEmail(result.email);
        if (found) await deleteAuthUser(found.user.id);
      }
    }

    return { ok: true as const };
  },
});

/** Listado de usuarios (solo staff de plataforma). Paginable simple. */
export const listUsers = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);
    return await ctx.db
      .query("users")
      .order("desc")
      .take(args.limit ?? 100);
  },
});

/** Solo el staff de plataforma (superadmin + admin). Para la página Administradores. */
export const listPlatformStaff = query({
  args: {},
  handler: async (ctx) => {
    await requirePlatformStaff(ctx);
    const supers = await ctx.db
      .query("users")
      .withIndex("by_platformRole", (q) => q.eq("platformRole", "superadmin"))
      .collect();
    const admins = await ctx.db
      .query("users")
      .withIndex("by_platformRole", (q) => q.eq("platformRole", "admin"))
      .collect();
    return await Promise.all(
      [...supers, ...admins].map(async (u) => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        image: await resolveUserImage(ctx, u),
        platformRole: u.platformRole ?? null,
      })),
    );
  },
});

/** Busca un usuario por email exacto (para promover a administrador). */
export const searchByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);
    const email = args.email.trim().toLowerCase();
    if (!email) return null;
    const u = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!u) return null;
    return {
      _id: u._id,
      name: u.name,
      email: u.email,
      platformRole: u.platformRole ?? null,
    };
  },
});

/**
 * Autoriza edición de un miembro y devuelve datos para setear contraseña.
 * Usado desde la action `setMemberPassword`.
 */
export const assertCanEditMember = query({
  args: {
    condominioId: v.id("condominios"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, ["administrador"]);
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("Usuario no encontrado.");
    if (!user.email) throw new Error("El usuario no tiene correo.");
    return { email: user.email, name: user.name };
  },
});

/**
 * Establece / actualiza la contraseña de un miembro del condominio.
 * No elimina la cuenta: solo cambia la credencial.
 */
export const setMemberPassword = action({
  args: {
    condominioId: v.id("condominios"),
    userId: v.id("users"),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const password = args.password.trim();
    if (password.length < 8) {
      throw new Error("La contraseña debe tener al menos 8 caracteres.");
    }

    const member = await ctx.runQuery(api.users.assertCanEditMember, {
      condominioId: args.condominioId,
      userId: args.userId,
    });

    const auth = createAuth(ctx);
    const authCtx = await auth.$context;
    const ia = authCtx.internalAdapter;
    const hashed = await authCtx.password.hash(password);

    const found = await ia.findUserByEmail(member.email);
    if (!found) {
      const created = await ia.createUser({
        email: member.email,
        name: member.name,
        emailVerified: false,
      });
      await ia.createAccount({
        userId: created.id,
        providerId: "credential",
        accountId: created.id,
        password: hashed,
      });
      return { ok: true as const, created: true };
    }

    const accounts = await ia.findAccounts(found.user.id);
    const credential = accounts.find((a) => a.providerId === "credential");
    if (!credential) {
      await ia.createAccount({
        userId: found.user.id,
        providerId: "credential",
        accountId: found.user.id,
        password: hashed,
      });
    } else {
      await ia.updatePassword(found.user.id, hashed);
    }

    return { ok: true as const, created: false };
  },
});

/**
 * Crea (o actualiza) el perfil de app de un admin de plataforma.
 * La credencial se crea en la action `createPlatformAdmin`.
 */
export const upsertPlatformAdminProfile = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    platformRole: v.union(v.literal("admin"), v.literal("superadmin")),
  },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);
    const email = args.email.trim().toLowerCase();
    const name = args.name.trim();
    if (!email || !name) throw new Error("Nombre y correo son obligatorios.");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        name,
        platformRole: args.platformRole,
        active: true,
        updatedAt: now,
      });
      return { userId: existing._id, email, name, existed: true as const };
    }

    const userId = await ctx.db.insert("users", {
      name,
      email,
      emailVerified: false,
      active: true,
      platformRole: args.platformRole,
      createdAt: now,
      updatedAt: now,
    });
    return { userId, email, name, existed: false as const };
  },
});

export const linkAuthId = mutation({
  args: {
    userId: v.id("users"),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);
    await ctx.db.patch(args.userId, {
      authId: args.authId,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Crea un administrador de plataforma nuevo (perfil + contraseña Better Auth).
 */
export const createPlatformAdmin = action({
  args: {
    email: v.string(),
    name: v.string(),
    password: v.string(),
    platformRole: v.union(v.literal("admin"), v.literal("superadmin")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true; userId: Id<"users">; existed: boolean }> => {
    const password = args.password.trim();
    if (password.length < 8) {
      throw new Error("La contraseña debe tener al menos 8 caracteres.");
    }

    const profile: {
      userId: Id<"users">;
      email: string;
      name: string;
      existed: boolean;
    } = await ctx.runMutation(api.users.upsertPlatformAdminProfile, {
      email: args.email,
      name: args.name,
      platformRole: args.platformRole,
    });

    const auth = createAuth(ctx);
    const authCtx = await auth.$context;
    const ia = authCtx.internalAdapter;
    const hashed = await authCtx.password.hash(password);

    const found = await ia.findUserByEmail(profile.email);
    let authUserId: string;

    if (!found) {
      const created = await ia.createUser({
        email: profile.email,
        name: profile.name,
        emailVerified: false,
      });
      authUserId = created.id;
      await ia.createAccount({
        userId: created.id,
        providerId: "credential",
        accountId: created.id,
        password: hashed,
      });
    } else {
      authUserId = found.user.id;
      const accounts = await ia.findAccounts(found.user.id);
      const credential = accounts.find((a) => a.providerId === "credential");
      if (!credential) {
        await ia.createAccount({
          userId: found.user.id,
          providerId: "credential",
          accountId: found.user.id,
          password: hashed,
        });
      } else {
        await ia.updatePassword(found.user.id, hashed);
      }
    }

    await ctx.runMutation(api.users.linkAuthId, {
      userId: profile.userId,
      authId: authUserId,
    });

    return { ok: true as const, userId: profile.userId, existed: profile.existed };
  },
});

/**
 * Crea un residente del condominio (perfil + membresía + contraseña + unidades).
 */
export const createCondoMember = action({
  args: {
    condominioId: v.id("condominios"),
    email: v.string(),
    name: v.string(),
    password: v.string(),
    telefono: v.optional(v.string()),
    roles: v.array(
      v.union(
        v.literal("administrador"),
        v.literal("propietario"),
        v.literal("apoderado"),
        v.literal("arrendatario"),
        v.literal("residente"),
        v.literal("contadora"),
        v.literal("guardia"),
        v.literal("junta_directiva"),
        v.literal("representante_asamblea"),
      ),
    ),
    unidadIds: v.optional(v.array(v.id("unidades"))),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true; userId: Id<"users">; membershipId: Id<"memberships">; existed: boolean }> => {
    const password = args.password.trim();
    if (password.length < 8) {
      throw new Error("La contraseña debe tener al menos 8 caracteres.");
    }

    const profile: {
      userId: Id<"users">;
      membershipId: Id<"memberships">;
      email: string;
      name: string;
      existed: boolean;
    } = await ctx.runMutation(api.memberships.upsertCondoMemberProfile, {
      condominioId: args.condominioId,
      email: args.email,
      name: args.name,
      telefono: args.telefono,
      roles: args.roles,
      unidadIds: args.unidadIds,
    });

    const auth = createAuth(ctx);
    const authCtx = await auth.$context;
    const ia = authCtx.internalAdapter;
    const hashed = await authCtx.password.hash(password);

    const found = await ia.findUserByEmail(profile.email);
    let authUserId: string;

    if (!found) {
      const created = await ia.createUser({
        email: profile.email,
        name: profile.name,
        emailVerified: false,
      });
      authUserId = created.id;
      await ia.createAccount({
        userId: created.id,
        providerId: "credential",
        accountId: created.id,
        password: hashed,
      });
    } else {
      authUserId = found.user.id;
      const accounts = await ia.findAccounts(found.user.id);
      const credential = accounts.find((a) => a.providerId === "credential");
      if (!credential) {
        await ia.createAccount({
          userId: found.user.id,
          providerId: "credential",
          accountId: found.user.id,
          password: hashed,
        });
      } else {
        await ia.updatePassword(found.user.id, hashed);
      }
    }

    await ctx.runMutation(api.users.linkAuthId, {
      userId: profile.userId,
      authId: authUserId,
    });

    return {
      ok: true as const,
      userId: profile.userId,
      membershipId: profile.membershipId,
      existed: profile.existed,
    };
  },
});
