import { mutation, query, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { requireCondominioRole } from "./model/authz";

const MESES_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function periodoLabelFrom(periodo: string): string {
  const [y, m] = periodo.split("-");
  const mi = Number(m) - 1;
  return `01-${MESES_ES[mi] ?? m}-${y}`;
}

function formatApto(numero: string, torre?: string | null): string {
  if (torre) return `${numero} ${torre}`;
  return numero;
}

// Valores de líneas en la factura
const lineValidator = v.object({
  codigo: v.number(),
  concepto: v.string(),
  saldoAnterior: v.number(),
  actual: v.number(),
  total: v.number(),
});

// ─────────────────────────────────────────────────────────────
// Conciliación por saldo anterior
//
// La factura del mes siguiente es la fuente de verdad sobre el pago del mes
// anterior: su "saldo anterior" dice cuánto quedó debiendo la unidad.
//   saldo anterior == 0                → la anterior quedó PAGADA
//   0 < saldo anterior < total anterior → la anterior quedó ABONADA (pago parcial)
//   saldo anterior >= total anterior    → la anterior quedó VENCIDA (no pagó;
//                                         con intereses puede venir aún mayor)
// Se recorre la cadena completa por unidad (1ª → 2ª → 3ª…): cada factura juzga
// a la inmediatamente anterior. La última de la cadena no se toca (aún no hay
// factura siguiente que la juzgue).
// ─────────────────────────────────────────────────────────────

/** Tolerancia en pesos para considerar una deuda como saldada (redondeos). */
const TOLERANCIA_PAGO = 1;

/** Deuda que la factura declara arrastrar del período anterior. */
function saldoAnteriorDe(f: Doc<"facturas">): number {
  return f.lineas.reduce((s, l) => s + l.saldoAnterior, 0);
}

/**
 * Recorre la cadena de facturas de una unidad (orden ascendente por período)
 * y ajusta el estado de cada factura según el saldo anterior de la siguiente.
 * Devuelve el conteo de cambios aplicados.
 */
async function conciliarCadenaUnidad(
  ctx: MutationCtx,
  condominioId: Id<"condominios">,
  unidadId: Id<"unidades">,
): Promise<{ pagadas: number; abonadas: number; vencidas: number }> {
  const cadena = (
    await ctx.db
      .query("facturas")
      .withIndex("by_unidad", (q) => q.eq("unidadId", unidadId))
      .collect()
  )
    .filter((f) => f.condominioId === condominioId)
    .sort((a, b) => a.periodo.localeCompare(b.periodo));

  const cambios = { pagadas: 0, abonadas: 0, vencidas: 0 };
  const now = Date.now();

  for (let i = 1; i < cadena.length; i++) {
    const anterior = cadena[i - 1]!;
    const siguiente = cadena[i]!;
    const deuda = saldoAnteriorDe(siguiente);

    let estado: Doc<"facturas">["estado"];
    if (anterior.totalAPagar < 0 && deuda <= TOLERANCIA_PAGO) estado = "saldo_a_favor";
    else if (deuda <= TOLERANCIA_PAGO) estado = "pagada";
    else if (deuda < anterior.totalAPagar - TOLERANCIA_PAGO) estado = "abonada";
    else estado = "vencida";

    if (anterior.estado !== estado) {
      await ctx.db.patch(anterior._id, { estado, updatedAt: now });
      if (estado === "pagada") cambios.pagadas++;
      else if (estado === "abonada") cambios.abonadas++;
      else cambios.vencidas++;
    }
  }

  return cambios;
}

/**
 * Inserta una factura extraída del PDF. Idempotente por (condominioId, unidadId, periodo).
 */
export const upsertFactura = mutation({
  args: {
    condominioId: v.id("condominios"),
    unidadId: v.id("unidades"),
    membershipId: v.optional(v.id("memberships")),

    numeroFactura: v.string(),
    numeroInterno: v.string(),
    periodo: v.string(),
    periodoLabel: v.string(),

    residenteNombre: v.string(),
    apto: v.optional(v.string()),
    vrAdmon: v.number(),

    lineas: v.array(lineValidator),
    saldoAFavor: v.number(),
    totalAPagar: v.number(),
    totalConDescuento: v.optional(v.number()),

    fechaEmision: v.number(),
    fechaVencimiento: v.number(),
    estado: v.union(
      v.literal("pendiente"),
      v.literal("pagada"),
      v.literal("vencida"),
      v.literal("abonada"),
      v.literal("saldo_a_favor")
    ),

    pdfUrl: v.optional(v.string()),
    legacyId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    // Un totalAPagar negativo es saldo a favor del residente, sin importar
    // qué estado haya calculado el caller (que suele mandar "pendiente" a ciegas).
    const estado = args.totalAPagar < 0 ? "saldo_a_favor" : args.estado;

    // Busca factura existente por (condominioId, unidadId, periodo)
    const existing = await ctx.db
      .query("facturas")
      .withIndex("by_condominio_periodo", (q) =>
        q.eq("condominioId", args.condominioId).eq("periodo", args.periodo)
      )
      .filter((q) => q.eq(q.field("unidadId"), args.unidadId))
      .first();

    if (existing) {
      // Actualiza si ya existe
      await ctx.db.patch(existing._id, {
        numeroFactura: args.numeroFactura,
        numeroInterno: args.numeroInterno,
        periodoLabel: args.periodoLabel,
        residenteNombre: args.residenteNombre,
        apto: args.apto,
        vrAdmon: args.vrAdmon,
        lineas: args.lineas,
        saldoAFavor: args.saldoAFavor,
        totalAPagar: args.totalAPagar,
        totalConDescuento: args.totalConDescuento,
        fechaEmision: args.fechaEmision,
        fechaVencimiento: args.fechaVencimiento,
        estado,
        pdfUrl: args.pdfUrl,
        membershipId: args.membershipId,
        updatedAt: now,
      });
      return existing._id;
    }

    // Crea nueva factura
    const id = await ctx.db.insert("facturas", {
      condominioId: args.condominioId,
      unidadId: args.unidadId,
      membershipId: args.membershipId,
      numeroFactura: args.numeroFactura,
      numeroInterno: args.numeroInterno,
      periodo: args.periodo,
      periodoLabel: args.periodoLabel,
      residenteNombre: args.residenteNombre,
      apto: args.apto,
      vrAdmon: args.vrAdmon,
      lineas: args.lineas,
      saldoAFavor: args.saldoAFavor,
      totalAPagar: args.totalAPagar,
      totalConDescuento: args.totalConDescuento,
      fechaEmision: args.fechaEmision,
      fechaVencimiento: args.fechaVencimiento,
      estado,
      pdfUrl: args.pdfUrl,
      legacyId: args.legacyId,
      createdAt: now,
      updatedAt: now,
    });

    // Concilia la cadena de la unidad con la nueva información
    await conciliarCadenaUnidad(ctx, args.condominioId, args.unidadId);

    return id;
  },
});

/**
 * Lista facturas de un condominio por período
 */
export const listByPeriodo = query({
  args: {
    condominioId: v.id("condominios"),
    periodo: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("facturas")
      .withIndex("by_condominio_periodo", (q) =>
        q.eq("condominioId", args.condominioId).eq("periodo", args.periodo)
      )
      .order("asc")
      .collect();
  },
});

/** Facturas recientes de un período (home). Sin .collect() completo. */
export const listRecentByPeriodo = query({
  args: {
    condominioId: v.id("condominios"),
    periodo: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 5, 1), 20);
    const rows = await ctx.db
      .query("facturas")
      .withIndex("by_condominio_periodo", (q) =>
        q.eq("condominioId", args.condominioId).eq("periodo", args.periodo),
      )
      .order("desc")
      .take(limit);
    return rows;
  },
});

