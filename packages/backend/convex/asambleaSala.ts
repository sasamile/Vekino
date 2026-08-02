import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  requireCondominioRole,
  requireAppUser,
  getMembership,
  hasPlatformRole,
} from "./model/authz";
import {
  duracionVentana,
  formatearDuracion,
  fusionarTramos,
  msConectados,
  pctPermanencia,
  presenteEn,
  type Tramo,
  type Ventana,
} from "./lib/permanencia";

/**
 * Sala de la asamblea: quién está conectado, cuánto tiempo estuvo y quién
 * estaba dentro en el instante exacto en que se votó cada punto.
 *
 * Va aparte de `asambleas.ts` (que ya pasa de 2.000 líneas) porque es un
 * problema distinto: aquel responde "¿entró?", este responde "¿cuánto
 * estuvo?". Los dos comparten `asambleaAsistentes` como fuente de quórum
 * acumulado; aquí vive el detalle temporal.
 */

const WRITE_ROLES = [
  "administrador",
  "junta_directiva",
  "representante_asamblea",
] as const;

/**
 * Cada cuánto debe latir el cliente. El corte por inactividad es 3× esto:
 * con un latido cada 30 s toleramos perder dos seguidos antes de dar a
 * alguien por desconectado. Un umbral más corto sacaría de la sala a media
 * asamblea cada vez que el wifi parpadea.
 */
export const LATIDO_MS = 30_000;
export const CORTE_INACTIVIDAD_MS = LATIDO_MS * 3;

// ─────────────────────────────────────────────────────────────
// Helpers compartidos (los usa también asambleas.ts)
// ─────────────────────────────────────────────────────────────

export type FilaSesion = {
  unidadId: Id<"unidades">;
  unidadNumero: string;
  userId: Id<"users">;
  userNombre: string;
  coeficiente?: number;
  esPoder?: boolean;
};

/**
 * Abre un tramo de conexión por unidad.
 *
 * Idempotente sobre tramos ABIERTOS: si la unidad ya tiene uno abierto, solo
 * refresca el latido. Eso permite llamarla en cada reconexión sin fabricar
 * tramos de cero milisegundos.
 */
export async function abrirSesiones(
  ctx: MutationCtx,
  args: {
    condominioId: Id<"condominios">;
    asambleaId: Id<"asambleas">;
    origen: "codigo" | "sala" | "manual_admin" | "poder_codigo" | "presencial";
    filas: FilaSesion[];
  },
): Promise<number> {
  const now = Date.now();
  let abiertas = 0;

  for (const f of args.filas) {
    const previa = await ctx.db
      .query("asambleaSesiones")
      .withIndex("by_asamblea_unidad", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("unidadId", f.unidadId),
      )
      .filter((q) => q.eq(q.field("abierta"), true))
      .first();

    if (previa) {
      await ctx.db.patch(previa._id, { ultimoLatido: now });
      continue;
    }

    await ctx.db.insert("asambleaSesiones", {
      condominioId: args.condominioId,
      asambleaId: args.asambleaId,
      unidadId: f.unidadId,
      unidadNumero: f.unidadNumero,
      userId: f.userId,
      userNombre: f.userNombre,
      coeficiente: f.coeficiente,
      esPoder: f.esPoder,
      entroEn: now,
      abierta: true,
      origen: args.origen,
      ultimoLatido: now,
    });
    abiertas++;
  }

  return abiertas;
}

/** Cierra los tramos abiertos de una unidad. */
export async function cerrarSesionesUnidad(
  ctx: MutationCtx,
  args: {
    asambleaId: Id<"asambleas">;
    unidadId: Id<"unidades">;
    motivo: "salida" | "inactividad" | "retirada_admin" | "cierre_asamblea";
  },
): Promise<number> {
  const abiertas = await ctx.db
    .query("asambleaSesiones")
    .withIndex("by_asamblea_unidad", (q) =>
      q.eq("asambleaId", args.asambleaId).eq("unidadId", args.unidadId),
    )
    .filter((q) => q.eq(q.field("abierta"), true))
    .collect();

  const now = Date.now();
  for (const s of abiertas) {
    await ctx.db.patch(s._id, {
      abierta: false,
      salioEn: now,
      motivoSalida: args.motivo,
    });
  }
  return abiertas.length;
}

