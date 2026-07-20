import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  requireCondominioRole,
  requireAppUser,
  getCurrentAppUser,
  getMembership,
} from "./model/authz";

const WRITE_ROLES = ["administrador", "junta_directiva", "representante_asamblea"] as const;

const tipoValidator = v.union(v.literal("ordinaria"), v.literal("extraordinaria"));
const modalidadValidator = v.union(v.literal("presencial"), v.literal("virtual"), v.literal("mixta"));
const estadoValidator = v.union(
  v.literal("programada"),
  v.literal("en_curso"),
  v.literal("finalizada"),
  v.literal("cancelada")
);

// ─── Asambleas ──────────────────────────────────────────────────────────────

export const listByCondominio = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, []);
    const asambleas = await ctx.db
      .query("asambleas")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .collect();

    return await Promise.all(
      asambleas.map(async (a) => {
        const votaciones = await ctx.db
          .query("votaciones")
          .withIndex("by_asamblea", (q) => q.eq("asambleaId", a._id))
          .collect();
        const actaUrl = a.actaStorageId ? await ctx.storage.getUrl(a.actaStorageId) : null;
        return { ...a, votacionesCount: votaciones.length, actaUrl };
      })
    );
  },
});

/** Una asamblea puntual con su URL de acta (para la página de gestión). */
export const get = query({
  args: { id: v.id("asambleas") },
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.id);
    if (!a) return null;
    await requireCondominioRole(ctx, a.condominioId, []);
    const actaUrl = a.actaStorageId ? await ctx.storage.getUrl(a.actaStorageId) : null;
    return { ...a, actaUrl };
  },
});

export const create = mutation({
  args: {
    condominioId: v.id("condominios"),
    titulo: v.string(),
    tipo: tipoValidator,
    modalidad: modalidadValidator,
    fecha: v.string(),
    hora: v.string(),
    lugar: v.optional(v.string()),
    quorumRequerido: v.optional(v.number()),
    agenda: v.array(v.string()),
    descripcion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...WRITE_ROLES]);
    const now = Date.now();
    return await ctx.db.insert("asambleas", {
      condominioId: args.condominioId,
      titulo: args.titulo.trim(),
      tipo: args.tipo,
      modalidad: args.modalidad,
      fecha: args.fecha,
      hora: args.hora,
      lugar: args.lugar?.trim(),
      estado: "programada",
      quorumRequerido: args.quorumRequerido,
      agenda: args.agenda.map((a) => a.trim()).filter(Boolean),
      descripcion: args.descripcion?.trim(),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("asambleas"),
    titulo: v.optional(v.string()),
    tipo: v.optional(tipoValidator),
    modalidad: v.optional(modalidadValidator),
    fecha: v.optional(v.string()),
    hora: v.optional(v.string()),
    lugar: v.optional(v.string()),
    quorumRequerido: v.optional(v.number()),
    quorumAlcanzado: v.optional(v.number()),
    agenda: v.optional(v.array(v.string())),
    descripcion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Asamblea no encontrada.");
    await requireCondominioRole(ctx, existing.condominioId, [...WRITE_ROLES]);
    const { id, ...rest } = args;
    await ctx.db.patch(id, {
      ...rest,
      titulo: rest.titulo?.trim() ?? existing.titulo,
      agenda: rest.agenda ? rest.agenda.map((a) => a.trim()).filter(Boolean) : existing.agenda,
      updatedAt: Date.now(),
    });
  },
});

export const setEstado = mutation({
  args: {
    id: v.id("asambleas"),
    estado: estadoValidator,
    quorumAlcanzado: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Asamblea no encontrada.");
    await requireCondominioRole(ctx, existing.condominioId, [...WRITE_ROLES]);
    await ctx.db.patch(args.id, {
      estado: args.estado,
      quorumAlcanzado: args.quorumAlcanzado ?? existing.quorumAlcanzado,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("asambleas") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Asamblea no encontrada.");
    await requireCondominioRole(ctx, existing.condominioId, [...WRITE_ROLES]);
    // Borrar votaciones asociadas
    const votaciones = await ctx.db
      .query("votaciones")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.id))
      .collect();
    await Promise.all(votaciones.map((vt) => ctx.db.delete(vt._id)));
    if (existing.actaStorageId) await ctx.storage.delete(existing.actaStorageId);
    await ctx.db.delete(args.id);
  },
});

