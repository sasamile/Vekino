import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  enviarMensaje,
  msgBotones,
  msgDocumento,
  msgLista,
  msgTexto,
} from "./lib/ycloud";

/**
 * Bot de WhatsApp (YCloud).
 *
 * El webhook (http.ts) valida y delega aquí. `registrarEntrante` es la barrera
 * de idempotencia (YCloud reintenta entregas); `procesarEntrante` es el router:
 * una máquina de estados determinista (menú, reservas, facturas, comprobantes,
 * problemas) con fallback a IA para texto libre.
 *
 * El bot SIEMPRE responde dentro de la ventana de 24 h (está contestando un
 * mensaje entrante), así que puede usar texto libre e interactivos. Las
 * plantillas solo hacen falta en los envíos iniciados por nosotros
 * (whatsappBroadcast / whatsappNotifs).
 */

const VENTANA_24H = 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────
// Persistencia (mutations/queries internas)
// ─────────────────────────────────────────────────────────────

/**
 * Registra un mensaje entrante. Idempotente por `ycloudMessageId`: si ya lo
 * vimos (reintento de YCloud), devuelve duplicado=true y el router no corre.
 */
export const registrarEntrante = internalMutation({
  args: {
    telefono: v.string(), // E.164 con "+"
    ycloudMessageId: v.string(),
    tipo: v.string(),
    contenido: v.string(),
    nombrePerfil: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existente = await ctx.db
      .query("waMessages")
      .withIndex("by_ycloudMessageId", (q) =>
        q.eq("ycloudMessageId", args.ycloudMessageId),
      )
      .first();
    if (existente) {
      return { conversacionId: existente.conversacionId, duplicado: true as const };
    }

    const now = Date.now();
    let conversacion = await ctx.db
      .query("waConversations")
      .withIndex("by_telefono", (q) => q.eq("telefono", args.telefono))
      .first();

    let conversacionId: Id<"waConversations">;
    if (conversacion) {
      conversacionId = conversacion._id;
      await ctx.db.patch(conversacionId, {
        ultimoMensajeAt: now,
        ventanaExpiraAt: now + VENTANA_24H,
        nombrePerfil: args.nombrePerfil ?? conversacion.nombrePerfil,
        updatedAt: now,
      });
    } else {
      conversacionId = await ctx.db.insert("waConversations", {
        telefono: args.telefono,
        nombrePerfil: args.nombrePerfil,
        paso: "nueva",
        ultimoMensajeAt: now,
        ventanaExpiraAt: now + VENTANA_24H,
        createdAt: now,
        updatedAt: now,
      });
      conversacion = await ctx.db.get(conversacionId);
    }

    // Identificación por teléfono. No es único (parejas comparten número):
    // tomamos el primer usuario ACTIVO; la desambiguación fina no vale el
    // costo aquí porque ambos ven las mismas unidades en la práctica.
    if (conversacion && !conversacion.userId) {
      const candidatos = await ctx.db
        .query("users")
        .withIndex("by_telefono", (q) => q.eq("telefonoE164", args.telefono))
        .collect();
      const usuario = candidatos.find((u) => u.active);
      if (usuario) {
        await ctx.db.patch(conversacionId, { userId: usuario._id, updatedAt: now });
      }
    }

    await ctx.db.insert("waMessages", {
      conversacionId,
      telefono: args.telefono,
      direccion: "entrante",
      tipo: args.tipo,
      contenido: args.contenido.slice(0, 4000),
      ycloudMessageId: args.ycloudMessageId,
      createdAt: now,
    });

    return { conversacionId, duplicado: false as const };
  },
});

export const registrarSaliente = internalMutation({
  args: {
    conversacionId: v.id("waConversations"),
    tipo: v.string(),
    contenido: v.string(),
    ycloudMessageId: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const conversacion = await ctx.db.get(args.conversacionId);
    if (!conversacion) return null;
    const now = Date.now();
    await ctx.db.patch(args.conversacionId, { ultimoMensajeAt: now, updatedAt: now });
    return await ctx.db.insert("waMessages", {
      conversacionId: args.conversacionId,
      telefono: conversacion.telefono,
      direccion: "saliente",
      tipo: args.tipo,
      contenido: args.contenido.slice(0, 4000),
      ycloudMessageId: args.ycloudMessageId,
      estado: args.error ? "failed" : "sent",
      error: args.error,
      createdAt: now,
    });
  },
});

