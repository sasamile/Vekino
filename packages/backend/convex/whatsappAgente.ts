import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/**
 * El agente de WhatsApp.
 *
 * A diferencia del router de menús (whatsapp.ts), aquí Claude tiene
 * HERRAMIENTAS sobre el backend real: consulta la factura de la unidad, genera
 * el link de pago, entrega credenciales, revisa disponibilidad y crea la
 * reserva o el PQRS. El residente escribe como le nazca —"cuánto debo",
 * "quiero el salón el sábado de 2 a 6"— y el agente lo resuelve en la misma
 * conversación, sin obligarlo a navegar opciones.
 *
 * Los menús interactivos siguen existiendo para quien prefiera tocar botones;
 * este camino es para el texto libre.
 */

const MAX_PASOS = 6;

const pesos = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

type Herramienta = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

const HERRAMIENTAS: Herramienta[] = [
  {
    name: "ver_estado_cuenta",
    description:
      "Consulta la factura de administración vigente de la unidad del residente: número, período, total a pagar, fecha de vencimiento y si está pagada. Úsala cuando pregunte cuánto debe, por su factura, su saldo o su estado de cuenta.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "generar_link_pago",
    description:
      "Genera el enlace de pago en línea (PSE/tarjeta) de la factura vigente y lo devuelve. Úsala solo cuando el residente quiera pagar. Antes conviene haber consultado el estado de cuenta.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "enviar_mis_credenciales",
    description:
      "Genera una contraseña nueva para que el residente entre a la plataforma web y devuelve su usuario y esa contraseña. La contraseña anterior deja de funcionar. Úsala cuando diga que no puede entrar, que olvidó su clave o que necesita sus datos de acceso. Confirma con él antes de usarla.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "ver_zonas_comunes",
    description:
      "Lista las zonas comunes que se pueden reservar en el conjunto, con su nombre e id. Úsala antes de crear una reserva para saber qué hay disponible.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "verificar_disponibilidad",
    description:
      "Revisa si una zona está libre en una fecha y horario. Úsala SIEMPRE antes de crear una reserva.",
    input_schema: {
      type: "object",
      properties: {
        zonaId: { type: "string", description: "id de la zona (de ver_zonas_comunes)" },
        fecha: { type: "string", description: "AAAA-MM-DD" },
        horaInicio: { type: "string", description: "HH:MM en 24 horas" },
        horaFin: { type: "string", description: "HH:MM en 24 horas" },
      },
      required: ["zonaId", "fecha", "horaInicio", "horaFin"],
    },
  },
  {
    name: "crear_reserva",
    description:
      "Crea la reserva de una zona común a nombre del residente. Queda pendiente de aprobación de la administración. Confirma fecha y hora con él antes de crearla.",
    input_schema: {
      type: "object",
      properties: {
        zonaId: { type: "string" },
        fecha: { type: "string", description: "AAAA-MM-DD" },
        horaInicio: { type: "string", description: "HH:MM" },
        horaFin: { type: "string", description: "HH:MM" },
      },
      required: ["zonaId", "fecha", "horaInicio", "horaFin"],
    },
  },
  {
    name: "reportar_problema",
    description:
      "Radica una petición, queja o reclamo ante la administración del conjunto. Devuelve el número de radicado. Úsala cuando reporte un daño, una queja o una solicitud formal.",
    input_schema: {
      type: "object",
      properties: {
        tipo: {
          type: "string",
          enum: ["peticion", "queja", "reclamo", "sugerencia", "felicitacion"],
        },
        asunto: { type: "string", description: "resumen corto" },
        descripcion: { type: "string", description: "lo que contó el residente" },
      },
      required: ["tipo", "asunto", "descripcion"],
    },
  },
];

