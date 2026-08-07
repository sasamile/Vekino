import { v } from "convex/values";
import {
  query,
  mutation,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requirePlatformStaff } from "./model/authz";
import { sendBrevoEmail } from "./lib/brevo";
import {
  asuntoApoderado,
  htmlApoderado,
  textoApoderado,
} from "./lib/emailApoderado";
import { enviarMensaje, msgPlantilla } from "./lib/ycloud";
import { esCelularWhatsApp } from "./lib/telefono";

/**
 * Envíos programados (automatizaciones).
 *
 * La ejecución la agenda el scheduler de Convex con `runAt`: sale a la hora
 * exacta y no hace falta un cron barriendo la tabla. Guardamos el id del job
 * para poder cancelarlo.
 *
 * Hoy hay un solo tipo: mandarle a cada apoderado registrado su enlace
 * personal para entrar a la asamblea. Por correo funciona ya; por WhatsApp
 * depende de que Meta apruebe la plantilla `acceso_asamblea_apoderado`.
 */

const canalValidator = v.union(
  v.literal("correo"),
  v.literal("whatsapp"),
  v.literal("ambos"),
);

// ─────────────────────────────────────────────────────────────
// Lecturas para la UI
// ─────────────────────────────────────────────────────────────

export const listar = query({
  args: { condominioId: v.optional(v.id("condominios")) },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);

    const envios = args.condominioId
      ? await ctx.db
          .query("enviosProgramados")
          .withIndex("by_condominio", (q) =>
            q.eq("condominioId", args.condominioId!),
          )
          .order("desc")
          .take(100)
      : await ctx.db.query("enviosProgramados").order("desc").take(100);

    return await Promise.all(
      envios.map(async (e) => {
        const condo = await ctx.db.get(e.condominioId);
        const asamblea = e.asambleaId ? await ctx.db.get(e.asambleaId) : null;
        return {
          _id: e._id,
          condominioId: e.condominioId,
          condominioNombre: condo?.name ?? "—",
          tipo: e.tipo,
          asambleaId: (e.asambleaId as string | undefined) ?? null,
          asambleaTitulo: asamblea?.titulo ?? null,
          canal: e.canal,
          programadoPara: e.programadoPara,
          estado: e.estado,
          total: e.total,
          enviados: e.enviados,
          fallidos: e.fallidos,
          sinContacto: e.sinContacto,
          error: e.error ?? null,
          creadoPorNombre: e.creadoPorNombre,
          createdAt: e.createdAt,
        };
      }),
    );
  },
});

/** Condominios con asambleas a las que tenga sentido programarles un envío. */
export const condominiosConAsambleas = query({
  args: {},
  handler: async (ctx) => {
    await requirePlatformStaff(ctx);

    const condominios = await ctx.db
      .query("condominios")
      .withIndex("by_isActive", (q) => q.eq("isActive", true))
      .collect();

    const salida = [];
    for (const c of condominios) {
      const asambleas = await ctx.db
        .query("asambleas")
        .withIndex("by_condominio", (q) => q.eq("condominioId", c._id))
        .order("desc")
        .take(10);

      const filas = [];
      for (const a of asambleas) {
        if (a.estado === "finalizada" || a.estado === "cancelada") continue;

        const poderes = await ctx.db
          .query("poderesAsamblea")
          .withIndex("by_asamblea", (q) => q.eq("asambleaId", a._id))
          .collect();

        // Un apoderado puede tener varias unidades: se cuenta por persona.
        const porPersona = new Map<string, boolean>();
        for (const p of poderes) {
          const clave = (p.representanteUserId as string) ?? p.codigoAcceso;
          if (porPersona.has(clave)) continue;
          let tieneContacto = false;
          if (p.representanteUserId) {
            const u = await ctx.db.get(p.representanteUserId);
            tieneContacto = !!u && (!!u.email || !!u.telefonoE164);
          }
          porPersona.set(clave, tieneContacto);
        }

        filas.push({
          asambleaId: a._id,
          titulo: a.titulo,
          fecha: a.fecha,
          hora: a.hora,
          apoderados: porPersona.size,
          apoderadosConContacto: [...porPersona.values()].filter(Boolean).length,
        });
      }

      if (filas.length > 0) {
        salida.push({
          condominioId: c._id,
          condominioNombre: c.name,
          asambleas: filas,
        });
      }
    }
    return salida;
  },
});