/** Cierra TODOS los tramos abiertos de la asamblea. La usa `setEstado`. */
export async function cerrarSesionesAsamblea(
  ctx: MutationCtx,
  asambleaId: Id<"asambleas">,
  motivo: "cierre_asamblea" | "retirada_admin" = "cierre_asamblea",
): Promise<number> {
  const abiertas = await ctx.db
    .query("asambleaSesiones")
    .withIndex("by_asamblea_abierta", (q) =>
      q.eq("asambleaId", asambleaId).eq("abierta", true),
    )
    .collect();

  const now = Date.now();
  for (const s of abiertas) {
    await ctx.db.patch(s._id, {
      abierta: false,
      salioEn: now,
      motivoSalida: motivo,
    });
  }
  return abiertas.length;
}

/** ¿La unidad de este usuario tiene conexión abierta? Para el gate de voto. */
export async function tieneConexionAbierta(
  ctx: QueryCtx | MutationCtx,
  asambleaId: Id<"asambleas">,
  unidadId: Id<"unidades">,
): Promise<boolean> {
  const s = await ctx.db
    .query("asambleaSesiones")
    .withIndex("by_asamblea_unidad", (q) =>
      q.eq("asambleaId", asambleaId).eq("unidadId", unidadId),
    )
    .filter((q) => q.eq(q.field("abierta"), true))
    .first();
  return s !== null;
}

// ─────────────────────────────────────────────────────────────
// Reconstrucción temporal
// ─────────────────────────────────────────────────────────────

type SesionDoc = Doc<"asambleaSesiones">;

/** Agrupa las sesiones por unidad y fusiona los tramos solapados. */
function tramosPorUnidad(sesiones: SesionDoc[], ahora: number) {
  const porUnidad = new Map<
    string,
    {
      unidadId: Id<"unidades">;
      unidadNumero: string;
      coeficiente: number;
      esPoder: boolean;
      nombres: Set<string>;
      tramos: Tramo[];
    }
  >();

  for (const s of sesiones) {
    const key = s.unidadId as string;
    const actual = porUnidad.get(key);
    const tramo: Tramo = { entroEn: s.entroEn, salioEn: s.salioEn ?? null };
    if (actual) {
      actual.tramos.push(tramo);
      actual.nombres.add(s.userNombre);
      if (s.esPoder) actual.esPoder = true;
      continue;
    }
    porUnidad.set(key, {
      unidadId: s.unidadId,
      unidadNumero: s.unidadNumero,
      coeficiente: s.coeficiente ?? 0,
      esPoder: !!s.esPoder,
      nombres: new Set([s.userNombre]),
      tramos: [tramo],
    });
  }

  for (const u of porUnidad.values()) {
    u.tramos = fusionarTramos(u.tramos, ahora);
  }
  return porUnidad;
}

/**
 * Ventana real de la asamblea, o `null` si todavía no ha empezado.
 *
 * NO cae a `createdAt`: una asamblea creada anteayer y aún sin iniciar daba
 * "duración 33 h 56 min", que es basura con pinta de dato. Sin `iniciadaEn`
 * y sin ninguna conexión, la respuesta correcta es "no ha empezado".
 */
function ventanaDe(
  asamblea: Doc<"asambleas">,
  sesiones: SesionDoc[],
): Ventana | null {
  const desde =
    asamblea.iniciadaEn ??
    (sesiones.length > 0
      ? Math.min(...sesiones.map((s) => s.entroEn))
      : null);
  if (desde === null) return null;
  return { desde, hasta: asamblea.finalizadaEn ?? null };
}

