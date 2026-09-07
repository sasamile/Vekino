import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { estaVigente } from "../lib/vigilancia";

type Ctx = QueryCtx | MutationCtx;

/**
 * EL EJE DE SEGURIDAD, EN UNA HOJA.
 *
 * Vive aparte de `model/acceso.ts` porque `model/authz.ts` también necesita
 * resolver una asignación —el guarda de compañía tiene que pasar por
 * `requireCondominioRole` igual que el guarda propio del conjunto— y
 * `acceso.ts` ya depende de `authz.ts`. Importarlo al revés cerraría un ciclo.
 * Aquí no se importa nada del proyecto salvo las cuentas de vigencia, así que
 * los dos lados pueden colgarse de este archivo sin enredo.
 */

/**
 * La asignación con la que esta persona puede operar hoy en este conjunto.
 *
 * Devuelve null en cuanto falla cualquier eslabón de la cadena: compañía
 * suspendida, miembro dado de baja, contrato vencido o asignación terminada.
 * Todo se comprueba al leer, así que el corte es exacto y no depende de que
 * ningún proceso se haya ejecutado.
 */
export async function asignacionVigente(
  ctx: Ctx,
  userId: Id<"users">,
  condominioId: Id<"condominios">,
  ahora: number = Date.now(),
): Promise<{
  asignacion: Doc<"asignaciones">;
  contrato: Doc<"companiaContratos">;
  compania: Doc<"companiasSeguridad">;
} | null> {
  const candidatas = await ctx.db
    .query("asignaciones")
    .withIndex("by_user_condominio", (q) =>
      q.eq("userId", userId).eq("condominioId", condominioId),
    )
    .collect();

  for (const asignacion of candidatas) {
    if (!estaVigente(asignacion, ahora)) continue;

    const contrato = await ctx.db.get(asignacion.contratoId);
    if (!contrato || !estaVigente(contrato, ahora)) continue;

    const compania = await ctx.db.get(asignacion.companiaId);
    if (!compania || compania.estado !== "activa") continue;

    const miembro = await ctx.db.get(asignacion.companiaMiembroId);
    if (!miembro || !miembro.isActive) continue;

    return { asignacion, contrato, compania };
  }
  return null;
}

/** Una asignación vigente, con lo que hace falta para pintarla y rutear. */
export type MiAsignacion = {
  asignacionId: Id<"asignaciones">;
  condominioId: Id<"condominios">;
  condominioNombre: string;
  condominioLogo: string | null;
  condominioColor: string | null;
  companiaId: Id<"companiasSeguridad">;
  companiaNombre: string;
  rol: Doc<"asignaciones">["rol"];
  vigenciaHasta: number | null;
};

/**
 * Dónde trabaja hoy una persona por la vía de una compañía.
 *
 * Es LA consulta del arranque de sesión del personal de vigilancia, y por eso
 * está aquí y no dentro de una función de Convex: la usan `users.me` (para
 * saber a dónde mandar a quien acaba de entrar), `condominios.listMine` (para
 * que el conjunto aparezca en el selector) y `asignaciones.misAsignaciones`.
 * Tenerla en tres sitios con tres criterios de vigencia distintos es
 * exactamente cómo se abren los agujeros por los que alguien sigue viendo un
 * conjunto que ya no cubre.
 *
 * Filtra la cadena entera —asignación, contrato, compañía, conjunto— porque
 * mostrar un conjunto al que la portería le va a rebotar es peor que no
 * mostrarlo.
 */
export async function misAsignacionesVigentes(
  ctx: Ctx,
  userId: Id<"users">,
  ahora: number = Date.now(),
): Promise<MiAsignacion[]> {
  const filas = await ctx.db
    .query("asignaciones")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const salida: MiAsignacion[] = [];
  for (const a of filas) {
    if (!estaVigente(a, ahora)) continue;

    const contrato = await ctx.db.get(a.contratoId);
    if (!contrato || !estaVigente(contrato, ahora)) continue;
    const compania = await ctx.db.get(a.companiaId);
    if (!compania || compania.estado !== "activa") continue;
    const miembro = await ctx.db.get(a.companiaMiembroId);
    if (!miembro || !miembro.isActive) continue;
    const condo = await ctx.db.get(a.condominioId);
    if (!condo || !condo.isActive) continue;

    salida.push({
      asignacionId: a._id,
      condominioId: a.condominioId,
      condominioNombre: condo.name,
      condominioLogo: condo.logo ?? null,
      condominioColor: condo.primaryColor ?? null,
      companiaId: a.companiaId,
      companiaNombre: compania.nombre,
      rol: a.rol,
      vigenciaHasta: a.vigenciaHasta ?? null,
    });
  }

  return salida.sort((a, b) =>
    a.condominioNombre.localeCompare(b.condominioNombre, "es"),
  );
}
