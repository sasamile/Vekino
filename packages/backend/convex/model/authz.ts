import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { OperationalRole, PlatformRole } from "./roles";

type Ctx = QueryCtx | MutationCtx;

/**
 * Devuelve el perfil de aplicación (tabla `users`) del usuario autenticado,
 * o null si no hay sesión / no existe perfil todavía.
 *
 * El enlace con Better Auth se hace por `users.authId === identity.subject`.
 */
export async function getCurrentAppUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  return await ctx.db
    .query("users")
    .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
    .unique();
}

/** Igual que getCurrentAppUser pero lanza si no hay usuario. */
export async function requireAppUser(ctx: Ctx): Promise<Doc<"users">> {
  const user = await getCurrentAppUser(ctx);
  if (!user) throw new Error("No autenticado o perfil inexistente.");
  if (!user.active) throw new Error("Usuario inactivo.");
  return user;
}

export function hasPlatformRole(
  user: Doc<"users">,
  ...roles: PlatformRole[]
): boolean {
  return !!user.platformRole && roles.includes(user.platformRole);
}

export function isSuperadmin(user: Doc<"users">): boolean {
  return user.platformRole === "superadmin";
}

/** Exige superadmin (control maestro total). */
export async function requireSuperadmin(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireAppUser(ctx);
  if (!isSuperadmin(user)) throw new Error("Requiere rol superadmin.");
  return user;
}

/** Exige staff de plataforma (superadmin o admin). */
export async function requirePlatformStaff(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireAppUser(ctx);
  if (!hasPlatformRole(user, "superadmin", "admin")) {
    throw new Error("Requiere rol de plataforma (admin/superadmin).");
  }
  return user;
}

/** Membresía del usuario en un condominio (o null). */
export async function getMembership(
  ctx: Ctx,
  userId: Id<"users">,
  condominioId: Id<"condominios">,
): Promise<Doc<"memberships"> | null> {
  return await ctx.db
    .query("memberships")
    .withIndex("by_condominio_user", (q) =>
      q.eq("condominioId", condominioId).eq("userId", userId),
    )
    .unique();
}

/**
 * Exige que el usuario actual pertenezca al condominio con al menos uno de los
 * roles indicados. Superadmin/admin de plataforma tienen paso libre.
 */
export async function requireCondominioRole(
  ctx: Ctx,
  condominioId: Id<"condominios">,
  roles: OperationalRole[],
): Promise<{ user: Doc<"users">; membership: Doc<"memberships"> | null }> {
  const user = await requireAppUser(ctx);

  // Control maestro: la plataforma puede operar sobre cualquier condominio.
  if (hasPlatformRole(user, "superadmin", "admin")) {
    const membership = await getMembership(ctx, user._id, condominioId);
    return { user, membership };
  }

  const membership = await getMembership(ctx, user._id, condominioId);
  if (!membership || !membership.isActive) {
    throw new Error("No pertenece a este condominio.");
  }
  const ok =
    roles.length === 0 || membership.roles.some((r) => roles.includes(r));
  if (!ok) throw new Error("No tiene el rol requerido en este condominio.");

  return { user, membership };
}
