import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireCondominioRole } from "./model/authz";
import { logMinuta, rondaEnCurso, turnoAbierto } from "./model/minuta";
import {
  contar,
  duracionMs,
  duracionTexto,
  estadoDeRonda,
  ordenarLineaDeTiempo,
  type Hito,
} from "./lib/ronda";

/**
 * Rondas de vigilancia: quien la hizo, cuando empezo, que paso y cuanto duro.
 *
 * Una ronda vive DENTRO de un turno. El turno responde por la jornada —la
 * dotacion, la entrega al relevo— y dura ocho o doce horas; la ronda responde
 * por un recorrido y dura una. Un turno tiene varias.
 *
 * Todo lo que el guarda registre mientras hay una ronda en curso queda colgado
 * de ella solo, sin que el tenga que indicarlo: la asociacion se hace en
 * `logMinuta`, por donde pasa cada accion de porteria.
 */

const GUARD_ROLES = ["guardia", "administrador", "junta_directiva"] as const;

/** Solo una ronda abierta a la vez por condominio. */
async function exigirSinRondaAbierta(
  ctx: QueryCtx,
  condominioId: Id<"condominios">,
) {
  const abierta = await rondaEnCurso(ctx, condominioId);
  if (abierta) {
    throw new Error(
      `Ya hay una ronda en curso (${abierta.zona}). Ciérrala antes de empezar otra.`,
    );
  }
}

/** Cuenta cuantas rondas lleva el condominio, para numerar la siguiente. */
async function siguienteNumero(
  ctx: QueryCtx,
  condominioId: Id<"condominios">,
): Promise<number> {
  const todas = await ctx.db
    .query("guardiaRondas")
    .withIndex("by_condominio", (q) => q.eq("condominioId", condominioId))
    .collect();
  /* Del maximo, no del total: si alguna vez se borra una ronda el consecutivo
   * no debe retroceder y chocar con una que ya existio. */
  const max = todas.reduce((m, r) => Math.max(m, r.numero ?? 0), 0);
  return max + 1;
}

/**
 * Abre la ronda. La hora y el responsable los pone el sistema.
 *
 * La especificacion es explicita en que no se puedan escribir a mano: una
 * ronda cuya hora de inicio la teclea quien la hizo no prueba nada.
 */
export const iniciar = mutation({
  args: {
    condominioId: v.id("condominios"),
    zonaId: v.optional(v.id("guardiaRondaZonas")),
    zona: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCondominioRole(ctx, args.condominioId, [
      ...GUARD_ROLES,
    ]);

    /* Sin turno abierto no hay ronda: la ronda cuelga del turno, y permitirla
     * suelta dejaria recorridos que no pertenecen a ninguna jornada. */
    const turno = await turnoAbierto(ctx, args.condominioId);
    if (!turno) {
      throw new Error("Abre el turno antes de iniciar una ronda.");
    }
    await exigirSinRondaAbierta(ctx, args.condominioId);

    let zona = args.zona?.trim() || "";
    if (args.zonaId) {
      const z = await ctx.db.get(args.zonaId);
      if (!z || z.condominioId !== args.condominioId) {
        throw new Error("Esa zona no pertenece a este condominio.");
      }
      zona = z.nombre;
    }
    if (!zona) zona = "Recorrido general";

    const ahora = Date.now();
    const numero = await siguienteNumero(ctx, args.condominioId);
    const rondaId = await ctx.db.insert("guardiaRondas", {
      condominioId: args.condominioId,
      turnoId: turno._id,
      zonaId: args.zonaId,
      zona,
      fotos: [],
      numero,
      guardiaUserId: user._id,
      guardiaNombre: user.name,
      estado: "en_curso",
      fechaInicio: ahora,
      createdAt: ahora,
    });

    await logMinuta(ctx, {
      condominioId: args.condominioId,
      modulo: "minuta",
      tipo: "Inicio de ronda",
      unidad: zona,
      resumen: `Ronda #${numero} iniciada en ${zona}.`,
      actorUserId: user._id,
      actorNombre: user.name,
      turnoId: turno._id,
    });

    return { rondaId, numero };
  },
});

/**
 * Cierra la ronda y la deja inmutable.
 *
 * A partir de aqui no admite mas registros. Es lo que convierte la bitacora
 * en evidencia: una ronda que se puede seguir editando despues de cerrada no
 * demuestra a que hora ocurrio nada.
 */
export const finalizar = mutation({
  args: {
    rondaId: v.id("guardiaRondas"),
    observaciones: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ronda = await ctx.db.get(args.rondaId);
    if (!ronda) throw new Error("Ronda no encontrada.");
    const { user } = await requireCondominioRole(ctx, ronda.condominioId, [
      ...GUARD_ROLES,
    ]);
    if (estadoDeRonda(ronda.estado) === "finalizada") {
      throw new Error("Esa ronda ya está cerrada.");
    }

    const ahora = Date.now();
    await ctx.db.patch(args.rondaId, {
      estado: "finalizada",
      fechaCierre: ahora,
      observacionesCierre: args.observaciones?.trim() || undefined,
    });

    const duracion = duracionTexto(ronda.fechaInicio, ahora);
    await logMinuta(ctx, {
      condominioId: ronda.condominioId,
      modulo: "minuta",
      tipo: "Fin de ronda",
      unidad: ronda.zona,
      resumen: `Ronda #${ronda.numero ?? "—"} finalizada${duracion ? ` · duró ${duracion}` : ""}.`,
      actorUserId: user._id,
      actorNombre: user.name,
      turnoId: ronda.turnoId,
    });

    return { ok: true as const, duracion };
  },
});