/**
 * Página de facturas por período. Sin filtros: paginación real.
 * Con `q` o `estado`: escanea un lote acotado (máx. 250).
 */
export const listPage = query({
  args: {
    condominioId: v.id("condominios"),
    periodo: v.string(),
    paginationOpts: paginationOptsValidator,
    q: v.optional(v.string()),
    estado: v.optional(
      v.union(
        v.literal("pendiente"),
        v.literal("pagada"),
        v.literal("vencida"),
        v.literal("abonada"),
        v.literal("saldo_a_favor"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const needle = args.q?.trim().toLowerCase() ?? "";
    const estado = args.estado;

    if (needle || estado) {
      const scan = await ctx.db
        .query("facturas")
        .withIndex("by_condominio_periodo", (q) =>
          q.eq("condominioId", args.condominioId).eq("periodo", args.periodo),
        )
        .order("desc")
        .take(250);
      const filtered = scan.filter((f) => {
        if (estado && f.estado !== estado) return false;
        if (!needle) return true;
        return (
          f.residenteNombre.toLowerCase().includes(needle) ||
          (f.apto ?? "").toLowerCase().includes(needle) ||
          f.numeroFactura.toLowerCase().includes(needle) ||
          f.numeroInterno.toLowerCase().includes(needle)
        );
      });
      const limit = Math.min(args.paginationOpts.numItems || 30, 60);
      return {
        page: filtered.slice(0, limit),
        isDone: true,
        continueCursor: "",
      };
    }

    return await ctx.db
      .query("facturas")
      .withIndex("by_condominio_periodo", (q) =>
        q.eq("condominioId", args.condominioId).eq("periodo", args.periodo),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

/**
 * Resumen de un período: total recaudado, pendientes, suma total a pagar
 */
export const resumenPeriodo = query({
  args: {
    condominioId: v.id("condominios"),
    periodo: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("facturas")
      .withIndex("by_condominio_periodo", (q) =>
        q.eq("condominioId", args.condominioId).eq("periodo", args.periodo)
      )
      .collect();

    const total = rows.length;
    const pagadas = rows.filter((r) => r.estado === "pagada").length;
    const pendientes = rows.filter((r) => r.estado === "pendiente").length;
    const vencidas = rows.filter((r) => r.estado === "vencida").length;
    const abonadas = rows.filter((r) => r.estado === "abonada").length;
    const saldoAFavorCount = rows.filter((r) => r.estado === "saldo_a_favor").length;
    const sumaTotalAPagar = rows.reduce((s, r) => s + r.totalAPagar, 0);
    const sumaPagado = rows
      .filter((r) => r.estado === "pagada")
      .reduce((s, r) => s + r.totalAPagar, 0);

    return {
      total,
      pagadas,
      pendientes,
      vencidas,
      abonadas,
      saldoAFavorCount,
      sumaTotalAPagar,
      sumaPagado,
    };
  },
});

/**
 * Lista todos los periodos disponibles para un condominio
 */
export const listPeriodos = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("facturas")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();
    const periodos = [...new Set(rows.map((r) => r.periodo))].sort().reverse();
    return periodos;
  },
});

/**
 * Serie temporal por período: totales y desglose de estado en cada período.
 * Ordenada ascendente por período (para gráficas de tendencia).
 */
export const serie = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("facturas")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();

    const map = new Map<
      string,
      {
        periodo: string;
        total: number;
        pagadas: number;
        pendientes: number;
        vencidas: number;
        abonadas: number;
        sumaTotalAPagar: number;
        sumaPagado: number;
      }
    >();

    for (const r of rows) {
      let e = map.get(r.periodo);
      if (!e) {
        e = {
          periodo: r.periodo,
          total: 0,
          pagadas: 0,
          pendientes: 0,
          vencidas: 0,
          abonadas: 0,
          sumaTotalAPagar: 0,
          sumaPagado: 0,
        };
        map.set(r.periodo, e);
      }
      e.total++;
      e.sumaTotalAPagar += r.totalAPagar;
      if (r.estado === "pagada") {
        e.pagadas++;
        e.sumaPagado += r.totalAPagar;
      } else if (r.estado === "pendiente") {
        e.pendientes++;
      } else if (r.estado === "vencida") {
        e.vencidas++;
      } else if (r.estado === "abonada") {
        e.abonadas++;
      }
    }

    return [...map.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));
  },
});

