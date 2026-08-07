import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  hasPlatformRole,
  requireAppUser,
  requireCondominioRole,
} from "./model/authz";
import { registrarBitacora } from "./salaBitacora";

/**
 * Lo que se habló en la asamblea, transcrito en vivo.
 *
 * Este módulo NO transcribe: recibe texto ya reconocido y lo deja pegado al
 * punto del orden del día y a la votación que estaban vigentes en ese
 * instante. El motor vive fuera (`infra/transcriptor`), porque reconocer voz
 * necesita mantener un socket abierto por hablante durante horas y eso no es
 * algo que pueda hacer una función de base de datos.
 *
 * Quién habla NO se deduce del audio: el servidor de medios entrega una
 * pista por participante con la identidad firmada en el token, así que cada
 * segmento llega ya atribuido.
 */

const WRITE_ROLES = [
  "administrador",
  "junta_directiva",
  "representante_asamblea",
] as const;

/** Debajo de esto la interfaz marca la frase como dudosa. */
export const CONFIANZA_DUDOSA = 0.6;

/** Tope de frases que devuelve una sola consulta. */
const TOPE_PAGINA = 500;

async function esMesa(
  ctx: QueryCtx | MutationCtx,
  condominioId: Id<"condominios">,
  user: { _id: Id<"users">; platformRole?: string | null },
) {
  if (hasPlatformRole(user as never, "superadmin", "admin")) return true;
  try {
    await requireCondominioRole(ctx, condominioId, [...WRITE_ROLES]);
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Contexto del momento
// ─────────────────────────────────────────────────────────────

/**
 * Punto del orden del día y votación vigentes AHORA.
 *
 * Se resuelve al insertar y no al leer el acta. Durante la asamblea la mesa
 * reordena puntos, agrega otros y marca hechos los que ya pasaron; si esto
 * se calculara después, las frases quedarían colgadas del punto equivocado.
 *
 * El punto vigente es el primero sin marcar como hecho: es exactamente el
 * criterio que usa la mesa cuando avanza el orden del día.
 */
async function contextoActual(
  ctx: QueryCtx | MutationCtx,
  asambleaId: Id<"asambleas">,
): Promise<{ puntoIndice?: number; votacionId?: Id<"votaciones"> }> {
  const asamblea = await ctx.db.get(asambleaId);
  if (!asamblea) return {};

  let puntoIndice: number | undefined;
  const orden = asamblea.ordenDia ?? [];
  const pendiente = orden.findIndex((p) => p.hecho !== true);
  if (pendiente >= 0) puntoIndice = pendiente;

  const abierta = await ctx.db
    .query("votaciones")
    .withIndex("by_asamblea", (q) => q.eq("asambleaId", asambleaId))
    .filter((q) => q.eq(q.field("estado"), "abierta"))
    .first();

  return { puntoIndice, votacionId: abierta?._id };
}

/**
 * Quién es el dueño de una pista de audio.
 *
 * La identidad viene del token de LiveKit y solo tiene dos formas: el id del
 * usuario, o `inv:CODIGO` para quien entró por el enlace de invitados (ver
 * `asambleaInvitados.identidadInvitado`). Cualquier otra cosa es basura y se
 * descarta: no se inventa un hablante.
 */
async function resolverHablante(
  ctx: QueryCtx | MutationCtx,
  asambleaId: Id<"asambleas">,
  identidad: string,
): Promise<{
  userId?: Id<"users">;
  codigoInvitado?: string;
  nombre: string;
  unidadNumero?: string;
} | null> {
  const id = identidad.trim();
  if (!id) return null;

  if (id.startsWith("inv:")) {
    const codigoInvitado = id.slice(4).toUpperCase();
    const presencia = await ctx.db
      .query("salaPresencias")
      .withIndex("by_asamblea_invitado", (q) =>
        q.eq("asambleaId", asambleaId).eq("codigoInvitado", codigoInvitado),
      )
      .first();
    if (presencia) return { codigoInvitado, nombre: presencia.nombre };

    // La presencia caduca por latido; la sesión no. Si alguien habla justo
    // cuando se le cayó el latido, el nombre igual tiene que salir.
    const sesion = await ctx.db
      .query("asambleaInvitadoSesiones")
      .withIndex("by_sesion", (q) => q.eq("sesionCodigo", codigoInvitado))
      .first();
    if (!sesion || sesion.asambleaId !== asambleaId) return null;
    return { codigoInvitado, nombre: sesion.nombre };
  }

  if (id.startsWith("pod:")) {
    const codigoPoder = id.slice(4).toUpperCase();
    const presencia = await ctx.db
      .query("salaPresencias")
      .withIndex("by_asamblea_codigo", (q) =>
        q.eq("asambleaId", asambleaId).eq("codigoPoder", codigoPoder),
      )
      .first();
    if (presencia) return { nombre: presencia.nombre };

    const poder = await ctx.db
      .query("poderesAsamblea")
      .withIndex("by_codigo", (q) => q.eq("codigoAcceso", codigoPoder))
      .first();
    if (!poder || poder.asambleaId !== asambleaId) return null;
    return { nombre: poder.representanteNombre };
  }

  const userId = ctx.db.normalizeId("users", id);
  if (!userId) return null;
  const user = await ctx.db.get(userId);
  if (!user) return null;

  // La unidad sale de la asistencia y no del perfil: en asamblea lo que
  // importa es por qué unidad está presente, que con un poder no es la suya.
  const asistente = await ctx.db
    .query("asambleaAsistentes")
    .withIndex("by_asamblea_user", (q) =>
      q.eq("asambleaId", asambleaId).eq("userId", userId),
    )
    .first();

  return {
    userId,
    nombre: asistente?.userNombre || user.name || "Sin nombre",
    unidadNumero: asistente?.unidadNumero,
  };
}

// ─────────────────────────────────────────────────────────────
// Escritura desde el transcriptor
// ─────────────────────────────────────────────────────────────

/**
 * Guarda un segmento transcrito. La llama la ruta HTTP del transcriptor,
 * que ya validó el secreto compartido.
 *
 * Devuelve `null` en vez de reventar cuando el segmento no se puede ubicar:
 * el transcriptor no debe caerse ni reintentar porque a alguien se le cayó
 * la sesión a mitad de una frase.
 */
export const registrarHttp = internalMutation({
  args: {
    /**
     * Llega como texto crudo del cuerpo JSON, no como `v.id`: quien llama es
     * un proceso externo y un id inventado tiene que morir aquí, validado,
     * en vez de reventar el validador con un error que no dice nada.
     */
    asambleaId: v.string(),
    identidad: v.string(),
    texto: v.string(),
    inicioEn: v.number(),
    finEn: v.number(),
    confianza: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const texto = args.texto.trim();
    if (!texto) return null;

    const asambleaId = ctx.db.normalizeId("asambleas", args.asambleaId);
    if (!asambleaId) return null;

    const asamblea = await ctx.db.get(asambleaId);
    if (!asamblea) return null;
    // Doble llave: el transcriptor ya se sale solo cuando se apaga, pero la
    // base no acepta texto de una asamblea cerrada ni sin aviso encendido.
    if (asamblea.estado !== "en_curso") return null;
    if (asamblea.transcripcionActiva !== true) return null;

    const quien = await resolverHablante(ctx, asambleaId, args.identidad);
    if (!quien) return null;

    const { puntoIndice, votacionId } = await contextoActual(ctx, asambleaId);

    return await ctx.db.insert("salaIntervenciones", {
      condominioId: asamblea.condominioId,
      asambleaId,
      userId: quien.userId,
      codigoInvitado: quien.codigoInvitado,
      nombre: quien.nombre,
      unidadNumero: quien.unidadNumero,
      inicioEn: args.inicioEn,
      finEn: Math.max(args.finEn, args.inicioEn),
      texto,
      confianza: args.confianza,
      puntoIndice,
      votacionId,
      fuente: "stt",
      createdAt: Date.now(),
    });
  },
});

/**
 * Salas que el transcriptor debe estar atendiendo ahora mismo.
 *
 * El transcriptor pregunta cada pocos segundos en vez de que alguien le
 * avise: así se recupera solo de un reinicio suyo, del servidor de medios o
 * de la red, sin que nadie tenga que acordarse de volver a prenderlo en
 * mitad de una asamblea.
 */
export const salasActivas = internalQuery({
  args: {},
  handler: async (ctx) => {
    const enCurso = await ctx.db
      .query("asambleas")
      .withIndex("by_estado", (q) => q.eq("estado", "en_curso"))
      .collect();

    return enCurso
      .filter((a) => a.transcripcionActiva === true && a.modalidad !== "presencial")
      .map((a) => ({ asambleaId: a._id, titulo: a.titulo }));
  },
});

// ─────────────────────────────────────────────────────────────
// Encender y apagar
// ─────────────────────────────────────────────────────────────

/**
 * Estado de la transcripción. Lo consulta la sala para mostrar el aviso.
 *
 * Ésta es la ÚNICA consulta de este módulo abierta a cualquier miembro, y es
 * a propósito: el texto es material de trabajo de la mesa (ver `listar`),
 * pero SABER que se está grabando la voz de uno no es un privilegio del
 * administrador. Transcribir sin que los asistentes se enteren no es
 * defendible, así que el aviso tiene que poder pintarse en la pantalla de
 * todos. No restringir esto.
 */
export const estado = query({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return null;
    try {
      await requireCondominioRole(ctx, asamblea.condominioId, []);
    } catch {
      return null;
    }
    return {
      activa: asamblea.transcripcionActiva === true,
      iniciadaEn: asamblea.transcripcionIniciadaEn ?? null,
      modalidad: asamblea.modalidad,
    };
  },
});

/** La mesa enciende la transcripción. Deja constancia en la bitácora. */
export const activar = mutation({
  args: { asambleaId: v.id("asambleas"), activa: v.boolean() },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");

    const user = await requireAppUser(ctx);
    if (!(await esMesa(ctx, asamblea.condominioId, user))) {
      throw new Error("Solo la mesa puede encender la transcripción.");
    }
    if (args.activa && asamblea.estado !== "en_curso") {
      throw new Error("La asamblea no está en curso.");
    }
    if (args.activa && asamblea.modalidad === "presencial") {
      throw new Error(
        "La transcripción automática solo aplica a asambleas virtuales o mixtas.",
      );
    }
    if (asamblea.transcripcionActiva === args.activa) return;

    await ctx.db.patch(args.asambleaId, {
      transcripcionActiva: args.activa,
      transcripcionIniciadaEn: args.activa ? Date.now() : undefined,
      updatedAt: Date.now(),
    });

    await registrarBitacora(ctx, {
      condominioId: asamblea.condominioId,
      asambleaId: args.asambleaId,
      tipo: args.activa ? "transcripcion_inicio" : "transcripcion_fin",
      nombre: user.name,
      detalle: args.activa
        ? "Transcripción en vivo encendida"
        : "Transcripción en vivo apagada",
      userId: user._id,
    });
  },
});

