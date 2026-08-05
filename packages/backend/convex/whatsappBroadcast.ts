import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { OperationalRole } from "./model/roles";
import { enviarMensaje, msgPlantilla } from "./lib/ycloud";

/**
 * Fan-out de WhatsApp cuando un admin publica un comunicado.
 *
 * Se programa desde comunicados.create (scheduler.runAfter(0, ...)) y envía
 * una plantilla pre-aprobada a cada residente de la audiencia del comunicado.
 *
 * Contrato de la plantilla (env YCLOUD_TEMPLATE_COMUNICADO): debe estar
 * aprobada en Meta con 2 variables de body:
 *   {{1}} = nombre del condominio
 *   {{2}} = título del comunicado
 *
 * Gating por tenant: solo se envía si el condominio está activo y tiene el
 * módulo "whatsapp" en activeModules. Idempotencia: los userId que ya tienen
 * fila en waEnvios para este comunicado se excluyen, así re-ejecutar la
 * action no duplica mensajes.
 */

type Destinatario = {
  userId: Id<"users">;
  nombre: string;
  telefono: string | null;
};

type DatosBroadcast = {
  comunicado: Doc<"comunicados">;
  condominio: Doc<"condominios">;
  destinatarios: Destinatario[];
} | null;

/** Audiencia del comunicado → roles de membership que la componen.
 *  null = cualquier membership activa (audiencia "todos"). */
const ROLES_POR_AUDIENCIA: Record<
  Doc<"comunicados">["audiencia"],
  OperationalRole[] | null
> = {
  todos: null,
  propietario: ["propietario", "apoderado"],
  arrendatario: ["arrendatario"],
  residente: ["residente"],
  junta_directiva: ["junta_directiva"],
  guardia: ["guardia"],
};

/**
 * Resuelve los destinatarios del fan-out. Devuelve null si no aplica enviar
 * (comunicado/condominio inexistente, condominio inactivo o sin módulo
 * "whatsapp").
 */
export const destinatariosComunicado = internalQuery({
  args: { comunicadoId: v.id("comunicados") },
  handler: async (ctx, args): Promise<DatosBroadcast> => {
    const comunicado = await ctx.db.get(args.comunicadoId);
    if (!comunicado) return null;

    const condominio = await ctx.db.get(comunicado.condominioId);
    if (
      !condominio ||
      !condominio.isActive ||
      !condominio.activeModules.includes("whatsapp")
    ) {
      return null; // gating por tenant
    }

    const rolesAudiencia = ROLES_POR_AUDIENCIA[comunicado.audiencia];

    // Memberships activas del condominio que caen en la audiencia.
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_condominio", (q) => q.eq("condominioId", condominio._id))
      .collect();
    const enAudiencia = memberships.filter(
      (m) =>
        m.isActive &&
        (rolesAudiencia === null ||
          m.roles.some((r) => rolesAudiencia.includes(r))),
    );

    // Idempotencia: excluir usuarios ya registrados en waEnvios para este comunicado.
    const enviosPrevios = await ctx.db
      .query("waEnvios")
      .withIndex("by_comunicado", (q) => q.eq("comunicadoId", args.comunicadoId))
      .collect();
    const yaNotificados = new Set(
      enviosPrevios.map((e) => e.userId).filter(Boolean),
    );

    // Un destinatario por usuario (dedupe por si hay memberships repetidas).
    const destinatarios = new Map<Id<"users">, Destinatario>();
    for (const m of enAudiencia) {
      if (destinatarios.has(m.userId) || yaNotificados.has(m.userId)) continue;
      const user = await ctx.db.get(m.userId);
      if (!user || !user.active) continue;
      destinatarios.set(m.userId, {
        userId: user._id,
        nombre: user.name,
        telefono: user.telefonoE164 ?? null,
      });
    }

    return { comunicado, condominio, destinatarios: [...destinatarios.values()] };
  },
});

/**
 * Envía la plantilla de comunicado a cada destinatario y deja constancia de
 * cada intento en waEnvios (enviado / fallido / sin_telefono).
 */
export const broadcastComunicado = internalAction({
  args: { comunicadoId: v.id("comunicados") },
  handler: async (
    ctx,
    args,
  ): Promise<{ enviados: number; fallidos: number; sinTelefono: number } | null> => {
    const datos = await ctx.runQuery(
      internal.whatsappBroadcast.destinatariosComunicado,
      { comunicadoId: args.comunicadoId },
    );
    if (!datos) return null;

    const template = process.env.YCLOUD_TEMPLATE_COMUNICADO;
    if (!template) {
      // No es un error: el tenant tiene WhatsApp pero la plantilla de
      // comunicados aún no está configurada en el deployment.
      console.log(
        "whatsappBroadcast: YCLOUD_TEMPLATE_COMUNICADO no está configurada; no se envía el fan-out.",
      );
      return null;
    }

    let enviados = 0;
    let fallidos = 0;
    let sinTelefono = 0;

    for (const dest of datos.destinatarios) {
      if (!dest.telefono) {
        sinTelefono++;
        await ctx.runMutation(internal.whatsappNotifs.registrarEnvio, {
          tipo: "comunicado",
          comunicadoId: args.comunicadoId,
          condominioId: datos.condominio._id,
          userId: dest.userId,
          template,
          estado: "sin_telefono",
        });
        continue;
      }

      try {
        const res = await enviarMensaje(
          // {{1}} condominio, {{2}} título del comunicado (ver cabecera).
          msgPlantilla(dest.telefono, template, "es", [
            datos.condominio.name,
            datos.comunicado.titulo,
          ]),
        );
        enviados++;
        await ctx.runMutation(internal.whatsappNotifs.registrarEnvio, {
          tipo: "comunicado",
          comunicadoId: args.comunicadoId,
          condominioId: datos.condominio._id,
          userId: dest.userId,
          telefono: dest.telefono,
          template,
          ycloudMessageId: res.id,
          estado: "enviado",
        });
      } catch (e) {
        fallidos++;
        await ctx.runMutation(internal.whatsappNotifs.registrarEnvio, {
          tipo: "comunicado",
          comunicadoId: args.comunicadoId,
          condominioId: datos.condominio._id,
          userId: dest.userId,
          telefono: dest.telefono,
          template,
          estado: "fallido",
          error: e instanceof Error ? e.message : String(e),
        });
      }

      // Envío secuencial con pausa corta: los fan-outs son de decenas/cientos
      // de mensajes y así no golpeamos el rate limit de YCloud.
      await new Promise((r) => setTimeout(r, 150));
    }

    return { enviados, fallidos, sinTelefono };
  },
});
