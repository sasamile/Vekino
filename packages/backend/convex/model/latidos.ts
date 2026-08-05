import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * El pulso de las conexiones a la sala.
 *
 * Vive aparte de las tablas que lee `salaEnVivo` a propósito: ver el
 * comentario de `salaLatidos` en el schema. En dos frases: Convex invalida
 * una consulta cuando cambia un documento que leyó, así que si el latido se
 * guardara dentro de la sesión, cada pulso de cada persona despertaría la
 * consulta de todas las demás — un coste que crece con el CUADRADO de la
 * gente conectada.
 *
 * Estas cuatro funciones son toda la superficie. Nadie más debería tocar
 * `salaLatidos` directamente.
 */

/** Refresca (o crea) el pulso de una sesión de unidad. */
export async function latirSesion(
  ctx: MutationCtx,
  asambleaId: Id<"asambleas">,
  sesionId: Id<"asambleaSesiones">,
) {
  const previo = await ctx.db
    .query("salaLatidos")
    .withIndex("by_sesion", (q) => q.eq("sesionId", sesionId))
    .first();

  const ultimoLatido = Date.now();
  if (previo) await ctx.db.patch(previo._id, { ultimoLatido });
  else await ctx.db.insert("salaLatidos", { asambleaId, sesionId, ultimoLatido });
}

/** Refresca (o crea) el pulso de una persona con la pestaña abierta. */
export async function latirPresencia(
  ctx: MutationCtx,
  asambleaId: Id<"asambleas">,
  presenciaId: Id<"salaPresencias">,
) {
  const previo = await ctx.db
    .query("salaLatidos")
    .withIndex("by_presencia", (q) => q.eq("presenciaId", presenciaId))
    .first();

  const ultimoLatido = Date.now();
  if (previo) await ctx.db.patch(previo._id, { ultimoLatido });
  else
    await ctx.db.insert("salaLatidos", { asambleaId, presenciaId, ultimoLatido });
}

/**
 * Borra el pulso de una sesión.
 *
 * Hay que llamarla en TODA salida —limpia o por cron—: un pulso huérfano
 * haría que el cron intentara cerrar una y otra vez algo que ya no existe.
 */
export async function olvidarLatidoSesion(
  ctx: MutationCtx,
  sesionId: Id<"asambleaSesiones">,
) {
  const fila = await ctx.db
    .query("salaLatidos")
    .withIndex("by_sesion", (q) => q.eq("sesionId", sesionId))
    .first();
  if (fila) await ctx.db.delete(fila._id);
}

/** Borra el pulso de una presencia. */
export async function olvidarLatidoPresencia(
  ctx: MutationCtx,
  presenciaId: Id<"salaPresencias">,
) {
  const fila = await ctx.db
    .query("salaLatidos")
    .withIndex("by_presencia", (q) => q.eq("presenciaId", presenciaId))
    .first();
  if (fila) await ctx.db.delete(fila._id);
}