// ─────────────────────────────────────────────────────────────
// Lectura
// ─────────────────────────────────────────────────────────────

function aSalida(f: {
  _id: Id<"salaIntervenciones">;
  nombre: string;
  unidadNumero?: string;
  texto: string;
  inicioEn: number;
  finEn: number;
  confianza?: number;
  puntoIndice?: number;
  votacionId?: Id<"votaciones">;
  fuente: "stt" | "manual";
  textoOriginal?: string;
  editadoEn?: number;
}) {
  return {
    _id: f._id,
    nombre: f.nombre,
    unidadNumero: f.unidadNumero ?? null,
    texto: f.texto,
    inicioEn: f.inicioEn,
    finEn: f.finEn,
    puntoIndice: f.puntoIndice ?? null,
    votacionId: f.votacionId ?? null,
    fuente: f.fuente,
    dudosa: (f.confianza ?? 1) < CONFIANZA_DUDOSA,
    corregida: f.editadoEn != null,
    textoOriginal: f.textoOriginal ?? null,
  };
}

/**
 * Últimas frases de la asamblea, en orden de reloj.
 *
 * SOLO LA MESA. La transcripción es material de trabajo del acta: sale en
 * bruto, con los errores del motor y sin revisar, y hasta que la secretaría
 * no la corrige no representa fielmente lo que se dijo. Publicarla a todos
 * los residentes en ese estado convertiría cada equivocación del
 * reconocimiento en algo que alguien "dijo" en la asamblea.
 *
 * Que se esté transcribiendo sí lo ve todo el mundo: eso es `estado`.
 *
 * Trae las MÁS RECIENTES y luego las voltea: durante la reunión lo que
 * interesa es el final de la conversación, no el principio, y una asamblea
 * de cuatro horas no cabe en una sola consulta.
 */
