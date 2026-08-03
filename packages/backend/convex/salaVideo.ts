import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  getCurrentAppUser,
  requireAppUser,
  requireCondominioRole,
  getMembership,
  hasPlatformRole,
} from "./model/authz";

/**
 * Señalización del video propio de la sala.
 *
 * Convex hace aquí de "cartero" WebRTC: los navegadores se intercambian
 * ofertas SDP, respuestas y candidatos ICE a través de estas tablas, y el
 * video viaja después punto a punto entre ellos, sin tocar el servidor.
 *
 * Quién emite: la MESA siempre; un residente cuando la mesa le concede LA
 * PALABRA (el "unmute" de una reunión grande). Todos los demás reciben.
 * El tope de espectadores por emisor lo pone el ancho de banda de subida
 * del emisor; el cliente corta en `TOPE_ESPECTADORES`. Para cientos de
 * espectadores el reparto pasa a un servidor de medios propio
 * (components/asamblea/README.md); esta señalización no cambia.
 *
 * El APODERADO EXTERNO no tiene cuenta: se identifica con el código de su
 * poder. Por eso cada endpoint acepta `codigoPoder` como alternativa a la
 * sesión — `requireAccesoSala` valida una u otra, nunca ninguna.
 */

const WRITE_ROLES = [
  "administrador",
  "junta_directiva",
  "representante_asamblea",
] as const;

/** Lo consume el cliente para cortar conexiones entrantes de más. */
export const TOPE_ESPECTADORES = 16;

/** Sin latido este tiempo, el emisor y sus señales se barren. */
const CORTE_EMISOR_MS = 90_000;

async function esMesa(
  ctx: QueryCtx | MutationCtx,
  condominioId: Id<"condominios">,
  user: { _id: Id<"users">; platformRole?: string | null },
) {
  if (hasPlatformRole(user as never, "superadmin", "admin")) return true;
  const m = await getMembership(ctx, user._id, condominioId);
  if (!m?.isActive) return false;
  return m.roles.some((r) => (WRITE_ROLES as readonly string[]).includes(r));
}

/**
 * Miembro con sesión O apoderado con código válido de ESTA asamblea.
 * Devuelve el usuario cuando lo hay (null para el apoderado externo).
 */
async function requireAccesoSala(
  ctx: QueryCtx | MutationCtx,
  asambleaId: Id<"asambleas">,
  codigoPoder?: string,
) {
  const asamblea = await ctx.db.get(asambleaId);
  if (!asamblea) throw new Error("Asamblea no encontrada.");

  const user = await getCurrentAppUser(ctx);
  if (user) {
    await requireCondominioRole(ctx, asamblea.condominioId, []);
    return { asamblea, user };
  }

  const codigo = codigoPoder?.trim().toUpperCase() ?? "";
  if (codigo.length >= 4) {
    const poder = await ctx.db
      .query("poderesAsamblea")
      .withIndex("by_codigo", (q) => q.eq("codigoAcceso", codigo))
      .first();
    if (poder && poder.asambleaId === asambleaId) {
      return { asamblea, user: null };
    }
  }
  throw new Error("Sin acceso a la sala.");
}

async function palabraConcedida(
  ctx: QueryCtx | MutationCtx,
  asambleaId: Id<"asambleas">,
  userId: Id<"users">,
) {
  const fila = await ctx.db
    .query("salaPalabra")
    .withIndex("by_asamblea_user", (q) =>
      q.eq("asambleaId", asambleaId).eq("userId", userId),
    )
    .first();
  return fila?.estado === "concedida";
}

// ─────────────────────────────────────────────────────────────
// Emisores
// ─────────────────────────────────────────────────────────────

