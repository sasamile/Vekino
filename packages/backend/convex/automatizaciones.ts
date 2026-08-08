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
  htmlMensajeLibre,
  textoApoderado,
} from "./lib/emailApoderado";
import {
  enviarMensaje,
  msgPlantillaConBoton,
  ycloudRequest,
} from "./lib/ycloud";
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


/** "2026-08-08" → "8 de agosto de 2026". Sin esto llega la fecha cruda. */
function fechaLegible(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  return `${d} de ${meses[m - 1]} de ${y}`;
}

/** "18:00" → "6:00 p. m." */
function horaLegible(hhmm: string): string {
  const [h, min] = hhmm.split(":").map(Number);
  if (h == null || Number.isNaN(h)) return hhmm;
  const sufijo = h < 12 ? "a. m." : "p. m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(min ?? 0).padStart(2, "0")} ${sufijo}`;
}

const tipoValidator = v.union(
  v.literal("apoderados_asamblea"),
  v.literal("mensaje_residentes"),
  v.literal("plantilla_whatsapp"),
);

/**
 * Fichas que se pueden usar dentro de una variable de plantilla y se
 * reemplazan por destinatario. Es lo que hace que una misma plantilla sirva
 * para todo el condominio y no solo para un envío fijo.
 */
export const FICHAS = ["{nombre}", "{condominio}", "{unidad}"] as const;

function rellenarFichas(
  texto: string,
  d: { nombre: string; condominio: string; unidad: string },
): string {
  return texto
    .replaceAll("{nombre}", d.nombre)
    .replaceAll("{condominio}", d.condominio)
    .replaceAll("{unidad}", d.unidad);
}

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
          asunto: e.asunto ?? null,
          mensaje: e.mensaje ?? null,
          audiencia: e.audiencia ?? null,
          plantilla: e.plantilla ?? null,
          parametros: e.parametros ?? null,
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

/**
 * TODOS los condominios activos, cada uno con sus asambleas abiertas (puede
 * venir vacío). Los tipos de envío que no dependen de una asamblea —mensaje
 * libre y plantilla— necesitan poder elegir cualquier condominio.
 */
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

      salida.push({
        condominioId: c._id,
        condominioNombre: c.name,
        asambleas: filas,
      });
    }
    return salida;
  },
});

/**
 * Plantillas APROBADAS en YCloud, con el texto del cuerpo y cuántas variables
 * tiene cada una. Es un action porque consulta la API de YCloud en vivo: la
 * fuente de verdad del estado de aprobación es Meta, no nuestra base.
 */
export const plantillasDisponibles = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<
    Array<{
      nombre: string;
      idioma: string;
      categoria: string;
      cuerpo: string;
      variables: number;
      botonUrlDinamica: boolean;
    }>
  > => {
    await ctx.runQuery(internal.automatizaciones.soloStaff, {});
    const { status, json } = await ycloudRequest(
      `/whatsapp/templates?filter.wabaId=${encodeURIComponent(
        process.env.YCLOUD_WABA_ID ?? "",
      )}&limit=100`,
    );
    if (status >= 300) throw new Error("No pude consultar las plantillas en YCloud.");

    return (json?.items ?? [])
      .filter((t: any) => t.status === "APPROVED")
      .map((t: any) => {
        const body = (t.components ?? []).find((c: any) => c.type === "BODY");
        const cuerpo: string = body?.text ?? "";
        const botones = (t.components ?? []).find((c: any) => c.type === "BUTTONS");
        return {
          nombre: t.name as string,
          idioma: t.language as string,
          categoria: t.category as string,
          cuerpo,
          // Se cuenta {{1}}, {{2}}… quedándose con el índice más alto.
          variables: [...cuerpo.matchAll(/\{\{(\d+)\}\}/g)].reduce(
            (max, m) => Math.max(max, Number(m[1])),
            0,
          ),
          botonUrlDinamica: !!(botones?.buttons ?? []).some(
            (b: any) => b.type === "URL" && String(b.url ?? "").includes("{{"),
          ),
        };
      })
      .sort((a: any, b: any) => a.nombre.localeCompare(b.nombre));
  },
});

