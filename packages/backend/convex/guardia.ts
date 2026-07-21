import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  getCurrentAppUser,
  requireCondominioRole,
  getMembership,
  hasPlatformRole,
} from "./model/authz";
import { logMinuta, turnoAbierto } from "./model/minuta";
import { esVisitanteVigente, ventanaHoyBogota } from "./model/visitantes";
import { displayNameFromUser } from "./model/displayName";

/** Roles que pueden operar la portería. */
const GUARD_ROLES = ["guardia", "administrador", "junta_directiva"] as const;
/** Roles que administran la configuración y el histórico. */
const ADMIN_ROLES = ["administrador", "junta_directiva"] as const;

const tipoDocValidator = v.union(
  v.literal("CC"),
  v.literal("CE"),
  v.literal("NIT"),
  v.literal("PASAPORTE"),
  v.literal("OTRO"),
);
const tipoVisitanteValidator = v.union(
  v.literal("visitante"),
  v.literal("empresa"),
  v.literal("domicilio"),
);
const tipoPaqueteValidator = v.union(
  v.literal("paquete"),
  v.literal("sobre"),
  v.literal("comida"),
  v.literal("mercado"),
  v.literal("otro"),
);
const checklistItemValidator = v.object({
  item: v.string(),
  obligatorio: v.boolean(),
  cantidadEsperada: v.number(),
  cantidadEncontrada: v.number(),
  estadoOk: v.boolean(),
  observacion: v.optional(v.string()),
});

/** URL de subida para evidencias fotográficas (rondas, paquetes, depósitos). */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) throw new Error("No autenticado.");
    return await ctx.storage.generateUploadUrl();
  },
});

// ─────────────────────────────────────────────────────────────
// Home / acceso
// ─────────────────────────────────────────────────────────────

/** Inicio del guardia: valida acceso y devuelve la marca del condominio. */
export const home = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) return { allowed: false as const };

    const condominio = await ctx.db.get(args.condominioId);
    if (!condominio) return { allowed: false as const };

    const isPlatform = hasPlatformRole(user, "superadmin", "admin");
    const membership = await getMembership(ctx, user._id, args.condominioId);
    const puede =
      isPlatform ||
      (!!membership &&
        membership.isActive &&
        membership.roles.some((r) => (GUARD_ROLES as readonly string[]).includes(r)));

    if (!puede) return { allowed: false as const };

    return {
      allowed: true as const,
      isPlatform,
      userId: user._id as string,
      userName: displayNameFromUser(user),
      userImage: user.image ?? null,
      userEmail: user.email,
      condominio: {
        _id: condominio._id as string,
        name: condominio.name,
        logo: condominio.logo ?? null,
        primaryColor: condominio.primaryColor ?? null,
      },
    };
  },
});

// ─────────────────────────────────────────────────────────────
// Turnos — el turno gobierna la operación
// ─────────────────────────────────────────────────────────────

/** Turno abierto del condominio (o null). Solo puede haber uno a la vez. */
export const turnoActivo = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...GUARD_ROLES]);
    const turno = await turnoAbierto(ctx, args.condominioId);
    if (!turno) return null;
    const rondas = await ctx.db
      .query("guardiaRondas")
      .withIndex("by_turno", (q) => q.eq("turnoId", turno._id))
      .collect();
    return { ...turno, rondasCount: rondas.length };
  },
});

/** Usuarios con rol guardia en el condominio (para turno compartido). */
export const equipo = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    const { user } = await requireCondominioRole(ctx, args.condominioId, [...GUARD_ROLES]);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();
    const guardias = memberships.filter(
      (m) => m.isActive && m.roles.includes("guardia") && m.userId !== user._id,
    );
    const rows = await Promise.all(
      guardias.map(async (m) => {
        const u = await ctx.db.get(m.userId);
        if (!u || !u.active) return null;
        return { userId: u._id, nombre: u.name };
      }),
    );
    return rows.filter((r): r is NonNullable<typeof r> => r !== null);
  },
});

/**
 * Inicia turno con checklist de dotación.
 * Reglas (VekinoApi): un solo turno abierto por condominio; checklist con al
 * menos 1 ítem; el segundo guardia debe ser válido y distinto del principal.
 */
