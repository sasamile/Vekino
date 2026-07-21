/**
 * Destino de inicio de un usuario dentro de un condominio, según sus roles.
 *
 * - administrador / junta_directiva / contadora → panel de administración
 *   (`/condominio/:id`), recortado por rol en el nav.
 * - guardia → app de portería (`/guardia/:id`).
 * - resto (propietario, arrendatario, residente…) → portal personal (`/mi/:id`).
 */
export function homeHrefForRoles(condominioId: string, roles: string[]): string {
  const canAdmin = roles.some((r) =>
    ["administrador", "junta_directiva", "contadora"].includes(r),
  );
  if (canAdmin) return `/condominio/${condominioId}`;
  if (roles.includes("guardia")) return `/guardia/${condominioId}`;
  return `/mi/${condominioId}`;
}
