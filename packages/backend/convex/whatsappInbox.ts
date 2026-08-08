import { v } from "convex/values";
import {
  query,
  mutation,
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requirePlatformStaff } from "./model/authz";
import {
  enviarMensaje,
  msgTexto,
  msgDocumento,
  msgPlantillaConBoton,
  describirMensaje,
} from "./lib/ycloud";

/**
 * Bandeja de WhatsApp para el equipo.
 *
 * Cuando una persona del equipo escribe desde aquí, el agente se PAUSA en esa
 * conversación: si no, el residente recibiría dos respuestas distintas al
 * mismo tiempo y ninguna serviría. La pausa se levanta sola pasado un rato,
 * o a mano desde el panel.
 */

/** Cuánto se calla el agente después de que responde una persona. */
const PAUSA_AGENTE_MS = 2 * 60 * 60 * 1000;

const VENTANA_24H = 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────
// Lecturas
// ─────────────────────────────────────────────────────────────

/**
 * Contador del menú Bandeja: chats con mensajes nuevos o escalados
 * (el bot pidió ayuda humana).
 */
export const countAtencion = query({
  args: {},
  handler: async (ctx) => {
    await requirePlatformStaff(ctx);
    const filas = await ctx.db.query("waConversations").take(500);
    let noLeidos = 0;
    let escaladas = 0;
    let atencion = 0;
    for (const c of filas) {
      const sinLeer = (c.noLeidos ?? 0) > 0;
      const escalada = !!c.escaladaAt;
      if (sinLeer) noLeidos += c.noLeidos ?? 0;
      if (escalada) escaladas++;
      if (sinLeer || escalada) atencion++;
    }
    return { noLeidos, escaladas, atencion };
  },
});

export const conversaciones = query({
  args: {
    soloNoLeidos: v.optional(v.boolean()),
    soloEscaladas: v.optional(v.boolean()),
    busqueda: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);

    const filas = await ctx.db
      .query("waConversations")
      .order("desc")
      .take(200);

    const necesita = (args.busqueda ?? "").trim().toLowerCase();

    const salida = [];
    for (const c of filas) {
      if (args.soloNoLeidos && !(c.noLeidos ?? 0)) continue;
      if (args.soloEscaladas && !c.escaladaAt) continue;

      const user = c.userId ? await ctx.db.get(c.userId) : null;
      const condominio = c.condominioId ? await ctx.db.get(c.condominioId) : null;

      const nombre = user?.name ?? c.nombrePerfil ?? c.telefono ?? "Desconocido";
      if (necesita) {
        const heno = [
          nombre,
          c.telefono ?? "",
          c.username ?? "",
          condominio?.name ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!heno.includes(necesita)) continue;
      }

      const ultimo = await ctx.db
        .query("waMessages")
        .withIndex("by_conversacion", (q) => q.eq("conversacionId", c._id))
        .order("desc")
        .first();

      salida.push({
        _id: c._id,
        nombre,
        /** @usuario de WhatsApp; con los usernames de Meta puede no haber teléfono. */
        username: c.username ?? null,
        telefono: c.telefono ?? null,
        identificado: !!user,
        condominioNombre: condominio?.name ?? null,
        noLeidos: c.noLeidos ?? 0,
        ultimoMensajeAt: c.ultimoMensajeAt,
        ultimoTexto: ultimo?.contenido?.slice(0, 90) ?? "",
        ultimoEsEntrante: ultimo?.direccion === "entrante",
        ventanaAbierta: (c.ventanaExpiraAt ?? 0) > Date.now(),
        ventanaExpiraAt: c.ventanaExpiraAt ?? null,
        agentePausado: (c.agentePausadoHasta ?? 0) > Date.now(),
        escalada: !!c.escaladaAt,
        escaladaMotivo: c.escaladaMotivo ?? null,
        puedeResponder: !!(c.telefono ?? c.bsuid),
      });
    }

    salida.sort((a, b) => b.ultimoMensajeAt - a.ultimoMensajeAt);
    return salida;
  },
});

