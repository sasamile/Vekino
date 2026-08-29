import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  requireCondominioRole,
  requireAppUser,
  getCurrentAppUser,
  getMembership,
  misUnidadIds,
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
    /** Depósito que se deja al reservar y se devuelve si se entrega bien. */
    depositoRequerido: v.optional(v.number()),
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
      depositoRequerido: args.depositoRequerido,
      capacidad: args.capacidad,
      descripcion: args.descripcion?.trim() || undefined,
      activa: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Edita una zona comun ya creada.
 *
 * Hacia falta: hasta ahora una zona solo se podia crear o desactivar, asi
 * que para ponerle el deposito a una que ya existia habria que borrarla y
 * volverla a crear —perdiendo el historial de reservas que cuelga de ella.
 */
export const updateZona = mutation({
  args: {
    id: v.id("zonasComunes"),
    nombre: v.optional(v.string()),
    tipo: v.optional(tipoZonaValidator),
    unidadTiempo: v.optional(unidadTiempoValidator),
    precioPorHora: v.optional(v.number()),
    precioPorDia: v.optional(v.number()),
    precioPorMes: v.optional(v.number()),
    requiereAprobacion: v.optional(v.boolean()),
    depositoRequerido: v.optional(v.number()),
    capacidad: v.optional(v.number()),
    descripcion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const zona = await ctx.db.get(args.id);
    if (!zona) throw new Error("Zona no encontrada.");
    await requireCondominioRole(ctx, zona.condominioId, [...ADMIN_ROLES]);

    const { id, ...campos } = args;
    const nombre = campos.nombre?.trim();
    if (campos.nombre !== undefined && !nombre) {
      throw new Error("El nombre no puede quedar vacio.");
    }

    /* Solo se tocan los campos que vinieron. `undefined` significa "no lo
     * cambies", no "borralo": pasar el objeto entero borraria el precio de
     * una zona por editarle el nombre. */
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, valor] of Object.entries(campos)) {
      if (valor !== undefined) patch[k] = k === "nombre" ? nombre : valor;
    }
    await ctx.db.patch(id, patch);
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
      /* Copiado, no leído de la zona: si la administración sube el depósito
       * en marzo, una reserva de febrero sigue debiendo lo pactado. */
      depositoRequerido: zona.depositoRequerido,
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

/** Reservas de las unidades del usuario autenticado (más recientes primero). */
/**
 * Reporte de reservas de un rango de fechas, con el estado del deposito.
 *
 * Cruza tres cosas que hoy viven separadas: la reserva, lo que la porteria
 * recibio de deposito y si lo devolvio. Sin ese cruce la administracion no
 * puede responder la pregunta que de verdad hace —"a quien le queda
 * pendiente devolverle el deposito"— sin mirar dos pantallas.
 */
export const reporte = query({
  args: {
    condominioId: v.id("condominios"),
    /** "2026-08-01". Inclusive. */
    desde: v.string(),
    /** "2026-08-31". Inclusive. */
    hasta: v.string(),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...ADMIN_ROLES]);

    const reservas = await ctx.db
      .query("reservas")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();

    /* Las fechas son "AAAA-MM-DD", asi que comparar como texto ya ordena
     * bien. No hace falta convertirlas ni preocuparse por zonas horarias. */
    const enRango = reservas
      .filter((r) => r.fecha >= args.desde && r.fecha <= args.hasta)
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.horaInicio.localeCompare(b.horaInicio));

    const filas = await Promise.all(
      enRango.map(async (r) => {
        const dep = await ctx.db
          .query("guardiaReservaDepositos")
          .withIndex("by_reserva", (q) => q.eq("reservaId", r._id))
          .first();
        return {
          _id: r._id,
          fecha: r.fecha,
          horaInicio: r.horaInicio,
          horaFin: r.horaFin,
          zonaNombre: r.zonaNombre,
          unidadNumero: r.unidadNumero,
          solicitanteNombre: r.solicitanteNombre,
          estado: r.estado,
          depositoRequerido: r.depositoRequerido ?? null,
          depositoRecibido: dep?.monto ?? null,
          depositoEstado: dep?.estado ?? null,
          ingresoValidadoAt: r.ingresoValidadoAt ?? null,
          salidaValidadaAt: r.salidaValidadaAt ?? null,
        };
      }),
    );

    /* Los totales se calculan aqui y no en el navegador: son los numeros que
     * la administracion va a cuadrar contra la caja. */
    const cobrables = filas.filter((f) => f.estado !== "cancelada" && f.estado !== "rechazada");
    return {
      filas,
      resumen: {
        total: filas.length,
        aprobadas: filas.filter((f) => f.estado === "aprobada").length,
        canceladas: filas.filter((f) => f.estado === "cancelada").length,
        depositoEsperado: cobrables.reduce((s, f) => s + (f.depositoRequerido ?? 0), 0),
        depositoRecibido: cobrables.reduce((s, f) => s + (f.depositoRecibido ?? 0), 0),
        depositosSinDevolver: filas.filter((f) => f.depositoEstado === "registrado").length,
        depositosRetenidos: filas.filter((f) => f.depositoEstado === "no_devuelto").length,
      },
    };
  },
});

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
      /* Copiado, no leído de la zona: si la administración sube el depósito
       * en marzo, una reserva de febrero sigue debiendo lo pactado. */
      depositoRequerido: zona.depositoRequerido,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * El propietario cancela una reserva de SUS unidades.
 *
 * No la borra: la deja en "cancelada" para que la administración conserve el
 * histórico. Borrar sigue siendo exclusivo de la administración (`remove`).
 */