async function cargarSesiones(
  ctx: QueryCtx,
  asambleaId: Id<"asambleas">,
): Promise<SesionDoc[]> {
  return await ctx.db
    .query("asambleaSesiones")
    .withIndex("by_asamblea", (q) => q.eq("asambleaId", asambleaId))
    .collect();
}

// ─────────────────────────────────────────────────────────────
// Mutaciones de la sala
// ─────────────────────────────────────────────────────────────

/**
 * Señal de vida del residente que está en la sala.
 *
 * Refresca el latido de todas SUS unidades con tramo abierto. Si no tiene
 * ninguno abierto (se cayó y el cron ya lo cerró), abre uno nuevo: volver a
 * conectarse no debería exigir escribir el código otra vez, siempre que ya
 * hubiera registrado asistencia.
 */
export const latido = mutation({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    if (asamblea.estado !== "en_curso") {
      return { activo: false as const, unidades: 0 };
    }
    const user = await requireAppUser(ctx);

    // Solo puede latir por unidades que ya marcaron asistencia.
    const asistencias = await ctx.db
      .query("asambleaAsistentes")
      .withIndex("by_asamblea_user", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("userId", user._id),
      )
      .collect();
    if (asistencias.length === 0) {
      return { activo: false as const, unidades: 0 };
    }

    const now = Date.now();
    let refrescadas = 0;
    const reabrir: FilaSesion[] = [];

    for (const a of asistencias) {
      const abierta = await ctx.db
        .query("asambleaSesiones")
        .withIndex("by_asamblea_unidad", (q) =>
          q.eq("asambleaId", args.asambleaId).eq("unidadId", a.unidadId),
        )
        .filter((q) => q.eq(q.field("abierta"), true))
        .first();

      if (abierta) {
        await ctx.db.patch(abierta._id, { ultimoLatido: now });
        refrescadas++;
        continue;
      }
      reabrir.push({
        unidadId: a.unidadId,
        unidadNumero: a.unidadNumero,
        userId: a.userId,
        userNombre: a.userNombre,
        coeficiente: a.coeficiente,
        esPoder: a.esPoder,
      });
    }

    if (reabrir.length > 0) {
      /* `origen: "sala"`, no "codigo". Antes iba "codigo" a fuerza y el
       * paquete de auditoría acababa etiquetando como "Código en pantalla"
       * reconexiones que nadie registró con un código — justo en los datos
       * que sostienen una impugnación. */
      await abrirSesiones(ctx, {
        condominioId: asamblea.condominioId,
        asambleaId: args.asambleaId,
        origen: "sala",
        filas: reabrir,
      });
    }

    return {
      activo: true as const,
      unidades: refrescadas + reabrir.length,
      proximoLatidoMs: LATIDO_MS,
    };
  },
});

/** Salida explícita: el residente cierra la sala. */
export const salirDeSala = mutation({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    const user = await requireAppUser(ctx);

    const asistencias = await ctx.db
      .query("asambleaAsistentes")
      .withIndex("by_asamblea_user", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("userId", user._id),
      )
      .collect();

    let cerradas = 0;
    for (const a of asistencias) {
      cerradas += await cerrarSesionesUnidad(ctx, {
        asambleaId: args.asambleaId,
        unidadId: a.unidadId,
        motivo: "salida",
      });
    }
    return { cerradas };
  },
});

/**
 * Cierra las conexiones que llevan rato sin latir. Lo llama el cron cada
 * minuto sobre TODAS las asambleas — por eso el índice arranca por
 * `abierta`, no por `asambleaId`.
 */
export const cerrarSesionesInactivas = internalMutation({
  args: {},
  handler: async (ctx) => {
    const limite = Date.now() - CORTE_INACTIVIDAD_MS;
    const vencidas = await ctx.db
      .query("asambleaSesiones")
      .withIndex("by_abierta_latido", (q) =>
        q.eq("abierta", true).lt("ultimoLatido", limite),
      )
      .take(500);

    const now = Date.now();
    for (const s of vencidas) {
      await ctx.db.patch(s._id, {
        abierta: false,
        salioEn: s.ultimoLatido,
        motivoSalida: "inactividad",
      });
    }
    if (vencidas.length > 0) {
      console.info(
        `[asambleaSala] ${vencidas.length} conexiones cerradas por inactividad (corte ${new Date(limite).toISOString()}, ahora ${new Date(now).toISOString()})`,
      );
    }
    return { cerradas: vencidas.length };
  },
});