export const hilo = query({
  args: { conversacionId: v.id("waConversations") },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);

    const c = await ctx.db.get(args.conversacionId);
    if (!c) return null;

    const mensajes = await ctx.db
      .query("waMessages")
      .withIndex("by_conversacion", (q) => q.eq("conversacionId", args.conversacionId))
      .order("desc")
      .take(200);

    const user = c.userId ? await ctx.db.get(c.userId) : null;
    const condominio = c.condominioId ? await ctx.db.get(c.condominioId) : null;

    return {
      conversacion: {
        _id: c._id,
        nombre: user?.name ?? c.nombrePerfil ?? c.telefono ?? "Desconocido",
        username: c.username ?? null,
        telefono: c.telefono ?? null,
        email: user?.email ?? null,
        identificado: !!user,
        condominioNombre: condominio?.name ?? null,
        ventanaAbierta: (c.ventanaExpiraAt ?? 0) > Date.now(),
        ventanaExpiraAt: c.ventanaExpiraAt ?? null,
        agentePausado: (c.agentePausadoHasta ?? 0) > Date.now(),
        agentePausadoHasta: c.agentePausadoHasta ?? null,
        ultimoAgenteNombre: c.ultimoAgenteNombre ?? null,
        escalada: !!c.escaladaAt,
        escaladaMotivo: c.escaladaMotivo ?? null,
        puedeResponder: !!(c.telefono ?? c.bsuid),
      },
      mensajes: mensajes.reverse().map((m) => ({
        _id: m._id,
        direccion: m.direccion,
        tipo: m.tipo,
        contenido: m.contenido,
        mediaUrl: m.mediaUrl ?? null,
        mediaMime: m.mediaMime ?? null,
        mediaNombre: m.mediaNombre ?? null,
        estado: m.estado ?? null,
        error: m.error ?? null,
        agenteNombre: m.agenteNombre ?? null,
        createdAt: m.createdAt,
      })),
    };
  },
});

// ─────────────────────────────────────────────────────────────
// Acciones del equipo
// ─────────────────────────────────────────────────────────────

export const marcarLeida = mutation({
  args: { conversacionId: v.id("waConversations") },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);
    await ctx.db.patch(args.conversacionId, { noLeidos: 0 });
    return null;
  },
});

/** Silencia o reactiva al agente en esta conversación. */
export const pausarAgente = mutation({
  args: {
    conversacionId: v.id("waConversations"),
    pausar: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);
    await ctx.db.patch(args.conversacionId, {
      agentePausadoHasta: args.pausar ? Date.now() + PAUSA_AGENTE_MS : undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const datosParaEnviar = internalQuery({
  args: { conversacionId: v.id("waConversations") },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.conversacionId);
    if (!c) return null;
    return {
      // El BSUID vale igual: enviarMensaje lo manda como `recipient`.
      destino: c.telefono ?? c.bsuid ?? null,
      ventanaAbierta: (c.ventanaExpiraAt ?? 0) > Date.now(),
    };
  },
});

export const registrarSalienteDeAgente = internalMutation({
  args: {
    conversacionId: v.id("waConversations"),
    tipo: v.string(),
    contenido: v.string(),
    mediaUrl: v.optional(v.string()),
    mediaMime: v.optional(v.string()),
    mediaNombre: v.optional(v.string()),
    ycloudMessageId: v.optional(v.string()),
    error: v.optional(v.string()),
    agenteNombre: v.string(),
  },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.conversacionId);
    if (!c) return null;
    const now = Date.now();

    await ctx.db.insert("waMessages", {
      conversacionId: args.conversacionId,
      telefono: c.telefono,
      direccion: "saliente",
      tipo: args.tipo,
      contenido: args.contenido.slice(0, 4000),
      mediaUrl: args.mediaUrl,
      mediaMime: args.mediaMime,
      mediaNombre: args.mediaNombre,
      ycloudMessageId: args.ycloudMessageId,
      estado: args.error ? "failed" : "sent",
      error: args.error,
      agenteNombre: args.agenteNombre,
      createdAt: now,
    });

    // Escribió una persona: el agente se calla en esta conversación.
    await ctx.db.patch(args.conversacionId, {
      ultimoMensajeAt: now,
      agentePausadoHasta: now + PAUSA_AGENTE_MS,
      ultimoAgenteNombre: args.agenteNombre,
      noLeidos: 0,
      updatedAt: now,
    });
    return null;
  },
});