export const cancelarMia = mutation({
  args: { id: v.id("reservas") },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    const reserva = await ctx.db.get(args.id);
    if (!reserva) throw new Error("Reserva no encontrada.");

    const unidadIds = await misUnidadIds(ctx, user._id, reserva.condominioId);
    if (!unidadIds.has(reserva.unidadId)) {
      throw new Error("Esa reserva no pertenece a tu unidad.");
    }
    if (reserva.estado === "cancelada") {
      throw new Error("La reserva ya está cancelada.");
    }
    if (reserva.estado === "rechazada") {
      throw new Error("Una reserva rechazada no se puede cancelar.");
    }

    await ctx.db.patch(args.id, { estado: "cancelada", updatedAt: Date.now() });
    return args.id;
  },
});

// ─────────────────────────────────────────────────────────────
// Bot de WhatsApp: funciones internas (sin sesión Better Auth).
// El router de whatsapp.ts identifica al propietario por teléfono
// y llama estas funciones con el userId ya resuelto.
// ─────────────────────────────────────────────────────────────

/**
 * Verifica horarios de la zona y solape con otras reservas.
 * Lógica compartida entre verificarDisponibilidad y createFromBot.
 * Asume que la zona ya fue validada (existe y está activa).
 */
async function checkDisponibilidadZona(
  ctx: QueryCtx | MutationCtx,
  zona: Doc<"zonasComunes">,
  fecha: string,
  horaInicio: string,
  horaFin: string,
): Promise<{ ok: boolean; motivo?: string }> {
  // Horarios de funcionamiento (0=domingo … 6=sábado, igual que el schema).
  // Mediodía + getUTCDay para que el día no dependa del timezone del runtime.
  const horarios = zona.horariosPorDia ?? [];
  if (horarios.length > 0) {
    const dia = new Date(fecha + "T12:00:00").getUTCDay();
    const franjas = horarios.filter((h) => h.dia === dia);
    if (franjas.length === 0) {
      return { ok: false, motivo: "La zona no abre ese día." };
    }
    // Comparación lexicográfica de "HH:MM" (convención del archivo).
    const cabe = franjas.some(
      (f) => horaInicio >= f.horaInicio && horaFin <= f.horaFin,
    );
    if (!cabe) {
      const rangos = franjas
        .map((f) => `de ${f.horaInicio} a ${f.horaFin}`)
        .join(" y ");
      return { ok: false, motivo: `Ese día la zona funciona ${rangos}.` };
    }
  }

  // Solape con reservas vigentes (pendientes o aprobadas) de esa zona y fecha.
  const existentes = await ctx.db
    .query("reservas")
    .withIndex("by_zona", (q) => q.eq("zonaId", zona._id))
    .collect();
  const conflicto = existentes.find(
    (r) =>
      r.fecha === fecha &&
      (r.estado === "pendiente" || r.estado === "aprobada") &&
      horaInicio < r.horaFin &&
      horaFin > r.horaInicio,
  );
  if (conflicto) {
    return {
      ok: false,
      motivo: `Ya hay una reserva de ${conflicto.horaInicio} a ${conflicto.horaFin} ese día.`,
    };
  }

  return { ok: true };
}

