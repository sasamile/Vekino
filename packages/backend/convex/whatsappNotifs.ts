import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { enviarMensaje, msgPlantilla, msgTexto } from "./lib/ycloud";

/**
 * Notificaciones salientes puntuales por WhatsApp (iniciadas por nosotros).
 *
 * Regla de WhatsApp: fuera de la ventana de 24 h desde el último mensaje DEL
 * usuario solo se pueden enviar plantillas pre-aprobadas por Meta. Aquí se
 * decide el canal: texto libre si la ventana está abierta, plantilla si no
 * (y si hay plantilla configurada); en último caso no se envía y se deja
 * constancia en waEnvios.
 */

const pesos = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export const datosPagoAprobado = internalQuery({
  args: { pagoId: v.id("pagos") },
  handler: async (ctx, args) => {
    const pago = await ctx.db.get(args.pagoId);
    if (!pago || pago.estado !== "aprobada") return null;

    const factura = await ctx.db.get(pago.facturaId);
    const condominio = await ctx.db.get(pago.condominioId);
    if (!factura || !condominio || !condominio.isActive) return null;
    // Gate por tenant: sin el módulo "whatsapp" no se notifica nada.
    if (!condominio.activeModules.includes("whatsapp")) return null;

    let userId = pago.userId ?? null;
    if (!userId && factura.membershipId) {
      const membership = await ctx.db.get(factura.membershipId);
      userId = membership?.userId ?? null;
    }
    const user = userId ? await ctx.db.get(userId) : null;
    const telefono = user?.telefonoE164 ?? null;

    const conversacion = telefono
      ? await ctx.db
          .query("waConversations")
          .withIndex("by_telefono", (q) => q.eq("telefono", telefono))
          .first()
      : null;

    return {
      pago,
      factura,
      condominio,
      userId,
      telefono,
      conversacionId: conversacion?._id ?? null,
      ventanaAbierta:
        (conversacion?.ventanaExpiraAt ?? 0) > Date.now(),
    };
  },
});