/**
 * Envía un mensaje desde el panel. Texto, imagen, audio o documento.
 *
 * Solo funciona dentro de la ventana de 24 h: fuera de ella WhatsApp exige
 * plantilla, y una plantilla no sirve para conversar.
 */
export const enviar = action({
  args: {
    conversacionId: v.id("waConversations"),
    texto: v.optional(v.string()),
    /** Archivo ya subido a S3 (api.files.generateUploadUrl). */
    mediaUrl: v.optional(v.string()),
    mediaMime: v.optional(v.string()),
    mediaNombre: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; motivo?: string }> => {
    const staff = await ctx.runQuery(internal.whatsappInbox.staffActual, {});
    if (!staff) throw new Error("Requiere rol de plataforma.");

    const datos: { destino: string | null; ventanaAbierta: boolean } | null =
      await ctx.runQuery(internal.whatsappInbox.datosParaEnviar, {
        conversacionId: args.conversacionId,
      });
    if (!datos?.destino) {
      return {
        ok: false,
        motivo:
          "Esta persona escribió con su @usuario de WhatsApp y no comparte su número. WhatsApp no permite responderle sin teléfono: contáctala por otra vía.",
      };
    }
    if (!datos.ventanaAbierta) {
      return {
        ok: false,
        motivo:
          "Pasaron más de 24 h desde su último mensaje. WhatsApp solo permite plantillas fuera de esa ventana.",
      };
    }

    const texto = args.texto?.trim();
    if (!texto && !args.mediaUrl) {
      return { ok: false, motivo: "Escribe un mensaje o adjunta un archivo." };
    }

    let payload: Record<string, unknown> & { to: string };
    let tipo = "text";
    if (args.mediaUrl) {
      const mime = args.mediaMime ?? "";
      if (mime.startsWith("image/")) {
        tipo = "image";
        payload = {
          to: datos.destino,
          type: "image",
          image: { link: args.mediaUrl, ...(texto ? { caption: texto } : {}) },
        };
      } else if (mime.startsWith("audio/")) {
        tipo = "audio";
        payload = {
          to: datos.destino,
          type: "audio",
          audio: { link: args.mediaUrl },
        };
      } else if (mime.startsWith("video/")) {
        tipo = "video";
        payload = {
          to: datos.destino,
          type: "video",
          video: { link: args.mediaUrl, ...(texto ? { caption: texto } : {}) },
        };
      } else {
        tipo = "document";
        payload = msgDocumento(datos.destino, args.mediaUrl, {
          filename: args.mediaNombre,
          caption: texto,
        }) as Record<string, unknown> & { to: string };
      }
    } else {
      payload = msgTexto(datos.destino, texto!) as Record<string, unknown> & {
        to: string;
      };
    }

    try {
      const res = await enviarMensaje(payload);
      await ctx.runMutation(internal.whatsappInbox.registrarSalienteDeAgente, {
        conversacionId: args.conversacionId,
        tipo,
        contenido: describirMensaje(payload),
        mediaUrl: args.mediaUrl,
        mediaMime: args.mediaMime,
        mediaNombre: args.mediaNombre,
        ycloudMessageId: res.id,
        agenteNombre: staff.nombre,
      });
      return { ok: true };
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.whatsappInbox.registrarSalienteDeAgente, {
        conversacionId: args.conversacionId,
        tipo,
        contenido: describirMensaje(payload),
        mediaUrl: args.mediaUrl,
        mediaMime: args.mediaMime,
        mediaNombre: args.mediaNombre,
        error: motivo,
        agenteNombre: staff.nombre,
      });
      return { ok: false, motivo };
    }
  },
});

