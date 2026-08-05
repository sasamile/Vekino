import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  getCurrentAppUser,
  requireAppUser,
  requireCondominioRole,
  getMembership,
  hasPlatformRole,
} from "./model/authz";
import { registrarBitacora } from "./salaBitacora";
import { resolveUserImage } from "./model/userImage";

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

/** Mesa (admin) o presidente de la asamblea: dan / quitan la palabra. */
async function puedeModerarPalabra(
  ctx: QueryCtx | MutationCtx,
  asamblea: {
    condominioId: Id<"condominios">;
    presidenteUserId?: Id<"users">;
  },
  user: { _id: Id<"users">; platformRole?: string | null },
) {
  if (await esMesa(ctx, asamblea.condominioId, user)) return true;
  return asamblea.presidenteUserId === user._id;
}

/**
 * Miembro con sesión, apoderado con código de poder, o invitado con sesión.
 * Devuelve el usuario cuando lo hay (null para externos).
 */
async function requireAccesoSala(
  ctx: QueryCtx | MutationCtx,
  asambleaId: Id<"asambleas">,
  codigoPoder?: string,
  codigoInvitado?: string,
) {
  const asamblea = await ctx.db.get(asambleaId);
  if (!asamblea) throw new Error("Asamblea no encontrada.");

  const user = await getCurrentAppUser(ctx);
  if (user) {
    await requireCondominioRole(ctx, asamblea.condominioId, []);
    return { asamblea, user, codigoInvitado: null as string | null };
  }

  const inv = codigoInvitado?.trim().toUpperCase() ?? "";
  if (inv.length >= 5) {
    const sesion = await ctx.db
      .query("asambleaInvitadoSesiones")
      .withIndex("by_sesion", (q) => q.eq("sesionCodigo", inv))
      .first();
    if (sesion && sesion.asambleaId === asambleaId) {
      const enlace = asamblea.codigoInvitado?.trim().toUpperCase();
      if (enlace && enlace === sesion.codigoEnlace) {
        return { asamblea, user: null, codigoInvitado: inv };
      }
    }
  }

  const codigo = codigoPoder?.trim().toUpperCase() ?? "";
  if (codigo.length >= 4) {
    const poder = await ctx.db
      .query("poderesAsamblea")
      .withIndex("by_codigo", (q) => q.eq("codigoAcceso", codigo))
      .first();
    if (poder && poder.asambleaId === asambleaId) {
      return { asamblea, user: null, codigoInvitado: null as string | null };
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

async function palabraConcedidaInvitado(
  ctx: QueryCtx | MutationCtx,
  asambleaId: Id<"asambleas">,
  codigoInvitado: string,
) {
  const fila = await ctx.db
    .query("salaPalabra")
    .withIndex("by_asamblea_invitado", (q) =>
      q.eq("asambleaId", asambleaId).eq("codigoInvitado", codigoInvitado),
    )
    .first();
  return fila?.estado === "concedida";
}

// ─────────────────────────────────────────────────────────────
// Emisores
// ─────────────────────────────────────────────────────────────

/** Enciende un medio. Mesa siempre; residente/invitado solo con la palabra. */
export const registrarEmisor = mutation({
  args: {
    asambleaId: v.id("asambleas"),
    clienteId: v.string(),
    medio: v.union(v.literal("camara"), v.literal("pantalla")),
    codigoInvitado: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    if (asamblea.estado !== "en_curso") {
      throw new Error("La sala no está abierta.");
    }

    const inv = args.codigoInvitado?.trim().toUpperCase() || undefined;
    let userId: Id<"users"> | undefined;
    let codigoInvitado: string | undefined;
    let nombre: string;

    if (inv) {
      const { codigoInvitado: ok } = await requireAccesoSala(
        ctx,
        args.asambleaId,
        undefined,
        inv,
      );
      if (!ok) throw new Error("Sesión de invitado inválida.");
      if (!(await palabraConcedidaInvitado(ctx, args.asambleaId, ok))) {
        throw new Error("Pide la palabra para poder hablar.");
      }
      const sesion = await ctx.db
        .query("asambleaInvitadoSesiones")
        .withIndex("by_sesion", (q) => q.eq("sesionCodigo", ok))
        .first();
      nombre = sesion?.nombre ?? "Invitado";
      codigoInvitado = ok;
    } else {
      const user = await requireAppUser(ctx);
      const mesa = await esMesa(ctx, asamblea.condominioId, user);
      if (!mesa && !(await palabraConcedida(ctx, args.asambleaId, user._id))) {
        throw new Error("Pide la palabra para poder hablar.");
      }
      userId = user._id;
      nombre = user.name;
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
      const mismaPersona = userId
        ? e.userId === userId
        : e.codigoInvitado === codigoInvitado;
      if (
        mismaPersona &&
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
      userId,
      codigoInvitado,
      nombre,
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
    codigoInvitado: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAccesoSala(
      ctx,
      args.asambleaId,
      undefined,
      args.codigoInvitado,
    );
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
  args: {
    asambleaId: v.id("asambleas"),
    clienteId: v.string(),
    codigoInvitado: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAccesoSala(
      ctx,
      args.asambleaId,
      undefined,
      args.codigoInvitado,
    );
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
  args: {
    asambleaId: v.id("asambleas"),
    codigoPoder: v.optional(v.string()),
    codigoInvitado: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAccesoSala(
      ctx,
      args.asambleaId,
      args.codigoPoder,
      args.codigoInvitado,
    );

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
    codigoInvitado: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAccesoSala(
      ctx,
      args.asambleaId,
      undefined,
      args.codigoInvitado,
    );
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
  args: {
    asambleaId: v.id("asambleas"),
    codigoInvitado: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    if (asamblea.estado !== "en_curso") {
      throw new Error("La sala no está abierta.");
    }

    const inv = args.codigoInvitado?.trim().toUpperCase() || undefined;
    if (inv) {
      await requireAccesoSala(ctx, args.asambleaId, undefined, inv);
      const sesion = await ctx.db
        .query("asambleaInvitadoSesiones")
        .withIndex("by_sesion", (q) => q.eq("sesionCodigo", inv))
        .first();
      if (!sesion) throw new Error("Sesión de invitado inválida.");

      const previa = await ctx.db
        .query("salaPalabra")
        .withIndex("by_asamblea_invitado", (q) =>
          q.eq("asambleaId", args.asambleaId).eq("codigoInvitado", inv),
        )
        .first();
      if (previa) return { estado: previa.estado };

      await ctx.db.insert("salaPalabra", {
        condominioId: asamblea.condominioId,
        asambleaId: args.asambleaId,
        codigoInvitado: inv,
        nombre: `${sesion.nombre} (invitado)`,
        estado: "pedida",
        createdAt: Date.now(),
      });
      await registrarBitacora(ctx, {
        condominioId: asamblea.condominioId,
        asambleaId: args.asambleaId,
        tipo: "palabra_pedida",
        nombre: sesion.nombre,
        detalle: "Invitado · levantó la mano",
      });
      return { estado: "pedida" as const };
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
    await registrarBitacora(ctx, {
      condominioId: asamblea.condominioId,
      asambleaId: args.asambleaId,
      tipo: "palabra_pedida",
      nombre: user.name,
      detalle: "Levantó la mano",
      userId: user._id,
    });
    return { estado: "pedida" as const };
  },
});

/** Bajar la propia mano (en cualquier estado). */
export const bajarMano = mutation({
  args: {
    asambleaId: v.id("asambleas"),
    codigoInvitado: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const inv = args.codigoInvitado?.trim().toUpperCase() || undefined;
    if (inv) {
      await requireAccesoSala(ctx, args.asambleaId, undefined, inv);
      const fila = await ctx.db
        .query("salaPalabra")
        .withIndex("by_asamblea_invitado", (q) =>
          q.eq("asambleaId", args.asambleaId).eq("codigoInvitado", inv),
        )
        .first();
      if (fila) await ctx.db.delete(fila._id);
      await apagarEmisionesInvitado(ctx, args.asambleaId, inv);
      await revocarEnServidorDeMediosInvitado(ctx, args.asambleaId, inv);
      return;
    }

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
    await revocarEnServidorDeMedios(ctx, args.asambleaId, user._id);
  },
});

/** La mesa o el presidente concede o quita la palabra. Quitar también corta su emisión. */
export const resolverPalabra = mutation({
  args: {
    asambleaId: v.id("asambleas"),
    userId: v.optional(v.id("users")),
    codigoInvitado: v.optional(v.string()),
    conceder: v.boolean(),
    /** Al conceder: segundos de palabra. 0 / omitido = sin límite. */
    duracionSegundos: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    const user = await requireAppUser(ctx);
    if (!(await puedeModerarPalabra(ctx, asamblea, user))) {
      throw new Error("Solo la mesa o el presidente pueden dar la palabra.");
    }

    const inv = args.codigoInvitado?.trim().toUpperCase() || undefined;
    if (inv) {
      const fila = await ctx.db
        .query("salaPalabra")
        .withIndex("by_asamblea_invitado", (q) =>
          q.eq("asambleaId", args.asambleaId).eq("codigoInvitado", inv),
        )
        .first();
      if (args.conceder) {
        if (!fila) throw new Error("Esa persona no tiene la mano levantada.");
        const ahora = Date.now();
        const dur = Math.max(0, Math.floor(args.duracionSegundos ?? 0));
        const cierraEn = dur > 0 ? ahora + dur * 1000 : undefined;
        await ctx.db.patch(fila._id, {
          estado: "concedida",
          concedidaEn: ahora,
          cierraEn,
        });
        await sincronizarPalabraInvitado(ctx, args.asambleaId, inv, true);
        await registrarBitacora(ctx, {
          condominioId: asamblea.condominioId,
          asambleaId: args.asambleaId,
          tipo: "palabra_concedida",
          nombre: fila.nombre,
          detalle:
            dur > 0
              ? `Invitado · tiempo: ${Math.round(dur / 60)} min`
              : "Invitado · sin límite de tiempo",
        });
        if (cierraEn != null) {
          await ctx.scheduler.runAfter(
            cierraEn - ahora,
            internal.salaVideo.retirarPalabraInvitadoSiExpiro,
            {
              asambleaId: args.asambleaId,
              codigoInvitado: inv,
              cierraEn,
            },
          );
        }
        return;
      }
      if (fila) await ctx.db.delete(fila._id);
      await apagarEmisionesInvitado(ctx, args.asambleaId, inv);
      await revocarEnServidorDeMediosInvitado(ctx, args.asambleaId, inv);
      await registrarBitacora(ctx, {
        condominioId: asamblea.condominioId,
        asambleaId: args.asambleaId,
        tipo: "palabra_retirada",
        nombre: fila?.nombre ?? "Invitado",
        detalle: "Palabra retirada / silenciado (invitado)",
      });
      return;
    }

    if (!args.userId) throw new Error("Indica a quién dar o quitar la palabra.");

    const fila = await ctx.db
      .query("salaPalabra")
      .withIndex("by_asamblea_user", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("userId", args.userId!),
      )
      .first();

    if (args.conceder) {
      if (!fila) throw new Error("Esa persona no tiene la mano levantada.");
      const ahora = Date.now();
      const dur = Math.max(0, Math.floor(args.duracionSegundos ?? 0));
      const cierraEn = dur > 0 ? ahora + dur * 1000 : undefined;
      await ctx.db.patch(fila._id, {
        estado: "concedida",
        concedidaEn: ahora,
        cierraEn,
      });
      await sincronizarPalabra(ctx, args.asambleaId, args.userId, true);
      await registrarBitacora(ctx, {
        condominioId: asamblea.condominioId,
        asambleaId: args.asambleaId,
        tipo: "palabra_concedida",
        nombre: fila.nombre,
        detalle:
          dur > 0
            ? `Tiempo: ${Math.round(dur / 60)} min`
            : "Sin límite de tiempo",
        userId: args.userId,
      });
      if (cierraEn != null) {
        await ctx.scheduler.runAfter(
          cierraEn - ahora,
          internal.salaVideo.retirarPalabraSiExpiro,
          {
            asambleaId: args.asambleaId,
            userId: args.userId,
            cierraEn,
          },
        );
      }
      return;
    }
    if (fila) await ctx.db.delete(fila._id);
    await apagarEmisionesDeUsuario(ctx, args.asambleaId, args.userId);
    await revocarEnServidorDeMedios(ctx, args.asambleaId, args.userId);
    await registrarBitacora(ctx, {
      condominioId: asamblea.condominioId,
      asambleaId: args.asambleaId,
      tipo: "palabra_retirada",
      nombre: fila?.nombre ?? "Participante",
      detalle: "Palabra retirada / silenciado",
      userId: args.userId,
    });
  },
});

/** Suma tiempo a quien está al aire (o reinicia el cronómetro). */
export const extenderPalabra = mutation({
  args: {
    asambleaId: v.id("asambleas"),
    userId: v.optional(v.id("users")),
    codigoInvitado: v.optional(v.string()),
    segundosExtra: v.number(),
  },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    const user = await requireAppUser(ctx);
    if (!(await puedeModerarPalabra(ctx, asamblea, user))) {
      throw new Error("Solo la mesa o el presidente pueden gestionar el tiempo de palabra.");
    }

    const inv = args.codigoInvitado?.trim().toUpperCase() || undefined;
    const fila = inv
      ? await ctx.db
          .query("salaPalabra")
          .withIndex("by_asamblea_invitado", (q) =>
            q.eq("asambleaId", args.asambleaId).eq("codigoInvitado", inv),
          )
          .first()
      : args.userId
        ? await ctx.db
            .query("salaPalabra")
            .withIndex("by_asamblea_user", (q) =>
              q.eq("asambleaId", args.asambleaId).eq("userId", args.userId!),
            )
            .first()
        : null;
    if (!fila || fila.estado !== "concedida") {
      throw new Error("Esa persona no tiene la palabra.");
    }
    const extra = Math.max(30, Math.min(Math.floor(args.segundosExtra), 3600));
    const ahora = Date.now();
    const base =
      fila.cierraEn != null ? Math.max(ahora, fila.cierraEn) : ahora;
    const cierraEn = base + extra * 1000;
    await ctx.db.patch(fila._id, { cierraEn });
    if (inv) {
      await ctx.scheduler.runAfter(
        cierraEn - ahora,
        internal.salaVideo.retirarPalabraInvitadoSiExpiro,
        {
          asambleaId: args.asambleaId,
          codigoInvitado: inv,
          cierraEn,
        },
      );
    } else if (args.userId) {
      await ctx.scheduler.runAfter(
        cierraEn - ahora,
        internal.salaVideo.retirarPalabraSiExpiro,
        {
          asambleaId: args.asambleaId,
          userId: args.userId,
          cierraEn,
        },
      );
    }
    return { cierraEn };
  },
});

/** Retira la palabra solo si el `cierraEn` programado sigue vigente. */
export const retirarPalabraSiExpiro = internalMutation({
  args: {
    asambleaId: v.id("asambleas"),
    userId: v.id("users"),
    cierraEn: v.number(),
  },
  handler: async (ctx, args) => {
    const fila = await ctx.db
      .query("salaPalabra")
      .withIndex("by_asamblea_user", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("userId", args.userId),
      )
      .first();
    if (!fila || fila.estado !== "concedida") return;
    if (fila.cierraEn !== args.cierraEn) return;
    if ((fila.cierraEn ?? 0) > Date.now() + 750) return;
    const asamblea = await ctx.db.get(args.asambleaId);
    await ctx.db.delete(fila._id);
    await apagarEmisionesDeUsuario(ctx, args.asambleaId, args.userId);
    await revocarEnServidorDeMedios(ctx, args.asambleaId, args.userId);
    if (asamblea) {
      await registrarBitacora(ctx, {
        condominioId: asamblea.condominioId,
        asambleaId: args.asambleaId,
        tipo: "palabra_retirada",
        nombre: fila.nombre,
        detalle: "Tiempo de palabra agotado",
        userId: args.userId,
      });
    }
  },
});

export const retirarPalabraInvitadoSiExpiro = internalMutation({
  args: {
    asambleaId: v.id("asambleas"),
    codigoInvitado: v.string(),
    cierraEn: v.number(),
  },
  handler: async (ctx, args) => {
    const inv = args.codigoInvitado.trim().toUpperCase();
    const fila = await ctx.db
      .query("salaPalabra")
      .withIndex("by_asamblea_invitado", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("codigoInvitado", inv),
      )
      .first();
    if (!fila || fila.estado !== "concedida") return;
    if (fila.cierraEn !== args.cierraEn) return;
    if ((fila.cierraEn ?? 0) > Date.now() + 750) return;
    const asamblea = await ctx.db.get(args.asambleaId);
    await ctx.db.delete(fila._id);
    await apagarEmisionesInvitado(ctx, args.asambleaId, inv);
    await revocarEnServidorDeMediosInvitado(ctx, args.asambleaId, inv);
    if (asamblea) {
      await registrarBitacora(ctx, {
        condominioId: asamblea.condominioId,
        asambleaId: args.asambleaId,
        tipo: "palabra_retirada",
        nombre: fila.nombre,
        detalle: "Tiempo de palabra agotado (invitado)",
      });
    }
  },
});

/**
 * Le avisa al servidor de medios que esta persona cambió de permiso.
 *
 * Va por el scheduler y no en línea porque una mutación no puede hacer
 * `fetch`: la palabra se concede en la base de datos de inmediato y el
 * permiso en el SFU llega un instante después. Si el servidor de medios no
 * respondiera, la mutación ya está confirmada — la mesa ve el cambio y el
 * peor caso es que la persona deba volver a entrar a la sala.
 */
async function sincronizarPalabra(
  ctx: MutationCtx,
  asambleaId: Id<"asambleas">,
  userId: Id<"users">,
  puedePublicar: boolean,
) {
  await ctx.scheduler.runAfter(0, internal.salaPermisos.sincronizarPalabra, {
    asambleaId,
    identidad: userId as string,
    puedePublicar,
  });
}

async function sincronizarPalabraInvitado(
  ctx: MutationCtx,
  asambleaId: Id<"asambleas">,
  codigoInvitado: string,
  puedePublicar: boolean,
) {
  await ctx.scheduler.runAfter(0, internal.salaPermisos.sincronizarPalabra, {
    asambleaId,
    identidad: `inv:${codigoInvitado.trim().toUpperCase()}`,
    puedePublicar,
  });
}

const revocarEnServidorDeMedios = (
  ctx: MutationCtx,
  asambleaId: Id<"asambleas">,
  userId: Id<"users">,
) => sincronizarPalabra(ctx, asambleaId, userId, false);

const revocarEnServidorDeMediosInvitado = (
  ctx: MutationCtx,
  asambleaId: Id<"asambleas">,
  codigoInvitado: string,
) => sincronizarPalabraInvitado(ctx, asambleaId, codigoInvitado, false);

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

async function apagarEmisionesInvitado(
  ctx: MutationCtx,
  asambleaId: Id<"asambleas">,
  codigoInvitado: string,
) {
  const emisiones = await ctx.db
    .query("salaEmisores")
    .withIndex("by_asamblea", (q) => q.eq("asambleaId", asambleaId))
    .collect();
  for (const e of emisiones) {
    if (e.codigoInvitado === codigoInvitado) await ctx.db.delete(e._id);
  }
}

/** Manos y palabra en curso. `mia` marca la fila del usuario que consulta. */
export const palabras = query({
  args: {
    asambleaId: v.id("asambleas"),
    codigoInvitado: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return [];

    const inv = args.codigoInvitado?.trim().toUpperCase() || undefined;
    if (inv) {
      try {
        await requireAccesoSala(ctx, args.asambleaId, undefined, inv);
      } catch {
        return [];
      }
    } else {
      await requireCondominioRole(ctx, asamblea.condominioId, []);
    }
    const user = await getCurrentAppUser(ctx);

    const filas = await ctx.db
      .query("salaPalabra")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .collect();
    return filas
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((f) => ({
        userId: f.userId ?? null,
        codigoInvitado: f.codigoInvitado ?? null,
        nombre: f.nombre,
        estado: f.estado,
        cierraEn: f.cierraEn ?? null,
        concedidaEn: f.concedidaEn ?? null,
        mia: inv
          ? f.codigoInvitado === inv
          : user
            ? f.userId === user._id
            : false,
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
    codigoInvitado: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAccesoSala(
      ctx,
      args.asambleaId,
      args.codigoPoder,
      args.codigoInvitado,
    );
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
    codigoInvitado: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      await requireAccesoSala(
        ctx,
        args.asambleaId,
        args.codigoPoder,
        args.codigoInvitado,
      );
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
    codigoInvitado: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAccesoSala(
      ctx,
      args.asambleaId,
      args.codigoPoder,
      args.codigoInvitado,
    );
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
    codigoInvitado: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!(REACCION_EMOJIS as readonly string[]).includes(args.emoji)) {
      throw new Error("Reacción no válida.");
    }
    const { asamblea, user } = await requireAccesoSala(
      ctx,
      args.asambleaId,
      args.codigoPoder,
      args.codigoInvitado,
    );
    if (asamblea.estado !== "en_curso") {
      throw new Error("La sala no está abierta.");
    }

    const inv = args.codigoInvitado?.trim().toUpperCase() || undefined;
    const codigo = args.codigoPoder?.trim().toUpperCase() || undefined;
    const nombre = await nombreEnSala(
      ctx,
      args.asambleaId,
      user,
      codigo,
      inv,
    );

    await ctx.db.insert("salaReacciones", {
      condominioId: asamblea.condominioId,
      asambleaId: args.asambleaId,
      emoji: args.emoji,
      nombre,
      userId: user?._id,
      codigoPoder: codigo,
      codigoInvitado: inv,
      createdAt: Date.now(),
    });
    await registrarBitacora(ctx, {
      condominioId: asamblea.condominioId,
      asambleaId: args.asambleaId,
      tipo: "reaccion",
      nombre,
      detalle: args.emoji,
      userId: user?._id,
    });
    return { ok: true as const };
  },
});

/** Reacciones de los últimos segundos para animar en pantalla. */
export const reaccionesRecientes = query({
  args: {
    asambleaId: v.id("asambleas"),
    codigoPoder: v.optional(v.string()),
    codigoInvitado: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      await requireAccesoSala(
        ctx,
        args.asambleaId,
        args.codigoPoder,
        args.codigoInvitado,
      );
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
// Chat de la sala
// ─────────────────────────────────────────────────────────────

const CHAT_MAX_CHARS = 400;
const CHAT_LIMITE = 80;

async function nombreEnSala(
  ctx: QueryCtx | MutationCtx,
  asambleaId: Id<"asambleas">,
  user: { _id: Id<"users">; name: string } | null,
  codigoPoder?: string,
  codigoInvitado?: string,
) {
  if (user) return user.name;
  const inv = codigoInvitado?.trim().toUpperCase() ?? "";
  if (inv.length >= 5) {
    const sesion = await ctx.db
      .query("asambleaInvitadoSesiones")
      .withIndex("by_sesion", (q) => q.eq("sesionCodigo", inv))
      .first();
    if (sesion && sesion.asambleaId === asambleaId) return sesion.nombre;
  }
  const codigo = codigoPoder?.trim().toUpperCase() ?? "";
  if (codigo.length >= 4) {
    const poder = await ctx.db
      .query("poderesAsamblea")
      .withIndex("by_codigo", (q) => q.eq("codigoAcceso", codigo))
      .first();
    if (poder && poder.asambleaId === asambleaId) {
      return poder.representanteNombre;
    }
  }
  return "Participante";
}

async function estaSilenciadoEnChat(
  ctx: QueryCtx | MutationCtx,
  asambleaId: Id<"asambleas">,
  ident: {
    userId?: Id<"users"> | null;
    codigoPoder?: string;
    codigoInvitado?: string;
  },
) {
  if (ident.userId) {
    const fila = await ctx.db
      .query("salaChatSilenciados")
      .withIndex("by_asamblea_user", (q) =>
        q.eq("asambleaId", asambleaId).eq("userId", ident.userId!),
      )
      .first();
    if (fila) return true;
  }
  const inv = ident.codigoInvitado?.trim().toUpperCase();
  if (inv) {
    const fila = await ctx.db
      .query("salaChatSilenciados")
      .withIndex("by_asamblea_invitado", (q) =>
        q.eq("asambleaId", asambleaId).eq("codigoInvitado", inv),
      )
      .first();
    if (fila) return true;
  }
  const poder = ident.codigoPoder?.trim().toUpperCase();
  if (poder) {
    const fila = await ctx.db
      .query("salaChatSilenciados")
      .withIndex("by_asamblea_poder", (q) =>
        q.eq("asambleaId", asambleaId).eq("codigoPoder", poder),
      )
      .first();
    if (fila) return true;
  }
  return false;
}

export const enviarMensaje = mutation({
  args: {
    asambleaId: v.id("asambleas"),
    texto: v.string(),
    codigoPoder: v.optional(v.string()),
    codigoInvitado: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const texto = args.texto.trim().slice(0, CHAT_MAX_CHARS);
    if (!texto) throw new Error("Escribe un mensaje.");
    const { asamblea, user } = await requireAccesoSala(
      ctx,
      args.asambleaId,
      args.codigoPoder,
      args.codigoInvitado,
    );
    if (asamblea.estado !== "en_curso") {
      throw new Error("La sala no está abierta.");
    }
    const codigo = args.codigoPoder?.trim().toUpperCase() || undefined;
    const inv = args.codigoInvitado?.trim().toUpperCase() || undefined;
    if (
      await estaSilenciadoEnChat(ctx, args.asambleaId, {
        userId: user?._id,
        codigoPoder: codigo,
        codigoInvitado: inv,
      })
    ) {
      throw new Error(
        "La mesa te silenció en el chat. Solo puedes leer los mensajes.",
      );
    }
    const nombre = await nombreEnSala(ctx, args.asambleaId, user, codigo, inv);
    await ctx.db.insert("salaMensajes", {
      condominioId: asamblea.condominioId,
      asambleaId: args.asambleaId,
      texto,
      nombre,
      userId: user?._id,
      codigoPoder: codigo,
      codigoInvitado: inv,
      createdAt: Date.now(),
    });
    await registrarBitacora(ctx, {
      condominioId: asamblea.condominioId,
      asambleaId: args.asambleaId,
      tipo: "chat",
      nombre,
      detalle: texto.slice(0, 120),
      userId: user?._id,
    });
    return { ok: true as const };
  },
});

/** La mesa silencia a alguien en el chat (sigue viendo, no escribe). */
export const silenciarEnChat = mutation({
  args: {
    asambleaId: v.id("asambleas"),
    userId: v.optional(v.id("users")),
    codigoPoder: v.optional(v.string()),
    codigoInvitado: v.optional(v.string()),
    nombre: v.string(),
  },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    const mesa = await requireAppUser(ctx);
    await requireCondominioRole(ctx, asamblea.condominioId, [...WRITE_ROLES]);

    const userId = args.userId;
    const codigo = args.codigoPoder?.trim().toUpperCase() || undefined;
    const inv = args.codigoInvitado?.trim().toUpperCase() || undefined;
    if (!userId && !codigo && !inv) {
      throw new Error("Indica a quién silenciar.");
    }
    if (userId && userId === mesa._id) {
      throw new Error("No puedes silenciarte a ti mismo.");
    }

    if (
      await estaSilenciadoEnChat(ctx, args.asambleaId, {
        userId,
        codigoPoder: codigo,
        codigoInvitado: inv,
      })
    ) {
      return { ok: true as const, yaEstaba: true };
    }

    const nombre = args.nombre.trim().slice(0, 80) || "Participante";
    await ctx.db.insert("salaChatSilenciados", {
      condominioId: asamblea.condominioId,
      asambleaId: args.asambleaId,
      userId,
      codigoPoder: codigo,
      codigoInvitado: inv,
      nombre,
      silenciadoPorUserId: mesa._id,
      createdAt: Date.now(),
    });
    await registrarBitacora(ctx, {
      condominioId: asamblea.condominioId,
      asambleaId: args.asambleaId,
      tipo: "chat",
      nombre,
      detalle: "Silenciado en el chat por la mesa",
      userId: mesa._id,
    });
    return { ok: true as const, yaEstaba: false };
  },
});

/** La mesa quita el silencio del chat. */
export const habilitarEnChat = mutation({
  args: {
    asambleaId: v.id("asambleas"),
    userId: v.optional(v.id("users")),
    codigoPoder: v.optional(v.string()),
    codigoInvitado: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    await requireCondominioRole(ctx, asamblea.condominioId, [...WRITE_ROLES]);

    const borradas: string[] = [];
    if (args.userId) {
      const fila = await ctx.db
        .query("salaChatSilenciados")
        .withIndex("by_asamblea_user", (q) =>
          q.eq("asambleaId", args.asambleaId).eq("userId", args.userId!),
        )
        .first();
      if (fila) {
        borradas.push(fila.nombre);
        await ctx.db.delete(fila._id);
      }
    }
    const inv = args.codigoInvitado?.trim().toUpperCase();
    if (inv) {
      const fila = await ctx.db
        .query("salaChatSilenciados")
        .withIndex("by_asamblea_invitado", (q) =>
          q.eq("asambleaId", args.asambleaId).eq("codigoInvitado", inv),
        )
        .first();
      if (fila) {
        borradas.push(fila.nombre);
        await ctx.db.delete(fila._id);
      }
    }
    const poder = args.codigoPoder?.trim().toUpperCase();
    if (poder) {
      const fila = await ctx.db
        .query("salaChatSilenciados")
        .withIndex("by_asamblea_poder", (q) =>
          q.eq("asambleaId", args.asambleaId).eq("codigoPoder", poder),
        )
        .first();
      if (fila) {
        borradas.push(fila.nombre);
        await ctx.db.delete(fila._id);
      }
    }

    if (borradas.length > 0) {
      const user = await getCurrentAppUser(ctx);
      await registrarBitacora(ctx, {
        condominioId: asamblea.condominioId,
        asambleaId: args.asambleaId,
        tipo: "chat",
        nombre: borradas[0]!,
        detalle: "Habilitado de nuevo en el chat",
        userId: user?._id,
      });
    }
    return { ok: true as const };
  },
});

/** ¿Puedo escribir? + lista de silenciados (solo mesa ve la lista). */
export const estadoChat = query({
  args: {
    asambleaId: v.id("asambleas"),
    codigoPoder: v.optional(v.string()),
    codigoInvitado: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      await requireAccesoSala(
        ctx,
        args.asambleaId,
        args.codigoPoder,
        args.codigoInvitado,
      );
    } catch {
      return {
        puedoEscribir: false,
        silenciado: false,
        esMesa: false,
        silenciados: [] as {
          _id: Id<"salaChatSilenciados">;
          nombre: string;
          userId: Id<"users"> | null;
          codigoPoder: string | null;
          codigoInvitado: string | null;
        }[],
      };
    }

    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) {
      return {
        puedoEscribir: false,
        silenciado: false,
        esMesa: false,
        silenciados: [],
      };
    }

    const user = await getCurrentAppUser(ctx);
    const mesa = user
      ? await esMesa(ctx, asamblea.condominioId, user)
      : false;
    const codigo = args.codigoPoder?.trim().toUpperCase() || undefined;
    const inv = args.codigoInvitado?.trim().toUpperCase() || undefined;
    const silenciado = await estaSilenciadoEnChat(ctx, args.asambleaId, {
      userId: user?._id,
      codigoPoder: codigo,
      codigoInvitado: inv,
    });

    let silenciados: {
      _id: Id<"salaChatSilenciados">;
      nombre: string;
      userId: Id<"users"> | null;
      codigoPoder: string | null;
      codigoInvitado: string | null;
    }[] = [];
    if (mesa) {
      const filas = await ctx.db
        .query("salaChatSilenciados")
        .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
        .collect();
      silenciados = filas.map((f) => ({
        _id: f._id,
        nombre: f.nombre,
        userId: f.userId ?? null,
        codigoPoder: f.codigoPoder ?? null,
        codigoInvitado: f.codigoInvitado ?? null,
      }));
    }

    return {
      puedoEscribir: !silenciado,
      silenciado,
      esMesa: mesa,
      silenciados,
    };
  },
});

/** Últimos mensajes de la sala (reactivo). Incluye foto de perfil si hay. */
export const mensajesSala = query({
  args: {
    asambleaId: v.id("asambleas"),
    codigoPoder: v.optional(v.string()),
    codigoInvitado: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      await requireAccesoSala(
        ctx,
        args.asambleaId,
        args.codigoPoder,
        args.codigoInvitado,
      );
    } catch {
      return [];
    }
    const filas = await ctx.db
      .query("salaMensajes")
      .withIndex("by_asamblea_created", (q) =>
        q.eq("asambleaId", args.asambleaId),
      )
      .order("desc")
      .take(CHAT_LIMITE);
    const ordenadas = filas.slice().reverse();

    /* Fotos: usuarios con cuenta + presencia (por si el avatar ya está ahí). */
    const userIds = [
      ...new Set(
        ordenadas
          .map((m) => m.userId)
          .filter((id): id is Id<"users"> => !!id),
      ),
    ];
    const fotos = new Map<string, string | null>();
    await Promise.all(
      userIds.map(async (id) => {
        const u = await ctx.db.get(id);
        fotos.set(id as string, u ? await resolveUserImage(ctx, u) : null);
      }),
    );

    const presencias = await ctx.db
      .query("salaPresencias")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .collect();
    const fotoPresencia = new Map<string, string>();
    for (const p of presencias) {
      if (!p.imageUrl) continue;
      if (p.userId) fotoPresencia.set(`u:${p.userId as string}`, p.imageUrl);
      if (p.codigoInvitado) {
        fotoPresencia.set(`i:${p.codigoInvitado}`, p.imageUrl);
      }
      if (p.codigoPoder) fotoPresencia.set(`p:${p.codigoPoder}`, p.imageUrl);
    }

    return ordenadas.map((m) => {
      let imageUrl: string | null = null;
      if (m.userId) {
        imageUrl =
          fotos.get(m.userId as string) ??
          fotoPresencia.get(`u:${m.userId as string}`) ??
          null;
      } else if (m.codigoInvitado) {
        imageUrl = fotoPresencia.get(`i:${m.codigoInvitado}`) ?? null;
      } else if (m.codigoPoder) {
        imageUrl = fotoPresencia.get(`p:${m.codigoPoder}`) ?? null;
      }
      return {
        _id: m._id,
        texto: m.texto,
        nombre: m.nombre,
        createdAt: m.createdAt,
        userId: m.userId ?? null,
        codigoPoder: m.codigoPoder ?? null,
        codigoInvitado: m.codigoInvitado ?? null,
        imageUrl,
      };
    });
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
    const mensajes = await ctx.db.query("salaMensajes").take(500);
    let mensajesViejos = 0;
    for (const m of mensajes) {
      if (m.createdAt < now - 12 * 60 * 60_000) {
        await ctx.db.delete(m._id);
        mensajesViejos++;
      }
    }
    if (borrados + huerfanas + reaccionesViejas + mensajesViejos > 0) {
      console.info(
        `[salaVideo] limpieza: ${borrados} emisores, ${huerfanas} señales, ${reaccionesViejas} reacciones, ${mensajesViejos} msgs`,
      );
    }
  },
});