// ─── Votaciones ─────────────────────────────────────────────────────────────

export const listVotaciones = query({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return [];
    await requireCondominioRole(ctx, asamblea.condominioId, []);
    return await ctx.db
      .query("votaciones")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .order("desc")
      .collect();
  },
});

export const createVotacion = mutation({
  args: {
    asambleaId: v.id("asambleas"),
    pregunta: v.string(),
    opciones: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    await requireCondominioRole(ctx, asamblea.condominioId, [...WRITE_ROLES]);
    const now = Date.now();
    return await ctx.db.insert("votaciones", {
      condominioId: asamblea.condominioId,
      asambleaId: args.asambleaId,
      asambleaTitulo: asamblea.titulo,
      pregunta: args.pregunta.trim(),
      opciones: args.opciones.map((o) => o.trim()).filter(Boolean).map((texto) => ({ texto, votos: 0 })),
      estado: "abierta",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setVotos = mutation({
  args: {
    id: v.id("votaciones"),
    opciones: v.array(v.object({ texto: v.string(), votos: v.number() })),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Votación no encontrada.");
    await requireCondominioRole(ctx, existing.condominioId, [...WRITE_ROLES]);
    await ctx.db.patch(args.id, { opciones: args.opciones, updatedAt: Date.now() });
  },
});

export const toggleVotacion = mutation({
  args: { id: v.id("votaciones") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Votación no encontrada.");
    await requireCondominioRole(ctx, existing.condominioId, [...WRITE_ROLES]);
    await ctx.db.patch(args.id, {
      estado: existing.estado === "abierta" ? "cerrada" : "abierta",
      updatedAt: Date.now(),
    });
  },
});

export const removeVotacion = mutation({
  args: { id: v.id("votaciones") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Votación no encontrada.");
    await requireCondominioRole(ctx, existing.condominioId, [...WRITE_ROLES]);
    await ctx.db.delete(args.id);
  },
});

// ─────────────────────────────────────────────────────────────
// Asamblea en vivo: asistencia (quórum) y votación por unidad
// ─────────────────────────────────────────────────────────────

/** Unidades vinculadas al usuario en el condominio (con su doc). */
async function misUnidades(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  condominioId: Id<"condominios">,
) {
  const membership = await getMembership(ctx, userId, condominioId);
  if (!membership || !membership.isActive) return [];
  const links = await ctx.db
    .query("usuarioUnidad")
    .withIndex("by_membership", (q) => q.eq("membershipId", membership._id))
    .collect();
  const unidades = await Promise.all(links.map((l) => ctx.db.get(l.unidadId)));
  return unidades.filter((u): u is NonNullable<typeof u> => u !== null);
}

/**
 * El propietario registra su asistencia (una fila por unidad suya).
 * Idempotente: si la unidad ya está presente, no duplica.
 */
export const registrarAsistencia = mutation({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    if (asamblea.estado === "finalizada" || asamblea.estado === "cancelada") {
      throw new Error("La asamblea ya no está activa.");
    }
    const user = await requireAppUser(ctx);
    const unidades = await misUnidades(ctx, user._id, asamblea.condominioId);
    if (unidades.length === 0) {
      throw new Error("No tienes unidades vinculadas en este condominio.");
    }

    const now = Date.now();
    let registradas = 0;
    for (const unidad of unidades) {
      const existing = await ctx.db
        .query("asambleaAsistentes")
        .withIndex("by_asamblea_unidad", (q) =>
          q.eq("asambleaId", args.asambleaId).eq("unidadId", unidad._id),
        )
        .first();
      if (existing) continue;
      await ctx.db.insert("asambleaAsistentes", {
        condominioId: asamblea.condominioId,
        asambleaId: args.asambleaId,
        unidadId: unidad._id,
        unidadNumero: unidad.numero,
        userId: user._id,
        userNombre: user.name,
        coeficiente: unidad.coeficiente,
        createdAt: now,
      });
      registradas++;
    }
    return { registradas, unidades: unidades.length };
  },
});

/**
 * Quórum en tiempo real: % de coeficiente presente (o % de unidades si el
 * condominio no maneja coeficientes), unidades conectadas y total.
 */
export const quorum = query({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return null;
    await requireCondominioRole(ctx, asamblea.condominioId, []);

    const asistentes = await ctx.db
      .query("asambleaAsistentes")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .collect();

    const poderes = await ctx.db
      .query("poderesAsamblea")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .collect();
    const poderesValidados = poderes.filter((p) => p.validado);

    const unidades = await ctx.db
      .query("unidades")
      .withIndex("by_condominio", (q) => q.eq("condominioId", asamblea.condominioId))
      .collect();

    // Unidades presentes = asistencia ∪ poderes validados (dedup por unidad).
    const presentes = new Map<string, number>(); // unidadId → coeficiente
    for (const a of asistentes) presentes.set(a.unidadId as string, a.coeficiente ?? 0);
    for (const p of poderesValidados) {
      if (!presentes.has(p.unidadId as string)) {
        presentes.set(p.unidadId as string, p.coeficiente ?? 0);
      }
    }

    const totalCoef = unidades.reduce((s, u) => s + (u.coeficiente ?? 0), 0);
    const presenteCoef = [...presentes.values()].reduce((s, c) => s + c, 0);
    const unidadesPresentes = presentes.size;

    // Con coeficientes reales usa %; si no, proporción de unidades.
    const pct =
      totalCoef > 0
        ? (presenteCoef / totalCoef) * 100
        : unidades.length > 0
          ? (unidadesPresentes / unidades.length) * 100
          : 0;

    return {
      pct: Math.round(pct * 100) / 100,
      unidadesPresentes,
      totalUnidades: unidades.length,
      poderesActivos: poderesValidados.length,
      quorumRequerido: asamblea.quorumRequerido ?? 51,
      asistentes: asistentes
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 200)
        .map((a) => ({
          unidadNumero: a.unidadNumero,
          userNombre: a.userNombre,
          coeficiente: a.coeficiente ?? null,
          createdAt: a.createdAt,
          esPoder: false,
        })),
    };
  },
});

/** Asistencia y votos del usuario actual en la asamblea (para la UI). */
export const miParticipacion = query({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return null;
    const user = await getCurrentAppUser(ctx);
    if (!user) return null;

    const misAsistencias = await ctx.db
      .query("asambleaAsistentes")
      .withIndex("by_asamblea_user", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("userId", user._id),
      )
      .collect();

    const votos = await ctx.db
      .query("votosAsamblea")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .collect();
    const misVotos = votos.filter((vt) => vt.userId === user._id);

    return {
      presente: misAsistencias.length > 0,
      unidades: misAsistencias.map((a) => a.unidadNumero),
      votos: Object.fromEntries(misVotos.map((vt) => [vt.votacionId as string, vt.opcionIndex])),
    };
  },
});

/**
 * El propietario vota en una votación abierta. Un voto por unidad (todas sus
 * unidades votan la misma opción). Puede cambiar el voto mientras esté abierta.
 * Recalcula los contadores de la votación para el tablero en vivo.
 */
export const votar = mutation({
  args: { votacionId: v.id("votaciones"), opcionIndex: v.number() },
  handler: async (ctx, args) => {
    const votacion = await ctx.db.get(args.votacionId);
    if (!votacion) throw new Error("Votación no encontrada.");
    if (votacion.estado !== "abierta") throw new Error("La votación está cerrada.");
    if (args.opcionIndex < 0 || args.opcionIndex >= votacion.opciones.length) {
      throw new Error("Opción inválida.");
    }
    const user = await requireAppUser(ctx);

    // Debe estar presente en la asamblea para votar.
    const asistencia = await ctx.db
      .query("asambleaAsistentes")
      .withIndex("by_asamblea_user", (q) =>
        q.eq("asambleaId", votacion.asambleaId).eq("userId", user._id),
      )
      .first();
    if (!asistencia) throw new Error("Registra tu asistencia antes de votar.");

    // Poderes de la asamblea: unidades que delegué (no las voto) y las que me delegaron.
    const poderes = await ctx.db
      .query("poderesAsamblea")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", votacion.asambleaId))
      .collect();
    const delegadasAway = new Set(
      poderes.filter((p) => p.validado && p.otorganteUserId === user._id).map((p) => p.unidadId as string),
    );
    const delegadasAMi = poderes.filter((p) => p.validado && p.representanteUserId === user._id);

    // Unidades votables = propias (no delegadas) + delegadas a mí (poder validado).
    const propias = (await misUnidades(ctx, user._id, votacion.condominioId))
      .filter((u) => !delegadasAway.has(u._id as string))
      .map((u) => ({ id: u._id, numero: u.numero, coeficiente: u.coeficiente }));
    const delegadas = delegadasAMi.map((p) => ({
      id: p.unidadId,
      numero: p.unidadNumero,
      coeficiente: p.coeficiente,
    }));
    const votables = [...propias, ...delegadas];
    if (votables.length === 0) {
      throw new Error("No tienes unidades habilitadas para votar en esta asamblea.");
    }

    const now = Date.now();
    for (const unidad of votables) {
      const existing = await ctx.db
        .query("votosAsamblea")
        .withIndex("by_votacion_unidad", (q) =>
          q.eq("votacionId", args.votacionId).eq("unidadId", unidad.id),
        )
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          opcionIndex: args.opcionIndex,
          userId: user._id,
          createdAt: now,
        });
      } else {
        await ctx.db.insert("votosAsamblea", {
          condominioId: votacion.condominioId,
          asambleaId: votacion.asambleaId,
          votacionId: args.votacionId,
          unidadId: unidad.id,
          unidadNumero: unidad.numero,
          userId: user._id,
          opcionIndex: args.opcionIndex,
          coeficiente: unidad.coeficiente,
          createdAt: now,
        });
      }
    }

    // Recalcula contadores (unidades por opción) para el tablero en vivo.
    const votos = await ctx.db
      .query("votosAsamblea")
      .withIndex("by_votacion", (q) => q.eq("votacionId", args.votacionId))
      .collect();
    const opciones = votacion.opciones.map((o, i) => ({
      texto: o.texto,
      votos: votos.filter((vt) => vt.opcionIndex === i).length,
    }));
    await ctx.db.patch(args.votacionId, { opciones, updatedAt: now });

    return { ok: true as const };
  },
});

