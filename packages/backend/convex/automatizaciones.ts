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
          reintentoDe: (e.reintentoDe as string | undefined) ?? null,
          pendientesDeReenvio:
            e.estado === "completado" || e.estado === "fallido"
              ? e.fallidos + e.sinContacto
              : 0,
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

        /* Se cuenta por PODER, y "con contacto" mira al propietario que lo
         * otorgó: es a él a quien se le manda el enlace para que se lo pase
         * a su apoderado, porque del apoderado externo no tenemos datos. */
        const vistos = new Set<string>();
        let conContacto = 0;
        for (const p of poderes) {
          const clave = `${p.otorganteUserId}:${p.codigoAcceso}`;
          if (vistos.has(clave)) continue;
          vistos.add(clave);
          const otorgante = await ctx.db.get(p.otorganteUserId);
          if (otorgante?.active && (otorgante.email || otorgante.telefonoE164)) {
            conContacto++;
          }
        }

        filas.push({
          asambleaId: a._id,
          titulo: a.titulo,
          fecha: a.fecha,
          hora: a.hora,
          apoderados: vistos.size,
          apoderadosConContacto: conContacto,
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

/**
 * Reenvía SOLO a quienes no recibieron el envío original: los que fallaron y
 * los que estaban sin contacto. Es lo que se usa después de corregir un
 * teléfono o un correo en la plataforma, sin volver a molestar a los demás.
 */
export const reintentarPendientes = mutation({
  args: {
    id: v.id("enviosProgramados"),
    canal: v.optional(canalValidator),
    programadoPara: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const staff = await requirePlatformStaff(ctx);
    const original = await ctx.db.get(args.id);
    if (!original) throw new Error("Envío no encontrado.");
    if (original.estado === "programado" || original.estado === "enviando") {
      throw new Error("Ese envío todavía no ha terminado.");
    }

    const filas = await ctx.db
      .query("enviosProgramadosDetalle")
      .withIndex("by_envio", (q) => q.eq("envioId", args.id))
      .collect();
    const pendientes = filas.filter((f) => f.estado !== "enviado").length;
    if (pendientes === 0) {
      throw new Error("Todos recibieron el envío: no hay a quién reenviar.");
    }

    const now = Date.now();
    const cuando = Math.max(args.programadoPara ?? now, now);

    const envioId = await ctx.db.insert("enviosProgramados", {
      condominioId: original.condominioId,
      tipo: original.tipo,
      asambleaId: original.asambleaId,
      canal: args.canal ?? original.canal,
      programadoPara: cuando,
      reintentoDe: args.id,
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


// ─────────────────────────────────────────────────────────────
// Envío de prueba
// ─────────────────────────────────────────────────────────────

/** Datos reales de la asamblea + un poder de muestra, para la prueba. */
export const datosPrueba = internalQuery({
  args: {
    condominioId: v.id("condominios"),
    asambleaId: v.id("asambleas"),
  },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);
    const condominio = await ctx.db.get(args.condominioId);
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!condominio || !asamblea) return null;

    const poder = await ctx.db
      .query("poderesAsamblea")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .first();

    return {
      condominioNombre: condominio.name,
      moduloWhatsapp: condominio.activeModules.includes("whatsapp"),
      asambleaTitulo: asamblea.titulo,
      fecha: asamblea.fecha,
      hora: asamblea.hora,
      // Si aún no hay poderes cargados, se usa un ejemplo para ver el formato.
      apoderadoNombre: poder?.representanteNombre ?? "Juan Pérez (ejemplo)",
      codigo: poder?.codigoAcceso ?? "EJEMPLO",
      unidad: poder?.unidadNumero ?? "101",
      hayPoderes: !!poder,
    };
  },
});

/**
 * Manda UNA copia del mensaje a un contacto de prueba, con los datos reales
 * de la asamblea. No toca la tabla de envíos ni cuenta como envío real: es
 * para revisar cómo llega antes de dispararlo a todo el condominio.
 */
export const enviarPrueba = action({
  args: {
    condominioId: v.id("condominios"),
    asambleaId: v.id("asambleas"),
    canal: canalValidator,
    email: v.optional(v.string()),
    telefono: v.optional(v.string()),
    /** true = versión que recibe el propietario ("compártele el enlace"). */
    comoPropietario: v.optional(v.boolean()),
    nombre: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ correo: string | null; whatsapp: string | null }> => {
    const datos: {
      condominioNombre: string;
      moduloWhatsapp: boolean;
      asambleaTitulo: string;
      fecha: string;
      hora: string;
      apoderadoNombre: string;
      codigo: string;
      unidad: string;
      hayPoderes: boolean;
    } | null = await ctx.runQuery(internal.automatizaciones.datosPrueba, {
      condominioId: args.condominioId,
      asambleaId: args.asambleaId,
    });
    if (!datos) throw new Error("No encontré la asamblea.");

    const email = args.email?.trim();
    const telefono = args.telefono?.trim();
    if (!email && !telefono) {
      throw new Error("Escribe un correo o un celular para la prueba.");
    }

    const base = (process.env.WEB_APP_URL ?? "https://www.vekino.com").replace(
      /\/+$/,
      "",
    );
    const enlace = `${base}/apoderado?codigo=${encodeURIComponent(datos.codigo)}`;
    const esApoderado = !args.comoPropietario;
    const nombre = args.nombre?.trim() || "Nombre de prueba";

    let correoRes: string | null = null;
    let waRes: string | null = null;

    if (args.canal !== "whatsapp" && email) {
      const datosCorreo = {
        nombre,
        esApoderado,
        apoderadoNombre: datos.apoderadoNombre,
        condominioNombre: datos.condominioNombre,
        asambleaTitulo: datos.asambleaTitulo,
        fecha: datos.fecha,
        hora: datos.hora,
        enlace,
        unidades: [datos.unidad],
      };
      try {
        await sendBrevoEmail({
          to: [{ email, name: nombre }],
          subject: `[PRUEBA] ${asuntoApoderado(datos.condominioNombre, esApoderado)}`,
          htmlContent: htmlApoderado(datosCorreo),
          textContent: textoApoderado(datosCorreo),
        });
        correoRes = `Enviado a ${email}`;
      } catch (e) {
        correoRes = `Falló: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    if (args.canal !== "correo" && telefono) {
      const e164 = telefono.startsWith("+") ? telefono : `+${telefono.replace(/\D/g, "")}`;
      const plantilla = esApoderado
        ? process.env.YCLOUD_TEMPLATE_APODERADO
        : (process.env.YCLOUD_TEMPLATE_PODER ?? process.env.YCLOUD_TEMPLATE_APODERADO);
      const params = esApoderado
        ? [nombre, datos.condominioNombre, datos.fecha, datos.hora]
        : [nombre, datos.apoderadoNombre, datos.condominioNombre, datos.fecha];

      if (!plantilla) {
        waRes = "Falta configurar la plantilla de WhatsApp.";
      } else {
        try {
          await enviarMensaje({
            ...msgPlantilla(e164, plantilla, "es", params),
            components: [
              {
                type: "body",
                parameters: params.map((t) => ({ type: "text", text: t })),
              },
              {
                type: "button",
                sub_type: "url",
                index: "0",
                parameters: [{ type: "text", text: datos.codigo }],
              },
            ],
          } as any);
          waRes = `Enviado a ${e164}`;
        } catch (e) {
          waRes = `Falló: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
    }

    return { correo: correoRes, whatsapp: waRes };
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

    /* El destinatario es el PROPIETARIO que otorgó el poder, no el apoderado.
     * La tabla de poderes no guarda correo ni celular del apoderado (muchos
     * son externos y ni siquiera tienen cuenta), pero el otorgante sí es un
     * residente registrado: se le manda el enlace para que se lo comparta.
     * Si el apoderado además tiene cuenta, le llega también directo. */
    type Destinatario = {
      clave: string;
      nombre: string;
      /** A quién representa el enlace (para redactar el mensaje). */
      apoderadoNombre: string;
      codigo: string;
      email?: string;
      telefono?: string;
      unidades: string[];
      /** true = es el propio apoderado; false = es el propietario. */
      esApoderado: boolean;
    };
    const porDestinatario = new Map<string, Destinatario>();

    const agregar = (
      clave: string,
      base: Omit<Destinatario, "clave" | "unidades">,
      unidad: string,
    ) => {
      const previo = porDestinatario.get(clave);
      if (previo) {
        if (!previo.unidades.includes(unidad)) previo.unidades.push(unidad);
        return;
      }
      porDestinatario.set(clave, { clave, ...base, unidades: [unidad] });
    };

    for (const p of poderes) {
      // 1) El propietario que otorgó el poder.
      const otorgante = await ctx.db.get(p.otorganteUserId);
      if (otorgante?.active) {
        agregar(
          `otorgante:${p.otorganteUserId}:${p.codigoAcceso}`,
          {
            nombre: otorgante.name,
            apoderadoNombre: p.representanteNombre,
            codigo: p.codigoAcceso,
            email: otorgante.email,
            telefono: otorgante.telefonoE164 ?? undefined,
            esApoderado: false,
          },
          p.unidadNumero,
        );
      }

      // 2) El apoderado, solo si tiene cuenta con datos de contacto.
      if (p.representanteUserId) {
        const rep = await ctx.db.get(p.representanteUserId);
        if (rep?.active && (rep.email || rep.telefonoE164)) {
          agregar(
            `apoderado:${p.representanteUserId}`,
            {
              nombre: rep.name,
              apoderadoNombre: rep.name,
              codigo: p.codigoAcceso,
              email: rep.email,
              telefono: rep.telefonoE164 ?? undefined,
              esApoderado: true,
            },
            p.unidadNumero,
          );
        }
      }
    }

    // Reenvío: se excluye a quien ya recibió en el envío original.
    let destinatarios = [...porDestinatario.values()];
    if (envio.reintentoDe) {
      const previos = await ctx.db
        .query("enviosProgramadosDetalle")
        .withIndex("by_envio", (q) => q.eq("envioId", envio.reintentoDe!))
        .collect();
      const yaRecibieron = new Set(
        previos.filter((f) => f.estado === "enviado").map((f) => f.clave),
      );
      destinatarios = destinatarios.filter((d) => !yaRecibieron.has(d.clave));
    }

    return {
      condominioId: envio.condominioId,
      condominioNombre: condominio.name,
      moduloWhatsapp: condominio.activeModules.includes("whatsapp"),
      asambleaTitulo: asamblea.titulo,
      fecha: asamblea.fecha,
      hora: asamblea.hora,
      canal: envio.canal,
      destinatarios,
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
    clave: v.optional(v.string()),
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
            esApoderado: d.esApoderado,
            apoderadoNombre: d.apoderadoNombre,
            condominioNombre: datos.condominioNombre,
            asambleaTitulo: datos.asambleaTitulo,
            fecha: datos.fecha,
            hora: datos.hora,
            enlace,
            unidades: d.unidades,
          };
          await sendBrevoEmail({
            to: [{ email: d.email, name: d.nombre }],
            subject: asuntoApoderado(datos.condominioNombre, d.esApoderado),
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
        // Al apoderado se le habla en primera persona; al propietario se le
        // pide que reenvíe. Son plantillas distintas aprobadas por separado.
        const plantillaUsada = d.esApoderado
          ? plantillaWa
          : (process.env.YCLOUD_TEMPLATE_PODER ?? plantillaWa);
        const paramsWa = d.esApoderado
          ? [d.nombre, datos.condominioNombre, datos.fecha, datos.hora]
          : [d.nombre, d.apoderadoNombre, datos.condominioNombre, datos.fecha];

        if (!plantillaUsada) {
          motivos.push("WhatsApp: falta la plantilla configurada");
        } else if (!datos.moduloWhatsapp) {
          motivos.push("WhatsApp: módulo apagado en el condominio");
        } else {
          try {
            // {{1}} nombre, {{2}} condominio, {{3}} fecha, {{4}} hora;
            // el botón URL lleva el código como sufijo dinámico.
            await enviarMensaje({
              ...msgPlantilla(d.telefono!, plantillaUsada, "es", paramsWa),
              components: [
                {
                  type: "body",
                  parameters: paramsWa.map((t) => ({ type: "text", text: t })),
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
        clave: d.clave,
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
