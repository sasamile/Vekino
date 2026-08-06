import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireCondominioRole } from "./model/authz";

/**
 * Comprobantes de pago subidos por propietarios (foto/PDF, normalmente vía
 * WhatsApp). Flujo: llega → "pendiente_revision" → la administración lo
 * aprueba (marca la factura vinculada como pagada) o lo rechaza.
 *
 * Este canal es paralelo a la pasarela Aval y NUNCA toca la tabla `pagos`
 * (esa es exclusiva de la pasarela).
 */

const ADMIN_ROLES = ["administrador", "contadora", "junta_directiva"] as const;

/** El bot registra un comprobante recibido por WhatsApp. */
export const crearDesdeBot = internalMutation({
  args: {
    condominioId: v.id("condominios"),
    unidadId: v.optional(v.id("unidades")),
    facturaId: v.optional(v.id("facturas")),
    userId: v.optional(v.id("users")),
    telefono: v.optional(v.string()),
    url: v.string(),
    mimeType: v.optional(v.string()),
    nota: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("soportesPago", {
      ...args,
      origen: "whatsapp",
      estado: "pendiente_revision",
      createdAt: Date.now(),
    });
  },
});

/** Factura pendiente/vencida más reciente de una unidad (para vincular el comprobante). */
export const facturaVigenteDeUnidad = internalQuery({
  args: { unidadId: v.id("unidades") },
  handler: async (ctx, args) => {
    const facturas = await ctx.db
      .query("facturas")
      .withIndex("by_unidad", (q) => q.eq("unidadId", args.unidadId))
      .order("desc")
      .take(12);
    return (
      facturas.find((f) => f.estado === "pendiente" || f.estado === "vencida" || f.estado === "abonada") ??
      facturas[0] ??
      null
    );
  },
});

/** Listado para la pantalla de revisión de la administración. */
export const listByCondominio = query({
  args: {
    condominioId: v.id("condominios"),
    estado: v.optional(
      v.union(
        v.literal("pendiente_revision"),
        v.literal("aprobado"),
        v.literal("rechazado"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...ADMIN_ROLES]);

    const soportes = args.estado
      ? await ctx.db
          .query("soportesPago")
          .withIndex("by_condominio_estado", (q) =>
            q.eq("condominioId", args.condominioId).eq("estado", args.estado!),
          )
          .order("desc")
          .take(200)
      : await ctx.db
          .query("soportesPago")
          .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
          .order("desc")
          .take(200);

    return await Promise.all(
      soportes.map(async (s) => {
        const [unidad, factura, user] = await Promise.all([
          s.unidadId ? ctx.db.get(s.unidadId) : null,
          s.facturaId ? ctx.db.get(s.facturaId) : null,
          s.userId ? ctx.db.get(s.userId) : null,
        ]);
        return {
          ...s,
          unidadNumero: unidad?.numero ?? null,
          unidadTorre: unidad?.torre ?? null,
          facturaNumero: factura?.numeroFactura ?? null,
          facturaPeriodo: factura?.periodoLabel ?? null,
          facturaTotal: factura?.totalAPagar ?? null,
          facturaEstado: factura?.estado ?? null,
          userNombre: user?.name ?? null,
        };
      }),
    );
  },
});

/** Conteo liviano para el badge del panel admin. */
export const countPendientes = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...ADMIN_ROLES]);
    const pendientes = await ctx.db
      .query("soportesPago")
      .withIndex("by_condominio_estado", (q) =>
        q.eq("condominioId", args.condominioId).eq("estado", "pendiente_revision"),
      )
      .take(100);
    return pendientes.length;
  },
});

/** Vincula (o corrige) la factura a la que corresponde el comprobante. */
export const vincularFactura = mutation({
  args: {
    id: v.id("soportesPago"),
    facturaId: v.id("facturas"),
  },
  handler: async (ctx, args) => {
    const soporte = await ctx.db.get(args.id);
    if (!soporte) throw new Error("Comprobante no encontrado.");
    await requireCondominioRole(ctx, soporte.condominioId, [...ADMIN_ROLES]);

    const factura = await ctx.db.get(args.facturaId);
    if (!factura || factura.condominioId !== soporte.condominioId) {
      throw new Error("La factura no pertenece a este condominio.");
    }
    if (soporte.estado !== "pendiente_revision") {
      throw new Error("El comprobante ya fue revisado.");
    }

    await ctx.db.patch(args.id, {
      facturaId: args.facturaId,
      unidadId: factura.unidadId,
    });
    return args.id;
  },
});

/**
 * Aprueba el comprobante. Si tiene factura vinculada, la marca como pagada
 * (mismo efecto que una aprobación de la pasarela en pagos.aplicarEstado).
 */
export const aprobar = mutation({
  args: {
    id: v.id("soportesPago"),
    notaRevision: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const soporte = await ctx.db.get(args.id);
    if (!soporte) throw new Error("Comprobante no encontrado.");
    const { user } = await requireCondominioRole(ctx, soporte.condominioId, [
      ...ADMIN_ROLES,
    ]);
    if (soporte.estado !== "pendiente_revision") {
      throw new Error("El comprobante ya fue revisado.");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      estado: "aprobado",
      revisadoPorUserId: user._id,
      revisadoPorNombre: user.name,
      revisadoAt: now,
      notaRevision: args.notaRevision,
    });

    if (soporte.facturaId) {
      const factura = await ctx.db.get(soporte.facturaId);
      if (factura && factura.estado !== "pagada") {
        await ctx.db.patch(soporte.facturaId, {
          estado: "pagada",
          updatedAt: now,
        });
      }
    }

    // El bot le prometió al residente avisarle del resultado.
    await ctx.scheduler.runAfter(0, internal.whatsappNotifs.soporteRevisado, {
      soporteId: args.id,
    });
    return args.id;
  },
});

export const rechazar = mutation({
  args: {
    id: v.id("soportesPago"),
    notaRevision: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const soporte = await ctx.db.get(args.id);
    if (!soporte) throw new Error("Comprobante no encontrado.");
    const { user } = await requireCondominioRole(ctx, soporte.condominioId, [
      ...ADMIN_ROLES,
    ]);
    if (soporte.estado !== "pendiente_revision") {
      throw new Error("El comprobante ya fue revisado.");
    }

    await ctx.db.patch(args.id, {
      estado: "rechazado",
      revisadoPorUserId: user._id,
      revisadoPorNombre: user.name,
      revisadoAt: Date.now(),
      notaRevision: args.notaRevision,
    });

    await ctx.scheduler.runAfter(0, internal.whatsappNotifs.soporteRevisado, {
      soporteId: args.id,
    });
    return args.id;
  },
});