export const detalle = query({
  args: { id: v.id("enviosProgramados") },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);
    const filas = await ctx.db
      .query("enviosProgramadosDetalle")
      .withIndex("by_envio", (q) => q.eq("envioId", args.id))
      .order("desc")
      .take(500);
    return filas.map((f) => ({
      _id: f._id,
      nombre: f.nombre,
      destino: f.destino ?? null,
      canal: f.canal,
      estado: f.estado,
      motivo: f.motivo,
      createdAt: f.createdAt,
    }));
  },
});

// ─────────────────────────────────────────────────────────────
// Programación y control
// ─────────────────────────────────────────────────────────────

export const programar = mutation({
  args: {
    condominioId: v.id("condominios"),
    tipo: v.literal("apoderados_asamblea"),
    asambleaId: v.id("asambleas"),
    canal: canalValidator,
    programadoPara: v.number(),
  },
  handler: async (ctx, args) => {
    const staff = await requirePlatformStaff(ctx);

    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea || asamblea.condominioId !== args.condominioId) {
      throw new Error("La asamblea no pertenece a ese condominio.");
    }
    if (args.canal !== "correo" && !process.env.YCLOUD_API_KEY?.trim()) {
      throw new Error("WhatsApp no está configurado (falta YCLOUD_API_KEY).");
    }

    const now = Date.now();
    // Programar hacia atrás no tiene sentido; el scheduler lo dispararía ya.
    const cuando = Math.max(args.programadoPara, now);

    const envioId = await ctx.db.insert("enviosProgramados", {
      condominioId: args.condominioId,
      tipo: args.tipo,
      asambleaId: args.asambleaId,
      canal: args.canal,
      programadoPara: cuando,
      estado: "programado",
      total: 0,
      enviados: 0,
      fallidos: 0,
      sinContacto: 0,
      creadoPorUserId: staff._id,
      creadoPorNombre: staff.name,
      createdAt: now,
      updatedAt: now,
    });

    const jobId = await ctx.scheduler.runAt(
      cuando,
      internal.automatizaciones.ejecutar,
      { envioId },
    );
    await ctx.db.patch(envioId, { scheduledFunctionId: jobId });
    return envioId;
  },
});

export const cancelar = mutation({
  args: { id: v.id("enviosProgramados") },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);
    const envio = await ctx.db.get(args.id);
    if (!envio) throw new Error("Envío no encontrado.");
    if (envio.estado !== "programado") {
      throw new Error("Solo se puede cancelar un envío que aún no ha salido.");
    }
    if (envio.scheduledFunctionId) {
      await ctx.scheduler.cancel(envio.scheduledFunctionId);
    }
    await ctx.db.patch(args.id, {
      estado: "cancelado",
      updatedAt: Date.now(),
    });
    return args.id;
  },
});

export const enviarAhora = mutation({
  args: { id: v.id("enviosProgramados") },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);
    const envio = await ctx.db.get(args.id);
    if (!envio) throw new Error("Envío no encontrado.");
    if (envio.estado !== "programado") {
      throw new Error("Este envío ya no está pendiente.");
    }
    // Se cancela el job agendado para que no salga dos veces.
    if (envio.scheduledFunctionId) {
      await ctx.scheduler.cancel(envio.scheduledFunctionId);
    }
    const jobId = await ctx.scheduler.runAfter(
      0,
      internal.automatizaciones.ejecutar,
      { envioId: args.id },
    );
    await ctx.db.patch(args.id, {
      scheduledFunctionId: jobId,
      programadoPara: Date.now(),
      updatedAt: Date.now(),
    });
    return args.id;
  },
});

