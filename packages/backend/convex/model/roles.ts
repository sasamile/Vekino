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
