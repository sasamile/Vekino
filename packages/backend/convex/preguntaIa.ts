import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  getCurrentAppUser,
  getMembership,
  hasPlatformRole,
} from "./model/authz";
import { configOpenAI, redactarConModelo } from "./lib/redactor";

/**
 * Corrige / mejora el texto de una pregunta de votación con OpenAI
 * (`OPENAI_API_KEY` en Convex). No usa Anthropic.
 */

const WRITE_ROLES = [
  "administrador",
  "junta_directiva",
  "representante_asamblea",
] as const;

const SISTEMA = `Eres un asistente para asambleas de condominio en Colombia.
Tu trabajo es corregir y mejorar preguntas de votación.

Reglas:
- Corrige ortografía, tipografía y redacción.
- Deja la pregunta clara, formal y fácil de votar (sí/no o a favor/en contra).
- Si falta el signo de interrogación y es una pregunta, añádelo.
- Conserva el sentido original; no inventes temas nuevos.
- Español de Colombia, tono de asamblea (respetuoso, concreto).
- Responde SOLO con el texto final de la pregunta, sin comillas ni explicaciones.`;

export const puedeMesa = internalQuery({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return null;
    const user = await getCurrentAppUser(ctx);
    if (!user) return null;
    if (hasPlatformRole(user, "superadmin", "admin")) {
      return { userId: user._id, condominioId: asamblea.condominioId };
    }
    const m = await getMembership(ctx, user._id, asamblea.condominioId);
    if (
      !m?.isActive ||
      !m.roles.some((r) => (WRITE_ROLES as readonly string[]).includes(r))
    ) {
      return null;
    }
    return { userId: user._id, condominioId: asamblea.condominioId };
  },
});

async function mejorarTexto(texto: string): Promise<string> {
  const original = texto.trim().replace(/\s+/g, " ");
  if (original.length < 3) {
    throw new Error("Escribe primero la pregunta (mínimo unas letras).");
  }
  if (original.length > 500) {
    throw new Error("La pregunta es demasiado larga.");
  }

  const cfg = configOpenAI();
  if (!cfg) {
    throw new Error(
      "Falta OPENAI_API_KEY en Convex (Settings → Environment Variables).",
    );
  }

  const mejorada = (
    await redactarConModelo(cfg, SISTEMA, `Pregunta borrador:\n${original}`)
  )
    .trim()
    .replace(/^["«»]|["«»]$/g, "")
    .replace(/\s+/g, " ");

  if (!mejorada) {
    throw new Error("La IA no devolvió texto. Intenta de nuevo.");
  }
  return mejorada.slice(0, 500);
}

/**
 * Devuelve la pregunta mejorada. No guarda nada: el cliente decide
 * aplicarla al formulario o al punto/votación.
 */
export const mejorarPregunta = action({
  args: {
    asambleaId: v.id("asambleas"),
    texto: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ pregunta: string; sinCambio: boolean }> => {
    const mesa = await ctx.runQuery(internal.preguntaIa.puedeMesa, {
      asambleaId: args.asambleaId,
    });
    if (!mesa) throw new Error("Solo la mesa puede arreglar preguntas con IA.");

    const original = args.texto.trim().replace(/\s+/g, " ");
    const pregunta = await mejorarTexto(original);
    return {
      pregunta,
      sinCambio: pregunta.toLowerCase() === original.toLowerCase(),
    };
  },
});

/** Guarda pregunta en votación y/o punto del orden (tras mejorar con IA). */
export const guardarPregunta = internalMutation({
  args: {
    asambleaId: v.id("asambleas"),
    pregunta: v.string(),
    votacionId: v.optional(v.id("votaciones")),
    puntoIndex: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    const now = Date.now();
    const pregunta = args.pregunta.trim();
    if (!pregunta) throw new Error("Pregunta vacía.");

    const orden: NonNullable<typeof asamblea.ordenDia> =
      asamblea.ordenDia && asamblea.ordenDia.length > 0
        ? [...asamblea.ordenDia]
        : (asamblea.agenda ?? []).map((t) => ({ titulo: t }));

    if (args.puntoIndex !== undefined) {
      const p = orden[args.puntoIndex];
      if (!p) throw new Error("Punto no encontrado.");
      orden[args.puntoIndex] = { ...p, titulo: pregunta };
      if (p.votacionId) {
        await ctx.db.patch(p.votacionId, { pregunta, updatedAt: now });
      }
      await ctx.db.patch(args.asambleaId, {
        ordenDia: orden,
        agenda: orden.map((x) => x.titulo),
        updatedAt: now,
      });
      return;
    }

    if (args.votacionId) {
      const vt = await ctx.db.get(args.votacionId);
      if (!vt || vt.asambleaId !== args.asambleaId) {
        throw new Error("Votación no encontrada.");
      }
      await ctx.db.patch(args.votacionId, { pregunta, updatedAt: now });
      const i = orden.findIndex((x) => x.votacionId === args.votacionId);
      if (i >= 0) {
        orden[i] = { ...orden[i]!, titulo: pregunta };
        await ctx.db.patch(args.asambleaId, {
          ordenDia: orden,
          agenda: orden.map((x) => x.titulo),
          updatedAt: now,
        });
      }
    }
  },
});

/**
 * Mejora con IA y aplica al punto/votación en un solo paso.
 */
export const aplicarPregunta = action({
  args: {
    asambleaId: v.id("asambleas"),
    texto: v.string(),
    votacionId: v.optional(v.id("votaciones")),
    puntoIndex: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ pregunta: string }> => {
    const mesa = await ctx.runQuery(internal.preguntaIa.puedeMesa, {
      asambleaId: args.asambleaId,
    });
    if (!mesa) throw new Error("Solo la mesa puede arreglar preguntas con IA.");

    if (args.votacionId === undefined && args.puntoIndex === undefined) {
      throw new Error("Indica la votación o el punto a actualizar.");
    }

    const pregunta = await mejorarTexto(args.texto);
    await ctx.runMutation(internal.preguntaIa.guardarPregunta, {
      asambleaId: args.asambleaId,
      pregunta,
      votacionId: args.votacionId,
      puntoIndex: args.puntoIndex,
    });
    return { pregunta };
  },
});
