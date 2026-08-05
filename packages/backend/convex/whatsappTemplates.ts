import { v } from "convex/values";
import { action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { requirePlatformStaff } from "./model/authz";
import { ycloudRequest } from "./lib/ycloud";

/**
 * Gestión de plantillas de WhatsApp (solo staff de plataforma).
 *
 * YCloud es la fuente de verdad: no guardamos copia local (el sistema viejo
 * la guardaba y el estado se quedaba en PENDIENTE para siempre porque nadie
 * procesaba los eventos de revisión). Aquí se consulta en vivo.
 */

/** Las actions no tienen ctx.db: el chequeo de rol corre en esta query. */
export const staffCheck = internalQuery({
  args: {},
  handler: async (ctx) => {
    await requirePlatformStaff(ctx);
    return null;
  },
});

export const listar = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runQuery(internal.whatsappTemplates.staffCheck, {});
    const wabaId = process.env.YCLOUD_WABA_ID ?? "";
    const { status, json } = await ycloudRequest(
      `/whatsapp/templates?filter.wabaId=${encodeURIComponent(wabaId)}&limit=100`,
    );
    if (status >= 300) {
      throw new Error(json?.message ?? "Error consultando plantillas en YCloud");
    }
    return (json?.items ?? []) as Array<{
      id: string;
      name: string;
      language: string;
      category: string;
      status: string;
      components: unknown[];
    }>;
  },
});

export const crear = action({
  args: {
    /** Solo minúsculas, números y guion bajo (requisito de Meta). */
    nombre: v.string(),
    idioma: v.optional(v.string()),
    categoria: v.union(
      v.literal("MARKETING"),
      v.literal("UTILITY"),
      v.literal("AUTHENTICATION"),
    ),
    /** [{type: "BODY", text: "Hola {{1}}..."}, {type: "FOOTER", text: ...}, ...] */
    componentes: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.whatsappTemplates.staffCheck, {});
    if (!/^[a-z0-9_]+$/.test(args.nombre)) {
      throw new Error(
        "El nombre solo puede tener minúsculas, números y guion bajo.",
      );
    }
    const { status, json } = await ycloudRequest("/whatsapp/templates", {
      method: "POST",
      body: {
        wabaId: process.env.YCLOUD_WABA_ID ?? "",
        name: args.nombre,
        language: args.idioma ?? "es",
        category: args.categoria,
        components: args.componentes,
      },
    });
    if (status >= 300) {
      throw new Error(json?.message ?? "Error creando la plantilla en YCloud");
    }
    return json;
  },
});

export const eliminar = action({
  args: { templateId: v.string() },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.whatsappTemplates.staffCheck, {});
    const { status, json } = await ycloudRequest(
      `/whatsapp/templates/${encodeURIComponent(args.templateId)}`,
      { method: "DELETE" },
    );
    if (status >= 300) {
      throw new Error(json?.message ?? "Error eliminando la plantilla en YCloud");
    }
    return { ok: true };
  },
});