/** La ronda abierta, para que el guarda vea que la tiene corriendo. */
export const activa = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...GUARD_ROLES]);
    const r = await rondaEnCurso(ctx, args.condominioId);
    if (!r) return null;
    return {
      _id: r._id,
      numero: r.numero ?? null,
      zona: r.zona,
      guardiaNombre: r.guardiaNombre ?? null,
      fechaInicio: r.fechaInicio ?? r.createdAt,
    };
  },
});

/** Reúne todo lo que ocurrió durante una ronda. */
async function hitosDeRonda(
  ctx: QueryCtx,
  ronda: Doc<"guardiaRondas">,
): Promise<Hito[]> {
  const hitos: Hito[] = [
    {
      en: ronda.fechaInicio ?? ronda.createdAt,
      tipo: "inicio",
      titulo: `Inicio de ronda${ronda.zona ? ` · ${ronda.zona}` : ""}`,
      quien: ronda.guardiaNombre ?? null,
    },
  ];

  const novedades = await ctx.db
    .query("guardiaNovedadReportes")
    .withIndex("by_condominio", (q) => q.eq("condominioId", ronda.condominioId))
    .collect();
  for (const n of novedades) {
    if (n.rondaId !== ronda._id) continue;
    hitos.push({
      en: n.ocurrioEn ?? n.createdAt,
      /* Un reporte con placa se lee como vehículo aunque viaje por la misma
       * tabla: es lo que la administración busca cuando revisa la ronda. */
      tipo: n.vehiculoPlaca ? "vehiculo" : "novedad",
      titulo: n.titulo,
      detalle: n.descripcion,
      fotos: n.fotos?.length ?? 0,
    });
  }

  const eventos = await ctx.db
    .query("minutaEventos")
    .withIndex("by_condominio", (q) => q.eq("condominioId", ronda.condominioId))
    .collect();
  for (const e of eventos) {
    if (e.rondaId !== ronda._id) continue;
    /* La apertura y el cierre ya son hitos propios; repetirlos desde la
     * minuta duplicaría las dos puntas de la línea de tiempo. */
    if (e.tipo === "Inicio de ronda" || e.tipo === "Fin de ronda") continue;
    hitos.push({
      en: e.createdAt,
      tipo: "evento",
      titulo: `${e.tipo}${e.unidad ? ` · ${e.unidad}` : ""}`,
      detalle: e.resumen,
      quien: e.actorNombre,
    });
  }

  if (ronda.fechaCierre) {
    hitos.push({
      en: ronda.fechaCierre,
      tipo: "cierre",
      titulo: "Finalización de ronda",
      detalle: ronda.observacionesCierre ?? null,
      quien: ronda.guardiaNombre ?? null,
    });
  }

  return ordenarLineaDeTiempo(hitos);
}

/** El reporte consolidado de una ronda. */
export const detalle = query({
  args: { rondaId: v.id("guardiaRondas") },
  handler: async (ctx, args) => {
    const ronda = await ctx.db.get(args.rondaId);
    if (!ronda) return null;
    await requireCondominioRole(ctx, ronda.condominioId, [...GUARD_ROLES]);

    const hitos = await hitosDeRonda(ctx, ronda);
    const inicio = ronda.fechaInicio ?? ronda.createdAt;
    return {
      _id: ronda._id,
      numero: ronda.numero ?? null,
      zona: ronda.zona,
      guardiaNombre: ronda.guardiaNombre ?? null,
      estado: estadoDeRonda(ronda.estado),
      fechaInicio: inicio,
      fechaCierre: ronda.fechaCierre ?? null,
      duracion: duracionTexto(inicio, ronda.fechaCierre),
      duracionMs: duracionMs(inicio, ronda.fechaCierre),
      observacionesCierre: ronda.observacionesCierre ?? null,
      totales: contar(hitos),
      lineaDeTiempo: hitos,
    };
  },
});

/** Historial de rondas, de la más reciente a la más vieja. */
export const listar = query({
  args: {
    condominioId: v.id("condominios"),
    limite: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...GUARD_ROLES]);
    const rondas = await ctx.db
      .query("guardiaRondas")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .take(Math.min(args.limite ?? 50, 200));

    /* Los contadores se calculan aquí y no se guardan en la ronda: un contador
     * denormalizado se desincroniza en cuanto alguien borra un reporte, y el
     * historial es justo donde se notaría. */
    const salida = [];
    for (const r of rondas) {
      const hitos = await hitosDeRonda(ctx, r);
      const inicio = r.fechaInicio ?? r.createdAt;
      salida.push({
        _id: r._id,
        numero: r.numero ?? null,
        zona: r.zona,
        guardiaNombre: r.guardiaNombre ?? null,
        estado: estadoDeRonda(r.estado),
        fechaInicio: inicio,
        fechaCierre: r.fechaCierre ?? null,
        duracion: duracionTexto(inicio, r.fechaCierre),
        totales: contar(hitos),
      });
    }
    return salida;
  },
});
