/**
 * Destino de inicio de un usuario dentro de un condominio, según sus roles.
 *
 * - administrador / contadora → panel de administración (`/condominio/:id`).
 * - guardia → app de portería (`/guardia/:id`).
 * - resto (propietario, arrendatario, residente, junta_directiva…) → portal
 *   personal (`/mi/:id`). La junta ve Consejo como sección extra del portal.
 */
export function homeHrefForRoles(condominioId: string, roles: string[]): string {
  const canAdmin = roles.some((r) =>
    ["administrador", "contadora"].includes(r),
  );
  if (canAdmin) return `/condominio/${condominioId}`;
  if (roles.includes("guardia")) return `/guardia/${condominioId}`;
  return `/mi/${condominioId}`;
}

/** Roles que abren el shell de administración del condominio. */
export const CONDO_ADMIN_ROLES = ["administrador", "contadora"] as const;

/** Roles de operación con shell propio (portería). */
export function isGuardiaOnly(roles: string[]): boolean {
  const canAdmin = roles.some((r) =>
    (CONDO_ADMIN_ROLES as readonly string[]).includes(r),
  );
  return !canAdmin && roles.includes("guardia");
}
