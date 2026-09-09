import { v } from "convex/values";

/**
 * ROLES EN 2 CAPAS
 *
 * Capa 1 — Plataforma (global, en `users.platformRole`):
 *   - superadmin: dueño del SaaS. Control maestro total (todos los condominios).
 *   - admin: staff de plataforma. Soporte / operación multi-condominio.
 *   - (undefined): usuario normal, sin poderes de plataforma.
 *
 * Capa 2 — Operativos por condominio (en `memberships.roles[]`):
 *   Un usuario puede tener varios roles dentro de un mismo condominio.
 */

export const PLATFORM_ROLES = ["superadmin", "admin"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const platformRoleValidator = v.union(
  v.literal("superadmin"),
  v.literal("admin"),
);

export const OPERATIONAL_ROLES = [
  "administrador", // admin del condominio (gestiona todo el conjunto)
  "propietario", // dueño de una o más unidades
  "apoderado", // representa a un propietario (poder / power of attorney)
  "arrendatario", // inquilino de una unidad
  "residente", // habita sin ser dueño ni arrendatario formal
  "contadora", // finanzas / cartera
  "guardia", // seguridad / portería
  "junta_directiva", // consejo de administración
  "representante_asamblea", // vocero en asambleas
] as const;

export type OperationalRole = (typeof OPERATIONAL_ROLES)[number];

export const operationalRoleValidator = v.union(
  v.literal("administrador"),
  v.literal("propietario"),
  v.literal("apoderado"),
  v.literal("arrendatario"),
  v.literal("residente"),
  v.literal("contadora"),
  v.literal("guardia"),
  v.literal("junta_directiva"),
  v.literal("representante_asamblea"),
);

/** Vínculo de una persona con una unidad concreta. */
export const vinculoUnidadValidator = v.union(
  v.literal("propietario"),
  v.literal("apoderado"),
  v.literal("arrendatario"),
  v.literal("residente"),
);

export const tipoDocumentoValidator = v.union(
  v.literal("CC"), // cédula de ciudadanía
  v.literal("CE"), // cédula de extranjería
  v.literal("NIT"),
  v.literal("PASAPORTE"),
  v.literal("TI"), // tarjeta de identidad
  v.literal("PEP"),
);

export const subscriptionPlanValidator = v.union(
  v.literal("basico"),
  v.literal("pro"),
  v.literal("enterprise"),
);

export const tipoUnidadValidator = v.union(
  v.literal("apartamento"),
  v.literal("casa"),
  v.literal("local"),
  v.literal("parqueadero"),
  v.literal("deposito"),
  v.literal("oficina"),
  v.literal("otro"),
);

export const estadoUnidadValidator = v.union(
  v.literal("ocupada"),
  v.literal("desocupada"),
  v.literal("en_mora"),
  v.literal("inactiva"),
);

// ─────────────────────────────────────────────────────────────
// EJE DE SEGURIDAD (compañías de vigilancia)
//
// Segundo eje de pertenencia, hermano del conjunto y no hijo suyo: una
// persona pertenece a una compañía, que existe antes de tener conjuntos y
// sobrevive a perderlos. Vive en `companiaMiembros`, espejo de `memberships`.
//
// El literal "guardia" se repite a propósito en los dos ejes. Nombrar
// "guarda" al de la compañía los haría distinguibles por una letra, que es
// una fábrica de errores silenciosos; como viven en tablas distintas y con
// validadores distintos, la ambigüedad real es nula.
// ─────────────────────────────────────────────────────────────

export const COMPANIA_ROLES = [
  "admin_compania", // gestiona el personal y las asignaciones de su compañía
  "supervisor", // supervisa la operación en los conjuntos donde se le asigne
  "guardia", // opera la portería en los conjuntos donde se le asigne
] as const;

export type CompaniaRole = (typeof COMPANIA_ROLES)[number];

export const companiaRoleValidator = v.union(
  v.literal("admin_compania"),
  v.literal("supervisor"),
  v.literal("guardia"),
);

/**
 * UN USUARIO DE COMPAÑÍA = UN ÚNICO ROL DE COMPAÑÍA.
 *
 * `companiaMiembros.roles` sigue siendo un array —cambiar la forma de la
 * tabla obligaría a migrar el esquema y a reescribir los ciento y pico sitios
 * que hoy preguntan `roles.includes(...)`, que funcionan igual de bien con un
 * array de un elemento—. Lo que cambia es que ahora hay una sola longitud
 * válida, y se comprueba aquí en vez de en cada formulario.
 *
 * El motivo es de ruteo, no de permisos: tras el login el sistema tiene que
 * poder decir a qué experiencia lleva a esta persona, y con dos roles a la vez
 * —guarda Y supervisor— no hay respuesta. La alternativa era desempatar por
 * orden de comprobación en el cliente, que es exactamente la clase de regla
 * que se olvida de actualizar cuando aparece el tercer rol.
 *
 * OJO: esto es SOLO el eje de vigilancia. `memberships.roles` sigue siendo
 * multi-rol a propósito —alguien es propietario Y miembro de la junta— y no
 * debe pasar por aquí.
 *
 * Lanza en vez de normalizar: quedarse en silencio con el primero de dos
 * roles enviados por error deja a una persona con menos permisos de los que
 * quien la dio de alta cree haberle puesto, y eso no se descubre hasta que
 * no puede entrar.
 */
export function exigirRolUnicoCompania(
  roles: readonly CompaniaRole[],
): CompaniaRole {
  if (roles.length === 0) throw new Error("Selecciona un rol.");
  if (roles.length > 1) {
    throw new Error(
      "Una persona solo puede tener un rol en la compañía. Selecciona uno.",
    );
  }
  return roles[0]!;
}

/**
 * El rol de un miembro tal como lo leen el ruteo y la interfaz.
 *
 * Tolerante a propósito, al revés que `exigirRolUnicoCompania`: las filas
 * anteriores a la regla pueden traer varios roles hasta que se normalicen, y
 * una pantalla que reviente al pintarlas sería peor que una que muestre el de
 * mayor responsabilidad. La jerarquía es la misma que usa la normalización.
 */
export function rolPrincipalDeCompania(
  roles: readonly CompaniaRole[],
): CompaniaRole | null {
  for (const rol of COMPANIA_ROLES) {
    if (roles.includes(rol)) return rol;
  }
  return null;
}

/**
 * Estado de la compañía. El único enum nuevo del modelo.
 *
 * `suspendida` existe porque un booleano no puede expresar "bloqueada pero
 * todavía contratada": la plataforma necesita cortar la operación de una
 * compañía —impago, incidente— sin terminar sus contratos, porque terminarlos
 * invalidaría todas sus asignaciones y perdería la relación comercial.
 */
export const estadoCompaniaValidator = v.union(
  v.literal("activa"),
  v.literal("suspendida"),
  v.literal("inactiva"),
);

export type EstadoCompania = "activa" | "suspendida" | "inactiva";

/**
 * Rol con el que alguien queda asignado a un conjunto concreto.
 *
 * Valor único y no array: en un conjunto se es una cosa. Va en la asignación
 * y no en la persona para que un supervisor pueda cubrir un turno como guarda
 * en otro conjunto sin cambiar quién es.
 */
export const rolAsignacionValidator = v.union(
  v.literal("supervisor"),
  v.literal("guardia"),
);

export type RolAsignacion = "supervisor" | "guardia";