export const responder = internalAction({
  args: {
    conversacionId: v.id("waConversations"),
    userId: v.id("users"),
    condominioId: v.id("condominios"),
    condominioNombre: v.string(),
    nombre: v.string(),
    unidadId: v.optional(v.id("unidades")),
    unidadNumero: v.optional(v.string()),
    timezone: v.string(),
    pregunta: v.string(),
  },
  handler: async (ctx, args): Promise<string | null> => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;

    const historial: Array<{ direccion: string; tipo: string; contenido: string }> =
      await ctx.runQuery(internal.whatsapp.ultimosMensajes, {
        conversacionId: args.conversacionId,
        n: 12,
      });

    const hoy = new Intl.DateTimeFormat("en-CA", {
      timeZone: args.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const system = [
      `Eres el asistente de Vekino para el conjunto residencial ${args.condominioNombre}, en Colombia.`,
      `Hablas por WhatsApp con ${args.nombre}${args.unidadNumero ? `, de la unidad ${args.unidadNumero}` : ""}.`,
      `Hoy es ${hoy} (zona horaria ${args.timezone}).`,
      "",
      "Actúa como una persona de la administración que resuelve, no como un menú.",
      "Usa tus herramientas para hacer las cosas de verdad en vez de explicar pasos.",
      "Si te falta un dato para usar una herramienta, pregúntalo en una sola frase.",
      "",
      "Reglas:",
      "- Esta persona YA está identificada por su número. Nunca le pidas cédula ni documento para verificarla.",
      "- Nunca inventes montos, fechas, saldos ni normas: si no lo devolvió una herramienta, no lo sabes.",
      "- Antes de crear una reserva o de cambiarle la contraseña, confirma con él.",
      "- Interpreta fechas como habla la gente: 'mañana', 'el sábado', '20 de agosto'. Conviértelas a AAAA-MM-DD.",
      "- Interpreta horas igual: 'de 2 a 6' es 14:00 a 18:00.",
      "",
      "Estilo WhatsApp: cálido, tuteo, frases cortas. Máximo 4 líneas salvo que listes datos.",
      "Usa *negritas* para lo importante y algún emoji cuando sume. Nada de tecnicismos.",
    ].join("\n");

    type Mensaje = { role: "user" | "assistant"; content: unknown };
    const mensajes: Mensaje[] = [];
    for (const m of historial) {
      if (m.tipo !== "text" || !m.contenido.trim()) continue;
      mensajes.push({
        role: m.direccion === "entrante" ? "user" : "assistant",
        content: m.contenido.slice(0, 1200),
      });
    }
    if (
      mensajes.length === 0 ||
      (mensajes[mensajes.length - 1] as Mensaje).role !== "user"
    ) {
      mensajes.push({ role: "user", content: args.pregunta.slice(0, 1200) });
    }

    for (let paso = 0; paso < MAX_PASOS; paso++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
          max_tokens: 900,
          system,
          tools: HERRAMIENTAS,
          messages: mensajes,
        }),
      });
      if (!res.ok) return null;

      const data = (await res.json()) as {
        content?: Array<Record<string, any>>;
        stop_reason?: string;
      };
      const bloques = data.content ?? [];
      mensajes.push({ role: "assistant", content: bloques });

      const usos = bloques.filter((b) => b.type === "tool_use");
      if (usos.length === 0) {
        return (
          bloques
            .filter((b) => b.type === "text" && b.text)
            .map((b) => b.text as string)
            .join("\n")
            .trim() || null
        );
      }

      const resultados = [];
      for (const uso of usos) {
        const salida = await ejecutar(ctx, args, uso.name, uso.input ?? {});
        resultados.push({
          type: "tool_result",
          tool_use_id: uso.id,
          content: JSON.stringify(salida),
        });
      }
      mensajes.push({ role: "user", content: resultados });
    }

    // Se acabaron los pasos sin una respuesta final: mejor callar que inventar.
    return null;
  },
});