export const iniciarTurno = mutation({
  args: {
    condominioId: v.id("condominios"),
    checklist: v.array(checklistItemValidator),
    observacionesInicio: v.optional(v.string()),
    guardiaSecundarioUserId: v.optional(v.id("users")),
    guardiaSecundarioNombre: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCondominioRole(ctx, args.condominioId, [...GUARD_ROLES]);

    const abierto = await turnoAbierto(ctx, args.condominioId);
    if (abierto) {
      throw new Error(
        `Ya hay un turno abierto (${abierto.guardiaNombre}). Debe cerrarse antes de iniciar otro.`,
      );
    }
    if (args.checklist.length === 0) {
      throw new Error("El checklist de inicio necesita al menos un ítem.");
    }

    let secundarioNombre = args.guardiaSecundarioNombre?.trim() || undefined;
    if (args.guardiaSecundarioUserId) {
      if (args.guardiaSecundarioUserId === user._id) {
        throw new Error("El guardia secundario no puede ser el mismo que inicia el turno.");
      }
      const sec = await ctx.db.get(args.guardiaSecundarioUserId);
      if (!sec || !sec.active) throw new Error("Guardia secundario no válido.");
      const secMembership = await getMembership(ctx, sec._id, args.condominioId);
      if (!secMembership?.isActive || !secMembership.roles.includes("guardia")) {
        throw new Error("El guardia secundario no tiene rol de guardia en este conjunto.");
      }
      secundarioNombre = sec.name;
    }

    const now = Date.now();
    const turnoId = await ctx.db.insert("guardiaTurnos", {
      condominioId: args.condominioId,
      guardiaUserId: user._id,
      guardiaNombre: user.name,
      guardiaSecundarioUserId: args.guardiaSecundarioUserId,
      guardiaSecundarioNombre: secundarioNombre,
      observacionesInicio: args.observacionesInicio?.trim() || undefined,
      checklist: args.checklist.map((c) => ({
        ...c,
        item: c.item.trim(),
        observacion: c.observacion?.trim() || undefined,
      })),
      estado: "abierto",
      fechaInicio: now,
      createdAt: now,
      updatedAt: now,
    });

    await logMinuta(ctx, {
      condominioId: args.condominioId,
      modulo: "minuta",
      tipo: "Inicio de Turno",
      unidad: "Portería",
      resumen: `Turno iniciado por ${user.name}${secundarioNombre ? ` (compartido con ${secundarioNombre})` : ""}. Checklist: ${args.checklist.length} ítems.`,
      estado: "abierto",
      actorUserId: user._id,
      actorNombre: user.name,
      turnoId,
    });
    return turnoId;
  },
});

/**
 * Cierre formal del turno: consignas para el relevo + quién recibe.
 * Solo el guardia del turno (principal o secundario) o un administrador.
 */
export const cerrarTurno = mutation({
  args: {
    turnoId: v.id("guardiaTurnos"),
    consignas: v.string(),
    recibe: v.string(),
    observacionesCierre: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const turno = await ctx.db.get(args.turnoId);
    if (!turno) throw new Error("Turno no encontrado.");
    const { user, membership } = await requireCondominioRole(
      ctx,
      turno.condominioId,
      [...GUARD_ROLES],
    );
    if (turno.estado !== "abierto") throw new Error("El turno ya está cerrado.");

    const esAdmin =
      hasPlatformRole(user, "superadmin", "admin") ||
      (membership?.roles ?? []).some((r) => (ADMIN_ROLES as readonly string[]).includes(r));
    const esDelTurno =
      turno.guardiaUserId === user._id || turno.guardiaSecundarioUserId === user._id;
    if (!esAdmin && !esDelTurno) {
      throw new Error("Solo el guardia del turno puede cerrarlo.");
    }

    const consignas = args.consignas.trim();
    const recibe = args.recibe.trim();
    if (!consignas || !recibe) {
      throw new Error("Las consignas y quién recibe el turno son obligatorios.");
    }

    const now = Date.now();
    await ctx.db.patch(args.turnoId, {
      consignas,
      recibe,
      observacionesCierre: args.observacionesCierre?.trim() || undefined,
      estado: "cerrado",
      fechaCierre: now,
      updatedAt: now,
    });

    await logMinuta(ctx, {
      condominioId: turno.condominioId,
      modulo: "minuta",
      tipo: "Cierre de Turno",
      unidad: "Portería",
      resumen: `Turno de ${turno.guardiaNombre} cerrado por ${user.name}. Recibe: ${recibe}.`,
      estado: "cerrado",
      actorUserId: user._id,
      actorNombre: user.name,
      turnoId: args.turnoId,
    });
  },
});

/** Histórico de turnos (admin) con conteo de rondas. */
export const listTurnos = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...GUARD_ROLES]);
    const turnos = await ctx.db
      .query("guardiaTurnos")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .take(100);
    return await Promise.all(
      turnos.map(async (t) => {
        const rondas = await ctx.db
          .query("guardiaRondas")
          .withIndex("by_turno", (q) => q.eq("turnoId", t._id))
          .collect();
        return { ...t, rondasCount: rondas.length, checklistCount: t.checklist.length };
      }),
    );
  },
});

