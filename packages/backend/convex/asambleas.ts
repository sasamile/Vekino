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
import { resolveMediaUrl } from "./model/files";

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
    // Fuera de "en_curso" no debe haber votaciones abiertas al público.
    if (args.estado !== "en_curso") {
      const votaciones = await ctx.db
        .query("votaciones")
        .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.id))
        .collect();
      const now = Date.now();
      for (const vt of votaciones) {
        if (vt.estado === "abierta") {
          await ctx.db.patch(vt._id, { estado: "cerrada", updatedAt: now });
        }
      }
    }
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

export const cerrarVotacionesSiInactiva = mutation({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return { cerradas: 0 };
    await requireCondominioRole(ctx, asamblea.condominioId, [...WRITE_ROLES]);
    if (asamblea.estado === "en_curso") return { cerradas: 0 };
    const votaciones = await ctx.db
      .query("votaciones")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .collect();
    const now = Date.now();
    let cerradas = 0;
    for (const vt of votaciones) {
      if (vt.estado === "abierta") {
        await ctx.db.patch(vt._id, { estado: "cerrada", updatedAt: now });
        cerradas++;
      }
    }
    return { cerradas };
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
    // Solo se abre al público si la asamblea ya está en curso.
    const enCurso = asamblea.estado === "en_curso";
    return await ctx.db.insert("votaciones", {
      condominioId: asamblea.condominioId,
      asambleaId: args.asambleaId,
      asambleaTitulo: asamblea.titulo,
      pregunta: args.pregunta.trim(),
      opciones: args.opciones.map((o) => o.trim()).filter(Boolean).map((texto) => ({ texto, votos: 0 })),
      estado: enCurso ? "abierta" : "cerrada",
      ...(enCurso ? { abiertaAlgunaVez: true } : {}),
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
    const abrir = existing.estado !== "abierta";
    if (abrir) {
      const asamblea = await ctx.db.get(existing.asambleaId);
      if (!asamblea || asamblea.estado !== "en_curso") {
        throw new Error("Inicia la asamblea antes de abrir una votación.");
      }
    }
    await ctx.db.patch(args.id, {
      estado: abrir ? "abierta" : "cerrada",
      ...(abrir ? { abiertaAlgunaVez: true } : {}),
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

/** Admin / junta / representante de asamblea (o platform admin). */
async function esGestorAsamblea(
  ctx: QueryCtx | MutationCtx,
  condominioId: Id<"condominios">,
  user: { _id: Id<"users">; platformRole?: string | null },
) {
  if (user.platformRole === "superadmin" || user.platformRole === "admin") return true;
  const m = await getMembership(ctx, user._id, condominioId);
  if (!m?.isActive) return false;
  return m.roles.some((r) => (WRITE_ROLES as readonly string[]).includes(r));
}

/** Dueño (propietario) de una unidad, si existe. */
async function dueñoUnidad(
  ctx: QueryCtx | MutationCtx,
  unidadId: Id<"unidades">,
): Promise<{ userId: Id<"users">; nombre: string } | null> {
  const links = await ctx.db
    .query("usuarioUnidad")
    .withIndex("by_unidad", (q) => q.eq("unidadId", unidadId))
    .collect();
  if (links.length === 0) return null;
  const preferido =
    links.find((l) => l.vinculo === "propietario") ??
    links.find((l) => l.esPrincipal) ??
    links[0]!;
  const membership = await ctx.db.get(preferido.membershipId);
  if (!membership) return null;
  const usr = await ctx.db.get(membership.userId);
  if (!usr) return null;
  return { userId: usr._id, nombre: usr.name };
}

/**
 * El propietario registra su asistencia (sus casas + las que representa por poder).
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
    const { filas, poderesRecibidos } = await filasAsistenciaPersona(ctx, {
      asambleaId: args.asambleaId,
      condominioId: asamblea.condominioId,
      userId: user._id,
      userNombre: user.name,
    });
    if (filas.length === 0) {
      throw new Error(
        "No tienes unidades para registrar. Si delegaste tu poder, el apoderado usa su código en sala.",
      );
    }
    await validarPoderesAlRegistrar(ctx, poderesRecibidos);
    const registradas = await insertarAsistencias(ctx, {
      condominioId: asamblea.condominioId,
      asambleaId: args.asambleaId,
      filas,
    });
    return { registradas, unidades: filas.length };
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

    // Solo cuenta como presente el check-in real (QR / código / manual).
    // Aceptar un poder NO suma al quórum por sí solo: el apoderado debe
    // registrarse en sala. Si ya está presente, las unidades que representa SÍ cuentan.
    const presentes = new Map<string, number>(); // unidadId → coeficiente
    for (const a of asistentes) presentes.set(a.unidadId as string, a.coeficiente ?? 0);
    sumarUnidadesPorPoderPresente(presentes, asistentes, poderes);

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
          esPoder: !!a.esPoder,
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

    // Casas que este usuario representa por poder (validado) — si es apoderado con cuenta.
    const poderesRecibidos = await ctx.db
      .query("poderesAsamblea")
      .withIndex("by_representante", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("representanteUserId", user._id),
      )
      .collect();
    const representa = poderesRecibidos.filter((p) => p.validado).map((p) => p.unidadNumero);

    // Unidades propias que ya delegó (poder validado) → no necesita QR de asistencia.
    const poderesOtorgados = (
      await ctx.db
        .query("poderesAsamblea")
        .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
        .collect()
    ).filter((p) => p.validado && p.otorganteUserId === user._id);
    const unidades = await misUnidades(ctx, user._id, asamblea.condominioId);
    const delegadas = new Set(poderesOtorgados.map((p) => p.unidadId as string));
    const propiasSinDelegar = unidades.filter((u) => !delegadas.has(u._id as string));
    const delegoTodo = unidades.length > 0 && propiasSinDelegar.length === 0;

    return {
      presente: misAsistencias.length > 0,
      unidades: misAsistencias.map((a) => a.unidadNumero),
      representa,
      delegoTodo,
      apoderadoNombre: poderesOtorgados[0]?.representanteNombre ?? null,
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
    const asamblea = await ctx.db.get(votacion.asambleaId);
    if (!asamblea || asamblea.estado !== "en_curso") {
      throw new Error("La asamblea aún no ha iniciado.");
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
/** Genera un código de acceso corto (evita caracteres ambiguos). */
function generarCodigo(unidadId: string): string {
  const raw = (Date.now().toString(36) + unidadId)
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .replace(/[O0I1L]/g, "X");
  return raw.slice(-6);
}

/**
 * El propietario otorga un poder de una de SUS unidades a un apoderado (persona,
 * puede no tener cuenta). Se genera un CÓDIGO que el apoderado usará para entrar
 * y votar. Si el mismo apoderado (documento) ya tiene poder en esta asamblea, se
 * reutiliza su código (así representa varias casas con el mismo código).
 */
export const otorgarPoder = mutation({
  args: {
    asambleaId: v.id("asambleas"),
    unidadId: v.id("unidades"),
    documentoStorageId: v.optional(v.id("_storage")), // PDF/foto del poder firmado (legacy)
    documentoUrl: v.optional(v.string()),
    // Modo A: seleccionar un propietario existente del conjunto.
    representanteUserId: v.optional(v.id("users")),
    // Modo B: persona externa (por nombre/documento).
    apoderadoNombre: v.optional(v.string()),
    apoderadoDocumento: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ codigo: string; nombre: string; esPropietario: boolean }> => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    if (asamblea.estado === "finalizada" || asamblea.estado === "cancelada") {
      throw new Error("La asamblea ya no está activa.");
    }
    const user = await requireAppUser(ctx);
    const esWriter = await esGestorAsamblea(ctx, asamblea.condominioId, user);

    // Público solo puede otorgar mientras la asamblea está programada.
    // En curso: únicamente administración (registro manual interno).
    if (asamblea.estado === "en_curso") {
      if (!esWriter) {
        throw new Error(
          "La asamblea ya inició. Solo la administración puede registrar poderes.",
        );
      }
    } else if (asamblea.estado !== "programada") {
      throw new Error("La asamblea ya no está activa.");
    }

    let unidadNumero: string;
    let coeficiente: number | undefined;
    let otorganteUserId: Id<"users">;
    let otorganteNombre: string;

    if (esWriter) {
      const unidad = await ctx.db.get(args.unidadId);
      if (!unidad || unidad.condominioId !== asamblea.condominioId) {
        throw new Error("Unidad no válida para esta asamblea.");
      }
      unidadNumero = unidad.numero;
      coeficiente = unidad.coeficiente;
      const dueño = await dueñoUnidad(ctx, args.unidadId);
      otorganteUserId = dueño?.userId ?? user._id;
      otorganteNombre = dueño?.nombre ?? user.name;
    } else {
      const propias = await misUnidades(ctx, user._id, asamblea.condominioId);
      const unidad = propias.find((u) => u._id === args.unidadId);
      if (!unidad) throw new Error("Esa unidad no está vinculada a tu cuenta.");
      unidadNumero = unidad.numero;
      coeficiente = unidad.coeficiente;
      otorganteUserId = user._id;
      otorganteNombre = user.name;
    }

    // Resuelve el apoderado: usuario existente o persona externa.
    let nombre: string;
    let documento: string | undefined;
    let representanteExistente: Id<"users"> | undefined;
    if (args.representanteUserId) {
      if (args.representanteUserId === otorganteUserId) {
        throw new Error("No puedes dar el poder al mismo otorgante.");
      }
      const rep = await ctx.db.get(args.representanteUserId);
      if (!rep) throw new Error("Propietario no encontrado.");
      nombre = rep.name;
      documento = rep.numeroDocumento ?? undefined;
      representanteExistente = rep._id;
    } else {
      nombre = (args.apoderadoNombre ?? "").trim();
      if (!nombre) throw new Error("El nombre del apoderado es obligatorio.");
      documento = args.apoderadoDocumento?.trim() || undefined;
    }

    // Una unidad → un solo poder por asamblea.
    const existing = await ctx.db
      .query("poderesAsamblea")
      .withIndex("by_asamblea_unidad", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("unidadId", args.unidadId),
      )
      .first();
    if (existing) throw new Error("Esta unidad ya tiene un poder en esta asamblea.");

    // Reutiliza el código si el mismo apoderado (documento, o nombre) ya tiene poder.
    const todos = await ctx.db
      .query("poderesAsamblea")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .collect();
    const mismo = todos.find((p) =>
      documento
        ? p.apoderadoDocumento === documento
        : p.representanteNombre.toLowerCase() === nombre.toLowerCase(),
    );
    const codigo = mismo?.codigoAcceso ?? generarCodigo(args.unidadId as string);

    // Si el apoderado ya es un propietario del conjunto, se enlaza a su cuenta
    // para que también pueda votar desde su propia sesión.
    let representanteUserId: Id<"users"> | undefined =
      representanteExistente ?? mismo?.representanteUserId;
    if (!representanteUserId && documento) {
      const posible = await ctx.db
        .query("users")
        .withIndex("by_numeroDocumento", (q) => q.eq("numeroDocumento", documento))
        .first();
      if (posible) {
        const m = await getMembership(ctx, posible._id, asamblea.condominioId);
        if (m) representanteUserId = posible._id;
      }
    }

    const now = Date.now();
    await ctx.db.insert("poderesAsamblea", {
      condominioId: asamblea.condominioId,
      asambleaId: args.asambleaId,
      unidadId: args.unidadId,
      unidadNumero,
      coeficiente,
      otorganteUserId,
      otorganteNombre,
      representanteUserId,
      representanteNombre: nombre,
      apoderadoDocumento: documento,
      codigoAcceso: codigo,
      documentoStorageId: args.documentoStorageId,
      documentoUrl: args.documentoUrl,
      // Vecino del conjunto: debe aceptar el poder. Externo: válido con el código.
      // Registro por administración queda validado de una vez.
      validado: esWriter ? true : !representanteUserId,
      createdAt: now,
      updatedAt: now,
    });
    return { codigo, nombre, esPropietario: !!representanteUserId };
  },
});

/** El representante (o admin) acepta o rechaza un poder recibido. */
export const responderPoder = mutation({
  args: { poderId: v.id("poderesAsamblea"), aceptar: v.boolean() },
  handler: async (ctx, args) => {
    const poder = await ctx.db.get(args.poderId);
    if (!poder) throw new Error("Poder no encontrado.");
    const asamblea = await ctx.db.get(poder.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    const { user } = await requireCondominioRole(ctx, poder.condominioId, []);
    const esWriter = await esGestorAsamblea(ctx, poder.condominioId, user);

    if (asamblea.estado !== "programada") {
      if (!esWriter) {
        throw new Error(
          "Con la asamblea en curso, solo la administración puede gestionar poderes.",
        );
      }
    } else if (poder.representanteUserId !== user._id && !esWriter) {
      throw new Error("Solo el representante puede responder este poder.");
    }

    if (args.aceptar) {
      await ctx.db.patch(args.poderId, { validado: true, updatedAt: Date.now() });
      // Si el apoderado ya hizo check-in, suma ya la unidad al quórum.
      if (poder.representanteUserId) {
        const yaPresente = await ctx.db
          .query("asambleaAsistentes")
          .withIndex("by_asamblea_user", (q) =>
            q.eq("asambleaId", poder.asambleaId).eq("userId", poder.representanteUserId!),
          )
          .first();
        if (yaPresente) {
          await insertarAsistencias(ctx, {
            condominioId: poder.condominioId,
            asambleaId: poder.asambleaId,
            filas: [
              {
                unidadId: poder.unidadId,
                unidadNumero: poder.unidadNumero,
                userId: poder.representanteUserId,
                userNombre: poder.representanteNombre,
                coeficiente: poder.coeficiente,
                esPoder: true,
              },
            ],
          });
        }
      }
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
    const asamblea = await ctx.db.get(poder.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    const { user } = await requireCondominioRole(ctx, poder.condominioId, []);
    const esWriter = await esGestorAsamblea(ctx, poder.condominioId, user);

    if (asamblea.estado !== "programada") {
      if (!esWriter) {
        throw new Error(
          "Con la asamblea en curso, solo la administración puede revocar poderes.",
        );
      }
    } else if (poder.otorganteUserId !== user._id && !esWriter) {
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

/** URL firmada — @deprecated usar api.files.generateUploadUrl (S3). */
export const generateUploadUrl = mutation({
  args: {},
  handler: async () => {
    throw new Error(
      "Las subidas van a S3. Usa api.files.generateUploadUrl (action).",
    );
  },
});

/** Poderes que el usuario RECIBIÓ en esta asamblea (para aceptar/rechazar). */
export const poderesRecibidos = query({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) return [];
    const poderes = await ctx.db
      .query("poderesAsamblea")
      .withIndex("by_representante", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("representanteUserId", user._id),
      )
      .collect();
    return await Promise.all(
      poderes.map(async (p) => ({
        ...p,
        documentoUrl:
          (await resolveMediaUrl(ctx, {
            url: p.documentoUrl,
            storageId: p.documentoStorageId,
          })) || null,
      })),
    );
  },
});

/** Poderes que el usuario OTORGÓ en esta asamblea (para revocar). */
export const poderesOtorgados = query({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) return [];
    const poderes = await ctx.db
      .query("poderesAsamblea")
      .withIndex("by_otorgante", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("otorganteUserId", user._id),
      )
      .collect();
    return await Promise.all(
      poderes.map(async (p) => ({
        ...p,
        documentoUrl:
          (await resolveMediaUrl(ctx, {
            url: p.documentoUrl,
            storageId: p.documentoStorageId,
          })) || null,
      })),
    );
  },
});

/** Todos los poderes de la asamblea (vista admin). */
export const listPoderes = query({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return [];
    await requireCondominioRole(ctx, asamblea.condominioId, []);
    const poderes = await ctx.db
      .query("poderesAsamblea")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .collect();

    // ¿El apoderado es propietario del condominio (tiene unidad) o persona externa?
    const propietariosUserIds = new Set<string>();
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_condominio", (q) => q.eq("condominioId", asamblea.condominioId))
      .collect();
    for (const m of memberships) {
      if (!m.isActive) continue;
      const links = await ctx.db
        .query("usuarioUnidad")
        .withIndex("by_membership", (q) => q.eq("membershipId", m._id))
        .first();
      if (links) propietariosUserIds.add(m.userId as string);
    }

    return await Promise.all(
      poderes.map(async (p) => {
        const esPropietario = p.representanteUserId
          ? propietariosUserIds.has(p.representanteUserId as string)
          : false;
        const documentoUrl =
          (await resolveMediaUrl(ctx, {
            url: p.documentoUrl,
            storageId: p.documentoStorageId,
          })) || null;
        return {
          ...p,
          documentoUrl,
          representanteTipo: esPropietario ? ("propietario" as const) : ("externo" as const),
        };
      }),
    );
  },
});

/**
 * Paquete completo para auditoría: asamblea, poderes (con URL de documento)
 * y resultados de todas las votaciones (coeficiente + veredicto).
 */
export const paqueteAuditoria = query({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return null;
    await requireCondominioRole(ctx, asamblea.condominioId, [...WRITE_ROLES]);

    const condominio = await ctx.db.get(asamblea.condominioId);
    const poderes = await ctx.db
      .query("poderesAsamblea")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .collect();

    const propietariosUserIds = new Set<string>();
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_condominio", (q) => q.eq("condominioId", asamblea.condominioId))
      .collect();
    for (const m of memberships) {
      if (!m.isActive) continue;
      const links = await ctx.db
        .query("usuarioUnidad")
        .withIndex("by_membership", (q) => q.eq("membershipId", m._id))
        .first();
      if (links) propietariosUserIds.add(m.userId as string);
    }

    const poderesOut = await Promise.all(
      poderes
        .slice()
        .sort((a, b) =>
          a.unidadNumero.localeCompare(b.unidadNumero, undefined, { numeric: true }),
        )
        .map(async (p) => {
          const esPropietario = p.representanteUserId
            ? propietariosUserIds.has(p.representanteUserId as string)
            : false;
          const documentoUrl =
            (await resolveMediaUrl(ctx, {
              url: p.documentoUrl,
              storageId: p.documentoStorageId,
            })) || null;
          return {
            unidadNumero: p.unidadNumero,
            coeficiente: p.coeficiente ?? null,
            otorganteNombre: p.otorganteNombre,
            representanteNombre: p.representanteNombre,
            apoderadoDocumento: p.apoderadoDocumento ?? null,
            codigoAcceso: p.codigoAcceso,
            validado: p.validado,
            representanteTipo: esPropietario
              ? ("propietario" as const)
              : ("externo" as const),
            tieneDocumento: !!(documentoUrl || p.documentoStorageId),
            documentoUrl,
            createdAt: p.createdAt,
          };
        }),
    );

    const votaciones = await ctx.db
      .query("votaciones")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .collect();

    const resultados = await Promise.all(
      votaciones.map(async (vt) => {
        const votos = await ctx.db
          .query("votosAsamblea")
          .withIndex("by_votacion", (q) => q.eq("votacionId", vt._id))
          .collect();
        const opciones = vt.opciones.map((o, i) => {
          const propios = votos.filter((v) => v.opcionIndex === i);
          return {
            texto: o.texto,
            votos: propios.length,
            coeficiente:
              Math.round(propios.reduce((s, v) => s + (v.coeficiente ?? 0), 0) * 100) / 100,
          };
        });
        return {
          pregunta: vt.pregunta,
          estado: vt.estado,
          abiertaAlgunaVez: vt.abiertaAlgunaVez ?? false,
          totalVotos: votos.length,
          opciones,
        };
      }),
    );

    const ordenDia =
      asamblea.ordenDia && asamblea.ordenDia.length > 0
        ? asamblea.ordenDia.map((p) => ({
            titulo: p.titulo,
            descripcion: p.descripcion ?? null,
            hecho: !!p.hecho,
            tieneVotacion: !!p.votacionId,
          }))
        : asamblea.agenda.map((t) => ({
            titulo: t,
            descripcion: null as string | null,
            hecho: false,
            tieneVotacion: false,
          }));

    return {
      condominioNombre: condominio?.name ?? "Condominio",
      asamblea: {
        titulo: asamblea.titulo,
        tipo: asamblea.tipo,
        modalidad: asamblea.modalidad,
        estado: asamblea.estado,
        fecha: asamblea.fecha,
        hora: asamblea.hora,
        lugar: asamblea.lugar ?? null,
        quorumRequerido: asamblea.quorumRequerido ?? 51,
      },
      ordenDia,
      poderes: poderesOut,
      resultados,
      generadoEn: Date.now(),
    };
  },
});

// ─────────────────────────────────────────────────────────────
// Admin de la sala en vivo
// ─────────────────────────────────────────────────────────────

/**
 * Inserta filas de asistencia (idempotente). Devuelve cuántas se crearon.
 */
async function insertarAsistencias(
  ctx: MutationCtx,
  args: {
    condominioId: Id<"condominios">;
    asambleaId: Id<"asambleas">;
    filas: {
      unidadId: Id<"unidades">;
      unidadNumero: string;
      userId: Id<"users">;
      userNombre: string;
      coeficiente?: number;
      esPoder?: boolean;
    }[];
  },
) {
  const now = Date.now();
  let registradas = 0;
  for (const f of args.filas) {
    const ex = await ctx.db
      .query("asambleaAsistentes")
      .withIndex("by_asamblea_unidad", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("unidadId", f.unidadId),
      )
      .first();
    if (ex) continue;
    await ctx.db.insert("asambleaAsistentes", {
      condominioId: args.condominioId,
      asambleaId: args.asambleaId,
      unidadId: f.unidadId,
      unidadNumero: f.unidadNumero,
      userId: f.userId,
      userNombre: f.userNombre,
      coeficiente: f.coeficiente,
      esPoder: f.esPoder,
      createdAt: now,
    });
    registradas++;
  }
  return registradas;
}

/**
 * Unidades a registrar cuando llega una persona:
 * - sus casas propias (no delegadas)
 * - casas que representa por poder (asignado a su userId; al check-in se valida)
 */
async function filasAsistenciaPersona(
  ctx: MutationCtx,
  args: {
    asambleaId: Id<"asambleas">;
    condominioId: Id<"condominios">;
    userId: Id<"users">;
    userNombre: string;
  },
) {
  const poderes = await ctx.db
    .query("poderesAsamblea")
    .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
    .collect();
  const delegadasAway = new Set(
    poderes
      .filter((p) => p.validado && p.otorganteUserId === args.userId)
      .map((p) => p.unidadId as string),
  );
  const propias = (await misUnidades(ctx, args.userId, args.condominioId)).filter(
    (u) => !delegadasAway.has(u._id as string),
  );
  // Incluye pendientes: al registrarse en sala, el apoderado asume esos poderes.
  const recibidos = poderes.filter((p) => p.representanteUserId === args.userId);

  const filas: {
    unidadId: Id<"unidades">;
    unidadNumero: string;
    userId: Id<"users">;
    userNombre: string;
    coeficiente?: number;
    esPoder?: boolean;
  }[] = [];

  for (const u of propias) {
    filas.push({
      unidadId: u._id,
      unidadNumero: u.numero,
      userId: args.userId,
      userNombre: args.userNombre,
      coeficiente: u.coeficiente,
      esPoder: false,
    });
  }
  for (const p of recibidos) {
    filas.push({
      unidadId: p.unidadId,
      unidadNumero: p.unidadNumero,
      userId: args.userId,
      userNombre: args.userNombre,
      coeficiente: p.coeficiente,
      esPoder: true,
    });
  }
  return { filas, poderesRecibidos: recibidos };
}

/** Marca como validados los poderes que la persona acaba de ejercer en sala. */
async function validarPoderesAlRegistrar(
  ctx: MutationCtx,
  poderes: { _id: Id<"poderesAsamblea">; validado: boolean }[],
) {
  const now = Date.now();
  for (const p of poderes) {
    if (!p.validado) {
      await ctx.db.patch(p._id, { validado: true, updatedAt: now });
    }
  }
}

/**
 * Si el apoderado ya está presente (check-in con su userId), las unidades
 * de poderes que representa también suman al quórum (aunque el poder
 * aún figure como pendiente: estar en sala lo ejerce de hecho).
 */
function sumarUnidadesPorPoderPresente(
  presentes: Map<string, number>,
  asistentes: { userId: Id<"users"> }[],
  poderes: {
    unidadId: Id<"unidades">;
    coeficiente?: number;
    representanteUserId?: Id<"users">;
  }[],
) {
  const usersPresentes = new Set(asistentes.map((a) => a.userId as string));
  for (const p of poderes) {
    if (!p.representanteUserId) continue;
    if (!usersPresentes.has(p.representanteUserId as string)) continue;
    const uid = p.unidadId as string;
    if (presentes.has(uid)) continue;
    presentes.set(uid, p.coeficiente ?? 0);
  }
}

/** El admin registra la asistencia de un usuario (QR o manual). */
export const registrarAsistenciaAdmin = mutation({
  args: { asambleaId: v.id("asambleas"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    await requireCondominioRole(ctx, asamblea.condominioId, [...WRITE_ROLES]);
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("Usuario no encontrado.");

    const { filas, poderesRecibidos } = await filasAsistenciaPersona(ctx, {
      asambleaId: args.asambleaId,
      condominioId: asamblea.condominioId,
      userId: args.userId,
      userNombre: target.name,
    });
    if (filas.length === 0) {
      throw new Error(
        "Esta persona no tiene unidades propias ni poderes para registrar. Si solo es apoderado externo, usa su código.",
      );
    }
    await validarPoderesAlRegistrar(ctx, poderesRecibidos);
    const registradas = await insertarAsistencias(ctx, {
      condominioId: asamblea.condominioId,
      asambleaId: args.asambleaId,
      filas,
    });
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

/** El admin registra asistencia con el código de un poder (apoderado). */
export const registrarAsistenciaPorCodigo = mutation({
  args: { asambleaId: v.id("asambleas"), codigo: v.string() },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    if (asamblea.estado === "finalizada" || asamblea.estado === "cancelada") {
      throw new Error("La asamblea ya no está activa.");
    }
    await requireCondominioRole(ctx, asamblea.condominioId, [...WRITE_ROLES]);

    const codigo = args.codigo.trim().toUpperCase();
    if (codigo.length < 4) throw new Error("Código inválido.");

    const poderes = (
      await ctx.db
        .query("poderesAsamblea")
        .withIndex("by_codigo", (q) => q.eq("codigoAcceso", codigo))
        .collect()
    ).filter((p) => p.asambleaId === args.asambleaId);

    if (poderes.length === 0) {
      throw new Error("Código no encontrado en esta asamblea.");
    }

    const now = Date.now();
    for (const p of poderes) {
      if (!p.validado) {
        await ctx.db.patch(p._id, { validado: true, updatedAt: now });
      }
    }

    const repUserId = poderes.find((p) => p.representanteUserId)?.representanteUserId;
    const repNombre = poderes[0]!.representanteNombre;

    const filas: {
      unidadId: Id<"unidades">;
      unidadNumero: string;
      userId: Id<"users">;
      userNombre: string;
      coeficiente?: number;
      esPoder?: boolean;
    }[] = [];

    for (const p of poderes) {
      const uid = p.representanteUserId ?? p.otorganteUserId;
      filas.push({
        unidadId: p.unidadId,
        unidadNumero: p.unidadNumero,
        userId: uid,
        userNombre: p.representanteNombre,
        coeficiente: p.coeficiente,
        esPoder: true,
      });
    }

    // Si el apoderado también es propietario, registra sus casas propias.
    if (repUserId) {
      const { filas: propias } = await filasAsistenciaPersona(ctx, {
        asambleaId: args.asambleaId,
        condominioId: asamblea.condominioId,
        userId: repUserId,
        userNombre: repNombre,
      });
      const seen = new Set(filas.map((f) => f.unidadId as string));
      for (const f of propias) {
        if (!seen.has(f.unidadId as string)) {
          filas.push(f);
          seen.add(f.unidadId as string);
        }
      }
    }

    const registradas = await insertarAsistencias(ctx, {
      condominioId: asamblea.condominioId,
      asambleaId: args.asambleaId,
      filas,
    });

    return {
      registradas,
      nombre: repNombre,
      unidades: filas.map((f) => f.unidadNumero),
    };
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
    // Solo administración / mesa de asistencia (no residentes).
    await requireCondominioRole(ctx, asamblea.condominioId, [
      ...WRITE_ROLES,
      "contadora",
    ]);

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

    // Unidades que cada persona (userId / nombre) representa por poder.
    const representaPorUser = new Map<string, string[]>();
    const representaPorNombre = new Map<string, string[]>();
    for (const p of poderes) {
      if (p.representanteUserId) {
        const key = p.representanteUserId as string;
        const arr = representaPorUser.get(key) ?? [];
        arr.push(p.unidadNumero);
        representaPorUser.set(key, arr);
      }
      const nk = p.representanteNombre.trim().toLowerCase();
      const arrN = representaPorNombre.get(nk) ?? [];
      arrN.push(p.unidadNumero);
      representaPorNombre.set(nk, arrN);
    }

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
        let tambienRepresenta: string[] = [];
        if (asis && !asis.esPoder) {
          const byUser = asis.userId
            ? representaPorUser.get(asis.userId as string) ?? []
            : [];
          const byName = representaPorNombre.get((asis.userNombre ?? "").trim().toLowerCase()) ?? [];
          tambienRepresenta = [...new Set([...byUser, ...byName])].sort((a, b) =>
            a.localeCompare(b, undefined, { numeric: true }),
          );
        }
        return {
          unidadId: u._id as string,
          unidadNumero: u.numero,
          coeficiente: u.coeficiente ?? null,
          // Solo cuenta como "asistió" si hubo registro explícito (QR/código/manual).
          // Aceptar un poder NO marca asistencia.
          presente: !!asis,
          tienePoder: !!pod,
          porPoder: !!asis?.esPoder,
          propietario: propietarioPorUnidad.get(u._id as string) ?? null,
          asistente: asis?.userNombre ?? null,
          /** Nombre del apoderado (si esta unidad tiene poder). */
          representa: pod ? pod.representanteNombre : null,
          /** Unidades que esta persona también representa (fila de su casa propia). */
          tambienRepresenta,
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
  hecho?: boolean;
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

/** Marca / desmarca un punto del orden del día como realizado. */
export const togglePuntoHecho = mutation({
  args: { asambleaId: v.id("asambleas"), index: v.number() },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    await requireCondominioRole(ctx, asamblea.condominioId, [...WRITE_ROLES]);
    const orden = ordenDiaActual(asamblea);
    const p = orden[args.index];
    if (!p) throw new Error("Punto no encontrado.");
    p.hecho = !p.hecho;
    await ctx.db.patch(args.asambleaId, {
      ordenDia: orden,
      updatedAt: Date.now(),
    });
    return { hecho: !!p.hecho };
  },
});

// ─────────────────────────────────────────────────────────────
// Acceso del APODERADO por código (sin cuenta)
// ─────────────────────────────────────────────────────────────

/** El apoderado entra con su código: ve las casas que representa y las votaciones. */
export const accederConCodigo = query({
  args: { codigo: v.string() },
  handler: async (ctx, args) => {
    const codigo = args.codigo.trim().toUpperCase();
    if (codigo.length < 4) return null;

    const poderes = await ctx.db
      .query("poderesAsamblea")
      .withIndex("by_codigo", (q) => q.eq("codigoAcceso", codigo))
      .collect();
    if (poderes.length === 0) return null;

    const asamblea = await ctx.db.get(poderes[0]!.asambleaId);
    if (!asamblea) return null;
    // Código deja de servir cuando la asamblea cierra.
    if (asamblea.estado === "finalizada" || asamblea.estado === "cancelada") {
      return null;
    }

    const votaciones = await ctx.db
      .query("votaciones")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", asamblea._id))
      .order("desc")
      .collect();

    const misVotos = (
      await ctx.db
        .query("votosAsamblea")
        .withIndex("by_asamblea", (q) => q.eq("asambleaId", asamblea._id))
        .collect()
    ).filter((vt) => vt.codigoApoderado === codigo);
    const votoPorVotacion = new Map<string, number>();
    for (const vt of misVotos) votoPorVotacion.set(vt.votacionId as string, vt.opcionIndex);

    // Quórum (mismo cálculo que la vista de admin: solo check-in real).
    const asistentes = await ctx.db
      .query("asambleaAsistentes")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", asamblea._id))
      .collect();
    const unidadesCond = await ctx.db
      .query("unidades")
      .withIndex("by_condominio", (q) => q.eq("condominioId", asamblea.condominioId))
      .collect();
    const presentes = new Map<string, number>();
    for (const a of asistentes) presentes.set(a.unidadId as string, a.coeficiente ?? 0);
    const poderesAsamblea = await ctx.db
      .query("poderesAsamblea")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", asamblea._id))
      .collect();
    sumarUnidadesPorPoderPresente(
      presentes,
      asistentes,
      poderesAsamblea,
    );
    // ¿Ya están registradas como presentes TODAS las unidades de este apoderado?
    const asistenciaRegistrada = poderes.every((p) => presentes.has(p.unidadId as string));
    const totalCoef = unidadesCond.reduce((s, u) => s + (u.coeficiente ?? 0), 0);
    const presenteCoef = [...presentes.values()].reduce((s, c) => s + c, 0);
    const pctQuorum =
      totalCoef > 0
        ? (presenteCoef / totalCoef) * 100
        : unidadesCond.length > 0
          ? (presentes.size / unidadesCond.length) * 100
          : 0;

    // Orden del día (con la pregunta/estado de su votación si tiene).
    const votacionPorId = new Map(votaciones.map((vt) => [vt._id as string, vt]));
    const ordenDia = ordenDiaActual(asamblea).map((p) => {
      const vt = p.votacionId ? votacionPorId.get(p.votacionId as string) : undefined;
      return {
        titulo: p.titulo,
        descripcion: p.descripcion ?? null,
        votacionId: p.votacionId ?? null,
        hecho: !!p.hecho,
        estadoVotacion: vt ? vt.estado : null,
      };
    });

    return {
      apoderadoNombre: poderes[0]!.representanteNombre,
      asamblea: {
        _id: asamblea._id,
        titulo: asamblea.titulo,
        tipo: asamblea.tipo,
        modalidad: asamblea.modalidad,
        estado: asamblea.estado,
        fecha: asamblea.fecha,
        hora: asamblea.hora,
      },
      validado: poderes.every((p) => p.validado),
      asistenciaRegistrada,
      quorum: {
        pct: Math.round(pctQuorum * 100) / 100,
        unidadesPresentes: presentes.size,
        totalUnidades: unidadesCond.length,
        quorumRequerido: asamblea.quorumRequerido ?? 51,
      },
      ordenDia,
      unidades: poderes.map((p) => ({ unidadNumero: p.unidadNumero, coeficiente: p.coeficiente ?? null, validado: p.validado })),
      votaciones: votaciones.map((vt) => ({
        _id: vt._id,
        pregunta: vt.pregunta,
        estado: vt.estado,
        abiertaAlgunaVez: vt.abiertaAlgunaVez ?? false,
        opciones: vt.opciones,
        miVoto: votoPorVotacion.get(vt._id as string) ?? null,
      })),
    };
  },
});

/**
 * El apoderado registra su asistencia con el código (página pública `/apoderado`).
 * El código es la credencial: marca presentes las casas que representa y valida
 * los poderes. Sirve para asambleas presenciales/mixtas donde se toma asistencia.
 */
export const registrarAsistenciaConCodigo = mutation({
  args: { codigo: v.string() },
  handler: async (ctx, args) => {
    const codigo = args.codigo.trim().toUpperCase();
    if (codigo.length < 4) throw new Error("Código inválido.");

    const poderes = await ctx.db
      .query("poderesAsamblea")
      .withIndex("by_codigo", (q) => q.eq("codigoAcceso", codigo))
      .collect();
    if (poderes.length === 0) throw new Error("Código no encontrado.");

    const asamblea = await ctx.db.get(poderes[0]!.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    if (asamblea.estado === "finalizada" || asamblea.estado === "cancelada") {
      throw new Error("La asamblea ya no está activa.");
    }
    // En presenciales/mixtas la asistencia la corrobora el administrador; el
    // apoderado solo puede auto-registrarse en asambleas virtuales.
    if (asamblea.modalidad !== "virtual") {
      throw new Error("En asambleas presenciales el administrador registra la asistencia con tu código.");
    }

    const now = Date.now();
    let registradas = 0;
    for (const p of poderes) {
      if (!p.validado) await ctx.db.patch(p._id, { validado: true, updatedAt: now });
      const ex = await ctx.db
        .query("asambleaAsistentes")
        .withIndex("by_asamblea_unidad", (q) =>
          q.eq("asambleaId", asamblea._id).eq("unidadId", p.unidadId),
        )
        .first();
      if (ex) continue;
      await ctx.db.insert("asambleaAsistentes", {
        condominioId: asamblea.condominioId,
        asambleaId: asamblea._id,
        unidadId: p.unidadId,
        unidadNumero: p.unidadNumero,
        userId: p.representanteUserId ?? p.otorganteUserId,
        userNombre: p.representanteNombre,
        coeficiente: p.coeficiente,
        esPoder: true,
        createdAt: now,
      });
      registradas++;
    }
    return { registradas, unidades: poderes.map((p) => p.unidadNumero) };
  },
});

/** El apoderado vota (con su código) por todas las casas que representa. */
export const votarConCodigo = mutation({
  args: { codigo: v.string(), votacionId: v.id("votaciones"), opcionIndex: v.number() },
  handler: async (ctx, args) => {
    const codigo = args.codigo.trim().toUpperCase();
    const votacion = await ctx.db.get(args.votacionId);
    if (!votacion) throw new Error("Votación no encontrada.");
    if (votacion.estado !== "abierta") throw new Error("La votación está cerrada.");
    if (args.opcionIndex < 0 || args.opcionIndex >= votacion.opciones.length) {
      throw new Error("Opción inválida.");
    }
    const asamblea = await ctx.db.get(votacion.asambleaId);
    if (!asamblea || asamblea.estado !== "en_curso") {
      throw new Error("La asamblea aún no ha iniciado.");
    }

    const poderes = (
      await ctx.db
        .query("poderesAsamblea")
        .withIndex("by_codigo", (q) => q.eq("codigoAcceso", codigo))
        .collect()
    ).filter((p) => p.validado && p.asambleaId === votacion.asambleaId);
    if (poderes.length === 0) throw new Error("Código inválido o poderes no validados.");

    const now = Date.now();
    for (const p of poderes) {
      const ex = await ctx.db
        .query("votosAsamblea")
        .withIndex("by_votacion_unidad", (q) =>
          q.eq("votacionId", args.votacionId).eq("unidadId", p.unidadId),
        )
        .first();
      if (ex) {
        await ctx.db.patch(ex._id, { opcionIndex: args.opcionIndex, codigoApoderado: codigo, userId: undefined, createdAt: now });
      } else {
        await ctx.db.insert("votosAsamblea", {
          condominioId: votacion.condominioId,
          asambleaId: votacion.asambleaId,
          votacionId: args.votacionId,
          unidadId: p.unidadId,
          unidadNumero: p.unidadNumero,
          codigoApoderado: codigo,
          opcionIndex: args.opcionIndex,
          coeficiente: p.coeficiente,
          createdAt: now,
        });
      }
    }

    const votos = await ctx.db
      .query("votosAsamblea")
      .withIndex("by_votacion", (q) => q.eq("votacionId", args.votacionId))
      .collect();
    await ctx.db.patch(args.votacionId, {
      opciones: votacion.opciones.map((o, i) => ({ texto: o.texto, votos: votos.filter((vt) => vt.opcionIndex === i).length })),
      updatedAt: now,
    });
    return { ok: true as const };
  },
});
