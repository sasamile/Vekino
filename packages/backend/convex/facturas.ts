import { mutation, query, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { requireCondominioRole, requireAppUser } from "./model/authz";
import {
  carteraDeUnidad,
  estadoCuentaDeCadena,
  saldoAnteriorDe,
} from "./lib/cartera";

/**
 * Quien puede ver la cartera del conjunto.
 *
 * La factura dice nombre, apartamento y cuanto debe cada residente. No es
 * dato de vecino: es de la administracion y de quien lleva las cuentas.
 * El residente ve LA SUYA por `listMia`, que filtra por sus unidades.
 */
const CARTERA_ROLES = ["administrador", "contadora", "junta_directiva"] as const;

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
/**
 * Alta/actualización de una factura desde los scripts de importación.
 *
 * Es `internalMutation` y no `mutation`: en Convex toda función exportada
 * como `mutation` es API pública, invocable por cualquiera que conozca la URL
 * del deployment —y esa URL viaja en el bundle del navegador—. Esta no tiene
 * ningún llamador de cliente; sus únicos usuarios son los scripts de
 * migración vía `convex run`, que también pueden invocar funciones internas.
 *
 * La alta manual desde la aplicación es `createManual`, que sí comprueba
 * permisos.
 */
export const upsertFactura = internalMutation({
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
    await requireCondominioRole(ctx, args.condominioId, [...CARTERA_ROLES]);
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
    await requireCondominioRole(ctx, args.condominioId, [...CARTERA_ROLES]);
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
    await requireCondominioRole(ctx, args.condominioId, [...CARTERA_ROLES]);
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
    await requireCondominioRole(ctx, args.condominioId, [...CARTERA_ROLES]);
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
    await requireCondominioRole(ctx, args.condominioId, [...CARTERA_ROLES]);
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
    await requireCondominioRole(ctx, args.condominioId, [...CARTERA_ROLES]);
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
    await requireCondominioRole(ctx, args.condominioId, [...CARTERA_ROLES]);
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
    /* Sesión primero. Sin esto, un lote VACÍO no pasaba por ninguna
     * comprobación —el bucle de abajo no itera— y una mutación pública
     * respondía correctamente a quien no había iniciado sesión. No escribía
     * nada, pero una escritura que no exige identidad no debe existir. */
    await requireAppUser(ctx);

    /* El lote no trae un `condominioId` propio: cada factura lleva el suyo.
     * Así que se comprueba el permiso sobre CADA conjunto presente en el
     * payload, no sobre el primero. Sin esto, quien administra un conjunto
     * podría colar en el mismo lote facturas de otro. */
    const conjuntos = new Set(args.facturas.map((f) => f.condominioId));
    for (const condominioId of conjuntos) {
      await requireCondominioRole(ctx, condominioId, [
        "administrador",
        "contadora",
      ]);
    }

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

    let rows: Doc<"facturas">[];

    if (!membership) {
      // Superadmin/admin: retorna las últimas facturas del condominio
      rows = await ctx.db
        .query("facturas")
        .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
        .order("desc")
        .take(50);
    } else {
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
            .take(50),
        ),
      );

      rows = sets
        .flat()
        .sort((a, b) => b.fechaEmision - a.fechaEmision)
        .slice(0, 50);
    }

    const unidadCache = new Map<
      Id<"unidades">,
      { numero: string; tipo: string; torre: string | null }
    >();

    return await Promise.all(
      rows.map(async (f) => {
        let u = unidadCache.get(f.unidadId);
        if (!u) {
          const doc = await ctx.db.get(f.unidadId);
          u = doc
            ? {
                numero: doc.numero,
                tipo: doc.tipo,
                torre: doc.torre ?? null,
              }
            : { numero: "—", tipo: "otro", torre: null };
          unidadCache.set(f.unidadId, u);
        }
        return {
          ...f,
          unidadNumero: u.numero,
          unidadTipo: u.tipo,
          unidadTorre: u.torre,
        };
      }),
    );
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

/**
 * Estado de cartera de un grupo de unidades, en una sola consulta.
 *
 * Nace para la tabla de reservas: la administración necesita ver, al lado de
 * cada solicitud, si esa casa está al día. Vive aquí y no en `reservas.ts`
 * porque es cartera —quién debe y desde cuándo lo decide este módulo— y
 * porque así hereda su control de acceso: `reservas.listPage` la puede leer
 * cualquier miembro del conjunto, y la situación financiera del vecino no es
 * dato de vecino. Reservas solo la consume.
 *
 * ── Por qué recibe una lista y no una unidad ─────────────────────────────
 * Preguntar unidad por unidad desde la tabla serían tantas consultas como
 * filas. Se piden juntas y se responden juntas: el llamador manda las
 * unidades DISTINTAS que tiene en pantalla —treinta reservas suelen ser doce
 * casas— y cada una se lee una sola vez.
 *
 * NO decide nada sobre la reserva. Informa; aprobar o rechazar sigue siendo
 * de quien administra, que es el único que sabe si hay un acuerdo de pago de
 * por medio.
 */

/**
 * Topes de la consulta. Se leen juntos: lo que acota el trabajo es el
 * PRODUCTO, porque cada unidad se resuelve con su propio recorrido de índice.
 *
 * 120 × 120 = 14.400 documentos en el peor caso imaginable, que es el orden
 * de lo que Convex deja leer en una función. Con 240 facturas por unidad el
 * peor caso se pasaba del techo y la consulta reventaba en vez de degradarse.
 *
 * Ninguno se alcanza con datos reales: 120 unidades son cuatro páginas de
 * reservas sin una sola casa repetida, y 120 facturas son diez años de cuotas
 * mensuales. Son cinturones de seguridad, no dimensionamiento.
 *
 * Si el de unidades se alcanza, las que sobren se devuelven sin fila: quien
 * llama debe distinguir "todavía cargando" de "no vino", y no dejar una
 * casilla girando para siempre.
 */
const MAX_UNIDADES_CARTERA = 120;
const MAX_FACTURAS_UNIDAD = 120;

export const carteraPorUnidad = query({
  args: {
    condominioId: v.id("condominios"),
    unidadIds: v.array(v.id("unidades")),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...CARTERA_ROLES]);

    const ids = [...new Set(args.unidadIds)].slice(0, MAX_UNIDADES_CARTERA);
    const ahora = Date.now();

    const filas = await Promise.all(
      ids.map(async (unidadId) => {
        /* El id llega del cliente: hay que comprobar que la unidad es de ESTE
         * conjunto antes de contar su plata. Sin esto, quien administra un
         * conjunto podría leer la cartera de otro pasando ids ajenos. */
        const unidad = await ctx.db.get(unidadId);
        if (!unidad || unidad.condominioId !== args.condominioId) return null;

        const facturas = await ctx.db
          .query("facturas")
          .withIndex("by_unidad", (q) => q.eq("unidadId", unidadId))
          .take(MAX_FACTURAS_UNIDAD);

        /* `by_unidad` no lleva el condominio en la llave; el mismo filtro que
         * hace la conciliación. */
        const propias = facturas.filter((f) => f.condominioId === args.condominioId);

        return { unidadId, ...carteraDeUnidad(propias, ahora) };
      }),
    );

    return filas.filter((f) => f !== null);
  },
});