/** Detalle de un turno: checklist + rondas con URLs de fotos + su minuta. */
export const getTurno = query({
  args: { turnoId: v.id("guardiaTurnos") },
  handler: async (ctx, args) => {
    const turno = await ctx.db.get(args.turnoId);
    if (!turno) return null;
    await requireCondominioRole(ctx, turno.condominioId, [...GUARD_ROLES]);

    const rondasRaw = await ctx.db
      .query("guardiaRondas")
      .withIndex("by_turno", (q) => q.eq("turnoId", args.turnoId))
      .collect();
    const rondas = await Promise.all(
      rondasRaw.map(async (r) => ({
        ...r,
        fotoUrls: (
          await Promise.all(r.fotos.map((f) => ctx.storage.getUrl(f)))
        ).filter((u): u is string => u !== null),
      })),
    );

    const eventos = await ctx.db
      .query("minutaEventos")
      .withIndex("by_turno", (q) => q.eq("turnoId", args.turnoId))
      .collect();

    return {
      ...turno,
      rondas: rondas.sort((a, b) => b.createdAt - a.createdAt),
      eventos: eventos.sort((a, b) => b.createdAt - a.createdAt),
    };
  },
});

// ─────────────────────────────────────────────────────────────
// Rondas de control
// ─────────────────────────────────────────────────────────────

/** Registra una ronda (requiere turno abierto propio; máximo 5 fotos). */
export const registrarRonda = mutation({
  args: {
    condominioId: v.id("condominios"),
    zonaId: v.optional(v.id("guardiaRondaZonas")),
    zonaNombre: v.optional(v.string()),
    novedad: v.optional(v.string()),
    fotos: v.array(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCondominioRole(ctx, args.condominioId, [...GUARD_ROLES]);

    const turno = await turnoAbierto(ctx, args.condominioId);
    if (!turno) throw new Error("Debes iniciar turno antes de registrar rondas.");
    if (args.fotos.length > 5) throw new Error("Máximo 5 fotos por ronda.");

    let zona = args.zonaNombre?.trim() || "";
    if (args.zonaId) {
      const z = await ctx.db.get(args.zonaId);
      if (!z || !z.activa) throw new Error("Zona de ronda no válida o inactiva.");
      zona = z.nombre;
    }
    if (!zona) throw new Error("Selecciona la zona de la ronda.");

    const now = Date.now();
    await ctx.db.insert("guardiaRondas", {
      condominioId: args.condominioId,
      turnoId: turno._id,
      zonaId: args.zonaId,
      zona,
      novedad: args.novedad?.trim() || undefined,
      fotos: args.fotos,
      createdAt: now,
    });

    await logMinuta(ctx, {
      condominioId: args.condominioId,
      modulo: "minuta",
      tipo: "Ronda de Control",
      unidad: zona,
      resumen: args.novedad?.trim() || `Ronda por ${zona} sin novedad.`,
      estado: "cerrado",
      actorUserId: user._id,
      actorNombre: user.name,
      turnoId: turno._id,
    });
  },
});

// ─────────────────────────────────────────────────────────────
// Catálogos (admin): checklist de dotación y zonas de ronda
// ─────────────────────────────────────────────────────────────

export const listChecklistTemplate = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...GUARD_ROLES]);
    const items = await ctx.db
      .query("guardiaChecklistTemplates")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();
    return items.sort((a, b) => a.orden - b.orden || a.createdAt - b.createdAt);
  },
});

export const createChecklistTemplate = mutation({
  args: {
    condominioId: v.id("condominios"),
    nombre: v.string(),
    obligatorio: v.boolean(),
    cantidadEsperada: v.number(),
    orden: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...ADMIN_ROLES]);
    const nombre = args.nombre.trim();
    if (!nombre) throw new Error("El nombre es obligatorio.");
    const now = Date.now();
    return await ctx.db.insert("guardiaChecklistTemplates", {
      condominioId: args.condominioId,
      nombre,
      obligatorio: args.obligatorio,
      cantidadEsperada: Math.max(1, Math.round(args.cantidadEsperada)),
      activo: true,
      orden: args.orden ?? 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateChecklistTemplate = mutation({
  args: {
    id: v.id("guardiaChecklistTemplates"),
    nombre: v.optional(v.string()),
    obligatorio: v.optional(v.boolean()),
    cantidadEsperada: v.optional(v.number()),
    activo: v.optional(v.boolean()),
    orden: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.id);
    if (!item) throw new Error("Ítem no encontrado.");
    await requireCondominioRole(ctx, item.condominioId, [...ADMIN_ROLES]);
    const { id, ...rest } = args;
    await ctx.db.patch(id, {
      ...rest,
      nombre: rest.nombre?.trim() ?? item.nombre,
      updatedAt: Date.now(),
    });
  },
});

export const removeChecklistTemplate = mutation({
  args: { id: v.id("guardiaChecklistTemplates") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.id);
    if (!item) return;
    await requireCondominioRole(ctx, item.condominioId, [...ADMIN_ROLES]);
    await ctx.db.delete(args.id);
  },
});

export const listRondaZonas = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...GUARD_ROLES]);
    const zonas = await ctx.db
      .query("guardiaRondaZonas")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();
    return zonas.sort((a, b) => a.orden - b.orden || a.createdAt - b.createdAt);
  },
});