/** Resultados en vivo de una votación (conteo por unidades y por coeficiente). */
export const resultadosVotacion = query({
  args: { votacionId: v.id("votaciones") },
  handler: async (ctx, args) => {
    const votacion = await ctx.db.get(args.votacionId);
    if (!votacion) return null;
    await requireCondominioRole(ctx, votacion.condominioId, []);

    const votos = await ctx.db
      .query("votosAsamblea")
      .withIndex("by_votacion", (q) => q.eq("votacionId", args.votacionId))
      .collect();

    return {
      estado: votacion.estado,
      pregunta: votacion.pregunta,
      opciones: votacion.opciones.map((o, i) => {
        const propios = votos.filter((vt) => vt.opcionIndex === i);
        return {
          texto: o.texto,
          votos: propios.length,
          coeficiente: Math.round(propios.reduce((s, vt) => s + (vt.coeficiente ?? 0), 0) * 100) / 100,
        };
      }),
      totalVotos: votos.length,
    };
  },
});

// ─────────────────────────────────────────────────────────────
// Poderes (delegación de voto)
// ─────────────────────────────────────────────────────────────

/** Busca miembros del condominio para asignarles un poder (nombre/correo). */
export const buscarUsuarios = query({
  args: { condominioId: v.id("condominios"), search: v.string() },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, []);
    const term = args.search.trim().toLowerCase();
    if (term.length < 2) return [];

    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();

    const users = await Promise.all(memberships.map((m) => ctx.db.get(m.userId)));
    return users
      .filter((u): u is NonNullable<typeof u> => u !== null)
      .filter(
        (u) =>
          u.name.toLowerCase().includes(term) ||
          (u.email ?? "").toLowerCase().includes(term),
      )
      .slice(0, 20)
      .map((u) => ({ _id: u._id, name: u.name, email: u.email }));
  },
});