/** Zonas comunes activas del condominio (para el menú del bot). */
export const zonasActivas = internalQuery({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    const zonas = await ctx.db
      .query("zonasComunes")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();
    return zonas.filter((z) => z.activa);
  },
});

/** ¿Está libre la zona en esa fecha y franja? Devuelve { ok, motivo? }. */
export const verificarDisponibilidad = internalQuery({
  args: {
    zonaId: v.id("zonasComunes"),
    fecha: v.string(),
    horaInicio: v.string(),
    horaFin: v.string(),
  },
  handler: async (ctx, args) => {
    const zona = await ctx.db.get(args.zonaId);
    if (!zona || !zona.activa) {
      return { ok: false, motivo: "La zona no está disponible." };
    }
    return await checkDisponibilidadZona(
      ctx,
      zona,
      args.fecha,
      args.horaInicio,
      args.horaFin,
    );
  },
});

/**
 * Crea una reserva EN NOMBRE de un propietario identificado por el bot
 * (mismas validaciones que createMia, pero con el usuario explícito).
 * Los mensajes de error se muestran tal cual en WhatsApp.
 */
export const createFromBot = internalMutation({
  args: {
    userId: v.id("users"),
    condominioId: v.id("condominios"),
    unidadId: v.id("unidades"),
    zonaId: v.id("zonasComunes"),
    fecha: v.string(),
    horaInicio: v.string(),
    horaFin: v.string(),
    observaciones: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || !user.active) {
      throw new Error("Tu cuenta no está activa. Contacta a la administración.");
    }

    const membership = await getMembership(ctx, args.userId, args.condominioId);
    if (!membership || !membership.isActive) {
      throw new Error("No tienes una cuenta activa en este conjunto.");
    }

    // La unidad debe estar vinculada a la membresía del usuario.
    const links = await ctx.db
      .query("usuarioUnidad")
      .withIndex("by_membership", (q) => q.eq("membershipId", membership._id))
      .collect();
    if (!links.some((l) => l.unidadId === args.unidadId)) {
      throw new Error("Esa unidad no está vinculada a tu cuenta.");
    }
    const unidad = await ctx.db.get(args.unidadId);
    if (!unidad) throw new Error("Unidad no encontrada.");

    const zona = await ctx.db.get(args.zonaId);
    if (!zona || zona.condominioId !== args.condominioId) {
      throw new Error("Zona no encontrada.");
    }
    if (!zona.activa) throw new Error("Esa zona no está disponible.");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.fecha)) {
      throw new Error("La fecha no es válida.");
    }
    if (args.horaFin <= args.horaInicio) {
      throw new Error("La hora de fin debe ser posterior a la de inicio.");
    }

    // Misma lógica de disponibilidad que verificarDisponibilidad.
    const disponible = await checkDisponibilidadZona(
      ctx,
      zona,
      args.fecha,
      args.horaInicio,
      args.horaFin,
    );
    if (!disponible.ok) {
      throw new Error(disponible.motivo ?? "Ese horario no está disponible.");
    }

    const now = Date.now();
    const reservaId = await ctx.db.insert("reservas", {
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
      /* Copiado, no leído de la zona: si la administración sube el depósito
       * en marzo, una reserva de febrero sigue debiendo lo pactado. */
      depositoRequerido: zona.depositoRequerido,
      createdAt: now,
      updatedAt: now,
    });
    return { reservaId, estado: "pendiente" as const };
  },
});