/**
 * Cuenta facturas por período
 */
export const countByPeriodo = query({
  args: {
    condominioId: v.id("condominios"),
    periodo: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("facturas")
      .withIndex("by_condominio_periodo", (q) =>
        q.eq("condominioId", args.condominioId).eq("periodo", args.periodo)
      )
      .collect();
    return rows.length;
  },
});

const facturaInputValidator = v.object({
  condominioId: v.id("condominios"),
  unidadId: v.id("unidades"),
  membershipId: v.optional(v.id("memberships")),
  numeroFactura: v.string(),
  numeroInterno: v.string(),
  periodo: v.string(),
  periodoLabel: v.string(),
  residenteNombre: v.string(),
  apto: v.optional(v.string()),
  vrAdmon: v.number(),
  lineas: v.array(lineValidator),
  saldoAFavor: v.number(),
  totalAPagar: v.number(),
  totalConDescuento: v.optional(v.number()),
  fechaEmision: v.number(),
  fechaVencimiento: v.number(),
  estado: v.union(
    v.literal("pendiente"),
    v.literal("pagada"),
    v.literal("vencida"),
    v.literal("abonada"),
    v.literal("saldo_a_favor"),
  ),
  pdfUrl: v.optional(v.string()),
  legacyId: v.optional(v.string()),
});