export const registrarEnvio = internalMutation({
  args: {
    tipo: v.union(
      v.literal("comunicado"),
      v.literal("pago_aprobado"),
      v.literal("soporte_revisado"),
      v.literal("manual"),
    ),
    comunicadoId: v.optional(v.id("comunicados")),
    condominioId: v.id("condominios"),
    userId: v.optional(v.id("users")),
    telefono: v.optional(v.string()),
    template: v.string(),
    ycloudMessageId: v.optional(v.string()),
    estado: v.union(
      v.literal("enviado"),
      v.literal("fallido"),
      v.literal("sin_telefono"),
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("waEnvios", { ...args, createdAt: Date.now() });
  },
});

export const datosSoporteRevisado = internalQuery({
  args: { soporteId: v.id("soportesPago") },
  handler: async (ctx, args) => {
    const soporte = await ctx.db.get(args.soporteId);
    if (!soporte || soporte.estado === "pendiente_revision") return null;

    const condominio = await ctx.db.get(soporte.condominioId);
    if (!condominio || !condominio.isActive) return null;
    if (!condominio.activeModules.includes("whatsapp")) return null;

    const user = soporte.userId ? await ctx.db.get(soporte.userId) : null;
    const telefono = soporte.telefono ?? user?.telefonoE164 ?? null;
    const factura = soporte.facturaId ? await ctx.db.get(soporte.facturaId) : null;

    const conversacion = telefono
      ? await ctx.db
          .query("waConversations")
          .withIndex("by_telefono", (q) => q.eq("telefono", telefono))
          .first()
      : null;

    return {
      soporte,
      condominio,
      factura,
      userId: soporte.userId ?? null,
      telefono,
      conversacionId: conversacion?._id ?? null,
      ventanaAbierta: (conversacion?.ventanaExpiraAt ?? 0) > Date.now(),
    };
  },
});

/**
 * "Tu comprobante fue aprobado/rechazado" — programado desde
 * soportesPago.aprobar/rechazar. El bot le promete al residente que le
 * avisamos del resultado; esta action cumple esa promesa.
 */
export const soporteRevisado = internalAction({
  args: { soporteId: v.id("soportesPago") },
  handler: async (ctx, args) => {
    const datos = await ctx.runQuery(internal.whatsappNotifs.datosSoporteRevisado, {
      soporteId: args.soporteId,
    });
    if (!datos) return null;

    const aprobado = datos.soporte.estado === "aprobado";
    const resultado = aprobado ? "aprobado" : "rechazado";
    const plantilla = process.env.YCLOUD_TEMPLATE_COMPROBANTE;

    const registrar = (
      estado: "enviado" | "fallido" | "sin_telefono",
      extras: { ycloudMessageId?: string; error?: string; template?: string } = {},
    ) =>
      ctx.runMutation(internal.whatsappNotifs.registrarEnvio, {
        tipo: "soporte_revisado",
        condominioId: datos.condominio._id,
        userId: datos.userId ?? undefined,
        telefono: datos.telefono ?? undefined,
        template: extras.template ?? "(texto libre)",
        ycloudMessageId: extras.ycloudMessageId,
        estado,
        error: extras.error,
      });

    if (!datos.telefono) {
      await registrar("sin_telefono");
      return null;
    }

    const detalleFactura = datos.factura
      ? ` de la factura ${datos.factura.numeroFactura}`
      : "";
    const nota = datos.soporte.notaRevision
      ? `\n\nNota de la administración: ${datos.soporte.notaRevision}`
      : "";
    const cuerpo = aprobado
      ? `✅ *¡Comprobante aprobado!*\n\nLa administración de ${datos.condominio.name} confirmó tu pago${detalleFactura}. ¡Gracias por estar al día! 🙌${nota}`
      : `❌ *Comprobante rechazado*\n\nLa administración de ${datos.condominio.name} no pudo validar tu comprobante${detalleFactura}.${nota}\n\nPuedes enviar otro comprobante por aquí o comunicarte con tu administración.`;

    try {
      if (datos.ventanaAbierta) {
        const res = await enviarMensaje(msgTexto(datos.telefono, cuerpo));
        if (datos.conversacionId) {
          await ctx.runMutation(internal.whatsapp.registrarSaliente, {
            conversacionId: datos.conversacionId,
            tipo: "text",
            contenido: cuerpo,
            ycloudMessageId: res.id,
          });
        }
        await registrar("enviado", { ycloudMessageId: res.id });
      } else if (plantilla) {
        // Plantilla con 2 variables de body: {{1}} condominio, {{2}} resultado.
        const res = await enviarMensaje(
          msgPlantilla(datos.telefono, plantilla, "es", [
            datos.condominio.name,
            resultado,
          ]),
        );
        await registrar("enviado", { ycloudMessageId: res.id, template: plantilla });
      } else {
        await registrar("fallido", {
          error: "Ventana de 24h cerrada y sin YCLOUD_TEMPLATE_COMPROBANTE",
        });
      }
    } catch (e) {
      await registrar("fallido", {
        error: e instanceof Error ? e.message : String(e),
        template: plantilla,
      });
    }
    return null;
  },
});

/**
 * "✅ Tu pago fue aprobado" — programado desde pagos.aplicarEstado cuando la
 * pasarela Aval confirma.
 */
export const pagoAprobado = internalAction({
  args: { pagoId: v.id("pagos") },
  handler: async (ctx, args) => {
    const datos = await ctx.runQuery(internal.whatsappNotifs.datosPagoAprobado, {
      pagoId: args.pagoId,
    });
    if (!datos) return null;

    const registrar = (
      estado: "enviado" | "fallido" | "sin_telefono",
      extras: { ycloudMessageId?: string; error?: string; template?: string } = {},
    ) =>
      ctx.runMutation(internal.whatsappNotifs.registrarEnvio, {
        tipo: "pago_aprobado",
        condominioId: datos.condominio._id,
        userId: datos.userId ?? undefined,
        telefono: datos.telefono ?? undefined,
        template: extras.template ?? "(texto libre)",
        ycloudMessageId: extras.ycloudMessageId,
        estado,
        error: extras.error,
      });

    if (!datos.telefono) {
      await registrar("sin_telefono");
      return null;
    }

    const monto = pesos.format(datos.pago.monto);
    const plantilla = process.env.YCLOUD_TEMPLATE_PAGO_APROBADO;

    try {
      if (datos.ventanaAbierta) {
        const res = await enviarMensaje(
          msgTexto(
            datos.telefono,
            `✅ *¡Pago confirmado!*\n\nRecibimos tu pago de *${monto}* de la factura ${datos.factura.numeroFactura} (${datos.condominio.name}).\n\n¡Gracias por estar al día! 🙌`,
          ),
        );
        if (datos.conversacionId) {
          await ctx.runMutation(internal.whatsapp.registrarSaliente, {
            conversacionId: datos.conversacionId,
            tipo: "text",
            contenido: `Pago confirmado ${monto} (${datos.factura.numeroFactura})`,
            ycloudMessageId: res.id,
          });
        }
        await registrar("enviado", { ycloudMessageId: res.id });
      } else if (plantilla) {
        // Plantilla con 3 variables de body: {{1}} condominio, {{2}} factura, {{3}} monto.
        const res = await enviarMensaje(
          msgPlantilla(datos.telefono, plantilla, "es", [
            datos.condominio.name,
            datos.factura.numeroFactura,
            monto,
          ]),
        );
        await registrar("enviado", { ycloudMessageId: res.id, template: plantilla });
      } else {
        await registrar("fallido", {
          error: "Ventana de 24h cerrada y sin YCLOUD_TEMPLATE_PAGO_APROBADO",
        });
      }
    } catch (e) {
      await registrar("fallido", {
        error: e instanceof Error ? e.message : String(e),
        template: plantilla,
      });
    }
    return null;
  },
});