/** El propietario otorga un poder de una de SUS unidades a un representante. */
export const otorgarPoder = mutation({
  args: {
    asambleaId: v.id("asambleas"),
    unidadId: v.id("unidades"),
    representanteUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    if (asamblea.estado === "finalizada" || asamblea.estado === "cancelada") {
      throw new Error("La asamblea ya no está activa.");
    }
    const user = await requireAppUser(ctx);

    const propias = await misUnidades(ctx, user._id, asamblea.condominioId);
    const unidad = propias.find((u) => u._id === args.unidadId);
    if (!unidad) throw new Error("Esa unidad no está vinculada a tu cuenta.");

    if (args.representanteUserId === user._id) {
      throw new Error("No puedes otorgarte un poder a ti mismo.");
    }
    const representante = await ctx.db.get(args.representanteUserId);
    if (!representante) throw new Error("Representante no encontrado.");

    // Una unidad → un solo poder por asamblea.
    const existing = await ctx.db
      .query("poderesAsamblea")
      .withIndex("by_asamblea_unidad", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("unidadId", args.unidadId),
      )
      .first();
    if (existing) throw new Error("Esta unidad ya tiene un poder en esta asamblea.");

    // Límite: representante CON unidad propia → máximo 2 poderes. Externo: sin límite.
    const repUnidades = await misUnidades(ctx, representante._id, asamblea.condominioId);
    if (repUnidades.length > 0) {
      const suyos = await ctx.db
        .query("poderesAsamblea")
        .withIndex("by_representante", (q) =>
          q.eq("asambleaId", args.asambleaId).eq("representanteUserId", representante._id),
        )
        .collect();
      if (suyos.length >= 2) {
        throw new Error("Ese representante ya tiene el máximo de 2 poderes en esta asamblea.");
      }
    }

    const now = Date.now();
    return await ctx.db.insert("poderesAsamblea", {
      condominioId: asamblea.condominioId,
      asambleaId: args.asambleaId,
      unidadId: args.unidadId,
      unidadNumero: unidad.numero,
      coeficiente: unidad.coeficiente,
      otorganteUserId: user._id,
      otorganteNombre: user.name,
      representanteUserId: representante._id,
      representanteNombre: representante.name,
      validado: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** El representante (o admin) acepta o rechaza un poder recibido. */
export const responderPoder = mutation({
  args: { poderId: v.id("poderesAsamblea"), aceptar: v.boolean() },
  handler: async (ctx, args) => {
    const poder = await ctx.db.get(args.poderId);
    if (!poder) throw new Error("Poder no encontrado.");
    const { user } = await requireCondominioRole(ctx, poder.condominioId, []);
    const esAdmin =
      user.platformRole === "superadmin" || user.platformRole === "admin";
    if (poder.representanteUserId !== user._id && !esAdmin) {
      throw new Error("Solo el representante puede responder este poder.");
    }
    if (args.aceptar) {
      await ctx.db.patch(args.poderId, { validado: true, updatedAt: Date.now() });
    } else {
      await ctx.db.delete(args.poderId);
    }
  },
});

/** El otorgante (o admin) revoca un poder que otorgó, si aún no se ha votado con él. */
export const revocarPoder = mutation({
  args: { poderId: v.id("poderesAsamblea") },
  handler: async (ctx, args) => {
    const poder = await ctx.db.get(args.poderId);
    if (!poder) throw new Error("Poder no encontrado.");
    const { user } = await requireCondominioRole(ctx, poder.condominioId, []);
    const esAdmin =
      user.platformRole === "superadmin" || user.platformRole === "admin";
    if (poder.otorganteUserId !== user._id && !esAdmin) {
      throw new Error("Solo quien otorgó el poder puede revocarlo.");
    }
    // No revocar si esa unidad ya votó en la asamblea.
    const yaVoto = await ctx.db
      .query("votosAsamblea")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", poder.asambleaId))
      .collect();
    if (yaVoto.some((vt) => vt.unidadId === poder.unidadId)) {
      throw new Error("No se puede revocar: la unidad ya emitió un voto.");
    }
    await ctx.db.delete(args.poderId);
  },
});

/** Poderes que el usuario RECIBIÓ en esta asamblea (para aceptar/rechazar). */
export const poderesRecibidos = query({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) return [];
    return await ctx.db
      .query("poderesAsamblea")
      .withIndex("by_representante", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("representanteUserId", user._id),
      )
      .collect();
  },
});

/** Poderes que el usuario OTORGÓ en esta asamblea (para revocar). */
export const poderesOtorgados = query({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) return [];
    return await ctx.db
      .query("poderesAsamblea")
      .withIndex("by_otorgante", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("otorganteUserId", user._id),
      )
      .collect();
  },
});

/** Todos los poderes de la asamblea (vista admin). */
export const listPoderes = query({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return [];
    await requireCondominioRole(ctx, asamblea.condominioId, []);
    return await ctx.db
      .query("poderesAsamblea")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .collect();
  },
});

