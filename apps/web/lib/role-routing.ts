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

/**
 * Destino de quien llega por el eje de vigilancia (una compañía, no el
 * conjunto). No tiene membresía, así que `homeHrefForRoles` no le aplica.
 *
 * - guardia → la misma app de portería que el guarda propio del conjunto.
 * - supervisor → su panel, que es transversal a varios conjuntos y por eso no
 *   lleva id en la ruta.
 */
export function homeHrefForAsignacion(
  condominioId: string,
  rol: "guardia" | "supervisor",
): string {
  return rol === "supervisor" ? "/vigilancia" : `/guardia/${condominioId}`;
}
