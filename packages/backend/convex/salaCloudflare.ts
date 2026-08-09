import { v } from "convex/values";
import { action, mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  getCurrentAppUser,
  getMembership,
  hasPlatformRole,
} from "./model/authz";
import { WRITE_ROLES } from "./asambleaSala";
import {
  configRealtime,
  crearSesion,
  publicarPistas,
  suscribirPistas,
  renegociar,
  cerrarPistas,
} from "./lib/cloudflareRealtime";

/**
 * La sala sobre Cloudflare Realtime.
 *
 * Reparto de trabajo, que es lo que hace que esto salga barato:
 *  - CLOUDFLARE mueve los medios. Cobra por gigabyte, y una asamblea de solo
 *    audio son ~50 GB contra los 1.000 GB gratis al mes.
 *  - CONVEX es la señalización: quién publica qué pista. Se escribe cinco o
 *    seis veces por asamblea, no cada 30 segundos.
 *  - EL NAVEGADOR hace el WebRTC. El secreto nunca sale del backend.
 *
 * Nada de esto toca la asistencia, el quórum, los poderes ni el acta: eso
 * sigue donde estaba y no sabe qué motor mueve el audio.
 *
 * Convive con LiveKit a propósito. Mientras `CLOUDFLARE_REALTIME_APP_ID` no
 * esté configurada, `disponible` devuelve false y la sala usa el camino de
 * siempre. Estrenar un motor de medios en una asamblea de verdad sin haberlo
 * probado con gente es justo lo que salió mal la última vez.
 */

/** ¿Está configurado el SFU de Cloudflare? Lo pregunta el cliente al montar. */
export const disponible = query({
  args: {},
  handler: async () => configRealtime() != null,
});

// ─────────────────────────────────────────────────────────────
// Señalización: el directorio de pistas
// ─────────────────────────────────────────────────────────────

/** Las pistas que hay ahora mismo en la sala, para saber a qué suscribirse. */
export const pistas = query({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const filas = await ctx.db
      .query("salaPistasCf")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .collect();
    return filas.map((p) => ({
      sessionId: p.sessionId,
      trackName: p.trackName,
      tipo: p.tipo,
      nombre: p.nombre,
      userId: p.userId ?? null,
    }));
  },
});

