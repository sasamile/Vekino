import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  requireCondominioRole,
  requireAppUser,
  getCurrentAppUser,
  getMembership,
} from "./model/authz";

const ADMIN_ROLES = ["administrador", "junta_directiva", "contadora"] as const;

const estadoValidator = v.union(
  v.literal("pendiente"),
  v.literal("aprobada"),
  v.literal("rechazada"),
  v.literal("cancelada")
);

const tipoZonaValidator = v.union(
  v.literal("salon_social"),
  v.literal("zona_bbq"),
  v.literal("sauna"),
  v.literal("casa_eventos"),
  v.literal("gimnasio"),
  v.literal("piscina"),
  v.literal("cancha_deportiva"),
  v.literal("parqueadero"),
  v.literal("otro"),
);

const unidadTiempoValidator = v.union(
  v.literal("hora"),
  v.literal("dia"),
  v.literal("mes"),
);

const horarioDiaValidator = v.object({
  dia: v.number(),
  horaInicio: v.string(),
  horaFin: v.string(),
});

function assertHorarios(
  horarios: { dia: number; horaInicio: string; horaFin: string }[],
) {
  if (horarios.length === 0) {
    throw new Error("Activa al menos un día con horario.");
  }
  for (const h of horarios) {
    if (h.dia < 0 || h.dia > 6) {
      throw new Error("Día de la semana inválido.");
    }
    const [sh, sm] = h.horaInicio.split(":").map(Number);
    const [eh, em] = h.horaFin.split(":").map(Number);
    const start = (sh ?? 0) * 60 + (sm ?? 0);
    const end = (eh ?? 0) * 60 + (em ?? 0);
    if (
      Number.isNaN(sh) ||
      Number.isNaN(sm) ||
      Number.isNaN(eh) ||
      Number.isNaN(em)
    ) {
      throw new Error("Formato de hora inválido (usa HH:MM).");
    }
    if (end <= start) {
      throw new Error(
        `El horario del día ${h.dia} debe terminar después de iniciar.`,
      );
    }
  }
}

// ─── Zonas comunes ────────────────────────────────────────────

export const listZonas = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, []);
    return await ctx.db
      .query("zonasComunes")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();
  },
});

export const createZona = mutation({
  args: {
    condominioId: v.id("condominios"),
    nombre: v.string(),
    tipo: v.optional(tipoZonaValidator),
    unidadTiempo: v.optional(unidadTiempoValidator),
    precioPorHora: v.optional(v.number()),
    precioPorDia: v.optional(v.number()),
    precioPorMes: v.optional(v.number()),
    horariosPorDia: v.optional(v.array(horarioDiaValidator)),
    requiereAprobacion: v.optional(v.boolean()),
    capacidad: v.optional(v.number()),
    descripcion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...ADMIN_ROLES]);
    const nombre = args.nombre.trim();
    if (!nombre) throw new Error("El nombre es obligatorio.");

    const horarios = args.horariosPorDia ?? [];
    if (horarios.length > 0) assertHorarios(horarios);

    const precioPorHora =
      args.precioPorHora != null && !Number.isNaN(args.precioPorHora)
        ? Math.max(0, args.precioPorHora)
        : undefined;
    const precioPorDia =
      args.precioPorDia != null && !Number.isNaN(args.precioPorDia)
        ? Math.max(0, args.precioPorDia)
        : undefined;
    const precioPorMes =
      args.precioPorMes != null && !Number.isNaN(args.precioPorMes)
        ? Math.max(0, args.precioPorMes)
        : undefined;

    const now = Date.now();
    return await ctx.db.insert("zonasComunes", {
      condominioId: args.condominioId,
      nombre,
      tipo: args.tipo ?? "otro",
      unidadTiempo: args.unidadTiempo ?? "hora",
      precioPorHora,
      precioPorDia,
      precioPorMes,
      horariosPorDia: horarios.length > 0 ? horarios : undefined,
      requiereAprobacion: args.requiereAprobacion ?? true,
      capacidad: args.capacidad,
      descripcion: args.descripcion?.trim() || undefined,
      activa: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const toggleZona = mutation({
  args: { id: v.id("zonasComunes") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Zona no encontrada.");
    await requireCondominioRole(ctx, existing.condominioId, [...ADMIN_ROLES]);
    await ctx.db.patch(args.id, { activa: !existing.activa, updatedAt: Date.now() });
  },
});

export const removeZona = mutation({
  args: { id: v.id("zonasComunes") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Zona no encontrada.");
    await requireCondominioRole(ctx, existing.condominioId, [...ADMIN_ROLES]);
    await ctx.db.delete(args.id);
  },
});

// ─── Reservas ─────────────────────────────────────────────────

export const listByCondominio = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, []);
    return await ctx.db
      .query("reservas")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .collect();
  },
});

/** Conteos de estado (escanea máx. 2000). */
export const countsByCondominio = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, []);
    const rows = await ctx.db
      .query("reservas")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .take(2000);
    return {
      total: rows.length,
      pendiente: rows.filter((r) => r.estado === "pendiente").length,
      aprobada: rows.filter((r) => r.estado === "aprobada").length,
      rechazada: rows.filter((r) => r.estado === "rechazada").length,
    };
  },
});

