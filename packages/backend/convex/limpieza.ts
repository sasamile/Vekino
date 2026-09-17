import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Borrar los datos de prueba antes de que el conjunto entre en operacion.
 *
 * Durante la implantacion se crean reservas, minutas, novedades y visitantes
 * de mentira para ver si todo funciona. El dia que el conjunto arranca de
 * verdad, esa basura queda mezclada con lo real y ensucia la trazabilidad:
 * una minuta que se supone que es el registro de lo que paso en porteria no
 * puede empezar con quince entradas inventadas.
 *
 * Solo `internal`: se ejecuta por terminal, nunca desde un boton. Borrar la
 * operacion de un conjunto entero no es algo que deba estar a un clic de
 * distancia de nadie.
 *
 * NUNCA toca los datos maestros —unidades, usuarios, facturas, vehiculos,
 * zonas, documentos, comunicados— porque esos son reales: se importaron de la
 * contabilidad y del censo del conjunto, no los inventamos nosotros.
 */

/** Tablas de operacion que se pueden limpiar, con su nombre en cristiano. */
const OPERACION = {
  reservas: "Reservas",
  reservaIncidentes: "Incidentes de reserva",
  guardiaReservaDepositos: "Depositos de reserva",
  visitantes: "Visitantes",
  paquetes: "Paqueteria",
  novedades: "Novedades (residentes)",
  guardiaNovedadReportes: "Novedades (guardia)",
  minutaEventos: "Minuta digital",
  guardiaTurnos: "Turnos de guardia",
  guardiaRondas: "Rondas",
  pqrs: "PQRS",
  soporteTickets: "Tickets de soporte",
  pagos: "Pagos de pasarela",
  soportesPago: "Soportes de pago",
  inventarioNovedades: "Novedades de inventario",
  actividadUso: "Actividad de uso",
} as const;

type Tabla = keyof typeof OPERACION;

const TABLAS = Object.keys(OPERACION) as Tabla[];

/** Todo lo de una tabla que pertenece al condominio. */
async function filasDe(
  ctx: QueryCtx | MutationCtx,
  tabla: Tabla,
  condominioId: Id<"condominios">,
) {
  const todas = await ctx.db.query(tabla).collect();
  return todas.filter(
    (f) => (f as { condominioId?: unknown }).condominioId === condominioId,
  );
}

const fecha = (ts: number) => new Date(ts).toISOString().slice(0, 16).replace("T", " ");

/**
 * Que hay, sin borrar nada.
 *
 * Se mira ANTES de limpiar. Un borrado a ciegas sobre produccion es como
 * firmar sin leer: aqui la lista sale con fechas para poder distinguir lo que
 * hicimos nosotros probando de lo que ya empezo a registrar el conjunto.
 */
export const inventario = internalQuery({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    const condominio = await ctx.db.get(args.condominioId);
    if (!condominio) throw new Error("Condominio no encontrado.");

    const salida = [];
    for (const tabla of TABLAS) {
      const filas = await filasDe(ctx, tabla, args.condominioId);
      if (filas.length === 0) continue;
      const tiempos = filas
        .map((f) => f._creationTime)
        .sort((a, b) => a - b);
      salida.push({
        tabla,
        nombre: OPERACION[tabla],
        filas: filas.length,
        primera: fecha(tiempos[0]!),
        ultima: fecha(tiempos[tiempos.length - 1]!),
      });
    }

    return {
      condominio: condominio.name,
      total: salida.reduce((s, t) => s + t.filas, 0),
      tablas: salida.sort((a, b) => b.filas - a.filas),
    };
  },
});

/**
 * Borra la operacion del condominio. Irreversible.
 *
 * Pide el nombre del condominio escrito a mano en `confirmar`. No es burocracia:
 * es la unica forma de que quien ejecute esto haya leido cual condominio esta
 * vaciando. Un id copiado y pegado no demuestra nada.
 */
export const limpiar = internalMutation({
  args: {
    condominioId: v.id("condominios"),
    /** El nombre exacto del condominio. */
    confirmar: v.string(),
    /** Si se omite, se limpian todas las tablas de operacion. */
    tablas: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const condominio = await ctx.db.get(args.condominioId);
    if (!condominio) throw new Error("Condominio no encontrado.");
    if (args.confirmar.trim() !== condominio.name) {
      throw new Error(
        `Para borrar la operacion de "${condominio.name}" hay que escribir ese nombre exacto en "confirmar".`,
      );
    }

    const pedidas = (args.tablas ?? TABLAS).filter((t): t is Tabla =>
      (TABLAS as string[]).includes(t),
    );

    const borrado: Record<string, number> = {};
    for (const tabla of pedidas) {
      const filas = await filasDe(ctx, tabla, args.condominioId);
      for (const f of filas) await ctx.db.delete(f._id);
      if (filas.length > 0) borrado[OPERACION[tabla]] = filas.length;
    }

    return {
      condominio: condominio.name,
      borrado,
      total: Object.values(borrado).reduce((s, n) => s + n, 0),
    };
  },
});