export const createRondaZona = mutation({
  args: {
    condominioId: v.id("condominios"),
    nombre: v.string(),
    orden: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...ADMIN_ROLES]);
    const nombre = args.nombre.trim();
    if (!nombre) throw new Error("El nombre es obligatorio.");
    const now = Date.now();
    return await ctx.db.insert("guardiaRondaZonas", {
      condominioId: args.condominioId,
      nombre,
      activa: true,
      orden: args.orden ?? 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateRondaZona = mutation({
  args: {
    id: v.id("guardiaRondaZonas"),
    nombre: v.optional(v.string()),
    activa: v.optional(v.boolean()),
    orden: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const zona = await ctx.db.get(args.id);
    if (!zona) throw new Error("Zona no encontrada.");
    await requireCondominioRole(ctx, zona.condominioId, [...ADMIN_ROLES]);
    const { id, ...rest } = args;
    await ctx.db.patch(id, {
      ...rest,
      nombre: rest.nombre?.trim() ?? zona.nombre,
      updatedAt: Date.now(),
    });
  },
});

export const removeRondaZona = mutation({
  args: { id: v.id("guardiaRondaZonas") },
  handler: async (ctx, args) => {
    const zona = await ctx.db.get(args.id);
    if (!zona) return;
    await requireCondominioRole(ctx, zona.condominioId, [...ADMIN_ROLES]);
    await ctx.db.delete(args.id);
  },
});

// ─────────────────────────────────────────────────────────────
// Minuta digital
// ─────────────────────────────────────────────────────────────

/** Eventos de la minuta (más recientes primero). */
export const listMinuta = query({
  args: { condominioId: v.id("condominios"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...GUARD_ROLES]);
    return await ctx.db
      .query("minutaEventos")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .take(Math.min(args.limit ?? 150, 300));
  },
});

/** Evento manual de minuta (requiere turno abierto). */
export const registrarEventoMinuta = mutation({
  args: {
    condominioId: v.id("condominios"),
    tipo: v.string(),
    unidad: v.optional(v.string()),
    resumen: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCondominioRole(ctx, args.condominioId, [...GUARD_ROLES]);
    const turno = await turnoAbierto(ctx, args.condominioId);
    if (!turno) throw new Error("Debes iniciar turno para registrar en la minuta.");
    const resumen = args.resumen.trim();
    if (!resumen) throw new Error("El detalle del evento es obligatorio.");
    await logMinuta(ctx, {
      condominioId: args.condominioId,
      modulo: "minuta",
      tipo: args.tipo.trim() || "Anotación",
      unidad: args.unidad?.trim() || "Portería",
      resumen,
      estado: "cerrado",
      actorUserId: user._id,
      actorNombre: user.name,
      turnoId: turno._id,
    });
  },
});

// ─────────────────────────────────────────────────────────────
// Visitantes (control de acceso)
// ─────────────────────────────────────────────────────────────

/** Visitantes visibles en portería: adentro, walk-ins pendientes y salidas recientes.
 *  NO incluye autorizaciones QR pendientes (eso es solo escaneo). */
export const listVisitantes = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...GUARD_ROLES]);
    const visitantes = await ctx.db
      .query("visitantes")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .take(300);
    return visitantes.filter(
      (v) =>
        v.estado === "activo" ||
        v.estado === "esperando_aprobacion" ||
        v.estado === "finalizado",
    ).slice(0, 200);
  },
});

/** Visitante puntual por id (resultado de escanear un QR). */
export const getVisitante = query({
  args: { id: v.id("visitantes") },
  handler: async (ctx, args) => {
    const vis = await ctx.db.get(args.id);
    if (!vis) return null;
    await requireCondominioRole(ctx, vis.condominioId, [...GUARD_ROLES]);
    return vis;
  },
});

/**
 * Ingreso por escaneo de QR.
 * Solo válido el día de la visita; si no llegó, el QR expira / se borra.
 */