export const listPage = query({
  args: {
    condominioId: v.id("condominios"),
    paginationOpts: paginationOptsValidator,
    estado: v.optional(estadoValidator),
    zonaId: v.optional(v.id("zonasComunes")),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, []);
    const estado = args.estado;
    const zonaId = args.zonaId;

    if (estado || zonaId) {
      const scan = await ctx.db
        .query("reservas")
        .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
        .order("desc")
        .take(250);
      const filtered = scan.filter((r) => {
        if (estado && r.estado !== estado) return false;
        if (zonaId && r.zonaId !== zonaId) return false;
        return true;
      });
      const limit = Math.min(args.paginationOpts.numItems || 30, 60);
      return {
        page: filtered.slice(0, limit),
        isDone: true,
        continueCursor: "",
      };
    }

    return await ctx.db
      .query("reservas")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

/** Conteo liviano de reservas pendientes (home). Escanea como máximo 120 recientes. */
export const countPendientes = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, []);
    const recent = await ctx.db
      .query("reservas")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .take(120);
    return recent.filter((r) => r.estado === "pendiente").length;
  },
});

export const create = mutation({
  args: {
    condominioId: v.id("condominios"),
    unidadId: v.id("unidades"),
    zonaId: v.id("zonasComunes"),
    fecha: v.string(),
    horaInicio: v.string(),
    horaFin: v.string(),
    observaciones: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCondominioRole(ctx, args.condominioId, [...ADMIN_ROLES]);
    const zona = await ctx.db.get(args.zonaId);
    if (!zona) throw new Error("Zona no encontrada.");
    const unidad = await ctx.db.get(args.unidadId);
    if (!unidad) throw new Error("Unidad no encontrada.");
    const now = Date.now();
    return await ctx.db.insert("reservas", {
      condominioId: args.condominioId,
      unidadId: args.unidadId,
      zonaId: args.zonaId,
      zonaNombre: zona.nombre,
      unidadNumero: unidad.numero,
      solicitanteNombre: user.name,
      fecha: args.fecha,
      horaInicio: args.horaInicio,
      horaFin: args.horaFin,
      estado: "pendiente",
      observaciones: args.observaciones?.trim(),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateEstado = mutation({
  args: {
    id: v.id("reservas"),
    estado: estadoValidator,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Reserva no encontrada.");
    await requireCondominioRole(ctx, existing.condominioId, [...ADMIN_ROLES]);
    await ctx.db.patch(args.id, { estado: args.estado, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("reservas") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Reserva no encontrada.");
    await requireCondominioRole(ctx, existing.condominioId, [...ADMIN_ROLES]);
    await ctx.db.delete(args.id);
  },
});

// ─────────────────────────────────────────────────────────────
// API del propietario: crea y ve las reservas de SUS unidades.
// ─────────────────────────────────────────────────────────────

/** Unidades vinculadas al usuario en el condominio. */
async function misUnidadIds(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  condominioId: Id<"condominios">,
): Promise<Set<Id<"unidades">>> {
  const membership = await getMembership(ctx, userId, condominioId);
  if (!membership || !membership.isActive) return new Set();
  const links = await ctx.db
    .query("usuarioUnidad")
    .withIndex("by_membership", (q) => q.eq("membershipId", membership._id))
    .collect();
  return new Set(links.map((l) => l.unidadId));
}

/** Reservas de las unidades del usuario autenticado (más recientes primero). */
export const listMias = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) return [];
    const unidadIds = await misUnidadIds(ctx, user._id, args.condominioId);
    if (unidadIds.size === 0) return [];

    const reservas = await ctx.db
      .query("reservas")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .collect();

    return reservas.filter((r) => unidadIds.has(r.unidadId));
  },
});

/** El propietario crea una reserva para una de SUS unidades (queda pendiente). */
export const createMia = mutation({
  args: {
    condominioId: v.id("condominios"),
    unidadId: v.id("unidades"),
    zonaId: v.id("zonasComunes"),
    fecha: v.string(),
    horaInicio: v.string(),
    horaFin: v.string(),
    observaciones: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    const unidadIds = await misUnidadIds(ctx, user._id, args.condominioId);
    if (!unidadIds.has(args.unidadId)) {
      throw new Error("Esa unidad no está vinculada a tu cuenta.");
    }
    const zona = await ctx.db.get(args.zonaId);
    if (!zona || zona.condominioId !== args.condominioId) {
      throw new Error("Zona no encontrada.");
    }
    if (!zona.activa) throw new Error("Esa zona no está disponible.");
    const unidad = await ctx.db.get(args.unidadId);
    if (!unidad) throw new Error("Unidad no encontrada.");

    if (args.horaFin <= args.horaInicio) {
      throw new Error("La hora de fin debe ser posterior a la de inicio.");
    }

    const now = Date.now();
    return await ctx.db.insert("reservas", {
      condominioId: args.condominioId,
      unidadId: args.unidadId,
      zonaId: args.zonaId,
      zonaNombre: zona.nombre,
      unidadNumero: unidad.numero,
      solicitanteNombre: user.name,
      fecha: args.fecha,
      horaInicio: args.horaInicio,
      horaFin: args.horaFin,
      estado: "pendiente",
      observaciones: args.observaciones?.trim(),
      createdAt: now,
      updatedAt: now,
    });
  },
});