// ─────────────────────────────────────────────────────────────
// Admin de la sala en vivo
// ─────────────────────────────────────────────────────────────

/** El admin registra la asistencia de un usuario (QR o manual). */
export const registrarAsistenciaAdmin = mutation({
  args: { asambleaId: v.id("asambleas"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    await requireCondominioRole(ctx, asamblea.condominioId, [...WRITE_ROLES]);
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("Usuario no encontrado.");
    const unidades = await misUnidades(ctx, args.userId, asamblea.condominioId);
    if (unidades.length === 0) throw new Error("El usuario no tiene unidades vinculadas.");

    const now = Date.now();
    let registradas = 0;
    for (const unidad of unidades) {
      const ex = await ctx.db
        .query("asambleaAsistentes")
        .withIndex("by_asamblea_unidad", (q) =>
          q.eq("asambleaId", args.asambleaId).eq("unidadId", unidad._id),
        )
        .first();
      if (ex) continue;
      await ctx.db.insert("asambleaAsistentes", {
        condominioId: asamblea.condominioId,
        asambleaId: args.asambleaId,
        unidadId: unidad._id,
        unidadNumero: unidad.numero,
        userId: args.userId,
        userNombre: target.name,
        coeficiente: unidad.coeficiente,
        createdAt: now,
      });
      registradas++;
    }
    return { registradas, nombre: target.name };
  },
});

/** El admin quita la asistencia de una unidad. */
export const quitarAsistencia = mutation({
  args: { asistenteId: v.id("asambleaAsistentes") },
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.asistenteId);
    if (!a) return;
    await requireCondominioRole(ctx, a.condominioId, [...WRITE_ROLES]);
    await ctx.db.delete(args.asistenteId);
  },
});