/** Ejecuta una herramienta contra el backend real. */
async function ejecutar(
  ctx: any,
  args: {
    userId: Id<"users">;
    condominioId: Id<"condominios">;
    unidadId?: Id<"unidades">;
    unidadNumero?: string;
  },
  nombre: string,
  input: Record<string, any>,
): Promise<unknown> {
  try {
    switch (nombre) {
      case "ver_estado_cuenta": {
        if (!args.unidadId) return { error: "El residente no tiene unidad vinculada." };
        const f = await ctx.runQuery(internal.soportesPago.facturaVigenteDeUnidad, {
          unidadId: args.unidadId,
        });
        if (!f) return { sinFacturas: true };
        const conDescuento =
          f.totalConDescuento != null && Date.now() <= f.fechaVencimiento;
        return {
          numeroFactura: f.numeroFactura,
          periodo: f.periodoLabel,
          estado: f.estado,
          totalAPagar: pesos.format(conDescuento ? f.totalConDescuento : f.totalAPagar),
          aplicaDescuentoProntoPago: conDescuento,
          venceEl: new Date(f.fechaVencimiento).toISOString().slice(0, 10),
          tienePdf: !!f.pdfUrl,
        };
      }

      case "generar_link_pago": {
        if (!args.unidadId) return { error: "Sin unidad vinculada." };
        const f = await ctx.runQuery(internal.soportesPago.facturaVigenteDeUnidad, {
          unidadId: args.unidadId,
        });
        if (!f) return { error: "No hay factura para pagar." };
        if (f.estado === "pagada") return { yaPagada: true };
        const pago = await ctx.runAction(internal.pagos.crearPagoFacturaBot, {
          facturaId: f._id,
          userId: args.userId,
        });
        return { enlacePago: pago.redirectUrl, factura: f.numeroFactura };
      }

      case "enviar_mis_credenciales": {
        const r = await ctx.runAction(internal.credenciales.generarClaveParaEntrega, {
          userId: args.userId,
        });
        if (!r.ok) return { error: r.motivo };
        return {
          usuario: r.email,
          contrasena: r.password,
          donde: "https://www.vekino.com/login",
          nota: "Es temporal y personal; la anterior dejó de funcionar.",
        };
      }

      case "ver_zonas_comunes": {
        const zonas = await ctx.runQuery(internal.reservas.zonasActivas, {
          condominioId: args.condominioId,
        });
        return zonas.map((z: any) => ({
          zonaId: z._id,
          nombre: z.nombre,
          tipo: z.tipo ?? null,
          horarios: z.horariosPorDia ?? null,
        }));
      }

      case "verificar_disponibilidad":
        return await ctx.runQuery(internal.reservas.verificarDisponibilidad, {
          zonaId: input.zonaId as Id<"zonasComunes">,
          fecha: input.fecha,
          horaInicio: input.horaInicio,
          horaFin: input.horaFin,
        });

      case "crear_reserva": {
        if (!args.unidadId) return { error: "Sin unidad vinculada." };
        const r = await ctx.runMutation(internal.reservas.createFromBot, {
          userId: args.userId,
          condominioId: args.condominioId,
          unidadId: args.unidadId,
          zonaId: input.zonaId as Id<"zonasComunes">,
          fecha: input.fecha,
          horaInicio: input.horaInicio,
          horaFin: input.horaFin,
          observaciones: "Creada por WhatsApp",
        });
        return { creada: true, estado: r.estado };
      }

      case "reportar_problema": {
        const r = await ctx.runMutation(internal.pqrs.crearInterno, {
          condominioId: args.condominioId,
          userId: args.userId,
          tipo: input.tipo,
          asunto: String(input.asunto).slice(0, 120),
          descripcion: `${input.descripcion}\n\n— Recibido por WhatsApp`,
          unidadNumero: args.unidadNumero,
        });
        return { radicado: r.radicado };
      }

      default:
        return { error: "Herramienta desconocida." };
    }
  } catch (e) {
    // El error viaja al modelo para que lo explique con sus palabras.
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
