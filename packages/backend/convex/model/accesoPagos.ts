import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getMembership, hasPlatformRole, misUnidadIds } from "./authz";

/**
 * Quien puede ver los pagos de una unidad (Fase 4, F-20).
 *
 * Antes `pagos.listPorFactura` solo pedia una sesion y `pagos.verificarPago`
 * ni eso: cualquier residente con el id de una factura o de un pago veia
 * montos, medios de pago y las respuestas crudas del banco de otra casa.
 *
 * Pueden:
 * - el staff de plataforma (como en `requireCondominioRole`);
 * - la administracion y la contadora del conjunto, que llevan las cuentas;
 * - quien tiene un vinculo VIGENTE con la unidad (`misUnidadIds`): un
 *   arrendatario cuyo contrato vencio ya no, igual que con las facturas.
 *
 * La junta directiva no: ve la cartera, no los pagos de cada casa.
 */
export const ROLES_PAGOS_DEL_CONJUNTO = ["administrador", "contadora"] as const;

export const MENSAJE_SIN_ACCESO_PAGOS = "No autorizado para ver los pagos de esta unidad.";

type Ctx = QueryCtx | MutationCtx;

export async function puedeVerPagosDeUnidad(
  ctx: Ctx,
  user: Doc<"users">,
  condominioId: Id<"condominios">,
  unidadId: Id<"unidades">,
): Promise<boolean> {
  if (hasPlatformRole(user, "superadmin", "admin")) return true;
  const membership = await getMembership(ctx, user._id, condominioId);
  if (!membership || !membership.isActive) return false;
  if (membership.roles.some((r) => (ROLES_PAGOS_DEL_CONJUNTO as readonly string[]).includes(r))) {
    return true;
  }
  return (await misUnidadIds(ctx, user._id, condominioId)).has(unidadId);
}

export async function exigirAccesoAPagos(
  ctx: Ctx,
  user: Doc<"users">,
  condominioId: Id<"condominios">,
  unidadId: Id<"unidades">,
): Promise<void> {
  if (!(await puedeVerPagosDeUnidad(ctx, user, condominioId, unidadId))) {
    throw new Error(MENSAJE_SIN_ACCESO_PAGOS);
  }
}

/**
 * Lo que sale de un pago hacia una pantalla. Nunca las respuestas crudas del
 * banco (`trnRaw`, `basicDataRaw`), ni el enlace de pago, ni los ids internos
 * de la transaccion o del usuario.
 */
export function pagoPublico(p: Doc<"pagos">) {
  return {
    _id: p._id,
    _creationTime: p._creationTime,
    condominioId: p.condominioId,
    unidadId: p.unidadId,
    facturaId: p.facturaId,
    monto: p.monto,
    estado: p.estado,
    statusCodeAval: p.statusCodeAval,
    medioPago: p.medioPago,
    banco: p.banco,
    approvalId: p.approvalId,
    pmtAuthId: p.pmtAuthId,
    fechaPago: p.fechaPago,
    ambiente: p.ambiente,
    esPrueba: p.esPrueba,
    error: p.error,
    reversadaAt: p.reversadaAt,
    motivoReverso: p.motivoReverso,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
