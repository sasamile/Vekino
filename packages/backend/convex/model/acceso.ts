import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getCurrentAppUser, getMembership, hasPlatformRole } from "./authz";
import { asignacionVigente } from "./asignacion";

import {
  capacidadesDePlataforma,
  capacidadesDeRolAsignacion,
  capacidadesDeRolesCompania,
  capacidadesDeRolesConjunto,
  estaVigente,
  unir,
  type Capacidad,
} from "../lib/vigilancia";

/* `asignacionVigente` vive en `model/asignacion.ts` para que `authz.ts`
 * tambien pueda usarla sin cerrar un ciclo de imports. Se reexporta porque
 * este sigue siendo el sitio donde se busca "el eje de seguridad". */
export { asignacionVigente };

type Ctx = QueryCtx | MutationCtx;

/**
 * QUIÉN PUEDE HACER QUÉ, EN UN SOLO SITIO.
 *
 * Con dos ejes de pertenencia la pregunta "puede operar aquí" deja de ser un
 * rol: es rol + contrato + vigencia. Las listas de literales que hoy declara
 * cada módulo (`GUARD_ROLES` está duplicada en guardia.ts, rondas.ts y
 * aporte.ts) no pueden expresar eso, así que se sustituyen por capacidades
 * resueltas aquí.
 *
 * Esto NO reemplaza todavía a `requireCondominioRole`: lo envuelve. Los 192
 * puntos de verificación que existen hoy siguen funcionando igual, y cada
 * módulo migra cuando le toque. La vía directa del guarda propio del conjunto
 * (`memberships.roles ∋ "guardia"`) se conserva intacta, que es lo que hace
 * que ningún guarda actual deje de funcionar.
 */
export type Acceso = {
  user: Doc<"users">;
  esPlataforma: boolean;
  /** Membresía en el conjunto, si la tiene. Eje residencial. */
  membership: Doc<"memberships"> | null;
  /** Asignación vigente en ESTE conjunto, si la tiene. Eje seguridad. */
  asignacion: Doc<"asignaciones"> | null;
  /** El contrato que ampara esa asignación. */
  contrato: Doc<"companiaContratos"> | null;
  compania: Doc<"companiasSeguridad"> | null;
  capacidades: Set<Capacidad>;
};

/**
 * Membresía de compañía de una persona (o null).
 *
 * Se busca por `by_user` y no por compañía porque la pregunta que se hace en
 * el arranque de sesión es "¿de qué compañía es esta persona?", no al revés.
 * Se toma la primera activa: el modelo admite varias filas históricas, pero
 * pertenecer a dos compañías a la vez no es un caso real.
 */
export async function getCompaniaMiembro(
  ctx: Ctx,
  userId: Id<"users">,
): Promise<Doc<"companiaMiembros"> | null> {
  const filas = await ctx.db
    .query("companiaMiembros")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return filas.find((m) => m.isActive) ?? null;
}

/**
 * Resuelve todo lo que una persona puede hacer en un conjunto.
 *
 * Coste acotado: como mucho cinco lecturas por índice, ninguna de colección
 * completa. Importa porque las queries del shell (`guardia.home`,
 * `condominios.adminHome`) corren en CADA página, y su propio código ya
 * advierte de eso. Resolver una vez por función y pasar el resultado; nunca
 * llamar a esto varias veces en el mismo handler.
 */
export async function resolverAcceso(
  ctx: Ctx,
  condominioId: Id<"condominios">,
): Promise<Acceso | null> {
  const user = await getCurrentAppUser(ctx);
  if (!user || !user.active) return null;

  const esPlataforma = hasPlatformRole(user, "superadmin", "admin");
  const membership = await getMembership(ctx, user._id, condominioId);
  const viaCompania = await asignacionVigente(ctx, user._id, condominioId);

  // El staff de plataforma mantiene el paso libre que ya tiene hoy.
  if (esPlataforma) {
    return {
      user,
      esPlataforma,
      membership,
      asignacion: viaCompania?.asignacion ?? null,
      contrato: viaCompania?.contrato ?? null,
      compania: viaCompania?.compania ?? null,
      capacidades: capacidadesDePlataforma(),
    };
  }

  /* Las dos vías se SUMAN. Un administrador del conjunto que además sea
   * supervisor de la compañía tiene lo de ambos, y un guarda que exista por
   * las dos vías no pierde acceso si una falla. */
  const delConjunto =
    membership && membership.isActive
      ? capacidadesDeRolesConjunto(membership.roles)
      : new Set<Capacidad>();

  const deLaAsignacion = viaCompania
    ? capacidadesDeRolAsignacion(viaCompania.asignacion.rol)
    : new Set<Capacidad>();

  return {
    user,
    esPlataforma,
    membership,
    asignacion: viaCompania?.asignacion ?? null,
    contrato: viaCompania?.contrato ?? null,
    compania: viaCompania?.compania ?? null,
    capacidades: unir(delConjunto, deLaAsignacion),
  };
}

/** Exige una capacidad en un conjunto. Lanza si no la tiene. */
export async function exigirAcceso(
  ctx: Ctx,
  condominioId: Id<"condominios">,
  capacidad: Capacidad,
): Promise<Acceso> {
  const acceso = await resolverAcceso(ctx, condominioId);
  if (!acceso) throw new Error("No autenticado o perfil inexistente.");
  if (!acceso.capacidades.has(capacidad)) {
    throw new Error(`No tiene permiso para esta operación (${capacidad}).`);
  }
  return acceso;
}