export const listar = query({
  args: {
    asambleaId: v.id("asambleas"),
    limite: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return [];
    await requireCondominioRole(ctx, asamblea.condominioId, [...WRITE_ROLES]);

    const limite = Math.min(args.limite ?? 200, TOPE_PAGINA);
    const filas = await ctx.db
      .query("salaIntervenciones")
      .withIndex("by_asamblea_inicio", (q) =>
        q.eq("asambleaId", args.asambleaId),
      )
      .order("desc")
      .take(limite);

    return filas.reverse().map(aSalida);
  },
});

/**
 * Frases dichas con una votación abierta.
 *
 * Es la consulta que responde «qué se discutió antes de decidir esto», que
 * es justo lo que se pide cuando impugnan una decisión del acta.
 */
export const porVotacion = query({
  args: { votacionId: v.id("votaciones") },
  handler: async (ctx, args) => {
    const votacion = await ctx.db.get(args.votacionId);
    if (!votacion) return [];
    await requireCondominioRole(ctx, votacion.condominioId, [...WRITE_ROLES]);

    const filas = await ctx.db
      .query("salaIntervenciones")
      .withIndex("by_asamblea_votacion", (q) =>
        q
          .eq("asambleaId", votacion.asambleaId)
          .eq("votacionId", args.votacionId),
      )
      .order("asc")
      .take(TOPE_PAGINA);

    return filas.map(aSalida);
  },
});