export const registrarIngreso = mutation({
  args: { id: v.id("visitantes") },
  handler: async (ctx, args) => {
    const vis = await ctx.db.get(args.id);
    if (!vis) throw new Error("Visitante no encontrado.");
    const { user } = await requireCondominioRole(ctx, vis.condominioId, [...GUARD_ROLES]);

    const vigencia = esVisitanteVigente(vis);
    if (!vigencia.ok) throw new Error(vigencia.reason);

    const now = Date.now();
    await ctx.db.patch(args.id, {
      estado: "activo",
      fechaIngreso: now,
      updatedAt: now,
    });
    await logMinuta(ctx, {
      condominioId: vis.condominioId,
      modulo: "visitantes",
      tipo: "Ingreso",
      unidad: vis.unidadNumero ?? "—",
      resumen: `Ingreso de ${vis.nombre} (${vis.documento})${vis.placa ? ` · placa ${vis.placa}` : ""}.`,
      estado: "abierto",
      actorUserId: user._id,
      actorNombre: user.name,
    });
  },
});

/**
 * Salida de un visitante. El QR queda invalidado (un solo uso por autorización).
 */
export const registrarSalida = mutation({
  args: { id: v.id("visitantes") },
  handler: async (ctx, args) => {
    const vis = await ctx.db.get(args.id);
    if (!vis) throw new Error("Visitante no encontrado.");
    const { user } = await requireCondominioRole(ctx, vis.condominioId, [...GUARD_ROLES]);
    const now = Date.now();
    await ctx.db.patch(args.id, {
      estado: "finalizado",
      fechaSalida: now,
      qrInvalidado: true,
      updatedAt: now,
    });
    await logMinuta(ctx, {
      condominioId: vis.condominioId,
      modulo: "visitantes",
      tipo: "Salida",
      unidad: vis.unidadNumero ?? "—",
      resumen: `Salida de ${vis.nombre} (${vis.documento}).`,
      estado: "cerrado",
      actorUserId: user._id,
      actorNombre: user.name,
    });
  },
});

/**
 * Walk-in: el guardia registra a quien llega sin QR.
 * Queda en "esperando_aprobacion" hasta que el residente acepte.
 * Avisar al dueño (llamar / app) antes de dejar pasar.
 */
export const registrarDirecto = mutation({
  args: {
    condominioId: v.id("condominios"),
    unidadNumero: v.string(),
    nombre: v.string(),
    documento: v.string(),
    tipoDocumento: tipoDocValidator,
    tipo: tipoVisitanteValidator,
    placa: v.optional(v.string()),
    observaciones: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCondominioRole(ctx, args.condominioId, [...GUARD_ROLES]);
    const nombre = args.nombre.trim();
    const documento = args.documento.trim();
    const unidadNumero = args.unidadNumero.trim();
    if (!nombre || !documento) throw new Error("Nombre y documento son obligatorios.");
    if (!unidadNumero) throw new Error("La unidad es obligatoria.");

    const unidad = await ctx.db
      .query("unidades")
      .withIndex("by_condominio_numero", (q) =>
        q.eq("condominioId", args.condominioId).eq("numero", unidadNumero),
      )
      .first();
    if (!unidad) throw new Error(`No existe la unidad ${unidadNumero} en el conjunto.`);

    const now = Date.now();
    const { inicio, fin } = ventanaHoyBogota();
    const id = await ctx.db.insert("visitantes", {
      condominioId: args.condominioId,
      unidadId: unidad._id,
      unidadNumero: unidad.numero,
      nombre,
      documento,
      tipoDocumento: args.tipoDocumento,
      tipo: args.tipo,
      placa: args.placa?.toUpperCase().trim() || undefined,
      fechaVisitaInicio: inicio,
      fechaVisitaFin: fin,
      estado: "esperando_aprobacion",
      observaciones: args.observaciones?.trim() || undefined,
      qrInvalidado: false,
      registradoPorGuardia: true,
      createdAt: now,
      updatedAt: now,
    });
    await logMinuta(ctx, {
      condominioId: args.condominioId,
      modulo: "visitantes",
      tipo: "Solicitud",
      unidad: unidad.numero,
      resumen: `Portería solicita autorización: ${nombre} (${documento}) → unidad ${unidad.numero}. Esperando al residente.`,
      estado: "abierto",
      actorUserId: user._id,
      actorNombre: user.name,
    });
    return id;
  },
});

// ─────────────────────────────────────────────────────────────
// Paquetería (con evidencia fotográfica)
// ─────────────────────────────────────────────────────────────

/** Lista de paquetes con URLs de evidencia resueltas. */
export const listPaquetes = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...GUARD_ROLES]);
    const paquetes = await ctx.db
      .query("paquetes")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .take(200);
    return await Promise.all(
      paquetes.map(async (p) => ({
        ...p,
        fotoUrl: p.fotoStorageId ? await ctx.storage.getUrl(p.fotoStorageId) : null,
        fotoEntregaUrl: p.fotoEntregaStorageId
          ? await ctx.storage.getUrl(p.fotoEntregaStorageId)
          : null,
      })),
    );
  },
});