// ─────────────────────────────────────────────────────────────
// Ejecución
// ─────────────────────────────────────────────────────────────

/** Todo lo que necesita el envío, resuelto en una sola lectura. */
export const datosEnvio = internalQuery({
  args: { envioId: v.id("enviosProgramados") },
  handler: async (ctx, args) => {
    const envio = await ctx.db.get(args.envioId);
    if (!envio || envio.estado !== "programado") return null;

    const condominio = await ctx.db.get(envio.condominioId);
    const asamblea = envio.asambleaId ? await ctx.db.get(envio.asambleaId) : null;
    if (!condominio || !asamblea) return null;

    const poderes = await ctx.db
      .query("poderesAsamblea")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", asamblea._id))
      .collect();

    // Una persona puede representar varias unidades: un solo mensaje por
    // persona, con todas sus unidades listadas.
    type Destinatario = {
      nombre: string;
      codigo: string;
      email?: string;
      telefono?: string;
      unidades: string[];
    };
    const porPersona = new Map<string, Destinatario>();

    for (const p of poderes) {
      const clave = (p.representanteUserId as string) ?? p.codigoAcceso;
      const existente = porPersona.get(clave);
      if (existente) {
        existente.unidades.push(p.unidadNumero);
        continue;
      }
      let email: string | undefined;
      let telefono: string | undefined;
      if (p.representanteUserId) {
        const u = await ctx.db.get(p.representanteUserId);
        if (u?.active) {
          email = u.email;
          telefono = u.telefonoE164 ?? undefined;
        }
      }
      porPersona.set(clave, {
        nombre: p.representanteNombre,
        codigo: p.codigoAcceso,
        email,
        telefono,
        unidades: [p.unidadNumero],
      });
    }

    return {
      condominioId: envio.condominioId,
      condominioNombre: condominio.name,
      moduloWhatsapp: condominio.activeModules.includes("whatsapp"),
      asambleaTitulo: asamblea.titulo,
      fecha: asamblea.fecha,
      hora: asamblea.hora,
      canal: envio.canal,
      destinatarios: [...porPersona.values()],
    };
  },
});