/**
 * Inserta o actualiza un lote de facturas desde la UI (subida de PDF bulk).
 * Idempotente por (condominioId, unidadId, periodo).
 * Con skipExisting=true solo inserta facturas nuevas (no pisa las que ya existen).
 */
export const bulkUpsert = mutation({
  args: {
    facturas: v.array(facturaInputValidator),
    skipExisting: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const unidadesAfectadas = new Map<Id<"unidades">, Id<"condominios">>();

    for (const f of args.facturas) {
      const existing = await ctx.db
        .query("facturas")
        .withIndex("by_condominio_periodo", (q) =>
          q.eq("condominioId", f.condominioId).eq("periodo", f.periodo)
        )
        .filter((q) => q.eq(q.field("unidadId"), f.unidadId))
        .first();

      if (existing) {
        if (args.skipExisting) {
          skipped++;
          // Aun sin re-insertar, la factura existente puede juzgar a la anterior
          unidadesAfectadas.set(f.unidadId, f.condominioId);
        } else {
          // Preserva el estado de pago; solo actualiza datos financieros y PDF
          await ctx.db.patch(existing._id, {
            numeroFactura: f.numeroFactura,
            numeroInterno: f.numeroInterno,
            periodoLabel: f.periodoLabel,
            residenteNombre: f.residenteNombre,
            apto: f.apto,
            vrAdmon: f.vrAdmon,
            lineas: f.lineas,
            saldoAFavor: f.saldoAFavor,
            totalAPagar: f.totalAPagar,
            totalConDescuento: f.totalConDescuento,
            pdfUrl: f.pdfUrl,
            updatedAt: now,
          });
          updated++;
          unidadesAfectadas.set(f.unidadId, f.condominioId);
        }
      } else {
        // Un totalAPagar negativo es saldo a favor del residente, sin importar
        // qué estado haya mandado el caller (la UI de subida manda "pendiente" a ciegas).
        const estado = f.totalAPagar < 0 ? "saldo_a_favor" : f.estado;
        await ctx.db.insert("facturas", { ...f, estado, createdAt: now, updatedAt: now });
        inserted++;
        unidadesAfectadas.set(f.unidadId, f.condominioId);
      }
    }

    // Conciliación automática: cada factura nueva juzga a la anterior de su unidad
    const conciliacion = { pagadas: 0, abonadas: 0, vencidas: 0 };
    for (const [unidadId, condominioId] of unidadesAfectadas) {
      const c = await conciliarCadenaUnidad(ctx, condominioId, unidadId);
      conciliacion.pagadas += c.pagadas;
      conciliacion.abonadas += c.abonadas;
      conciliacion.vencidas += c.vencidas;
    }

    return { inserted, updated, skipped, conciliacion };
  },
});