/**
 * Registro detallado (tabla del admin): TODAS las unidades con su estado de
 * asistencia, quién representa (poder), coeficiente y el voto por cada votación.
 */
export const asistentesDetallado = query({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return { filas: [], asistentes: [] };
    await requireCondominioRole(ctx, asamblea.condominioId, []);

    const unidades = await ctx.db
      .query("unidades")
      .withIndex("by_condominio", (q) => q.eq("condominioId", asamblea.condominioId))
      .collect();
    const asistentes = await ctx.db
      .query("asambleaAsistentes")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .collect();
    const poderes = (
      await ctx.db
        .query("poderesAsamblea")
        .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
        .collect()
    ).filter((p) => p.validado);
    const votos = await ctx.db
      .query("votosAsamblea")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .collect();

    const asisMap = new Map(asistentes.map((a) => [a.unidadId as string, a]));
    const podMap = new Map(poderes.map((p) => [p.unidadId as string, p]));

    // Dueño (propietario) por unidad: membership → usuarioUnidad → user.
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_condominio", (q) => q.eq("condominioId", asamblea.condominioId))
      .collect();
    const propietarioPorUnidad = new Map<string, string>();
    for (const m of memberships) {
      const links = await ctx.db
        .query("usuarioUnidad")
        .withIndex("by_membership", (q) => q.eq("membershipId", m._id))
        .collect();
      if (links.length === 0) continue;
      const usr = await ctx.db.get(m.userId);
      const nombre = usr?.name ?? null;
      if (!nombre) continue;
      for (const l of links) {
        const key = l.unidadId as string;
        // Prefiere el vínculo "propietario"; si no, el primero que aparezca.
        if (!propietarioPorUnidad.has(key) || l.vinculo === "propietario") {
          propietarioPorUnidad.set(key, nombre);
        }
      }
    }

    const filas = unidades
      .map((u) => {
        const asis = asisMap.get(u._id as string);
        const pod = podMap.get(u._id as string);
        const votosUnidad = votos.filter((vt) => vt.unidadId === u._id);
        return {
          unidadId: u._id as string,
          unidadNumero: u.numero,
          coeficiente: u.coeficiente ?? null,
          presente: !!asis || !!pod,
          propietario: propietarioPorUnidad.get(u._id as string) ?? null,
          asistente: asis?.userNombre ?? null,
          representa: pod ? pod.representanteNombre : null,
          horaRegistro: asis?.createdAt ?? null,
          votos: Object.fromEntries(votosUnidad.map((vt) => [vt.votacionId as string, vt.opcionIndex])),
        };
      })
      .sort((a, b) => a.unidadNumero.localeCompare(b.unidadNumero, undefined, { numeric: true }));

    return {
      filas,
      asistentes: asistentes
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((a) => ({
          _id: a._id,
          unidadNumero: a.unidadNumero,
          userNombre: a.userNombre,
          coeficiente: a.coeficiente ?? null,
          createdAt: a.createdAt,
        })),
    };
  },
});