// ─────────────────────────────────────────────────────────────
// Consultas
// ─────────────────────────────────────────────────────────────

/**
 * Estado de la sala AHORA: cuántas unidades conectadas y qué coeficiente
 * representan. Es el número que la mesa proyecta durante la asamblea.
 */
export const salaEnVivo = query({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return null;
    await requireCondominioRole(ctx, asamblea.condominioId, []);

    const abiertas = await ctx.db
      .query("asambleaSesiones")
      .withIndex("by_asamblea_abierta", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("abierta", true),
      )
      .collect();

    const unidades = await ctx.db
      .query("unidades")
      .withIndex("by_condominio", (q) =>
        q.eq("condominioId", asamblea.condominioId),
      )
      .collect();

    // Una unidad conectada dos veces (dueño + apoderado) cuenta UNA.
    const porUnidad = new Map<string, number>();
    for (const s of abiertas) {
      porUnidad.set(s.unidadId as string, s.coeficiente ?? 0);
    }

    const totalCoef = unidades.reduce((s, u) => s + (u.coeficiente ?? 0), 0);
    const coefConectado = [...porUnidad.values()].reduce((s, c) => s + c, 0);
    const pct =
      totalCoef > 0
        ? (coefConectado / totalCoef) * 100
        : unidades.length > 0
          ? (porUnidad.size / unidades.length) * 100
          : 0;

    return {
      unidadesConectadas: porUnidad.size,
      totalUnidades: unidades.length,
      pctCoeficiente: Math.round(pct * 100) / 100,
      quorumRequerido: asamblea.quorumRequerido ?? 51,
      hayQuorum: pct >= (asamblea.quorumRequerido ?? 51),
      iniciadaEn: asamblea.iniciadaEn ?? null,
      exigeConexionParaVotar: !!asamblea.exigirConexionParaVotar,
      conectados: abiertas
        .sort((a, b) => b.entroEn - a.entroEn)
        .slice(0, 300)
        .map((s) => ({
          unidadNumero: s.unidadNumero,
          userNombre: s.userNombre,
          entroEn: s.entroEn,
          esPoder: !!s.esPoder,
          origen: s.origen,
        })),
    };
  },
});

/**
 * Quórum reconstruido en un instante cualquiera.
 *
 * Sirve para responder "¿había quórum a las 19:42, cuando se aprobó el
 * presupuesto?" — que es la única pregunta que importa cuando alguien
 * impugna una decisión concreta y no la asamblea entera.
 */
export const quorumEnInstante = query({
  args: { asambleaId: v.id("asambleas"), instante: v.number() },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return null;
    await requireCondominioRole(ctx, asamblea.condominioId, []);

    const sesiones = await cargarSesiones(ctx, args.asambleaId);
    const unidades = await ctx.db
      .query("unidades")
      .withIndex("by_condominio", (q) =>
        q.eq("condominioId", asamblea.condominioId),
      )
      .collect();

    const ahora = Date.now();
    const porUnidad = tramosPorUnidad(sesiones, ahora);

    let coefPresente = 0;
    let unidadesPresentes = 0;
    for (const u of porUnidad.values()) {
      if (!presenteEn(u.tramos, args.instante, ahora)) continue;
      unidadesPresentes++;
      coefPresente += u.coeficiente;
    }

    const totalCoef = unidades.reduce((s, u) => s + (u.coeficiente ?? 0), 0);
    const pct =
      totalCoef > 0
        ? (coefPresente / totalCoef) * 100
        : unidades.length > 0
          ? (unidadesPresentes / unidades.length) * 100
          : 0;

    const requerido = asamblea.quorumRequerido ?? 51;
    return {
      instante: args.instante,
      unidadesPresentes,
      totalUnidades: unidades.length,
      pctCoeficiente: Math.round(pct * 100) / 100,
      quorumRequerido: requerido,
      hayQuorum: pct >= requerido,
    };
  },
});