/** Cuántas variables ({{n}}) tiene el cuerpo de una plantilla aprobada. */
export const variablesDePlantilla = internalAction({
  args: { nombre: v.string() },
  handler: async (_ctx, args): Promise<number> => {
    const { status, json } = await ycloudRequest(
      `/whatsapp/templates?filter.wabaId=${encodeURIComponent(
        process.env.YCLOUD_WABA_ID ?? "",
      )}&limit=100`,
    );
    if (status >= 300) return 0;
    const t = (json?.items ?? []).find((x: any) => x.name === args.nombre);
    const cuerpo: string =
      (t?.components ?? []).find((c: any) => c.type === "BODY")?.text ?? "";
    return [...cuerpo.matchAll(/\{\{(\d+)\}\}/g)].reduce(
      (max, m) => Math.max(max, Number(m[1])),
      0,
    );
  },
});

export const soloStaff = internalQuery({
  args: {},
  handler: async (ctx) => {
    await requirePlatformStaff(ctx);
    return null;
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
    tipo: tipoValidator,
    /** Obligatorio para `apoderados_asamblea`. */
    asambleaId: v.optional(v.id("asambleas")),
    /** Obligatorios para `mensaje_residentes`. */
    asunto: v.optional(v.string()),
    mensaje: v.optional(v.string()),
    audiencia: v.optional(v.string()),
    /** Solo para `plantilla_whatsapp`. */
    plantilla: v.optional(v.string()),
    parametros: v.optional(v.array(v.string())),
    canal: canalValidator,
    programadoPara: v.number(),
  },
  handler: async (ctx, args) => {
    const staff = await requirePlatformStaff(ctx);

    if (args.tipo === "apoderados_asamblea") {
      if (!args.asambleaId) throw new Error("Elige la asamblea.");
      const asamblea = await ctx.db.get(args.asambleaId);
      if (!asamblea || asamblea.condominioId !== args.condominioId) {
        throw new Error("La asamblea no pertenece a ese condominio.");
      }
    } else if (args.tipo === "plantilla_whatsapp") {
      if (!args.plantilla?.trim()) throw new Error("Elige la plantilla.");
      const condo = await ctx.db.get(args.condominioId);
      if (!condo) throw new Error("Condominio no encontrado.");
    } else {
      if (!args.mensaje?.trim()) throw new Error("Escribe el mensaje.");
      const condo = await ctx.db.get(args.condominioId);
      if (!condo) throw new Error("Condominio no encontrado.");
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
      asunto: args.asunto?.trim() || undefined,
      mensaje: args.mensaje?.trim() || undefined,
      audiencia: args.audiencia ?? "todos",
      plantilla: args.plantilla?.trim() || undefined,
      parametros: args.parametros,
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
      asunto: original.asunto,
      mensaje: original.mensaje,
      audiencia: original.audiencia,
      plantilla: original.plantilla,
      parametros: original.parametros,
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

export const nombreCondominio = internalQuery({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);
    const c = await ctx.db.get(args.condominioId);
    return c ? { condominioNombre: c.name } : null;
  },
});

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
    tipo: v.optional(tipoValidator),
    /** Solo para el enlace de asamblea. */
    asambleaId: v.optional(v.id("asambleas")),
    /** Solo para el mensaje libre. */
    mensaje: v.optional(v.string()),
    asunto: v.optional(v.string()),
    /** Solo para `plantilla_whatsapp`. */
    plantilla: v.optional(v.string()),
    parametros: v.optional(v.array(v.string())),
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
    const email0 = args.email?.trim();
    const telefono0 = args.telefono?.trim();
    if (!email0 && !telefono0) {
      throw new Error("Escribe un correo o un celular para la prueba.");
    }
    const nombrePrueba = args.nombre?.trim() || "Nombre de prueba";

    // ── Prueba de una plantilla elegida ──
    if (args.tipo === "plantilla_whatsapp") {
      if (!args.plantilla?.trim()) throw new Error("Elige la plantilla.");
      if (!telefono0) throw new Error("Escribe un celular: esta prueba es por WhatsApp.");
      const condo: { condominioNombre: string } | null = await ctx.runQuery(
        internal.automatizaciones.nombreCondominio,
        { condominioId: args.condominioId },
      );
      const e164 = telefono0.startsWith("+")
        ? telefono0
        : `+${telefono0.replace(/\D/g, "")}`;
      const ctxFichas = {
        nombre: nombrePrueba.split(" ")[0] ?? nombrePrueba,
        condominio: condo?.condominioNombre ?? "tu conjunto",
        unidad: "101",
      };
      /* Para una prueba de un clic basta con el nombre: si no se pasaron
       * valores, se rellenan solos con datos de muestra para que el mensaje
       * salga completo y se pueda ver cómo llega. */
      let params = (args.parametros ?? []).map((t) =>
        rellenarFichas(t, ctxFichas),
      );
      if (params.length === 0 || params.some((p) => !p.trim())) {
        const cuantas: number = await ctx.runAction(
          internal.automatizaciones.variablesDePlantilla,
          { nombre: args.plantilla },
        );
        const muestra = [
          ctxFichas.nombre,
          ctxFichas.condominio,
          "8 de agosto de 2026",
          "6:00 p. m.",
          "ejemplo",
          "ejemplo",
        ];
        params = Array.from({ length: cuantas }, (_, i) => {
          const dado = params[i]?.trim();
          return dado || muestra[i] || "ejemplo";
        });
      }
      try {
        await enviarMensaje(
          msgPlantillaConBoton(e164, args.plantilla, "es", params),
        );
        return { correo: null, whatsapp: `Enviado a ${e164}` };
      } catch (e) {
        return {
          correo: null,
          whatsapp: `Falló: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    }

    // ── Prueba de mensaje libre ──
    if (args.tipo === "mensaje_residentes") {
      const texto = args.mensaje?.trim();
      if (!texto) throw new Error("Escribe el mensaje para poder probarlo.");
      const condo: { condominioNombre: string } | null = await ctx.runQuery(
        internal.automatizaciones.nombreCondominio,
        { condominioId: args.condominioId },
      );
      if (!condo) throw new Error("No encontré el condominio.");

      let correoOut: string | null = null;
      let waOut: string | null = null;

      if (args.canal !== "whatsapp" && email0) {
        try {
          await sendBrevoEmail({
            to: [{ email: email0, name: nombrePrueba }],
            subject: `[PRUEBA] ${args.asunto?.trim() || `Mensaje de ${condo.condominioNombre}`}`,
            htmlContent: htmlMensajeLibre({
              nombre: nombrePrueba,
              condominioNombre: condo.condominioNombre,
              mensaje: texto,
            }),
            textContent: `Hola ${nombrePrueba}:\n\n${texto}`,
          });
          correoOut = `Enviado a ${email0}`;
        } catch (e) {
          correoOut = `Falló: ${e instanceof Error ? e.message : String(e)}`;
        }
      }

      if (args.canal !== "correo" && telefono0) {
        const e164 = telefono0.startsWith("+")
          ? telefono0
          : `+${telefono0.replace(/\D/g, "")}`;
        const plantilla = process.env.YCLOUD_TEMPLATE_GENERICO;
        if (!plantilla) {
          waOut = "Falta configurar la plantilla genérica de WhatsApp.";
        } else {
          try {
            await enviarMensaje(
              msgPlantillaConBoton(e164, plantilla, "es", [nombrePrueba, texto]),
            );
            waOut = `Enviado a ${e164}`;
          } catch (e) {
            waOut = `Falló: ${e instanceof Error ? e.message : String(e)}`;
          }
        }
      }
      return { correo: correoOut, whatsapp: waOut };
    }

    if (!args.asambleaId) throw new Error("Elige la asamblea para probar.");

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

    const email = email0;
    const telefono = telefono0;

    const base = (process.env.WEB_APP_URL ?? "https://www.vekino.com").replace(
      /\/+$/,
      "",
    );
    const enlace = `${base}/apoderado?codigo=${encodeURIComponent(datos.codigo)}`;
    // Solo existe la versión del propietario: es a quien se le escribe.
    const esApoderado = false;
    const nombre = nombrePrueba;

    let correoRes: string | null = null;
    let waRes: string | null = null;

    if (args.canal !== "whatsapp" && email) {
      const datosCorreo = {
        nombre,
        esApoderado,
        apoderadoNombre: datos.apoderadoNombre,
        condominioNombre: datos.condominioNombre,
        asambleaTitulo: datos.asambleaTitulo,
        fecha: fechaLegible(datos.fecha),
        hora: horaLegible(datos.hora),
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
      const plantilla = process.env.YCLOUD_TEMPLATE_APODERADO;
      const params = [
        nombre,
        datos.apoderadoNombre,
        datos.condominioNombre,
        `${fechaLegible(datos.fecha)}, ${horaLegible(datos.hora)}`,
      ];

      if (!plantilla) {
        waRes = "Falta configurar la plantilla de WhatsApp.";
      } else {
        try {
          await enviarMensaje(
            msgPlantillaConBoton(e164, plantilla, "es", params, datos.codigo),
          );
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
    if (!condominio) return null;

    // ── Mensaje libre a los residentes ──
    if (envio.tipo === "mensaje_residentes" || envio.tipo === "plantilla_whatsapp") {
      const audiencia = envio.audiencia ?? "todos";
      const memberships = await ctx.db
        .query("memberships")
        .withIndex("by_condominio", (q) => q.eq("condominioId", envio.condominioId))
        .collect();

      const vistos = new Set<string>();
      const destinatarios = [];
      for (const m of memberships) {
        if (!m.isActive || vistos.has(m.userId)) continue;
        if (audiencia !== "todos" && !m.roles.includes(audiencia as never)) continue;
        const u = await ctx.db.get(m.userId);
        if (!u || !u.active) continue;
        vistos.add(m.userId);
        // Unidad principal, para la ficha {unidad} de las plantillas.
        const vinculo = await ctx.db
          .query("usuarioUnidad")
          .withIndex("by_membership", (q) => q.eq("membershipId", m._id))
          .first();
        const unidad = vinculo ? await ctx.db.get(vinculo.unidadId) : null;

        destinatarios.push({
          clave: `user:${m.userId}`,
          nombre: u.name,
          apoderadoNombre: u.name,
          codigo: "",
          email: u.email,
          telefono: u.telefonoE164 ?? undefined,
          unidades: unidad ? [unidad.numero] : ([] as string[]),
          esApoderado: true,
        });
      }

      // Reenvío: excluir a quien ya recibió.
      let finales = destinatarios;
      if (envio.reintentoDe) {
        const previos = await ctx.db
          .query("enviosProgramadosDetalle")
          .withIndex("by_envio", (q) => q.eq("envioId", envio.reintentoDe!))
          .collect();
        const ya = new Set(
          previos.filter((f) => f.estado === "enviado").map((f) => f.clave),
        );
        finales = destinatarios.filter((d) => !ya.has(d.clave));
      }

      return {
        tipo: envio.tipo as "mensaje_residentes" | "plantilla_whatsapp",
        plantilla: envio.plantilla ?? null,
        parametros: envio.parametros ?? [],
        condominioId: envio.condominioId,
        condominioNombre: condominio.name,
        moduloWhatsapp: condominio.activeModules.includes("whatsapp"),
        asambleaTitulo: "",
        fecha: "",
        hora: "",
        asunto: envio.asunto ?? `Mensaje de ${condominio.name}`,
        mensaje: envio.mensaje ?? "",
        canal: envio.canal,
        destinatarios: finales,
      };
    }

    const asamblea = envio.asambleaId ? await ctx.db.get(envio.asambleaId) : null;
    if (!asamblea) return null;

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
      // El destinatario SIEMPRE es el propietario que otorgó el poder: del
      // apoderado no tenemos ni correo ni celular, y aunque los tuviéramos,
      // quien debe decidir a quién le pasa su enlace es el dueño de la unidad.
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
      tipo: "apoderados_asamblea" as const,
      plantilla: null as string | null,
      parametros: [] as string[],
      condominioId: envio.condominioId,
      condominioNombre: condominio.name,
      moduloWhatsapp: condominio.activeModules.includes("whatsapp"),
      asunto: "",
      mensaje: "",
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

    const esMensajeLibre = datos.tipo === "mensaje_residentes";
    const esPlantilla = datos.tipo === "plantilla_whatsapp";
    const plantillaGenerica = process.env.YCLOUD_TEMPLATE_GENERICO;

    for (const d of datos.destinatarios) {
      const enlace = `${base}/apoderado?codigo=${encodeURIComponent(d.codigo)}`;
      let algoSalio = false;
      const motivos: string[] = [];

      if (esPlantilla) {
        // Este tipo es exclusivo de WhatsApp: no hay correo equivalente.
      } else if (quiereCorreo && d.email && esMensajeLibre) {
        try {
          await sendBrevoEmail({
            to: [{ email: d.email, name: d.nombre }],
            subject: datos.asunto,
            htmlContent: htmlMensajeLibre({
              nombre: d.nombre,
              condominioNombre: datos.condominioNombre,
              mensaje: datos.mensaje,
            }),
            textContent: `Hola ${d.nombre}:\n\n${datos.mensaje}\n\nMensaje enviado por la administración de ${datos.condominioNombre}.`,
          });
          algoSalio = true;
        } catch (e) {
          motivos.push(
            `correo: ${e instanceof Error ? e.message : String(e)}`.slice(0, 150),
          );
        }
      } else if (quiereCorreo && d.email) {
        try {
          const datosCorreo = {
            nombre: d.nombre,
            esApoderado: d.esApoderado,
            apoderadoNombre: d.apoderadoNombre,
            condominioNombre: datos.condominioNombre,
            asambleaTitulo: datos.asambleaTitulo,
            fecha: fechaLegible(datos.fecha),
            hora: horaLegible(datos.hora),
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
        const plantillaUsada = esPlantilla
          ? datos.plantilla
          : esMensajeLibre
            ? plantillaGenerica
            : plantillaWa;
        // {{1}} propietario, {{2}} apoderado, {{3}} condominio, {{4}} fecha,
        // {{5}} hora. El código va solo en el botón: nombrarlo en el cuerpo
        // hace que Meta rechace la plantilla por tratarlo como credencial.
        const cuando = `${fechaLegible(datos.fecha)}, ${horaLegible(datos.hora)}`;
        const contexto = {
          nombre: d.nombre.split(" ")[0] ?? d.nombre,
          condominio: datos.condominioNombre,
          unidad: d.unidades[0] ?? "",
        };
        const paramsWa = esPlantilla
          ? datos.parametros.map((t) => rellenarFichas(t, contexto))
          : esMensajeLibre
            ? [d.nombre, datos.mensaje]
            : [d.nombre, d.apoderadoNombre, datos.condominioNombre, cuando];

        if (!plantillaUsada) {
          motivos.push("WhatsApp: falta la plantilla configurada");
        } else if (!datos.moduloWhatsapp) {
          motivos.push("WhatsApp: módulo apagado en el condominio");
        } else {
          try {
            // {{1}} nombre, {{2}} condominio, {{3}} fecha, {{4}} hora;
            // el botón URL lleva el código como sufijo dinámico.
            await enviarMensaje(
              msgPlantillaConBoton(
                d.telefono!,
                plantillaUsada,
                "es",
                paramsWa,
                d.codigo,
              ),
            );
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