/** Estado de entrega de un saliente (evento whatsapp.message.updated). */
export const actualizarEstadoMensaje = internalMutation({
  args: {
    ycloudMessageId: v.string(),
    estado: v.string(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const mensaje = await ctx.db
      .query("waMessages")
      .withIndex("by_ycloudMessageId", (q) =>
        q.eq("ycloudMessageId", args.ycloudMessageId),
      )
      .first();
    if (mensaje) {
      await ctx.db.patch(mensaje._id, { estado: args.estado, error: args.error });
    }
    return null;
  },
});

export const setConversacion = internalMutation({
  args: {
    conversacionId: v.id("waConversations"),
    paso: v.optional(v.string()),
    contexto: v.optional(v.any()),
    condominioId: v.optional(v.id("condominios")),
    membershipId: v.optional(v.id("memberships")),
  },
  handler: async (ctx, args) => {
    const { conversacionId, ...cambios } = args;
    await ctx.db.patch(conversacionId, { ...cambios, updatedAt: Date.now() });
    return null;
  },
});

/** Todo lo que el router necesita para decidir: usuario, membresías, unidades. */
export const contextoConversacion = internalQuery({
  args: { conversacionId: v.id("waConversations") },
  handler: async (ctx, args) => {
    const conversacion = await ctx.db.get(args.conversacionId);
    if (!conversacion) return null;

    const user = conversacion.userId ? await ctx.db.get(conversacion.userId) : null;
    const usuarioActivo = user && user.active ? user : null;

    const membresias: Array<{
      membership: Doc<"memberships">;
      condominio: Doc<"condominios">;
    }> = [];
    if (usuarioActivo) {
      const ms = await ctx.db
        .query("memberships")
        .withIndex("by_user", (q) => q.eq("userId", usuarioActivo._id))
        .collect();
      for (const m of ms) {
        if (!m.isActive) continue;
        const condominio = await ctx.db.get(m.condominioId);
        if (condominio && condominio.isActive) {
          membresias.push({ membership: m, condominio });
        }
      }
    }

    const unidades: Array<{ unidad: Doc<"unidades">; vinculo: string }> = [];
    if (conversacion.membershipId) {
      const vinculos = await ctx.db
        .query("usuarioUnidad")
        .withIndex("by_membership", (q) =>
          q.eq("membershipId", conversacion.membershipId!),
        )
        .collect();
      for (const vu of vinculos) {
        const unidad = await ctx.db.get(vu.unidadId);
        if (unidad) unidades.push({ unidad, vinculo: vu.vinculo });
      }
    }

    return { conversacion, user: usuarioActivo, membresias, unidades };
  },
});

/** Últimos mensajes (para darle memoria a la IA). */
export const ultimosMensajes = internalQuery({
  args: { conversacionId: v.id("waConversations"), n: v.number() },
  handler: async (ctx, args) => {
    const mensajes = await ctx.db
      .query("waMessages")
      .withIndex("by_conversacion", (q) =>
        q.eq("conversacionId", args.conversacionId),
      )
      .order("desc")
      .take(Math.min(args.n, 20));
    return mensajes.reverse();
  },
});

// ─────────────────────────────────────────────────────────────
// Helpers puros del router
// ─────────────────────────────────────────────────────────────

const pesos = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function fechaLarga(ts: number, timezone: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "long",
    timeZone: timezone,
  }).format(new Date(ts));
}