/**
 * Permanencia por unidad: cuánto estuvo conectada cada una respecto a la
 * duración real de la asamblea.
 *
 * Ordena por permanencia ascendente: lo primero que quiere ver la mesa es
 * quién se fue temprano, no quién se quedó.
 */
export const permanencia = query({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return null;
    await requireCondominioRole(ctx, asamblea.condominioId, [...WRITE_ROLES]);

    const sesiones = await cargarSesiones(ctx, args.asambleaId);
    const ahora = Date.now();
    const ventana = ventanaDe(asamblea, sesiones);

    if (!ventana) {
      return {
        sinIniciar: true as const,
        iniciadaEn: null,
        finalizadaEn: null,
        enCurso: false,
        msTotales: 0,
        duracionTotal: null,
        unidades: [],
        pctPromedio: 0,
      };
    }

    const msTotales = duracionVentana(ventana, ahora);
    const porUnidad = tramosPorUnidad(sesiones, ahora);

    const filas = [...porUnidad.values()]
      .map((u) => {
        const ms = msConectados(u.tramos, ventana, ahora);
        const sigueConectada = u.tramos.some((t) => t.salioEn === null);
        return {
          unidadNumero: u.unidadNumero,
          personas: [...u.nombres].join(", "),
          esPoder: u.esPoder,
          coeficiente: u.coeficiente,
          msConectado: ms,
          duracion: formatearDuracion(ms),
          pct: pctPermanencia(ms, msTotales),
          tramos: u.tramos.length,
          reconexiones: Math.max(0, u.tramos.length - 1),
          primeraEntrada: Math.min(...u.tramos.map((t) => t.entroEn)),
          ultimaSalida: sigueConectada
            ? null
            : Math.max(...u.tramos.map((t) => t.salioEn ?? 0)),
          sigueConectada,
        };
      })
      .sort((a, b) => a.msConectado - b.msConectado);

    return {
      sinIniciar: false as const,
      iniciadaEn: ventana.desde,
      finalizadaEn: ventana.hasta,
      enCurso: ventana.hasta === null,
      msTotales,
      duracionTotal: formatearDuracion(msTotales),
      unidades: filas,
      // Promedio de permanencia: un solo número para el encabezado del acta.
      pctPromedio:
        filas.length > 0
          ? Math.round(
              (filas.reduce((s, f) => s + f.pct, 0) / filas.length) * 100,
            ) / 100
          : 0,
    };
  },
});

/**
 * Integridad de una votación: cruza cada voto contra las conexiones para
 * detectar los que se emitieron sin estar en la sala.
 *
 * No bloquea nada — reporta. La decisión de anular un voto es de la mesa, no
 * de un query. Para bloquear de entrada está `exigirConexionParaVotar` en la
 * asamblea.
 */