/**
 * Página de frases desde un instante dado, hacia adelante.
 * La usa el generador de acta, que sí necesita la asamblea completa.
 */
export const desde = internalQuery({
  args: {
    asambleaId: v.id("asambleas"),
    desdeEn: v.number(),
    limite: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const filas = await ctx.db
      .query("salaIntervenciones")
      .withIndex("by_asamblea_inicio", (q) =>
        q.eq("asambleaId", args.asambleaId).gt("inicioEn", args.desdeEn),
      )
      .order("asc")
      .take(Math.min(args.limite ?? TOPE_PAGINA, TOPE_PAGINA));

    return filas.map((f) => ({
      inicioEn: f.inicioEn,
      finEn: f.finEn,
      nombre: f.nombre,
      unidadNumero: f.unidadNumero ?? null,
      texto: f.texto,
      puntoIndice: f.puntoIndice ?? null,
      votacionId: f.votacionId ?? null,
    }));
  },
});

// ─────────────────────────────────────────────────────────────
// Corrección por la secretaría
// ─────────────────────────────────────────────────────────────

/**
 * Corrige el texto de una frase.
 *
 * El original se guarda la PRIMERA vez y no se vuelve a tocar: si cada
 * corrección lo pisara, se podría reescribir lo que alguien dijo sin dejar
 * rastro y el acta dejaría de servir como prueba.
 */
export const corregir = mutation({
  args: {
    intervencionId: v.id("salaIntervenciones"),
    texto: v.string(),
  },
  handler: async (ctx, args) => {
    const fila = await ctx.db.get(args.intervencionId);
    if (!fila) throw new Error("Intervención no encontrada.");

    const user = await requireAppUser(ctx);
    if (!(await esMesa(ctx, fila.condominioId, user))) {
      throw new Error("Solo la mesa puede corregir la transcripción.");
    }

    const texto = args.texto.trim();
    if (!texto) throw new Error("El texto no puede quedar vacío.");
    if (texto === fila.texto) return;

    await ctx.db.patch(args.intervencionId, {
      texto,
      textoOriginal: fila.textoOriginal ?? fila.texto,
      editadoPorUserId: user._id,
      editadoEn: Date.now(),
    });
  },
});

/**
 * La secretaría agrega a mano una intervención que el motor no captó.
 *
 * Queda marcada como `manual` para que el acta pueda distinguirla: no es lo
 * mismo lo que reconoció una máquina que lo que escribió una persona.
 */
export const agregarManual = mutation({
  args: {
    asambleaId: v.id("asambleas"),
    nombre: v.string(),
    texto: v.string(),
    /** Instante al que corresponde. Por defecto, ahora. */
    inicioEn: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");

    const user = await requireAppUser(ctx);
    if (!(await esMesa(ctx, asamblea.condominioId, user))) {
      throw new Error("Solo la mesa puede escribir en la bitácora.");
    }

    const texto = args.texto.trim();
    const nombre = args.nombre.trim();
    if (!texto) throw new Error("El texto no puede quedar vacío.");
    if (!nombre) throw new Error("Falta el nombre de quien habló.");

    const ahora = args.inicioEn ?? Date.now();
    const { puntoIndice, votacionId } = await contextoActual(
      ctx,
      args.asambleaId,
    );

    return await ctx.db.insert("salaIntervenciones", {
      condominioId: asamblea.condominioId,
      asambleaId: args.asambleaId,
      nombre,
      inicioEn: ahora,
      finEn: ahora,
      texto,
      puntoIndice,
      votacionId,
      fuente: "manual",
      editadoPorUserId: user._id,
      editadoEn: Date.now(),
      createdAt: Date.now(),
    });
  },
});

/** Borra una frase (ruido, eco, algo que no era de la asamblea). */
export const eliminar = mutation({
  args: { intervencionId: v.id("salaIntervenciones") },
  handler: async (ctx, args) => {
    const fila = await ctx.db.get(args.intervencionId);
    if (!fila) return;

    const user = await requireAppUser(ctx);
    if (!(await esMesa(ctx, fila.condominioId, user))) {
      throw new Error("Solo la mesa puede borrar de la transcripción.");
    }
    await ctx.db.delete(args.intervencionId);
  },
});