export const staffActual = internalQuery({
  args: {},
  handler: async (ctx) => {
    const user = await requirePlatformStaff(ctx);
    return { nombre: user.name };
  },
});

// ─────────────────────────────────────────────────────────────
// Enganches desde el webhook
// ─────────────────────────────────────────────────────────────

/**
 * Marca que a esta persona no se le puede responder: escribió con su
 * @usuario de WhatsApp y Meta no comparte su teléfono. YCloud solo acepta
 * E.164 como destinatario, así que el bot no tiene por dónde contestarle.
 * Se escala para que alguien del equipo la busque por otro canal.
 */
export const marcarSinDestino = internalMutation({
  args: { conversacionId: v.id("waConversations") },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.conversacionId);
    if (!c || c.escaladaAt) return null;
    await ctx.db.patch(args.conversacionId, {
      escaladaAt: Date.now(),
      escaladaMotivo:
        "Escribió con su @usuario de WhatsApp y no comparte el número. El bot no puede responderle: contáctala por otra vía o pídele que comparta su número.",
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Suma un no leído al llegar un entrante. */
export const sumarNoLeido = internalMutation({
  args: { conversacionId: v.id("waConversations") },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.conversacionId);
    if (!c) return null;
    await ctx.db.patch(args.conversacionId, { noLeidos: (c.noLeidos ?? 0) + 1 });
    return null;
  },
});

/** Guarda en S3 la media entrante para poder verla en el inbox. */
export const guardarMediaEntrante = internalMutation({
  args: {
    ycloudMessageId: v.string(),
    mediaUrl: v.string(),
    mediaMime: v.optional(v.string()),
    mediaNombre: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const m = await ctx.db
      .query("waMessages")
      .withIndex("by_ycloudMessageId", (q) =>
        q.eq("ycloudMessageId", args.ycloudMessageId),
      )
      .first();
    if (!m) return null;
    await ctx.db.patch(m._id, {
      mediaUrl: args.mediaUrl,
      mediaMime: args.mediaMime,
      mediaNombre: args.mediaNombre,
    });
    return null;
  },
});

/**
 * Baja la media de YCloud a S3 y la deja visible en el inbox.
 *
 * Los enlaces que manda YCloud exigen la API key y caducan, así que no sirven
 * para pintarlos en el navegador del equipo: hay que re-alojarlos.
 */
export const rescatarMedia = internalAction({
  args: {
    ycloudMessageId: v.string(),
    condominioId: v.optional(v.id("condominios")),
    link: v.string(),
    mimeType: v.optional(v.string()),
    filename: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const subido: { publicUrl: string } = await ctx.runAction(
        internal.files.uploadFromUrl,
        {
          url: args.link,
          folder: `whatsapp/${args.condominioId ?? "sin-condominio"}`,
          fileName: args.filename,
          contentType: args.mimeType,
          conApiKeyYCloud: true,
        },
      );
      await ctx.runMutation(internal.whatsappInbox.guardarMediaEntrante, {
        ycloudMessageId: args.ycloudMessageId,
        mediaUrl: subido.publicUrl,
        mediaMime: args.mimeType,
        mediaNombre: args.filename,
      });
    } catch {
      // Sin la copia el inbox muestra el mensaje sin la imagen; no se cae.
    }
    return null;
  },
});


/**
 * Manda una plantilla aprobada a esta conversación desde el panel.
 *
 * A diferencia de `enviar`, esto SÍ funciona con la ventana de 24 h cerrada:
 * es justo para lo que existen las plantillas. El equipo llena las variables
 * a mano, así que puede adaptar el mensaje a cada caso.
 */