export const integridadVotacion = query({
  args: { votacionId: v.id("votaciones") },
  handler: async (ctx, args) => {
    const votacion = await ctx.db.get(args.votacionId);
    if (!votacion) return null;
    await requireCondominioRole(ctx, votacion.condominioId, [...WRITE_ROLES]);

    const asamblea = await ctx.db.get(votacion.asambleaId);
    if (!asamblea) return null;

    const sesiones = await cargarSesiones(ctx, votacion.asambleaId);
    const ahora = Date.now();
    const porUnidad = tramosPorUnidad(sesiones, ahora);

    const votos = await ctx.db
      .query("votosAsamblea")
      .withIndex("by_votacion", (q) => q.eq("votacionId", args.votacionId))
      .collect();

    /* Sin sesiones registradas no hay nada que cruzar: es una asamblea
     * presencial o anterior a la sala. Devolvemos `aplicable: false` en vez
     * de marcar todos los votos como sospechosos, que sería una alarma
     * falsa con toda la lista en rojo. */
    if (sesiones.length === 0) {
      return {
        aplicable: false as const,
        totalVotos: votos.length,
        sinConexion: [],
        abiertaEn: votacion.abiertaEn ?? null,
        cerradaEn: votacion.cerradaEn ?? null,
      };
    }

    const sinConexion = votos
      .filter((vt) => {
        const u = porUnidad.get(vt.unidadId as string);
        if (!u) return true; // votó una unidad que nunca se conectó
        return !presenteEn(u.tramos, vt.createdAt, ahora);
      })
      .map((vt) => ({
        unidadNumero: vt.unidadNumero,
        opcionIndex: vt.opcionIndex,
        votadoEn: vt.createdAt,
        coeficiente: vt.coeficiente ?? null,
      }));

    return {
      aplicable: true as const,
      totalVotos: votos.length,
      sinConexion,
      abiertaEn: votacion.abiertaEn ?? null,
      cerradaEn: votacion.cerradaEn ?? null,
    };
  },
});

/**
 * Enciende o apaga la exigencia de estar conectado para votar.
 *
 * Es una decisión de la mesa, no del código: en una asamblea mixta hay gente
 * en el salón sin sala virtual, y encenderlo ahí los dejaría sin voto.
 */
export const exigirConexionParaVotar = mutation({
  args: { asambleaId: v.id("asambleas"), exigir: v.boolean() },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    await requireCondominioRole(ctx, asamblea.condominioId, [...WRITE_ROLES]);

    if (args.exigir && asamblea.modalidad === "presencial") {
      throw new Error(
        "Esta asamblea es presencial: no hay sala virtual a la que conectarse.",
      );
    }
    await ctx.db.patch(args.asambleaId, {
      exigirConexionParaVotar: args.exigir,
      updatedAt: Date.now(),
    });
    return { exigir: args.exigir };
  },
});

/** Mi estado en la sala, para que el cliente sepa si debe latir. */
export const miSala = query({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return null;
    const user = await requireAppUser(ctx);

    const asistencias = await ctx.db
      .query("asambleaAsistentes")
      .withIndex("by_asamblea_user", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("userId", user._id),
      )
      .collect();

    let conectadas = 0;
    for (const a of asistencias) {
      if (await tieneConexionAbierta(ctx, args.asambleaId, a.unidadId)) {
        conectadas++;
      }
    }

    /* El rol se resuelve aquí y no en la URL: la sala es UNA ruta para todos
     * (`/sala/...`, fuera de los dos shells de la app), así que el cliente no
     * puede deducir de la ruta si eres mesa o residente. */
    const membership = await getMembership(ctx, user._id, asamblea.condominioId);
    const esMesa =
      hasPlatformRole(user, "superadmin", "admin") ||
      (!!membership?.isActive &&
        membership.roles.some((r) =>
          (WRITE_ROLES as readonly string[]).includes(r),
        ));

    return {
      esMesa,
      enCurso: asamblea.estado === "en_curso",
      registrado: asistencias.length > 0,
      unidades: asistencias.length,
      unidadesConectadas: conectadas,
      debeLatir: asamblea.estado === "en_curso" && asistencias.length > 0,
      latidoMs: LATIDO_MS,
      exigeConexionParaVotar: !!asamblea.exigirConexionParaVotar,
    };
  },
});

// ─────────────────────────────────────────────────────────────
// Apoderado por código (sin cuenta)
// ─────────────────────────────────────────────────────────────

async function poderesPorCodigo(
  ctx: QueryCtx | MutationCtx,
  codigoRaw: string,
) {
  const codigo = codigoRaw.trim().toUpperCase();
  if (codigo.length < 4) return null;
  const poderes = await ctx.db
    .query("poderesAsamblea")
    .withIndex("by_codigo", (q) => q.eq("codigoAcceso", codigo))
    .collect();
  if (poderes.length === 0) return null;
  const asamblea = await ctx.db.get(poderes[0]!.asambleaId);
  if (!asamblea) return null;
  if (asamblea.estado === "finalizada" || asamblea.estado === "cancelada") {
    return null;
  }
  return { codigo, poderes, asamblea };
}