// ─────────────────────────────────────────────────────────────
// Orden del día estructurado (puntos con votación opcional)
// ─────────────────────────────────────────────────────────────

type PuntoOrden = {
  titulo: string;
  descripcion?: string;
  votacionId?: Id<"votaciones">;
};

/** Orden del día actual (usa el estructurado; si no existe, migra desde agenda). */
function ordenDiaActual(a: { ordenDia?: PuntoOrden[]; agenda: string[] }): PuntoOrden[] {
  if (a.ordenDia && a.ordenDia.length > 0) return [...a.ordenDia];
  return a.agenda.map((t) => ({ titulo: t }));
}

/** Agrega un punto al orden del día; opcionalmente crea su votación. */
export const agregarPunto = mutation({
  args: {
    asambleaId: v.id("asambleas"),
    titulo: v.string(),
    descripcion: v.optional(v.string()),
    habilitarVotacion: v.boolean(),
    opciones: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    await requireCondominioRole(ctx, asamblea.condominioId, [...WRITE_ROLES]);
    const titulo = args.titulo.trim();
    if (!titulo) throw new Error("El título del punto es obligatorio.");

    const now = Date.now();
    let votacionId: Id<"votaciones"> | undefined;
    if (args.habilitarVotacion) {
      const ops = (args.opciones ?? ["A favor", "En contra", "Abstención"])
        .map((o) => o.trim())
        .filter(Boolean);
      if (ops.length < 2) throw new Error("La votación necesita al menos 2 opciones.");
      votacionId = await ctx.db.insert("votaciones", {
        condominioId: asamblea.condominioId,
        asambleaId: args.asambleaId,
        asambleaTitulo: asamblea.titulo,
        pregunta: titulo,
        opciones: ops.map((texto) => ({ texto, votos: 0 })),
        estado: "cerrada", // se abre desde "Votación en vivo"
        createdAt: now,
        updatedAt: now,
      });
    }

    const orden = ordenDiaActual(asamblea);
    orden.push({ titulo, descripcion: args.descripcion?.trim() || undefined, votacionId });
    await ctx.db.patch(args.asambleaId, {
      ordenDia: orden,
      agenda: orden.map((p) => p.titulo),
      updatedAt: now,
    });
    return { ok: true as const };
  },
});