export const marcarEnviando = internalMutation({
  args: { envioId: v.id("enviosProgramados"), total: v.number() },
  handler: async (ctx, args) => {
    const envio = await ctx.db.get(args.envioId);
    if (!envio || envio.estado !== "programado") return false;
    await ctx.db.patch(args.envioId, {
      estado: "enviando",
      total: args.total,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const registrarResultado = internalMutation({
  args: {
    envioId: v.id("enviosProgramados"),
    condominioId: v.id("condominios"),
    nombre: v.string(),
    destino: v.optional(v.string()),
    canal: v.string(),
    estado: v.union(
      v.literal("enviado"),
      v.literal("fallido"),
      v.literal("sin_contacto"),
    ),
    motivo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { envioId, ...fila } = args;
    await ctx.db.insert("enviosProgramadosDetalle", {
      envioId,
      ...fila,
      createdAt: Date.now(),
    });

    const envio = await ctx.db.get(envioId);
    if (!envio) return null;
    await ctx.db.patch(envioId, {
      enviados: envio.enviados + (args.estado === "enviado" ? 1 : 0),
      fallidos: envio.fallidos + (args.estado === "fallido" ? 1 : 0),
      sinContacto: envio.sinContacto + (args.estado === "sin_contacto" ? 1 : 0),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const cerrarEnvio = internalMutation({
  args: {
    envioId: v.id("enviosProgramados"),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.envioId, {
      estado: args.error ? "fallido" : "completado",
      error: args.error,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const ejecutar = internalAction({
  args: { envioId: v.id("enviosProgramados") },
  handler: async (ctx, args) => {
    const datos = await ctx.runQuery(internal.automatizaciones.datosEnvio, {
      envioId: args.envioId,
    });
    if (!datos) {
      await ctx.runMutation(internal.automatizaciones.cerrarEnvio, {
        envioId: args.envioId,
        error: "El envío ya no era válido (cancelado o asamblea eliminada).",
      });
      return null;
    }

    // Reclamo atómico: si el job se dispara dos veces, solo uno pasa.
    const tomado = await ctx.runMutation(
      internal.automatizaciones.marcarEnviando,
      { envioId: args.envioId, total: datos.destinatarios.length },
    );
    if (!tomado) return null;

    const base = (process.env.WEB_APP_URL ?? "https://www.vekino.com").replace(
      /\/+$/,
      "",
    );
    const plantillaWa = process.env.YCLOUD_TEMPLATE_APODERADO;
    const quiereWa = datos.canal !== "correo";
    const quiereCorreo = datos.canal !== "whatsapp";

    for (const d of datos.destinatarios) {
      const enlace = `${base}/apoderado?codigo=${encodeURIComponent(d.codigo)}`;
      let algoSalio = false;
      const motivos: string[] = [];

      if (quiereCorreo && d.email) {
        try {
          const datosCorreo = {
            nombre: d.nombre,
            condominioNombre: datos.condominioNombre,
            asambleaTitulo: datos.asambleaTitulo,
            fecha: datos.fecha,
            hora: datos.hora,
            enlace,
            unidades: d.unidades,
          };
          await sendBrevoEmail({
            to: [{ email: d.email, name: d.nombre }],
            subject: asuntoApoderado(datos.condominioNombre),
            htmlContent: htmlApoderado(datosCorreo),
            textContent: textoApoderado(datosCorreo),
          });
          algoSalio = true;
        } catch (e) {
          motivos.push(
            `correo: ${e instanceof Error ? e.message : String(e)}`.slice(0, 150),
          );
        }
      }

      if (quiereWa && esCelularWhatsApp(d.telefono)) {
        if (!plantillaWa) {
          motivos.push("WhatsApp: falta YCLOUD_TEMPLATE_APODERADO");
        } else if (!datos.moduloWhatsapp) {
          motivos.push("WhatsApp: módulo apagado en el condominio");
        } else {
          try {
            // {{1}} nombre, {{2}} condominio, {{3}} fecha, {{4}} hora;
            // el botón URL lleva el código como sufijo dinámico.
            await enviarMensaje({
              ...msgPlantilla(d.telefono!, plantillaWa, "es", [
                d.nombre,
                datos.condominioNombre,
                datos.fecha,
                datos.hora,
              ]),
              components: [
                {
                  type: "body",
                  parameters: [
                    { type: "text", text: d.nombre },
                    { type: "text", text: datos.condominioNombre },
                    { type: "text", text: datos.fecha },
                    { type: "text", text: datos.hora },
                  ],
                },
                {
                  type: "button",
                  sub_type: "url",
                  index: "0",
                  parameters: [{ type: "text", text: d.codigo }],
                },
              ],
            } as any);
            algoSalio = true;
          } catch (e) {
            motivos.push(
              `WhatsApp: ${e instanceof Error ? e.message : String(e)}`.slice(0, 150),
            );
          }
        }
      }

      const sinContacto =
        (!quiereCorreo || !d.email) &&
        (!quiereWa || !esCelularWhatsApp(d.telefono));

      await ctx.runMutation(internal.automatizaciones.registrarResultado, {
        envioId: args.envioId,
        condominioId: datos.condominioId,
        nombre: d.nombre,
        destino: d.email ?? d.telefono,
        canal: datos.canal,
        estado: algoSalio
          ? "enviado"
          : sinContacto
            ? "sin_contacto"
            : "fallido",
        motivo: algoSalio
          ? undefined
          : sinContacto
            ? "Sin correo ni celular registrado: compártele el enlace a mano."
            : motivos.join(" · ").slice(0, 300),
      });

      // Respiro entre destinatarios para no golpear los límites de envío.
      await new Promise((r) => setTimeout(r, 150));
    }

    await ctx.runMutation(internal.automatizaciones.cerrarEnvio, {
      envioId: args.envioId,
    });
    return null;
  },
});