/** El guardia recibe un paquete (foto de llegada opcional). */
export const recibirPaquete = mutation({
  args: {
    condominioId: v.id("condominios"),
    unidadNumero: v.string(),
    tipo: tipoPaqueteValidator,
    remitente: v.optional(v.string()),
    destinatario: v.optional(v.string()),
    descripcion: v.optional(v.string()),
    fotoStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCondominioRole(ctx, args.condominioId, [...GUARD_ROLES]);
    const unidadNumero = args.unidadNumero.trim();
    if (!unidadNumero) throw new Error("La unidad es obligatoria.");
    const now = Date.now();
    const id = await ctx.db.insert("paquetes", {
      condominioId: args.condominioId,
      unidadNumero,
      tipo: args.tipo,
      remitente: args.remitente?.trim() || undefined,
      destinatario: args.destinatario?.trim() || undefined,
      descripcion: args.descripcion?.trim() || undefined,
      fotoStorageId: args.fotoStorageId,
      estado: "recibido",
      recibidoPorNombre: user.name,
      fechaRecibido: now,
    });
    await logMinuta(ctx, {
      condominioId: args.condominioId,
      modulo: "paqueteria",
      tipo: "Registro",
      unidad: unidadNumero,
      resumen: `Paquete recibido${args.remitente ? ` de ${args.remitente.trim()}` : ""} para la unidad ${unidadNumero}.`,
      estado: "abierto",
      actorUserId: user._id,
      actorNombre: user.name,
    });
    return id;
  },
});

/** Entrega con evidencia: quién recibe, observaciones y foto de entrega. */
export const entregarPaquete = mutation({
  args: {
    id: v.id("paquetes"),
    entregadoA: v.optional(v.string()),
    observaciones: v.optional(v.string()),
    fotoEntregaStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.id);
    if (!p) throw new Error("Paquete no encontrado.");
    const { user } = await requireCondominioRole(ctx, p.condominioId, [...GUARD_ROLES]);
    if (p.estado === "entregado") return;
    await ctx.db.patch(args.id, {
      estado: "entregado",
      entregadoPorNombre: user.name,
      entregadoANombre: args.entregadoA?.trim() || undefined,
      observacionesEntrega: args.observaciones?.trim() || undefined,
      fotoEntregaStorageId: args.fotoEntregaStorageId,
      fechaEntregado: Date.now(),
    });
    await logMinuta(ctx, {
      condominioId: p.condominioId,
      modulo: "paqueteria",
      tipo: "Entrega",
      unidad: p.unidadNumero,
      resumen: `Paquete entregado${args.entregadoA ? ` a ${args.entregadoA.trim()}` : ""}${args.observaciones ? `. Obs: ${args.observaciones.trim()}` : "."}`,
      estado: "cerrado",
      actorUserId: user._id,
      actorNombre: user.name,
    });
  },
});

/** Elimina un registro de paquete hecho por error (solo admin). */
export const removePaquete = mutation({
  args: { id: v.id("paquetes") },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.id);
    if (!p) return;
    await requireCondominioRole(ctx, p.condominioId, [...ADMIN_ROLES]);
    if (p.fotoStorageId) await ctx.storage.delete(p.fotoStorageId).catch(() => {});
    if (p.fotoEntregaStorageId) await ctx.storage.delete(p.fotoEntregaStorageId).catch(() => {});
    await ctx.db.delete(args.id);
  },
});

// ─────────────────────────────────────────────────────────────
// Control de reservas + depósitos/garantías
// ─────────────────────────────────────────────────────────────

/** Reservas aprobadas para control en portería, con su depósito si existe. */
export const listReservasControl = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...GUARD_ROLES]);
    const reservas = await ctx.db
      .query("reservas")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .take(100);
    const aprobadas = reservas.filter((r) => r.estado === "aprobada");
    return await Promise.all(
      aprobadas.map(async (r) => {
        const deposito = await ctx.db
          .query("guardiaReservaDepositos")
          .withIndex("by_reserva", (q) => q.eq("reservaId", r._id))
          .first();
        return { ...r, deposito: deposito ?? null };
      }),
    );
  },
});