/** Edita el título/descripción de un punto (y la pregunta de su votación). */
export const editarPunto = mutation({
  args: {
    asambleaId: v.id("asambleas"),
    index: v.number(),
    titulo: v.string(),
    descripcion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    await requireCondominioRole(ctx, asamblea.condominioId, [...WRITE_ROLES]);
    const orden = ordenDiaActual(asamblea);
    const p = orden[args.index];
    if (!p) throw new Error("Punto no encontrado.");
    p.titulo = args.titulo.trim() || p.titulo;
    p.descripcion = args.descripcion?.trim() || undefined;
    if (p.votacionId) {
      const vt = await ctx.db.get(p.votacionId);
      if (vt) await ctx.db.patch(p.votacionId, { pregunta: p.titulo, updatedAt: Date.now() });
    }
    await ctx.db.patch(args.asambleaId, {
      ordenDia: orden,
      agenda: orden.map((x) => x.titulo),
      updatedAt: Date.now(),
    });
  },
});

/** Elimina un punto (y su votación ligada, si tiene). */
export const eliminarPunto = mutation({
  args: { asambleaId: v.id("asambleas"), index: v.number() },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    await requireCondominioRole(ctx, asamblea.condominioId, [...WRITE_ROLES]);
    const orden = ordenDiaActual(asamblea);
    const p = orden[args.index];
    if (!p) return;
    if (p.votacionId) {
      await ctx.db.delete(p.votacionId).catch(() => {});
    }
    orden.splice(args.index, 1);
    await ctx.db.patch(args.asambleaId, {
      ordenDia: orden,
      agenda: orden.map((x) => x.titulo),
      updatedAt: Date.now(),
    });
  },
});

/** Reordena un punto hacia arriba (-1) o abajo (1). */
export const moverPunto = mutation({
  args: { asambleaId: v.id("asambleas"), index: v.number(), dir: v.number() },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    await requireCondominioRole(ctx, asamblea.condominioId, [...WRITE_ROLES]);
    const orden = ordenDiaActual(asamblea);
    const j = args.index + (args.dir < 0 ? -1 : 1);
    if (args.index < 0 || args.index >= orden.length || j < 0 || j >= orden.length) return;
    const tmp = orden[args.index]!;
    orden[args.index] = orden[j]!;
    orden[j] = tmp;
    await ctx.db.patch(args.asambleaId, {
      ordenDia: orden,
      agenda: orden.map((x) => x.titulo),
      updatedAt: Date.now(),
    });
  },
});

/** Crea/quita la votación de un punto existente. */
export const toggleVotacionPunto = mutation({
  args: {
    asambleaId: v.id("asambleas"),
    index: v.number(),
    opciones: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    await requireCondominioRole(ctx, asamblea.condominioId, [...WRITE_ROLES]);
    const orden = ordenDiaActual(asamblea);
    const p = orden[args.index];
    if (!p) throw new Error("Punto no encontrado.");
    const now = Date.now();
    if (p.votacionId) {
      await ctx.db.delete(p.votacionId).catch(() => {});
      p.votacionId = undefined;
    } else {
      const ops = (args.opciones ?? ["A favor", "En contra", "Abstención"])
        .map((o) => o.trim())
        .filter(Boolean);
      p.votacionId = await ctx.db.insert("votaciones", {
        condominioId: asamblea.condominioId,
        asambleaId: args.asambleaId,
        asambleaTitulo: asamblea.titulo,
        pregunta: p.titulo,
        opciones: ops.map((texto) => ({ texto, votos: 0 })),
        estado: "cerrada",
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.patch(args.asambleaId, { ordenDia: orden, updatedAt: now });
  },
});