function hoyEn(timezone: string): string {
  // en-CA da YYYY-MM-DD directamente.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizarComando(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** "15/08/2026", "15-08-2026" o "2026-08-15" → "2026-08-15" | null */
function parseFecha(texto: string): string | null {
  const t = texto.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const mes = Number(mo);
    const dia = Number(d);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    return `${y}-${mo!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  return null;
}

/** "14:00-18:00", "14 a 18", "9:30 - 12:00" → ["14:00","18:00"] | null */
function parseRangoHoras(texto: string): [string, string] | null {
  const m = texto
    .trim()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(?:-|a|hasta)\s*(\d{1,2})(?::(\d{2}))?$/i);
  if (!m) return null;
  const h1 = Number(m[1]);
  const h2 = Number(m[3]);
  if (h1 > 23 || h2 > 24) return null;
  const inicio = `${String(h1).padStart(2, "0")}:${m[2] ?? "00"}`;
  const fin = `${String(h2).padStart(2, "0")}:${m[4] ?? "00"}`;
  if (fin <= inicio) return null;
  return [inicio, fin];
}

type CtxBot = {
  conversacion: Doc<"waConversations">;
  user: Doc<"users"> | null;
  membresias: Array<{
    membership: Doc<"memberships">;
    condominio: Doc<"condominios">;
  }>;
  unidades: Array<{ unidad: Doc<"unidades">; vinculo: string }>;
};

// ─────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────

export const procesarEntrante = internalAction({
  args: {
    conversacionId: v.id("waConversations"),
    tipo: v.string(),
    texto: v.optional(v.string()),
    /** id del botón/fila elegida en un mensaje interactivo. */
    interactiveId: v.optional(v.string()),
    media: v.optional(
      v.object({
        link: v.string(),
        mimeType: v.optional(v.string()),
        filename: v.optional(v.string()),
        caption: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const datos = await ctx.runQuery(internal.whatsapp.contextoConversacion, {
      conversacionId: args.conversacionId,
    });
    if (!datos) return null;

    const enviar = async (payload: Record<string, unknown> & { to: string }) => {
      const tipo = (payload as { type?: string }).type ?? "text";
      const contenido = JSON.stringify(
        (payload as Record<string, unknown>)[tipo] ?? payload,
      );
      try {
        const res = await enviarMensaje(payload);
        await ctx.runMutation(internal.whatsapp.registrarSaliente, {
          conversacionId: args.conversacionId,
          tipo,
          contenido,
          ycloudMessageId: res.id,
        });
      } catch (e) {
        await ctx.runMutation(internal.whatsapp.registrarSaliente, {
          conversacionId: args.conversacionId,
          tipo,
          contenido,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    };

    const to = datos.conversacion.telefono;
    const setConv = (cambios: {
      paso?: string;
      contexto?: unknown;
      condominioId?: Id<"condominios">;
      membershipId?: Id<"memberships">;
    }) =>
      ctx.runMutation(internal.whatsapp.setConversacion, {
        conversacionId: args.conversacionId,
        ...cambios,
      });

    // 1) Número no registrado: mensaje informativo y nada más.
    if (!datos.user) {
      await enviar(
        msgTexto(
          to,
          "👋 Hola. Este es el canal de *Vekino*.\n\nNo encontramos tu número en la plataforma. Pídele a la administración de tu conjunto que registre o actualice tu teléfono, y con gusto te atiendo por aquí.",
        ),
      );
      return null;
    }

    // 2) Sin membresías activas.
    if (datos.membresias.length === 0) {
      await enviar(
        msgTexto(
          to,
          "Tu cuenta no tiene un conjunto activo asociado. Comunícate con tu administración.",
        ),
      );
      return null;
    }

    // 3) Resolver condominio activo de la conversación.
    let activa = datos.membresias.find(
      (m) => m.membership._id === datos.conversacion.membershipId,
    );
    if (!activa && datos.membresias.length === 1) {
      activa = datos.membresias[0]!;
      await setConv({
        condominioId: activa.condominio._id,
        membershipId: activa.membership._id,
      });
    }

    const nombre = datos.user.firstName ?? datos.user.name.split(" ")[0] ?? "";
    const accion = args.interactiveId;
    const texto = args.texto ?? "";
    const comando = normalizarComando(texto);

    // Cambio de condominio elegido por lista: fijarlo y caer al menú.
    let mostrarMenuTrasElegirCondominio = false;
    if (accion?.startsWith("condo:")) {
      const membershipId = accion.slice("condo:".length) as Id<"memberships">;
      const elegida = datos.membresias.find((m) => m.membership._id === membershipId);
      if (elegida) {
        await setConv({
          condominioId: elegida.condominio._id,
          membershipId: elegida.membership._id,
          paso: "menu",
          contexto: null,
        });
        activa = elegida;
        mostrarMenuTrasElegirCondominio = true;
      }
    }

    if (!activa) {
      // Varios condominios y ninguno elegido aún.
      await enviar(
        msgLista(
          to,
          `Hola ${nombre} 👋 ¿Sobre cuál conjunto quieres hablar?`,
          "Elegir conjunto",
          datos.membresias.map((m) => ({
            id: `condo:${m.membership._id}`,
            title: m.condominio.name.slice(0, 24),
          })),
        ),
      );
      await setConv({ paso: "elegir_condominio" });
      return null;
    }

    const condominio = activa.condominio;
    const membership = activa.membership;
    const timezone = condominio.timezone ?? "America/Bogota";
    const contexto = (datos.conversacion.contexto ?? {}) as Record<string, any>;
    const paso = datos.conversacion.paso;

    async function enviarMenu(nombreCondominio?: string) {
      await enviar(
        msgLista(
          to,
          `Hola ${nombre} 👋 Soy el asistente de *${nombreCondominio ?? condominio.name}*. ¿En qué te ayudo?`,
          "Ver opciones",
          [
            { id: "menu:factura", title: "💰 Estado de cuenta", description: "Tu factura de administración" },
            { id: "menu:reserva", title: "🏝 Reservar zona común", description: "Salón social, BBQ y más" },
            { id: "menu:comprobante", title: "🧾 Enviar comprobante", description: "Reporta tu pago con una foto" },
            { id: "menu:problema", title: "🛠 Reportar un problema", description: "Queja, petición o daño" },
            { id: "menu:consulta", title: "💬 Otra consulta", description: "Pregúntame lo que necesites" },
          ],
        ),
      );
      await setConv({ paso: "menu", contexto: null });
    }

    /** Unidad de trabajo: la única, la elegida antes, o pedimos elegir. */
    async function resolverUnidad(pendiente: string): Promise<Doc<"unidades"> | null> {
      if (contexto.unidadId) {
        const u = datos!.unidades.find((x) => x.unidad._id === contexto.unidadId);
        if (u) return u.unidad;
      }
      if (datos!.unidades.length === 1) return datos!.unidades[0]!.unidad;
      if (datos!.unidades.length === 0) {
        await enviar(
          msgTexto(
            to,
            "No encontré unidades vinculadas a tu cuenta en este conjunto. Escríbele a tu administración para que lo corrija.",
          ),
        );
        return null;
      }
      await enviar(
        msgLista(
          to,
          "¿Sobre cuál unidad?",
          "Elegir unidad",
          datos!.unidades.map((x) => ({
            id: `unidad:${x.unidad._id}`,
            title: [x.unidad.torre, x.unidad.numero].filter(Boolean).join(" ").slice(0, 24) || x.unidad.numero,
            description: x.vinculo,
          })),
        ),
      );
      await setConv({
        paso: "elegir_unidad",
        contexto: { ...contexto, pendiente },
      });
      return null;
    }

    if (mostrarMenuTrasElegirCondominio) {
      await enviarMenu();
      return null;
    }

    // ── Comprobante: cualquier imagen/PDF entrante se trata como comprobante ──
    if (args.media && (args.tipo === "image" || args.tipo === "document")) {
      const unidad = await resolverUnidad("media");
      if (!unidad) {
        if (datos.unidades.length > 1) {
          // guardamos la media para procesarla al elegir unidad
          await setConv({
            paso: "elegir_unidad",
            contexto: { ...contexto, pendiente: "media", media: args.media },
          });
        }
        return null;
      }
      await procesarComprobante(unidad, args.media);
      return null;
    }

    async function procesarComprobante(
      unidad: Doc<"unidades">,
      media: { link: string; mimeType?: string; filename?: string; caption?: string },
    ) {
      try {
        const subido: { key: string; publicUrl: string } = await ctx.runAction(
          internal.files.uploadFromUrl,
          {
            url: media.link,
            folder: `comprobantes/${condominio._id}`,
            fileName: media.filename,
            contentType: media.mimeType,
            conApiKeyYCloud: true,
          },
        );
        const factura = await ctx.runQuery(
          internal.soportesPago.facturaVigenteDeUnidad,
          { unidadId: unidad._id },
        );
        await ctx.runMutation(internal.soportesPago.crearDesdeBot, {
          condominioId: condominio._id,
          unidadId: unidad._id,
          facturaId: factura?._id,
          userId: datos!.user!._id,
          telefono: to,
          url: subido.publicUrl,
          mimeType: media.mimeType,
          nota: media.caption,
        });
        await enviar(
          msgTexto(
            to,
            `🧾 ¡Recibido! Tu comprobante quedó *pendiente de revisión* por la administración${factura ? ` (factura ${factura.numeroFactura})` : ""}.\n\nTe avisaremos cuando lo confirmen. Escribe *menú* si necesitas algo más.`,
          ),
        );
        await setConv({ paso: "menu", contexto: { unidadId: unidad._id } });
      } catch {
        await enviar(
          msgTexto(
            to,
            "😕 No pude guardar el comprobante. Inténtalo de nuevo en unos minutos o envíalo a tu administración.",
          ),
        );
      }
    }

    // ── Selección de unidad pendiente ──
    if (accion?.startsWith("unidad:")) {
      const unidadId = accion.slice("unidad:".length);
      const elegida = datos.unidades.find((x) => x.unidad._id === unidadId);
      if (!elegida) return null;
      const nuevoContexto = { ...contexto, unidadId };
      await setConv({ contexto: nuevoContexto });
      contexto.unidadId = unidadId;
      const pendiente = contexto.pendiente as string | undefined;
      if (pendiente === "media" && contexto.media) {
        await procesarComprobante(elegida.unidad, contexto.media);
      } else if (pendiente) {
        await manejarAccion(pendiente);
      } else {
        await enviarMenu();
      }
      return null;
    }

    // ── Acciones del menú y botones ──
    async function manejarAccion(id: string): Promise<void> {
      if (id === "menu:inicio") {
        await enviarMenu();
        return;
      }

      if (id === "menu:factura") {
        const unidad = await resolverUnidad("menu:factura");
        if (!unidad) return;
        const factura = await ctx.runQuery(
          internal.soportesPago.facturaVigenteDeUnidad,
          { unidadId: unidad._id },
        );
        if (!factura) {
          await enviar(
            msgTexto(to, `No encontré facturas para la unidad ${unidad.numero}. 🎉`),
          );
          return;
        }
        const conDescuento =
          factura.totalConDescuento != null && Date.now() <= factura.fechaVencimiento;
        const monto = conDescuento ? factura.totalConDescuento! : factura.totalAPagar;
        const lineas = [
          `📄 *Factura ${factura.numeroFactura}* — ${factura.periodoLabel}`,
          `Unidad: ${[unidad.torre, unidad.numero].filter(Boolean).join(" ")}`,
          `Estado: *${factura.estado.replace("_", " ")}*`,
          `Total a pagar: *${pesos.format(monto)}*${conDescuento ? " (con descuento por pronto pago)" : ""}`,
          `Vence: ${fechaLarga(factura.fechaVencimiento, timezone)}`,
        ];
        if (factura.estado === "pagada" || factura.estado === "saldo_a_favor") {
          await enviar(msgTexto(to, `${lineas.join("\n")}\n\n✅ Estás al día. ¡Gracias!`));
          return;
        }
        await enviar(msgTexto(to, lineas.join("\n")));
        if (factura.pdfUrl) {
          await enviar(
            msgDocumento(to, factura.pdfUrl, {
              filename: `${factura.numeroFactura}.pdf`,
              caption: "Tu factura en PDF",
            }),
          );
        }
        await enviar(
          msgBotones(to, "¿Qué quieres hacer?", [
            { id: `pagar:${factura._id}`, title: "💳 Pagar en línea" },
            { id: "menu:comprobante", title: "🧾 Ya pagué" },
            { id: "menu:inicio", title: "Volver al menú" },
          ]),
        );
        await setConv({ paso: "menu", contexto: { unidadId: unidad._id } });
        return;
      }

      if (id.startsWith("pagar:")) {
        const facturaId = id.slice("pagar:".length) as Id<"facturas">;
        try {
          const pago: { pagoId: string; redirectUrl: string } = await ctx.runAction(
            internal.pagos.crearPagoFacturaBot,
            { facturaId, userId: datos!.user!._id },
          );
          await enviar(
            msgTexto(
              to,
              `💳 Paga de forma segura con PSE o tarjeta en este enlace:\n\n${pago.redirectUrl}\n\nCuando el banco confirme, te aviso por aquí. ✅`,
            ),
          );
        } catch (e) {
          const motivo = e instanceof Error ? e.message : "";
          await enviar(
            msgTexto(
              to,
              motivo.includes("pagada")
                ? "Esa factura ya figura pagada. ✅"
                : "😕 No pude generar el enlace de pago en este momento. Intenta más tarde o escribe *menú*.",
            ),
          );
        }
        return;
      }

      if (id === "menu:comprobante") {
        await enviar(
          msgTexto(
            to,
            "🧾 Envíame la *foto o PDF* del comprobante de tu pago y lo dejo registrado para revisión de la administración.",
          ),
        );
        await setConv({ paso: "esperando_comprobante", contexto });
        return;
      }

      if (id === "menu:reserva") {
        const zonas: Array<Doc<"zonasComunes">> = await ctx.runQuery(
          internal.reservas.zonasActivas,
          { condominioId: condominio._id },
        );
        if (zonas.length === 0) {
          await enviar(
            msgTexto(to, "Este conjunto no tiene zonas comunes reservables por ahora."),
          );
          return;
        }
        await enviar(
          msgLista(
            to,
            "🏝 ¿Qué zona quieres reservar?",
            "Ver zonas",
            zonas.map((z) => ({
              id: `zona:${z._id}`,
              title: z.nombre.slice(0, 24),
              description: z.descripcion?.slice(0, 72),
            })),
          ),
        );
        await setConv({ paso: "reserva:zona", contexto });
        return;
      }

      if (id.startsWith("zona:")) {
        const zonaId = id.slice("zona:".length);
        await setConv({
          paso: "reserva:fecha",
          contexto: { ...contexto, reserva: { zonaId } },
        });
        await enviar(
          msgTexto(to, "📅 ¿Para qué fecha? Escríbela así: *DD/MM/AAAA* (ej: 15/09/2026)"),
        );
        return;
      }

      if (id === "reserva:confirmar") {
        const draft = contexto.reserva;
        const unidad = await resolverUnidad("reserva:confirmar");
        if (!unidad || !draft?.zonaId || !draft?.fecha || !draft?.horaInicio || !draft?.horaFin) {
          return;
        }
        try {
          const res: { reservaId: string } = await ctx.runMutation(
            internal.reservas.createFromBot,
            {
              userId: datos!.user!._id,
              condominioId: condominio._id,
              unidadId: unidad._id,
              zonaId: draft.zonaId as Id<"zonasComunes">,
              fecha: draft.fecha,
              horaInicio: draft.horaInicio,
              horaFin: draft.horaFin,
              observaciones: "Creada por WhatsApp",
            },
          );
          void res;
          await enviar(
            msgTexto(
              to,
              `✅ ¡Listo! Tu reserva quedó registrada y está *pendiente de aprobación* por la administración.\n\nTe confirmo por aquí cuando la aprueben. Escribe *menú* para más opciones.`,
            ),
          );
          await setConv({ paso: "menu", contexto: { unidadId: unidad._id } });
        } catch (e) {
          await enviar(
            msgTexto(
              to,
              `😕 No pude crear la reserva: ${e instanceof Error ? e.message : "error"}.\n\nEscribe *menú* para intentarlo de nuevo.`,
            ),
          );
          await setConv({ paso: "menu", contexto: {} });
        }
        return;
      }

      if (id === "reserva:cancelar") {
        await enviar(msgTexto(to, "Reserva descartada. 👍"));
        await enviarMenu();
        return;
      }

      if (id === "menu:problema") {
        await enviar(
          msgTexto(
            to,
            "🛠 Cuéntame qué pasa: escribe tu petición, queja o el problema que quieres reportar.",
          ),
        );
        await setConv({ paso: "problema:descripcion", contexto });
        return;
      }

      if (id === "problema:condominio" || id === "problema:app") {
        const descripcion = (contexto.problema ?? "").toString();
        if (!descripcion) {
          await enviarMenu();
          return;
        }
        const asunto =
          descripcion.length > 60 ? `${descripcion.slice(0, 57)}...` : descripcion;
        try {
          if (id === "problema:condominio") {
            const r: { radicado: string } = await ctx.runMutation(
              internal.pqrs.crearInterno,
              {
                condominioId: condominio._id,
                userId: datos!.user!._id,
                tipo: "peticion",
                asunto,
                descripcion: `${descripcion}\n\n— Recibido por WhatsApp`,
                unidadNumero: datos!.unidades[0]?.unidad.numero,
              },
            );
            await enviar(
              msgTexto(
                to,
                `📋 Tu solicitud quedó radicada como *${r.radicado}*.\n\nLa administración te responderá pronto. Escribe *menú* si necesitas algo más.`,
              ),
            );
          } else {
            await ctx.runMutation(internal.soporte.crearInterno, {
              userId: datos!.user!._id,
              condominioId: condominio._id,
              categoria: "app",
              asunto,
              mensaje: `${descripcion}\n\n— Recibido por WhatsApp`,
            });
            await enviar(
              msgTexto(
                to,
                "🎧 Tu reporte llegó al equipo de soporte de Vekino. Te contactaremos pronto.\n\nEscribe *menú* si necesitas algo más.",
              ),
            );
          }
        } catch {
          await enviar(
            msgTexto(to, "😕 No pude registrar tu reporte. Inténtalo de nuevo más tarde."),
          );
        }
        await setConv({ paso: "menu", contexto: {} });
        return;
      }

      if (id === "menu:consulta") {
        await enviar(msgTexto(to, "💬 Claro, escríbeme tu pregunta."));
        await setConv({ paso: "consulta", contexto });
        return;
      }

      // Acción desconocida: menú.
      await enviarMenu();
    }

    if (accion) {
      await manejarAccion(accion);
      return null;
    }

    // ── Texto libre ──

    if (["hola", "menu", "inicio", "buenas", "volver", "hi"].includes(comando) || paso === "nueva") {
      await enviarMenu();
      return null;
    }

    if (paso === "reserva:fecha") {
      const fecha = parseFecha(texto);
      if (!fecha) {
        await enviar(msgTexto(to, "No entendí la fecha 😅. Escríbela así: *15/09/2026*"));
        return null;
      }
      if (fecha < hoyEn(timezone)) {
        await enviar(msgTexto(to, "Esa fecha ya pasó. Elige una fecha futura. 📅"));
        return null;
      }
      await setConv({
        paso: "reserva:hora",
        contexto: { ...contexto, reserva: { ...contexto.reserva, fecha } },
      });
      await enviar(
        msgTexto(to, "🕐 ¿En qué horario? Escríbelo así: *14:00-18:00*"),
      );
      return null;
    }

    if (paso === "reserva:hora") {
      const rango = parseRangoHoras(texto);
      if (!rango) {
        await enviar(
          msgTexto(to, "No entendí el horario 😅. Escríbelo así: *14:00-18:00*"),
        );
        return null;
      }
      const draft = { ...contexto.reserva, horaInicio: rango[0], horaFin: rango[1] };
      const disponible: { ok: boolean; motivo?: string } = await ctx.runQuery(
        internal.reservas.verificarDisponibilidad,
        {
          zonaId: draft.zonaId as Id<"zonasComunes">,
          fecha: draft.fecha,
          horaInicio: draft.horaInicio,
          horaFin: draft.horaFin,
        },
      );
      if (!disponible.ok) {
        await enviar(
          msgTexto(
            to,
            `😕 ${disponible.motivo ?? "Ese horario no está disponible."}\n\nPrueba con otro horario (*14:00-18:00*) o escribe *menú*.`,
          ),
        );
        return null;
      }
      await setConv({
        paso: "reserva:confirmar",
        contexto: { ...contexto, reserva: draft },
      });
      const [d1, m1, y1] = draft.fecha.split("-").reverse();
      await enviar(
        msgBotones(
          to,
          `¿Confirmas la reserva?\n\n📅 ${d1}/${m1}/${y1}\n🕐 ${draft.horaInicio} a ${draft.horaFin}`,
          [
            { id: "reserva:confirmar", title: "✅ Confirmar" },
            { id: "reserva:cancelar", title: "❌ Cancelar" },
          ],
        ),
      );
      return null;
    }

    if (paso === "problema:descripcion" && texto.trim()) {
      await setConv({
        paso: "problema:destino",
        contexto: { ...contexto, problema: texto.trim().slice(0, 2000) },
      });
      await enviar(
        msgBotones(to, "¿Con quién va tu reporte?", [
          { id: "problema:condominio", title: "🏢 Mi conjunto" },
          { id: "problema:app", title: "📱 La app Vekino" },
        ]),
      );
      return null;
    }

    if (paso === "esperando_comprobante") {
      await enviar(
        msgTexto(to, "Quedo atento a la *foto o PDF* del comprobante. 🧾"),
      );
      return null;
    }

    // Texto libre sin paso específico: intentos de intención por palabra clave.
    if (/factur|deuda|cuanto debo|estado de cuenta|pagar|pago/.test(comando)) {
      await manejarAccion("menu:factura");
      return null;
    }
    if (/reserv|salon|bbq|piscina|cancha|gimnasio/.test(comando)) {
      await manejarAccion("menu:reserva");
      return null;
    }
    if (/comprobante|soporte de pago|transferencia|consign/.test(comando)) {
      await manejarAccion("menu:comprobante");
      return null;
    }
    if (/problema|queja|reclamo|dano|daño|reportar/.test(comando)) {
      await manejarAccion("menu:problema");
      return null;
    }

    // IA para el resto (si hay API key); si no, menú.
    const respuestaIA = await responderConIA(ctx, args.conversacionId, datos, texto);
    if (respuestaIA) {
      await enviar(msgTexto(to, respuestaIA));
      await setConv({ paso: "consulta", contexto });
    } else {
      await enviar(
        msgTexto(to, "No estoy seguro de haberte entendido. 🤔 Aquí va el menú:"),
      );
      await enviarMenu();
    }
    return null;
  },
});

// ─────────────────────────────────────────────────────────────
// IA (Claude) para consultas de texto libre
// ─────────────────────────────────────────────────────────────

async function responderConIA(
  ctx: { runQuery: any },
  conversacionId: Id<"waConversations">,
  datos: CtxBot,
  pregunta: string,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !pregunta.trim()) return null;

  const historial: Array<Doc<"waMessages">> = await ctx.runQuery(
    internal.whatsapp.ultimosMensajes,
    { conversacionId, n: 10 },
  );

  const condominio = datos.membresias.find(
    (m) => m.membership._id === datos.conversacion.membershipId,
  )?.condominio;

  const system = [
    `Eres el asistente de WhatsApp de Vekino, la plataforma de administración del conjunto residencial "${condominio?.name ?? "—"}" en Colombia.`,
    `Hablas con ${datos.user?.name ?? "un residente"}. Responde en español, cálido y BREVE (máximo 3 frases, es WhatsApp).`,
    "Puedes orientar sobre: facturas de administración y pagos (opción 'Estado de cuenta' del menú), reservas de zonas comunes, envío de comprobantes de pago, y reportes de problemas (PQRS).",
    "Si piden datos exactos (montos, fechas, disponibilidad) diles que usen la opción del menú correspondiente escribiendo *menú*.",
    "Nunca inventes montos, fechas ni normas del conjunto. Si no sabes, dilo y sugiere contactar a la administración.",
  ].join("\n");

  const mensajes = historial
    .filter((m) => m.tipo === "text" && m.contenido.trim())
    .slice(-8)
    .map((m) => ({
      role: m.direccion === "entrante" ? ("user" as const) : ("assistant" as const),
      content: m.contenido.slice(0, 1000),
    }));
  if (mensajes.length === 0 || mensajes[mensajes.length - 1]!.role !== "user") {
    mensajes.push({ role: "user", content: pregunta.slice(0, 1000) });
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system,
        messages: mensajes,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const textoIA = data.content
      ?.filter((b) => b.type === "text" && b.text)
      .map((b) => b.text)
      .join("\n")
      .trim();
    return textoIA || null;
  } catch {
    return null;
  }
}