// ─────────────────────────────────────────────────────────────
// Autorización dentro del eje de seguridad (sin conjunto de por medio)
// ─────────────────────────────────────────────────────────────

export type AccesoCompania = {
  user: Doc<"users">;
  esPlataforma: boolean;
  miembro: Doc<"companiaMiembros"> | null;
  compania: Doc<"companiasSeguridad">;
  capacidades: Set<Capacidad>;
};

/**
 * Exige una capacidad SOBRE una compañía concreta.
 *
 * Separada de `exigirAcceso` porque administrar el personal de una compañía
 * no ocurre dentro de ningún conjunto: un supervisor puede existir sin estar
 * asignado a ninguna parte todavía.
 */
export async function exigirAccesoCompania(
  ctx: Ctx,
  companiaId: Id<"companiasSeguridad">,
  capacidad: Capacidad,
): Promise<AccesoCompania> {
  const user = await getCurrentAppUser(ctx);
  if (!user || !user.active) {
    throw new Error("No autenticado o perfil inexistente.");
  }
  const compania = await ctx.db.get(companiaId);
  if (!compania) throw new Error("Compañía no encontrada.");

  const esPlataforma = hasPlatformRole(user, "superadmin", "admin");
  if (esPlataforma) {
    return {
      user,
      esPlataforma,
      miembro: await getCompaniaMiembro(ctx, user._id),
      compania,
      capacidades: capacidadesDePlataforma(),
    };
  }

  const miembro = await getCompaniaMiembro(ctx, user._id);
  /* Pertenecer a OTRA compañía no da ningún acceso sobre ésta. */
  if (!miembro || miembro.companiaId !== companiaId) {
    throw new Error("No pertenece a esta compañía.");
  }
  /* Una compañía suspendida no opera, ni siquiera su propio administrador:
   * es justo lo que significa suspenderla. */
  if (compania.estado !== "activa") {
    throw new Error(`La compañía está ${compania.estado}.`);
  }

  const capacidades = capacidadesDeRolesCompania(miembro.roles);
  if (!capacidades.has(capacidad)) {
    throw new Error(`No tiene permiso para esta operación (${capacidad}).`);
  }
  return { user, esPlataforma, miembro, compania, capacidades };
}

/**
 * Conjuntos donde esta persona supervisa hoy.
 *
 * El ámbito del supervisor NO es su compañía entera: es el conjunto de sitios
 * donde tiene asignación vigente con rol `supervisor`. Un supervisor de zona
 * norte no manda sobre la zona sur de la misma empresa.
 */
export async function condominiosSupervisados(
  ctx: Ctx,
  userId: Id<"users">,
  ahora: number = Date.now(),
): Promise<Set<Id<"condominios">>> {
  const filas = await ctx.db
    .query("asignaciones")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const out = new Set<Id<"condominios">>();
  for (const a of filas) {
    if (a.rol !== "supervisor") continue;
    if (!estaVigente(a, ahora)) continue;
    const contrato = await ctx.db.get(a.contratoId);
    if (!contrato || !estaVigente(contrato, ahora)) continue;
    out.add(a.condominioId);
  }
  return out;
}

/**
 * Quién puede obrar sobre un contrato concreto.
 *
 * Tres vías, y ninguna acepta la compañía como argumento del cliente: sale
 * del documento del contrato.
 *
 *   - plataforma,
 *   - `admin_compania` de ESA compañía,
 *   - `supervisor` de esa compañía CON asignación vigente en ESE conjunto.
 *
 * La tercera es la que `exigirAccesoCompania` no puede expresar: las
 * capacidades de compañía son globales a la empresa y el supervisor está
 * acotado por conjunto. Sin esto, o el supervisor no podía hacer nada, o
 * podía tocar los conjuntos de sus colegas.
 */
export async function exigirAccesoContrato(
  ctx: Ctx,
  contrato: Doc<"companiaContratos">,
  capacidad: Capacidad,
): Promise<{
  user: Doc<"users">;
  esPlataforma: boolean;
  /** true si obra como supervisor acotado, no como admin de la compañía. */
  comoSupervisor: boolean;
}> {
  const user = await getCurrentAppUser(ctx);
  if (!user || !user.active) {
    throw new Error("No autenticado o perfil inexistente.");
  }
  if (hasPlatformRole(user, "superadmin", "admin")) {
    return { user, esPlataforma: true, comoSupervisor: false };
  }

  const miembro = await getCompaniaMiembro(ctx, user._id);
  if (!miembro || miembro.companiaId !== contrato.companiaId) {
    throw new Error("Ese contrato no pertenece a su compañía.");
  }
  const compania = await ctx.db.get(contrato.companiaId);
  if (!compania || compania.estado !== "activa") {
    throw new Error("La compañía no está activa.");
  }

  if (capacidadesDeRolesCompania(miembro.roles).has(capacidad)) {
    return { user, esPlataforma: false, comoSupervisor: false };
  }

  if (miembro.roles.includes("supervisor")) {
    const supervisa = await condominiosSupervisados(ctx, user._id);
    if (
      supervisa.has(contrato.condominioId) &&
      capacidadesDeRolAsignacion("supervisor").has(capacidad)
    ) {
      return { user, esPlataforma: false, comoSupervisor: true };
    }
  }

  throw new Error(`No tiene permiso para esta operación (${capacidad}).`);
}