/**
 * Estado de cuenta de UNA unidad: sus facturas, una por una.
 *
 * Es el detalle detrás del resumen que `carteraPorUnidad` pone en la tabla de
 * reservas, y se pide sólo cuando la administración abre el modal de una
 * casa. Por eso son dos consultas y no una: cargar el detalle de las treinta
 * casas de la página para que se mire una sería traer treinta veces más de lo
 * que se va a leer.
 *
 * No calcula nada nuevo. El estado de cada factura lo puso la conciliación,
 * el abono sale del saldo anterior de la factura siguiente —el mismo número
 * con el que la conciliación decide— y la mora sale del vencimiento. Aquí
 * sólo se ordena la cadena y se traduce.
 *
 * Devuelve `null` si la unidad no es de este condominio, en vez de lanzar:
 * quien pregunta ya demostró que administra ESTE conjunto, y un id que no
 * corresponde es una pantalla desincronizada, no un intento de intrusión. Lo
 * que no hace nunca es responder con datos de otro conjunto.
 */
export const estadoCuentaUnidad = query({
  args: {
    condominioId: v.id("condominios"),
    unidadId: v.id("unidades"),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...CARTERA_ROLES]);

    const unidad = await ctx.db.get(args.unidadId);
    if (!unidad || unidad.condominioId !== args.condominioId) return null;

    const cadena = (
      await ctx.db
        .query("facturas")
        .withIndex("by_unidad", (q) => q.eq("unidadId", args.unidadId))
        .take(MAX_FACTURAS_UNIDAD)
    )
      .filter((f) => f.condominioId === args.condominioId)
      /* Del más viejo al más nuevo: cada factura se juzga con la siguiente,
       * igual que en la conciliación. */
      .sort((a, b) => a.periodo.localeCompare(b.periodo));

    const ahora = Date.now();
    const filas = estadoCuentaDeCadena(cadena, ahora).map((fila, i) => ({
      ...fila,
      _id: cadena[i]!._id,
      numeroFactura: cadena[i]!.numeroFactura,
      fechaEmision: cadena[i]!.fechaEmision,
      pdfUrl: cadena[i]!.pdfUrl ?? null,
    }));

    return {
      unidad: {
        _id: unidad._id,
        numero: unidad.numero,
        torre: unidad.torre ?? null,
        residenteNombre: cadena[cadena.length - 1]?.residenteNombre ?? null,
      },
      cartera: carteraDeUnidad(cadena, ahora),
      /* De la más reciente hacia atrás: es el orden en el que se lee un
       * estado de cuenta. */
      facturas: filas.reverse(),
    };
  },
});