/** Enciende un medio. Mesa siempre; residente solo con la palabra. */
export const registrarEmisor = mutation({
  args: {
    asambleaId: v.id("asambleas"),
    clienteId: v.string(),
    medio: v.union(v.literal("camara"), v.literal("pantalla")),
  },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    if (asamblea.estado !== "en_curso") {
      throw new Error("La sala no está abierta.");
    }
    const user = await requireAppUser(ctx);
    const mesa = await esMesa(ctx, asamblea.condominioId, user);
    if (!mesa && !(await palabraConcedida(ctx, args.asambleaId, user._id))) {
      throw new Error("Pide la palabra para poder hablar.");
    }

    const now = Date.now();

    /* Una misma persona NO emite el mismo medio desde dos pestañas. La
     * pestaña vieja (recargada o abandonada) deja un emisor fantasma hasta
     * el corte de 90 s: cada espectador se conectaba a AMBOS y el emisor
     * subía el stream por duplicado — se veía un mosaico repetido y todo
     * más lento. La pestaña nueva desplaza a la vieja. */
    const enAsamblea = await ctx.db
      .query("salaEmisores")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .collect();
    for (const e of enAsamblea) {
      if (
        e.userId === user._id &&
        e.medio === args.medio &&
        e.clienteId !== args.clienteId
      ) {
        await ctx.db.delete(e._id);
      }
    }

    const mio = enAsamblea.find(
      (e) => e.clienteId === args.clienteId && e.medio === args.medio,
    );
    if (mio) {
      await ctx.db.patch(mio._id, { ultimoLatido: now });
      return { emisorId: mio._id };
    }

    const emisorId = await ctx.db.insert("salaEmisores", {
      condominioId: asamblea.condominioId,
      asambleaId: args.asambleaId,
      clienteId: args.clienteId,
      userId: user._id,
      nombre: user.name,
      medio: args.medio,
      ultimoLatido: now,
      createdAt: now,
    });
    return { emisorId };
  },
});

/** Apaga un medio (o todos los de esta pestaña con `medio` omitido). */
export const detenerEmisor = mutation({
  args: {
    asambleaId: v.id("asambleas"),
    clienteId: v.string(),
    medio: v.optional(v.union(v.literal("camara"), v.literal("pantalla"))),
  },
  handler: async (ctx, args) => {
    await requireAppUser(ctx);
    const mios = await ctx.db
      .query("salaEmisores")
      .withIndex("by_asamblea_cliente", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("clienteId", args.clienteId),
      )
      .collect();
    for (const e of mios) {
      if (args.medio && e.medio !== args.medio) continue;
      await ctx.db.delete(e._id);
    }
  },
});

/** Late por TODOS los medios de la pestaña emisora. */
export const latidoEmisor = mutation({
  args: { asambleaId: v.id("asambleas"), clienteId: v.string() },
  handler: async (ctx, args) => {
    await requireAppUser(ctx);
    const now = Date.now();
    const mios = await ctx.db
      .query("salaEmisores")
      .withIndex("by_asamblea_cliente", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("clienteId", args.clienteId),
      )
      .collect();
    for (const e of mios) await ctx.db.patch(e._id, { ultimoLatido: now });
    return { activos: mios.length };
  },
});

/**
 * Emisores vivos. El filtro por latido va aquí y no en el cliente: la query
 * se re-ejecuta con cada latido (escritura), así que la lista se cura sola.
 */
export const emisores = query({
  args: { asambleaId: v.id("asambleas"), codigoPoder: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAccesoSala(ctx, args.asambleaId, args.codigoPoder);

    const todos = await ctx.db
      .query("salaEmisores")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .collect();
    const corte = Date.now() - CORTE_EMISOR_MS;
    return todos
      .filter((e) => e.ultimoLatido >= corte)
      .map((e) => ({
        clienteId: e.clienteId,
        nombre: e.nombre,
        medio: e.medio,
        camApagada: !!e.camApagada,
        micApagado: !!e.micApagado,
      }));
  },
});

/** Refleja los toggles de mic/cámara para que el espectador pinte avatar. */
export const actualizarEstadoMedios = mutation({
  args: {
    asambleaId: v.id("asambleas"),
    clienteId: v.string(),
    micOn: v.boolean(),
    camOn: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAppUser(ctx);
    const mios = await ctx.db
      .query("salaEmisores")
      .withIndex("by_asamblea_cliente", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("clienteId", args.clienteId),
      )
      .collect();
    for (const e of mios) {
      if (e.medio !== "camara") continue;
      await ctx.db.patch(e._id, {
        micApagado: !args.micOn,
        camApagada: !args.camOn,
      });
    }
  },
});

// ─────────────────────────────────────────────────────────────
// La palabra (levantar la mano)
// ─────────────────────────────────────────────────────────────