export const enviarPlantilla = action({
  args: {
    conversacionId: v.id("waConversations"),
    plantilla: v.string(),
    idioma: v.optional(v.string()),
    parametros: v.optional(v.array(v.string())),
    /** Sufijo del botón de URL dinámica, si la plantilla lo tiene. */
    sufijoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; motivo?: string }> => {
    const staff = await ctx.runQuery(internal.whatsappInbox.staffActual, {});
    if (!staff) throw new Error("Requiere rol de plataforma.");

    const datos: { destino: string | null; ventanaAbierta: boolean } | null =
      await ctx.runQuery(internal.whatsappInbox.datosParaEnviar, {
        conversacionId: args.conversacionId,
      });
    if (!datos?.destino) {
      return {
        ok: false,
        motivo:
          "Sin número visible no se puede enviar: esta persona usa @usuario de WhatsApp.",
      };
    }

    const params = (args.parametros ?? []).map((p) => p.trim());
    const payload = msgPlantillaConBoton(
      datos.destino,
      args.plantilla,
      args.idioma ?? "es",
      params,
      args.sufijoUrl?.trim() || undefined,
    );

    try {
      const res = await enviarMensaje(payload);
      await ctx.runMutation(internal.whatsappInbox.registrarSalienteDeAgente, {
        conversacionId: args.conversacionId,
        tipo: "template",
        contenido: describirMensaje(payload),
        ycloudMessageId: res.id,
        agenteNombre: staff.nombre,
      });
      return { ok: true };
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.whatsappInbox.registrarSalienteDeAgente, {
        conversacionId: args.conversacionId,
        tipo: "template",
        contenido: describirMensaje(payload),
        error: motivo,
        agenteNombre: staff.nombre,
      });
      return { ok: false, motivo };
    }
  },
});

// ─────────────────────────────────────────────────────────────
// Escalar a una persona
// ─────────────────────────────────────────────────────────────

/**
 * El agente levanta la mano: no supo resolver y pide que lo atienda alguien
 * del equipo. Se pausa a sí mismo para no seguir dando vueltas.
 */
export const escalar = internalMutation({
  args: {
    conversacionId: v.id("waConversations"),
    motivo: v.string(),
  },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.conversacionId);
    if (!c) return null;
    const now = Date.now();
    await ctx.db.patch(args.conversacionId, {
      escaladaAt: now,
      escaladaMotivo: args.motivo.slice(0, 300),
      // Deja de responder: a partir de aquí contesta una persona.
      agentePausadoHasta: now + PAUSA_AGENTE_MS,
      noLeidos: (c.noLeidos ?? 0) + 1,
      updatedAt: now,
    });
    return null;
  },
});

/** El equipo da por atendida la escalación. */
export const resolverEscalacion = mutation({
  args: { conversacionId: v.id("waConversations") },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);
    await ctx.db.patch(args.conversacionId, {
      escaladaAt: undefined,
      escaladaMotivo: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Le manda sus datos de acceso a la persona de esta conversación.
 *
 * Es el atajo del caso de soporte más repetido —"no puedo entrar"— para que
 * el equipo lo resuelva de un toque en vez de buscar a la persona, generarle
 * una clave y redactar el mensaje a mano, que es donde se cuelan los errores.
 *
 * Sirve tanto para quien comparte su número como para quien usa @usuario de
 * Meta: el destino lo decide el motor mirando la conversación.
 */
export const enviarAccesos = action({
  args: {
    conversacionId: v.id("waConversations"),
    /** true rota la clave aunque la persona ya tuviera una propia. */
    forzar: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; motivo?: string }> => {
    const staff = await ctx.runQuery(internal.whatsappInbox.staffActual, {});
    if (!staff) throw new Error("Requiere rol de plataforma.");

    const r: { ok: boolean; motivo?: string } = await ctx.runAction(
      internal.credenciales.enviarAccesoPorWhatsapp,
      { conversacionId: args.conversacionId, forzar: args.forzar !== false },
    );
    return r.ok ? { ok: true } : { ok: false, motivo: r.motivo };
  },
});