/** Valida el ingreso de una reserva (sin depósito). */
export const validarIngresoReserva = mutation({
  args: { reservaId: v.id("reservas") },
  handler: async (ctx, args) => {
    const r = await ctx.db.get(args.reservaId);
    if (!r) throw new Error("Reserva no encontrada.");
    const { user } = await requireCondominioRole(ctx, r.condominioId, [...GUARD_ROLES]);
    if (r.ingresoValidadoAt) return;
    await ctx.db.patch(args.reservaId, { ingresoValidadoAt: Date.now(), updatedAt: Date.now() });
    await logMinuta(ctx, {
      condominioId: r.condominioId,
      modulo: "reservas",
      tipo: "Ingreso Validado",
      unidad: r.unidadNumero,
      resumen: `Ingreso validado: ${r.zonaNombre} (${r.horaInicio}–${r.horaFin}) · ${r.solicitanteNombre}.`,
      estado: "abierto",
      actorUserId: user._id,
      actorNombre: user.name,
    });
  },
});

/** Registra el depósito/garantía y valida el ingreso. */
export const registrarDepositoReserva = mutation({
  args: {
    reservaId: v.id("reservas"),
    monto: v.number(),
    observaciones: v.optional(v.string()),
    fotoStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const r = await ctx.db.get(args.reservaId);
    if (!r) throw new Error("Reserva no encontrada.");
    const { user } = await requireCondominioRole(ctx, r.condominioId, [...GUARD_ROLES]);
    if (args.monto <= 0) throw new Error("El monto del depósito debe ser mayor a 0.");

    const existente = await ctx.db
      .query("guardiaReservaDepositos")
      .withIndex("by_reserva", (q) => q.eq("reservaId", args.reservaId))
      .first();
    if (existente) throw new Error("Esta reserva ya tiene un depósito registrado.");

    const now = Date.now();
    await ctx.db.insert("guardiaReservaDepositos", {
      condominioId: r.condominioId,
      reservaId: args.reservaId,
      monto: args.monto,
      observacionesIngreso: args.observaciones?.trim() || undefined,
      fotoIngresoStorageId: args.fotoStorageId,
      estado: "registrado",
      recibidoPorNombre: user.name,
      fechaRegistro: now,
    });
    await ctx.db.patch(args.reservaId, { ingresoValidadoAt: now, updatedAt: now });
    await logMinuta(ctx, {
      condominioId: r.condominioId,
      modulo: "reservas",
      tipo: "Depósito Registrado",
      unidad: r.unidadNumero,
      resumen: `Depósito de $${args.monto.toLocaleString("es-CO")} por ${r.zonaNombre} · ${r.solicitanteNombre}.`,
      estado: "abierto",
      actorUserId: user._id,
      actorNombre: user.name,
    });
  },
});

/**
 * Valida la salida de una reserva. Si hay depósito pendiente ("registrado"),
 * la salida se bloquea hasta resolverlo.
 */
export const validarSalidaReserva = mutation({
  args: { reservaId: v.id("reservas") },
  handler: async (ctx, args) => {
    const r = await ctx.db.get(args.reservaId);
    if (!r) throw new Error("Reserva no encontrada.");
    const { user } = await requireCondominioRole(ctx, r.condominioId, [...GUARD_ROLES]);
    const deposito = await ctx.db
      .query("guardiaReservaDepositos")
      .withIndex("by_reserva", (q) => q.eq("reservaId", args.reservaId))
      .first();
    if (deposito && deposito.estado === "registrado") {
      throw new Error("Hay un depósito pendiente: debes resolverlo (devuelto o no devuelto) antes de validar la salida.");
    }
    await ctx.db.patch(args.reservaId, { salidaValidadaAt: Date.now(), updatedAt: Date.now() });
    await logMinuta(ctx, {
      condominioId: r.condominioId,
      modulo: "reservas",
      tipo: "Salida Validada",
      unidad: r.unidadNumero,
      resumen: `Salida validada: ${r.zonaNombre} · ${r.solicitanteNombre}.`,
      estado: "cerrado",
      actorUserId: user._id,
      actorNombre: user.name,
    });
  },
});

/**
 * Resuelve el depósito: devuelto o no devuelto. Si NO se devuelve, las
 * observaciones y la foto de evidencia son obligatorias. Valida la salida.
 */