export const pedirPalabra = mutation({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    if (asamblea.estado !== "en_curso") {
      throw new Error("La sala no está abierta.");
    }
    const user = await requireAppUser(ctx);
    await requireCondominioRole(ctx, asamblea.condominioId, []);

    // Solo quien ya está registrado en la asamblea puede pedir la palabra.
    const asistencia = await ctx.db
      .query("asambleaAsistentes")
      .withIndex("by_asamblea_user", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("userId", user._id),
      )
      .first();
    if (!asistencia) throw new Error("Primero registra tu asistencia.");

    const previa = await ctx.db
      .query("salaPalabra")
      .withIndex("by_asamblea_user", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("userId", user._id),
      )
      .first();
    if (previa) return { estado: previa.estado };

    await ctx.db.insert("salaPalabra", {
      condominioId: asamblea.condominioId,
      asambleaId: args.asambleaId,
      userId: user._id,
      nombre: user.name,
      estado: "pedida",
      createdAt: Date.now(),
    });
    return { estado: "pedida" as const };
  },
});

/** Bajar la propia mano (en cualquier estado). */
export const bajarMano = mutation({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    const fila = await ctx.db
      .query("salaPalabra")
      .withIndex("by_asamblea_user", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("userId", user._id),
      )
      .first();
    if (fila) await ctx.db.delete(fila._id);
    // Si estaba al aire, sus emisiones se apagan con la mano.
    await apagarEmisionesDeUsuario(ctx, args.asambleaId, user._id);
  },
});

/** La mesa concede o quita la palabra. Quitar también corta su emisión. */
export const resolverPalabra = mutation({
  args: {
    asambleaId: v.id("asambleas"),
    userId: v.id("users"),
    conceder: v.boolean(),
  },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    await requireCondominioRole(ctx, asamblea.condominioId, [...WRITE_ROLES]);

    const fila = await ctx.db
      .query("salaPalabra")
      .withIndex("by_asamblea_user", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("userId", args.userId),
      )
      .first();

    if (args.conceder) {
      if (!fila) throw new Error("Esa persona no tiene la mano levantada.");
      await ctx.db.patch(fila._id, { estado: "concedida" });
      return;
    }
    if (fila) await ctx.db.delete(fila._id);
    await apagarEmisionesDeUsuario(ctx, args.asambleaId, args.userId);
  },
});

async function apagarEmisionesDeUsuario(
  ctx: MutationCtx,
  asambleaId: Id<"asambleas">,
  userId: Id<"users">,
) {
  const emisiones = await ctx.db
    .query("salaEmisores")
    .withIndex("by_asamblea", (q) => q.eq("asambleaId", asambleaId))
    .collect();
  for (const e of emisiones) {
    if (e.userId === userId) await ctx.db.delete(e._id);
  }
}

/** Manos y palabra en curso. `mia` marca la fila del usuario que consulta. */
export const palabras = query({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return [];
    await requireCondominioRole(ctx, asamblea.condominioId, []);
    const user = await getCurrentAppUser(ctx);

    const filas = await ctx.db
      .query("salaPalabra")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .collect();
    return filas
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((f) => ({
        userId: f.userId,
        nombre: f.nombre,
        estado: f.estado,
        mia: user ? f.userId === user._id : false,
      }));
  },
});

// ─────────────────────────────────────────────────────────────
// Señales (SDP / ICE)
// ─────────────────────────────────────────────────────────────

const tipoSenal = v.union(
  v.literal("oferta"),
  v.literal("respuesta"),
  v.literal("ice"),
  v.literal("lleno"),
);

export const enviarSenal = mutation({
  args: {
    asambleaId: v.id("asambleas"),
    deClienteId: v.string(),
    paraClienteId: v.string(),
    tipo: tipoSenal,
    datos: v.string(),
    codigoPoder: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAccesoSala(ctx, args.asambleaId, args.codigoPoder);
    if (args.datos.length > 200_000) throw new Error("Señal demasiado grande.");

    await ctx.db.insert("salaSenales", {
      asambleaId: args.asambleaId,
      deClienteId: args.deClienteId,
      paraClienteId: args.paraClienteId,
      tipo: args.tipo,
      datos: args.datos,
      createdAt: Date.now(),
    });
  },
});

/** Buzón reactivo de la pestaña. Se vacía con `consumirSenales`. */
export const senalesParaMi = query({
  args: {
    asambleaId: v.id("asambleas"),
    clienteId: v.string(),
    codigoPoder: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      await requireAccesoSala(ctx, args.asambleaId, args.codigoPoder);
    } catch {
      return [];
    }
    return await ctx.db
      .query("salaSenales")
      .withIndex("by_asamblea_para", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("paraClienteId", args.clienteId),
      )
      .take(100);
  },
});