/**
 * Re-ejecuta la conciliación por saldo anterior sobre TODAS las cadenas de
 * facturas del condominio (1ª → 2ª → 3ª… por unidad). Útil para arreglar el
 * histórico completo de una vez o después de correcciones manuales.
 */
export const reconciliar = mutation({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [
      "administrador",
      "contadora",
      "junta_directiva",
    ]);

    const facturas = await ctx.db
      .query("facturas")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();

    const unidades = [...new Set(facturas.map((f) => f.unidadId))];

    const totales = { pagadas: 0, abonadas: 0, vencidas: 0 };
    for (const unidadId of unidades) {
      const c = await conciliarCadenaUnidad(ctx, args.condominioId, unidadId);
      totales.pagadas += c.pagadas;
      totales.abonadas += c.abonadas;
      totales.vencidas += c.vencidas;
    }

    return {
      unidades: unidades.length,
      facturas: facturas.length,
      ...totales,
    };
  },
});

/** URL de subida para adjunto — @deprecated usar api.files.generateUploadUrl (S3). */
export const generateUploadUrl = mutation({
  args: {},
  handler: async () => {
    throw new Error(
      "Las subidas van a S3. Usa api.files.generateUploadUrl (action).",
    );
  },
});

/**
 * Crea una factura puntual para una unidad (montos manuales + PDF/imagen opcional).
 * Falla si ya existe factura para (condominio, unidad, período).
 */
export const createManual = mutation({
  args: {
    condominioId: v.id("condominios"),
    unidadId: v.id("unidades"),
    periodo: v.string(),
    fechaVencimiento: v.number(),
    valor: v.number(),
    saldoAFavor: v.optional(v.number()),
    totalConDescuento: v.optional(v.number()),
    pdfStorageId: v.optional(v.id("_storage")),
    pdfUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [
      "administrador",
      "contadora",
      "junta_directiva",
    ]);

    if (!/^\d{4}-\d{2}$/.test(args.periodo)) {
      throw new Error("El período debe tener formato YYYY-MM.");
    }
    if (args.valor < 0) throw new Error("El valor no puede ser negativo.");
    const saldoAFavor = Math.max(0, args.saldoAFavor ?? 0);
    if (
      args.totalConDescuento !== undefined &&
      args.totalConDescuento !== null &&
      args.totalConDescuento < 0
    ) {
      throw new Error("El valor con descuento no puede ser negativo.");
    }

    const unidad = await ctx.db.get(args.unidadId);
    if (!unidad || unidad.condominioId !== args.condominioId) {
      throw new Error("Unidad no encontrada en este condominio.");
    }

    const existing = await ctx.db
      .query("facturas")
      .withIndex("by_condominio_periodo", (q) =>
        q.eq("condominioId", args.condominioId).eq("periodo", args.periodo),
      )
      .filter((q) => q.eq(q.field("unidadId"), args.unidadId))
      .first();
    if (existing) {
      throw new Error(
        "Ya existe una factura para esta unidad en ese período.",
      );
    }

    const links = await ctx.db
      .query("usuarioUnidad")
      .withIndex("by_unidad", (q) => q.eq("unidadId", args.unidadId))
      .collect();

    let membershipId: Id<"memberships"> | undefined;
    let residenteNombre = "Sin asignar";
    for (const link of links) {
      const m = await ctx.db.get(link.membershipId);
      if (!m) continue;
      const user = await ctx.db.get(m.userId);
      if (!membershipId) membershipId = m._id;
      if (user?.name) {
        residenteNombre = user.name;
        membershipId = m._id;
        if (link.vinculo === "propietario" || link.esPrincipal) break;
      }
    }

    const apto = formatApto(unidad.numero, unidad.torre);
    const mesNombre = MESES_ES[Number(args.periodo.split("-")[1]) - 1] ?? "";
    const totalAPagar = Math.max(0, args.valor - saldoAFavor);
    const now = Date.now();
    const consecutivo = String(now).slice(-6);
    const numeroFactura = `FAC-${args.periodo}-${unidad.numero}-${consecutivo}`;
    const numeroInterno = consecutivo;

    let pdfUrl = args.pdfUrl;
    if (!pdfUrl && args.pdfStorageId) {
      pdfUrl = (await ctx.storage.getUrl(args.pdfStorageId)) ?? undefined;
    }

    const id = await ctx.db.insert("facturas", {
      condominioId: args.condominioId,
      unidadId: args.unidadId,
      membershipId,
      numeroFactura,
      numeroInterno,
      periodo: args.periodo,
      periodoLabel: periodoLabelFrom(args.periodo),
      residenteNombre,
      apto,
      vrAdmon: args.valor,
      lineas: [
        {
          codigo: 1,
          concepto: `Administración de ${mesNombre}`,
          saldoAnterior: 0,
          actual: args.valor,
          total: args.valor,
        },
      ],
      saldoAFavor,
      totalAPagar,
      totalConDescuento: args.totalConDescuento,
      fechaEmision: now,
      fechaVencimiento: args.fechaVencimiento,
      estado: "pendiente",
      pdfUrl,
      createdAt: now,
      updatedAt: now,
    });

    await conciliarCadenaUnidad(ctx, args.condominioId, args.unidadId);
    return id;
  },
});