export const resolverDepositoReserva = mutation({
  args: {
    depositoId: v.id("guardiaReservaDepositos"),
    devuelto: v.boolean(),
    observaciones: v.optional(v.string()),
    fotoStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const dep = await ctx.db.get(args.depositoId);
    if (!dep) throw new Error("Depósito no encontrado.");
    const { user } = await requireCondominioRole(ctx, dep.condominioId, [...GUARD_ROLES]);
    if (dep.estado !== "registrado") throw new Error("El depósito ya fue resuelto.");
    if (!args.devuelto && (!args.observaciones?.trim() || !args.fotoStorageId)) {
      throw new Error("Si el depósito NO se devuelve, las observaciones y la foto de evidencia son obligatorias.");
    }

    const r = await ctx.db.get(dep.reservaId);
    const now = Date.now();
    await ctx.db.patch(args.depositoId, {
      estado: args.devuelto ? "devuelto" : "no_devuelto",
      observacionesSalida: args.observaciones?.trim() || undefined,
      fotoSalidaStorageId: args.fotoStorageId,
      resueltoPorNombre: user.name,
      fechaResolucion: now,
    });
    if (r) {
      await ctx.db.patch(dep.reservaId, { salidaValidadaAt: now, updatedAt: now });
      await logMinuta(ctx, {
        condominioId: dep.condominioId,
        modulo: "reservas",
        tipo: args.devuelto ? "Depósito Devuelto" : "Depósito No Devuelto",
        unidad: r.unidadNumero,
        resumen: `Depósito de $${dep.monto.toLocaleString("es-CO")} ${args.devuelto ? "devuelto" : "NO devuelto"} · ${r.zonaNombre}${args.observaciones ? `. Obs: ${args.observaciones.trim()}` : "."}`,
        estado: "cerrado",
        actorUserId: user._id,
        actorNombre: user.name,
      });
    }
  },
});

// ─────────────────────────────────────────────────────────────
// Novedades / incidentes de seguridad
// ─────────────────────────────────────────────────────────────

export const listNovedadReportes = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...GUARD_ROLES]);
    const reportes = await ctx.db
      .query("guardiaNovedadReportes")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .take(100);
    return await Promise.all(
      reportes.map(async (n) => ({
        ...n,
        archivoUrl: n.archivoStorageId ? await ctx.storage.getUrl(n.archivoStorageId) : null,
      })),
    );
  },
});

export const reportarNovedad = mutation({
  args: {
    condominioId: v.id("condominios"),
    titulo: v.string(),
    descripcion: v.string(),
    prioridad: v.union(v.literal("baja"), v.literal("media"), v.literal("alta")),
    archivoStorageId: v.optional(v.id("_storage")),
    archivoNombre: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCondominioRole(ctx, args.condominioId, [...GUARD_ROLES]);
    const titulo = args.titulo.trim();
    const descripcion = args.descripcion.trim();
    if (!titulo || !descripcion) throw new Error("Título y descripción son obligatorios.");

    const turno = await turnoAbierto(ctx, args.condominioId);
    const now = Date.now();
    const id = await ctx.db.insert("guardiaNovedadReportes", {
      condominioId: args.condominioId,
      turnoId: turno?._id,
      titulo,
      descripcion,
      prioridad: args.prioridad,
      archivoStorageId: args.archivoStorageId,
      archivoNombre: args.archivoNombre?.trim() || undefined,
      reportadoPorUserId: user._id,
      reportadoPorNombre: user.name,
      createdAt: now,
    });
    await logMinuta(ctx, {
      condominioId: args.condominioId,
      modulo: "novedades",
      tipo: `Reporte ${args.prioridad.toUpperCase()}`,
      unidad: "Portería",
      resumen: `${titulo}: ${descripcion.slice(0, 140)}${descripcion.length > 140 ? "…" : ""}`,
      estado: "abierto",
      actorUserId: user._id,
      actorNombre: user.name,
      turnoId: turno?._id,
    });
    return id;
  },
});

// ─────────────────────────────────────────────────────────────
// Avisos para seguridad (comunicados con audiencia todos/guardia)
// ─────────────────────────────────────────────────────────────

export const listAvisos = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...GUARD_ROLES]);
    const comunicados = await ctx.db
      .query("comunicados")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .take(60);
    const visibles = comunicados.filter(
      (c) => c.audiencia === "todos" || c.audiencia === "guardia",
    );
    return await Promise.all(
      visibles.map(async (c) => ({
        ...c,
        archivos: await Promise.all(
          (c.archivos ?? []).map(async (a) => ({
            nombre: a.nombre,
            mimeType: a.mimeType,
            url: await ctx.storage.getUrl(a.storageId),
          })),
        ),
      })),
    );
  },
});

// ─────────────────────────────────────────────────────────────
// Reservas del día (compat: lo usa la home del guardia)
// ─────────────────────────────────────────────────────────────

/** Reservas aprobadas para una fecha (YYYY-MM-DD). */
export const listReservasDia = query({
  args: { condominioId: v.id("condominios"), fecha: v.string() },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...GUARD_ROLES]);
    const reservas = await ctx.db
      .query("reservas")
      .withIndex("by_condominio_fecha", (q) =>
        q.eq("condominioId", args.condominioId).eq("fecha", args.fecha),
      )
      .collect();
    return reservas
      .filter((r) => r.estado === "aprobada")
      .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  },
});

// Nota de tipos: Doc/Id se usan en las firmas inferidas.
export type GuardiaTurnoDoc = Doc<"guardiaTurnos">;
export type GuardiaRondaZonaId = Id<"guardiaRondaZonas">;
