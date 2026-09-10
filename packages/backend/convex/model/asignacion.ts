import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { acotado, estaVigente, haySolape, type Rango } from "../lib/vigilancia";

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

/**
 * Si una asignacion ya existente choca DE VERDAD con una ventana nueva.
 *
 * ── Por que no basta con mirar las fechas ────────────────────────────────
 * Porque en este modelo el significado de una fila no esta en la fila. Una
 * asignacion cuelga del contrato y del miembro precisamente para que
 * terminar el contrato o dar de baja a la persona la invaliden sin tocarla:
 * lo dice el esquema y lo aplica `asignacionVigente` al leer. Terminar un
 * contrato NO le pone fecha de fin a sus asignaciones, a proposito.
 *
 * De modo que una asignacion vieja, sin `vigenciaHasta`, bajo un contrato
 * terminado hace meses, leida sola parece abierta e infinita. Y asi es como
 * un guarda registrado en una compania de pruebas —contrato terminado, baja
 * dada— quedaba bloqueado para siempre en el conjunto: la comprobacion de
 * solape miraba la fila cruda mientras el resto del sistema miraba la cadena.
 *
 * Esta funcion comprueba los mismos cuatro eslabones que `asignacionVigente`
 * —asignacion, contrato, compania, miembro— y vive pegada a ella para que no
 * vuelvan a separarse. Si una asignacion no puede dar acceso, no puede
 * estorbar: no hay nadie ahi con quien chocar.
 *
 * ── Lo que SIGUE bloqueando ──────────────────────────────────────────────
 * Dos asignaciones vivas a la misma porteria a la vez, aunque las traiga otra
 * compania. No se filtra por `companiaId`: la misma persona no puede cubrir
 * dos veces el mismo puesto a la misma hora, y de quien la contrate no
 * depende. Acotar por compania habria hecho pasar este caso, si, pero
 * abriendo justo ese agujero.
 */
export async function asignacionEstorba(
  ctx: Ctx,
  previa: Doc<"asignaciones">,
  nueva: Rango,
): Promise<boolean> {
  /* Lo barato primero. Acotar por el contrato solo puede ENCOGER la ventana,
   * asi que si las fechas crudas ya no se pisan no hay nada que ir a leer, y
   * el caso normal no cuesta una sola consulta. */
  if (!haySolape(previa, nueva)) return false;

  /* Sin contrato no ampara nada. No deberia pasar; si pasa, la fila esta
   * huerfana y no es motivo para bloquear a nadie. */
  const contrato = await ctx.db.get(previa.contratoId);
  if (!contrato) return false;
  if (!haySolape(acotado(previa, contrato), nueva)) return false;

  const compania = await ctx.db.get(previa.companiaId);
  if (!compania || compania.estado !== "activa") return false;

  const miembro = await ctx.db.get(previa.companiaMiembroId);
  if (!miembro || !miembro.isActive) return false;

  return true;
}