/** Facturas de las unidades del usuario autenticado en este condominio. */
export const listMia = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    const { membership } = await requireCondominioRole(ctx, args.condominioId, []);

    if (!membership) {
      // Superadmin/admin: retorna las últimas facturas del condominio
      return await ctx.db
        .query("facturas")
        .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
        .order("desc")
        .take(50);
    }

    const links = await ctx.db
      .query("usuarioUnidad")
      .withIndex("by_membership", (q) => q.eq("membershipId", membership._id))
      .collect();

    if (links.length === 0) return [];

    const sets = await Promise.all(
      links.map((l) =>
        ctx.db
          .query("facturas")
          .withIndex("by_unidad", (q) => q.eq("unidadId", l.unidadId))
          .order("desc")
          .take(50)
      )
    );

    return sets
      .flat()
      .sort((a, b) => b.fechaEmision - a.fechaEmision)
      .slice(0, 50);
  },
});

/**
 * Backfill de fechas. Las facturas migradas quedaron con fechaEmision y
 * fechaVencimiento en 0 (epoch → se muestra "31 de diciembre de 1969").
 * Deriva ambas del período "YYYY-MM":
 *   fechaEmision     = día 1 del mes del período
 *   fechaVencimiento = día 15 del mes siguiente (regla documentada en el schema)
 * Solo toca facturas con la fecha en 0. Idempotente.
 */
export const backfillFechas = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("facturas").collect();
    let actualizadas = 0;
    const now = Date.now();
    for (const f of rows) {
      if (f.fechaEmision > 0 && f.fechaVencimiento > 0) continue;
      const parts = f.periodo.split("-");
      const y = Number(parts[0]);
      const m = Number(parts[1]);
      if (!y || !m) continue;
      await ctx.db.patch(f._id, {
        fechaEmision: f.fechaEmision > 0 ? f.fechaEmision : Date.UTC(y, m - 1, 1, 12),
        fechaVencimiento:
          f.fechaVencimiento > 0 ? f.fechaVencimiento : Date.UTC(y, m, 15, 12),
        updatedAt: now,
      });
      actualizadas++;
    }
    return { actualizadas, total: rows.length };
  },
});