/** Estado de sala del apoderado (para saber si debe latir). */
export const miSalaConCodigo = query({
  args: { codigo: v.string() },
  handler: async (ctx, args) => {
    const pack = await poderesPorCodigo(ctx, args.codigo);
    if (!pack) return null;
    const { poderes, asamblea } = pack;

    let conectadas = 0;
    let registradas = 0;
    for (const p of poderes) {
      const asis = await ctx.db
        .query("asambleaAsistentes")
        .withIndex("by_asamblea_unidad", (q) =>
          q.eq("asambleaId", asamblea._id).eq("unidadId", p.unidadId),
        )
        .first();
      if (!asis) continue;
      registradas++;
      if (await tieneConexionAbierta(ctx, asamblea._id, p.unidadId)) {
        conectadas++;
      }
    }

    return {
      asambleaId: asamblea._id,
      enCurso: asamblea.estado === "en_curso",
      registrado: registradas === poderes.length && poderes.length > 0,
      unidades: poderes.length,
      unidadesConectadas: conectadas,
      debeLatir: asamblea.estado === "en_curso" && registradas > 0,
      latidoMs: LATIDO_MS,
      exigeConexionParaVotar: !!asamblea.exigirConexionParaVotar,
    };
  },
});

/** Latido del apoderado: mantiene abiertas las sesiones de sus unidades. */
export const latidoConCodigo = mutation({
  args: { codigo: v.string() },
  handler: async (ctx, args) => {
    const pack = await poderesPorCodigo(ctx, args.codigo);
    if (!pack) return { activo: false as const, unidades: 0 };
    const { poderes, asamblea } = pack;
    if (asamblea.estado !== "en_curso") {
      return { activo: false as const, unidades: 0 };
    }

    const now = Date.now();
    let refrescadas = 0;
    const reabrir: FilaSesion[] = [];

    for (const p of poderes) {
      const asis = await ctx.db
        .query("asambleaAsistentes")
        .withIndex("by_asamblea_unidad", (q) =>
          q.eq("asambleaId", asamblea._id).eq("unidadId", p.unidadId),
        )
        .first();
      if (!asis) continue;

      const abierta = await ctx.db
        .query("asambleaSesiones")
        .withIndex("by_asamblea_unidad", (q) =>
          q.eq("asambleaId", asamblea._id).eq("unidadId", p.unidadId),
        )
        .filter((q) => q.eq(q.field("abierta"), true))
        .first();

      if (abierta) {
        await ctx.db.patch(abierta._id, { ultimoLatido: now });
        refrescadas++;
        continue;
      }
      reabrir.push({
        unidadId: asis.unidadId,
        unidadNumero: asis.unidadNumero,
        userId: asis.userId,
        userNombre: asis.userNombre,
        coeficiente: asis.coeficiente,
        esPoder: true,
      });
    }

    if (reabrir.length > 0) {
      await abrirSesiones(ctx, {
        condominioId: asamblea.condominioId,
        asambleaId: asamblea._id,
        origen: "poder_codigo",
        filas: reabrir,
      });
    }

    return {
      activo: true as const,
      unidades: refrescadas + reabrir.length,
      proximoLatidoMs: LATIDO_MS,
    };
  },
});

/** El apoderado cierra la pestaña / sale de la sala. */
export const salirDeSalaConCodigo = mutation({
  args: { codigo: v.string() },
  handler: async (ctx, args) => {
    const pack = await poderesPorCodigo(ctx, args.codigo);
    if (!pack) return { cerradas: 0 };
    const { poderes, asamblea } = pack;

    let cerradas = 0;
    for (const p of poderes) {
      cerradas += await cerrarSesionesUnidad(ctx, {
        asambleaId: asamblea._id,
        unidadId: p.unidadId,
        motivo: "salida",
      });
    }
    return { cerradas };
  },
});