export const consumirSenales = mutation({
  args: {
    asambleaId: v.id("asambleas"),
    clienteId: v.string(),
    ids: v.array(v.id("salaSenales")),
    codigoPoder: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAccesoSala(ctx, args.asambleaId, args.codigoPoder);
    for (const id of args.ids) {
      const s = await ctx.db.get(id);
      // Solo el destinatario vacía su buzón.
      if (s && s.paraClienteId === args.clienteId) await ctx.db.delete(s._id);
    }
  },
});

// ─────────────────────────────────────────────────────────────
// Reacciones (👍👏❤️… como Meet)
// ─────────────────────────────────────────────────────────────

export const REACCION_EMOJIS = ["👍", "👏", "❤️", "😂", "😮", "🎉"] as const;
const REACCION_VIVE_MS = 6_000;

export const enviarReaccion = mutation({
  args: {
    asambleaId: v.id("asambleas"),
    emoji: v.string(),
    codigoPoder: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!(REACCION_EMOJIS as readonly string[]).includes(args.emoji)) {
      throw new Error("Reacción no válida.");
    }
    const { asamblea, user } = await requireAccesoSala(
      ctx,
      args.asambleaId,
      args.codigoPoder,
    );
    if (asamblea.estado !== "en_curso") {
      throw new Error("La sala no está abierta.");
    }

    let nombre = user?.name ?? "Participante";
    const codigo = args.codigoPoder?.trim().toUpperCase();
    if (!user && codigo) {
      const poder = await ctx.db
        .query("poderesAsamblea")
        .withIndex("by_codigo", (q) => q.eq("codigoAcceso", codigo))
        .first();
      if (poder) nombre = poder.representanteNombre;
    }

    await ctx.db.insert("salaReacciones", {
      condominioId: asamblea.condominioId,
      asambleaId: args.asambleaId,
      emoji: args.emoji,
      nombre,
      userId: user?._id,
      codigoPoder: codigo || undefined,
      createdAt: Date.now(),
    });
    return { ok: true as const };
  },
});

/** Reacciones de los últimos segundos para animar en pantalla. */
export const reaccionesRecientes = query({
  args: {
    asambleaId: v.id("asambleas"),
    codigoPoder: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      await requireAccesoSala(ctx, args.asambleaId, args.codigoPoder);
    } catch {
      return [];
    }
    const desde = Date.now() - REACCION_VIVE_MS;
    const filas = await ctx.db
      .query("salaReacciones")
      .withIndex("by_asamblea_created", (q) =>
        q.eq("asambleaId", args.asambleaId).gte("createdAt", desde),
      )
      .collect();
    return filas.map((r) => ({
      _id: r._id,
      emoji: r.emoji,
      nombre: r.nombre,
      createdAt: r.createdAt,
    }));
  },
});

// ─────────────────────────────────────────────────────────────
// Limpieza
// ─────────────────────────────────────────────────────────────

/** Barre emisores sin latido y señales huérfanas. Corre cada minuto. */
export const limpiar = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const emisoresViejos = await ctx.db.query("salaEmisores").take(500);
    let borrados = 0;
    for (const e of emisoresViejos) {
      if (e.ultimoLatido < now - CORTE_EMISOR_MS) {
        await ctx.db.delete(e._id);
        borrados++;
      }
    }
    // Una señal que nadie consumió en 2 min ya no le sirve a ningún par.
    const senales = await ctx.db.query("salaSenales").take(500);
    let huerfanas = 0;
    for (const s of senales) {
      if (s.createdAt < now - 120_000) {
        await ctx.db.delete(s._id);
        huerfanas++;
      }
    }
    const reacciones = await ctx.db.query("salaReacciones").take(500);
    let reaccionesViejas = 0;
    for (const r of reacciones) {
      if (r.createdAt < now - REACCION_VIVE_MS * 2) {
        await ctx.db.delete(r._id);
        reaccionesViejas++;
      }
    }
    if (borrados + huerfanas + reaccionesViejas > 0) {
      console.info(
        `[salaVideo] limpieza: ${borrados} emisores, ${huerfanas} señales, ${reaccionesViejas} reacciones`,
      );
    }
  },
});