export const anotarPista = internalMutation({
  args: {
    asambleaId: v.id("asambleas"),
    sessionId: v.string(),
    trackName: v.string(),
    tipo: v.union(v.literal("audio"), v.literal("video"), v.literal("pantalla")),
    userId: v.optional(v.id("users")),
    codigoPoder: v.optional(v.string()),
    codigoInvitado: v.optional(v.string()),
    nombre: v.string(),
  },
  handler: async (ctx, args) => {
    // Idempotente: una renegociación puede reenviar la misma pista.
    const ya = await ctx.db
      .query("salaPistasCf")
      .withIndex("by_asamblea_track", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("trackName", args.trackName),
      )
      .first();
    if (ya) return ya._id;
    return await ctx.db.insert("salaPistasCf", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const olvidarPistas = internalMutation({
  args: { sessionId: v.string(), trackNames: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const filas = await ctx.db
      .query("salaPistasCf")
      .withIndex("by_sesion", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    for (const f of filas) {
      if (args.trackNames && !args.trackNames.includes(f.trackName)) continue;
      await ctx.db.delete(f._id);
    }
    return null;
  },
});

/**
 * Quién es quien llama y si puede emitir audio.
 *
 * Reutiliza la MISMA regla que LiveKit —mesa, presidente o palabra
 * concedida— en vez de reimplementarla. Dos motores con dos criterios
 * distintos de quién puede hablar es como se acaba dando la palabra a quien
 * no la tiene.
 */
export const permisoParaPublicar = internalQuery({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) return null;

    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return null;

    const membresia = await getMembership(ctx, user._id, asamblea.condominioId);
    const esMesa =
      hasPlatformRole(user, "superadmin", "admin") ||
      (!!membresia?.isActive &&
        membresia.roles.some((r) =>
          (WRITE_ROLES as readonly string[]).includes(r),
        ));
    const esPresidente = asamblea.presidenteUserId === user._id;

    const palabra = await ctx.db
      .query("salaPalabra")
      .withIndex("by_asamblea_user", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("userId", user._id),
      )
      .first();

    return {
      userId: user._id as string,
      nombre: user.name,
      puedePublicar:
        esMesa || esPresidente || palabra?.estado === "concedida",
    };
  },
});

export const contextoSala = internalQuery({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return null;
    return {
      condominioId: asamblea.condominioId,
      enCurso: asamblea.estado === "en_curso",
    };
  },
});

// ─────────────────────────────────────────────────────────────
// El puente con Cloudflare
// ─────────────────────────────────────────────────────────────

/**
 * Abre la sesión de esta persona con el SFU.
 *
 * El navegador manda su oferta; devolvemos la respuesta y el `sessionId`, que
 * a partir de ahí identifica su conexión.
 */
export const abrirSesion = action({
  args: {
    asambleaId: v.id("asambleas"),
    sdp: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ sessionId: string; sdp: string } | { error: string }> => {
    const cfg = configRealtime();
    if (!cfg) return { error: "El SFU de Cloudflare no está configurado." };

    const sala: { enCurso: boolean } | null = await ctx.runQuery(
      internal.salaCloudflare.contextoSala,
      { asambleaId: args.asambleaId },
    );
    if (!sala) return { error: "Asamblea no encontrada." };
    if (!sala.enCurso) return { error: "La sala no está abierta." };

    try {
      const { sessionId, respuesta } = await crearSesion(cfg, {
        type: "offer",
        sdp: args.sdp,
      });
      return { sessionId, sdp: respuesta.sdp };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  },
});

/**
 * Publica el micrófono (o la pantalla) de quien ya tiene sesión.
 *
 * El permiso NO se comprueba aquí por comodidad: se comprueba porque el
 * secreto de la aplicación permite publicar en cualquier sesión. Sin esta
 * puerta, cualquiera con la consola abierta podría emitir audio a los 173.
 */
export const publicar = action({
  args: {
    asambleaId: v.id("asambleas"),
    sessionId: v.string(),
    sdp: v.string(),
    pistas: v.array(
      v.object({
        mid: v.string(),
        trackName: v.string(),
        tipo: v.union(
          v.literal("audio"),
          v.literal("video"),
          v.literal("pantalla"),
        ),
      }),
    ),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ sdp: string } | { error: string }> => {
    const cfg = configRealtime();
    if (!cfg) return { error: "El SFU de Cloudflare no está configurado." };

    /* Mismo criterio que LiveKit: mesa, presidente o palabra concedida. Se
     * reutiliza `miSala`, que ya lo resuelve y ya está probado. */
    const permiso: { puedePublicar: boolean; nombre: string; userId: string } | null =
      await ctx.runQuery(internal.salaCloudflare.permisoParaPublicar, {
        asambleaId: args.asambleaId,
      });
    if (!permiso) return { error: "Sin acceso a esta sala." };
    if (!permiso.puedePublicar) {
      return { error: "No tienes la palabra en esta asamblea." };
    }

    try {
      const { respuesta } = await publicarPistas(
        cfg,
        args.sessionId,
        { type: "offer", sdp: args.sdp },
        args.pistas.map((p) => ({
          location: "local" as const,
          mid: p.mid,
          trackName: p.trackName,
        })),
      );

      for (const p of args.pistas) {
        await ctx.runMutation(internal.salaCloudflare.anotarPista, {
          asambleaId: args.asambleaId,
          sessionId: args.sessionId,
          trackName: p.trackName,
          tipo: p.tipo,
          userId: permiso.userId as Id<"users">,
          nombre: permiso.nombre,
        });
      }
      return { sdp: respuesta.sdp };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  },
});

/** Se suscribe a las pistas de la mesa. Devuelve la oferta que hay que responder. */
export const suscribir = action({
  args: {
    asambleaId: v.id("asambleas"),
    sessionId: v.string(),
    pistas: v.array(v.object({ sessionId: v.string(), trackName: v.string() })),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ sdp: string | null } | { error: string }> => {
    const cfg = configRealtime();
    if (!cfg) return { error: "El SFU de Cloudflare no está configurado." };

    try {
      const { oferta } = await suscribirPistas(
        cfg,
        args.sessionId,
        args.pistas.map((p) => ({
          location: "remote" as const,
          sessionId: p.sessionId,
          trackName: p.trackName,
        })),
      );
      return { sdp: oferta?.sdp ?? null };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  },
});

/** Cierra el ciclo de `suscribir` con la respuesta del navegador. */
export const responder = action({
  args: { sessionId: v.string(), sdp: v.string() },
  handler: async (_ctx, args): Promise<{ ok: boolean; error?: string }> => {
    const cfg = configRealtime();
    if (!cfg) return { ok: false, error: "SFU no configurado." };
    try {
      await renegociar(cfg, args.sessionId, { type: "answer", sdp: args.sdp });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
});

/** Deja de publicar. Se llama al silenciarse y al salir de la sala. */
export const dejarDePublicar = action({
  args: {
    sessionId: v.string(),
    trackNames: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; error?: string }> => {
    const cfg = configRealtime();
    if (!cfg) return { ok: false, error: "SFU no configurado." };
    try {
      await cerrarPistas(cfg, args.sessionId, args.trackNames);
    } catch (e) {
      /* Si Cloudflare ya la cerró por su cuenta, el directorio igual hay que
       * limpiarlo: una pista fantasma hace que los demás se suscriban a algo
       * que no existe y se queden esperando audio que no llega. */
      await ctx.runMutation(internal.salaCloudflare.olvidarPistas, {
        sessionId: args.sessionId,
        trackNames: args.trackNames,
      });
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    await ctx.runMutation(internal.salaCloudflare.olvidarPistas, {
      sessionId: args.sessionId,
      trackNames: args.trackNames,
    });
    return { ok: true };
  },
});
