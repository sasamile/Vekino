import { mutation, query, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { requireCondominioRole, requireAppUser, getCurrentAppUser } from "./model/authz";
import {
  carteraDeUnidad,
  enRevision,
  estadoCuentaDeCadena,
  veredictoConciliacion,
} from "./lib/cartera";
import {
  PERIODO_VALIDO,
  estadoDeCarga,
  motivosValidos,
  rechazoDePeriodo,
  validarLectura,
  type MotivoRechazo,
} from "./lib/lecturaFactura";
import { planificarReproceso, type PlanUnidad } from "./lib/reproceso";

/** Quien sube y confirma facturas: los mismos roles de `bulkUpsert`. */
const CARGA_ROLES = ["administrador", "contadora"] as const;

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
  codigoTexto: v.optional(v.string()),
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
//
// El "saldo anterior" es el que imprime el documento (fila Totales) cuando lo
// trae, y la suma de las líneas si no (`saldoAnteriorDe`). Y un par en el que
// alguna de las dos facturas está en revisión (lectura dudosa) no se juzga:
// con un documento que no cuadra no se decide si la anterior se pagó. La
// anterior conserva el estado que tenía: si no lo tenía, sigue sin veredicto.
// ─────────────────────────────────────────────────────────────

/**
 * Recorre la cadena de facturas de una unidad (orden ascendente por período)
 * y ajusta el estado de cada factura según el saldo anterior de la siguiente
 * (`veredictoConciliacion`, `lib/cartera.ts`). Devuelve el conteo de cambios
 * aplicados.
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
    const estado = veredictoConciliacion(anterior, cadena[i]!);
    if (estado === null) continue;

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
  /** Saldo anterior que imprime el documento (fila Totales), si lo trae. */
  saldoAnteriorDocumento: v.optional(v.number()),
  /**
   * Motivos de lectura dudosa que vio el parser en el PDF y que no se pueden
   * comprobar con los números (no estaba el total, la hoja era de
   * continuación…). Solo pueden AGREGAR dudas: lo que el backend comprueba
   * por su cuenta no depende de esto.
   */
  motivosLectura: v.optional(v.array(v.string())),
});

/**
 * Si quien llama puede subir PDFs de facturas del conjunto cuyo `legacyId`
 * es `condominioLegacyId`.
 *
 * La consulta `/api/facturas/upload` antes de leer el PDF y de escribir en
 * S3, donde las llaves van por ese id: la ruta respondía a cualquiera, con o
 * sin sesión. Pide los mismos roles que `bulkUpsert`, que es lo que se hace
 * después con lo leído.
 *
 * Responde el motivo en vez de lanzar: la ruta decide 401 o 403 con él, y no
 * con el texto de un error, que Convex puede ocultar fuera de desarrollo.
 */
export const permisoSubida = query({
  args: { condominioLegacyId: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ allowed: true } | { allowed: false; motivo: "sin_sesion" | "sin_permiso" }> => {
    const user = await getCurrentAppUser(ctx);
    if (!user || !user.active) return { allowed: false, motivo: "sin_sesion" };
    /* `condominios` no tiene índice por `legacyId`, y son pocos: uno por
     * conjunto. Si dos compartieran el id, compartirían la carpeta de S3, así
     * que se exige el rol en todos. */
    const conjuntos = (await ctx.db.query("condominios").collect()).filter(
      (c) => c.legacyId === args.condominioLegacyId,
    );
    if (conjuntos.length === 0) return { allowed: false, motivo: "sin_permiso" };
    for (const c of conjuntos) {
      try {
        await requireCondominioRole(ctx, c._id, ["administrador", "contadora"]);
      } catch {
        return { allowed: false, motivo: "sin_permiso" };
      }
    }
    return { allowed: true };
  },
});

/**
 * Inserta o actualiza un lote de facturas desde la UI (subida de PDF bulk).
 * Idempotente por (condominioId, unidadId, periodo).
 * Con skipExisting=true solo inserta facturas nuevas (no pisa las que ya existen).
 *
 * ── No confía en lo que manda el navegador ──────────────────────────────
 * Valida cada factura por su cuenta (`lib/lecturaFactura.ts`), aunque la
 * ruta de confirmación ya lo haya hecho:
 *
 *   · RECHAZA (no la guarda; devuelve el motivo) la factura cuyo propio
 *     documento dice otro período (`periodo_no_coincide`), la de un período
 *     mal formado o la de una unidad de otro conjunto. Guardarla sería
 *     guardar una identidad que el documento contradice.
 *   · MARCA "en revisión" la que no cuadra (Σ líneas ≠ total, saldo anterior
 *     de las líneas ≠ el del documento, sin líneas, período ilegible, o lo
 *     que avise el parser). Entra igual —es la vigente de su unidad y no
 *     puede faltar—, pero no se paga, no concilia y no decide "al día" ni
 *     "mora" hasta que se corrija o se confirme (`confirmarLectura`).
 *
 * Una lectura correcta que llega después (re-subida con "actualizar") quita
 * la marca.
 */
export const bulkUpsert = mutation({
  args: {
    facturas: v.array(facturaInputValidator),
    skipExisting: v.optional(v.boolean()),
    /** La importación (PDF confirmado) a la que pertenece el lote, si la hay. */
    importacionId: v.optional(v.id("importaciones")),
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
      await requireCondominioRole(ctx, condominioId, [...CARGA_ROLES]);
    }

    const importacion = args.importacionId ? await ctx.db.get(args.importacionId) : null;
    if (args.importacionId) {
      if (!importacion || [...conjuntos].some((c) => c !== importacion.condominioId)) {
        throw new Error("La importación no corresponde a este conjunto.");
      }
      if (importacion.estado !== "en_curso") throw new Error("La importación ya se cerró.");
    }

    const now = Date.now();
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let marcadas = 0;
    const rechazos: { indice: number; unidadId: Id<"unidades">; motivo: MotivoRechazo }[] = [];
    const unidadesAfectadas = new Map<Id<"unidades">, Id<"condominios">>();

    for (const [indice, entrada] of args.facturas.entries()) {
      const { motivosLectura, ...f } = entrada;

      /* Identidad: la unidad es de este conjunto, y el período es el que dice
       * el propio documento. Si no, la factura no se guarda. */
      const unidad = await ctx.db.get(f.unidadId);
      const rechazo: MotivoRechazo | null =
        !unidad || unidad.condominioId !== f.condominioId
          ? "unidad_ajena"
          : rechazoDePeriodo(f.periodo, f.periodoLabel);
      if (rechazo) {
        rechazos.push({ indice, unidadId: f.unidadId, motivo: rechazo });
        continue;
      }

      /* Lectura: lo que el backend comprueba con los números, más lo que el
       * parser vio en el PDF. Cualquier motivo deja la factura en revisión. */
      const motivos = motivosValidos([...validarLectura(f), ...(motivosLectura ?? [])]);
      const lecturaDudosa = motivos.length > 0 ? { motivos, marcadaAt: now } : undefined;
      const estadoCarga = lecturaDudosa ? ("pendiente" as const) : estadoDeCarga(f);

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
          /* Preserva el estado que vino de un pago o de la conciliación; solo
           * el de carga (pendiente / saldo a favor) se recalcula con la nueva
           * lectura. La marca de lectura dudosa se reemplaza por la nueva: una
           * lectura correcta la quita. */
          const deCarga = existing.estado === "pendiente" || existing.estado === "saldo_a_favor";
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
            saldoAnteriorDocumento: f.saldoAnteriorDocumento,
            lecturaDudosa,
            pdfUrl: f.pdfUrl,
            ...(deCarga ? { estado: estadoCarga } : {}),
            ...(args.importacionId ? { importacionId: args.importacionId } : {}),
            updatedAt: now,
          });
          updated++;
          if (lecturaDudosa) marcadas++;
          unidadesAfectadas.set(f.unidadId, f.condominioId);
        }
      } else {
        /* El estado lo decide la lectura, no el que mande quien llama (la UI
         * de subida mandaba "pendiente" a ciegas). */
        await ctx.db.insert("facturas", {
          ...f,
          estado: estadoCarga,
          ...(lecturaDudosa ? { lecturaDudosa } : {}),
          ...(args.importacionId ? { importacionId: args.importacionId } : {}),
          createdAt: now,
          updatedAt: now,
        });
        inserted++;
        if (lecturaDudosa) marcadas++;
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

    if (importacion) {
      await ctx.db.patch(importacion._id, {
        insertadas: importacion.insertadas + inserted,
        actualizadas: importacion.actualizadas + updated,
        omitidas: importacion.omitidas + skipped,
        marcadas: importacion.marcadas + marcadas,
        rechazadas: importacion.rechazadas + rechazos.length,
        rechazos: [
          ...importacion.rechazos,
          ...rechazos.map((r) => ({ unidadId: r.unidadId, motivo: r.motivo })),
        ],
      });
    }

    return {
      inserted,
      updated,
      skipped,
      marcadas,
      rechazadas: rechazos.length,
      rechazos,
      conciliacion,
    };
  },
});

// ─────────────────────────────────────────────────────────────
// Importaciones: la confirmación de un PDF, de punta a punta
//
// /api/facturas/confirmar vuelve a leer el PDF en el servidor, comprueba que
// es el mismo de la vista previa (hash) y entonces:
//   1. `iniciarImportacion` registra la carga y dice qué pasará con cada
//      factura (insertar, actualizar, omitir, rechazar);
//   2. la ruta publica en S3 SOLO las que se insertan o actualizan, con una
//      llave propia de la importación (nunca se pisa un PDF publicado);
//   3. `bulkUpsert` guarda, enlazando cada factura a la importación;
//   4. `finalizarImportacion` la cierra con sus conteos.
// El hash hace idempotente la confirmación: el mismo archivo para el mismo
// período se carga una sola vez, aunque se pulse dos veces.
// ─────────────────────────────────────────────────────────────

/** Una confirmación que lleva más que esto "en curso" se da por abandonada. */
const IMPORTACION_ABANDONADA_MS = 10 * 60 * 1000;

function resumenImportacion(i: Doc<"importaciones">) {
  return {
    importacionId: i._id,
    estado: i.estado,
    documentos: i.documentos,
    insertadas: i.insertadas,
    actualizadas: i.actualizadas,
    omitidas: i.omitidas,
    marcadas: i.marcadas,
    rechazadas: i.rechazadas,
    rechazos: i.rechazos,
  };
}

export const iniciarImportacion = mutation({
  args: {
    condominioId: v.id("condominios"),
    periodo: v.string(),
    archivo: v.string(),
    hash: v.string(),
    soloNuevas: v.boolean(),
    documentos: v.number(),
    /** Las facturas leídas que tienen unidad, con la etiqueta de su documento. */
    candidatas: v.array(
      v.object({
        indice: v.number(),
        unidadId: v.id("unidades"),
        periodoLabel: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCondominioRole(ctx, args.condominioId, [...CARGA_ROLES]);
    if (!PERIODO_VALIDO.test(args.periodo)) throw new Error("El período debe tener la forma AAAA-MM.");
    if (!/^[0-9a-f]{64}$/.test(args.hash)) throw new Error("La huella del archivo no es válida.");

    const ahora = Date.now();
    const previa = (
      await ctx.db
        .query("importaciones")
        .withIndex("by_condominio_hash", (q) =>
          q.eq("condominioId", args.condominioId).eq("hash", args.hash),
        )
        .collect()
    ).find((i) => i.periodo === args.periodo);

    if (previa?.estado === "completada") {
      return {
        tipo: "repetida" as const,
        importacionId: previa._id,
        resultado: resumenImportacion(previa),
        plan: [],
      };
    }
    if (previa?.estado === "en_curso" && ahora - previa.createdAt < IMPORTACION_ABANDONADA_MS) {
      return {
        tipo: "en_curso" as const,
        importacionId: previa._id,
        resultado: resumenImportacion(previa),
        plan: [],
      };
    }

    /* Nueva, o una anterior que falló o quedó a medias: se retoma la MISMA
     * importación, así las llaves de S3 que ya se hubieran publicado se
     * reconocen en vez de duplicarse. */
    const datos = {
      archivo: args.archivo.slice(0, 200),
      userId: user._id,
      userNombre: user.name,
      soloNuevas: args.soloNuevas,
      estado: "en_curso" as const,
      documentos: args.documentos,
      insertadas: 0,
      actualizadas: 0,
      omitidas: 0,
      marcadas: 0,
      rechazadas: 0,
      rechazos: [] as Doc<"importaciones">["rechazos"],
      createdAt: ahora,
    };
    let importacionId: Id<"importaciones">;
    if (previa) {
      await ctx.db.patch(previa._id, { ...datos, error: undefined, completadaAt: undefined });
      importacionId = previa._id;
    } else {
      importacionId = await ctx.db.insert("importaciones", {
        ...datos,
        condominioId: args.condominioId,
        periodo: args.periodo,
        hash: args.hash,
      });
    }

    const plan: { indice: number; accion: "insertar" | "actualizar" | "omitir" | "rechazar"; motivo?: MotivoRechazo }[] = [];
    for (const c of args.candidatas) {
      const unidad = await ctx.db.get(c.unidadId);
      const rechazo: MotivoRechazo | null =
        !unidad || unidad.condominioId !== args.condominioId
          ? "unidad_ajena"
          : rechazoDePeriodo(args.periodo, c.periodoLabel);
      if (rechazo) {
        plan.push({ indice: c.indice, accion: "rechazar", motivo: rechazo });
        continue;
      }
      const existente = await ctx.db
        .query("facturas")
        .withIndex("by_condominio_periodo", (q) =>
          q.eq("condominioId", args.condominioId).eq("periodo", args.periodo),
        )
        .filter((q) => q.eq(q.field("unidadId"), c.unidadId))
        .first();
      plan.push({
        indice: c.indice,
        accion: existente ? (args.soloNuevas ? "omitir" : "actualizar") : "insertar",
      });
    }

    return { tipo: "nueva" as const, importacionId, resultado: null, plan };
  },
});

export const finalizarImportacion = mutation({
  args: {
    importacionId: v.id("importaciones"),
    estado: v.union(v.literal("completada"), v.literal("fallida")),
    error: v.optional(v.string()),
    /** Facturas que no llegaron al backend: sin unidad emparejada. */
    sinUnidad: v.optional(v.array(v.number())),
  },
  handler: async (ctx, args) => {
    const importacion = await ctx.db.get(args.importacionId);
    if (!importacion) throw new Error("Importación no encontrada.");
    await requireCondominioRole(ctx, importacion.condominioId, [...CARGA_ROLES]);
    if (importacion.estado !== "en_curso") return resumenImportacion(importacion);
    const sinUnidad = args.sinUnidad ?? [];
    await ctx.db.patch(args.importacionId, {
      estado: args.estado,
      error: args.error?.slice(0, 500),
      rechazadas: importacion.rechazadas + sinUnidad.length,
      rechazos: [
        ...importacion.rechazos,
        ...sinUnidad.map((indice) => ({ indice, motivo: "sin_unidad" })),
      ],
      completadaAt: Date.now(),
    });
    return resumenImportacion((await ctx.db.get(args.importacionId))!);
  },
});

/**
 * Facturas en revisión del conjunto: lecturas dudosas sin confirmar, con su
 * motivo. Es la lista de trabajo de Finanzas.
 */
export const listEnRevision = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...CARTERA_ROLES]);
    const facturas = await ctx.db
      .query("facturas")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();
    const enCurso = facturas.filter((f) => enRevision(f));
    const unidades = new Map<Id<"unidades">, Doc<"unidades"> | null>();
    for (const f of enCurso) {
      if (!unidades.has(f.unidadId)) unidades.set(f.unidadId, await ctx.db.get(f.unidadId));
    }
    return enCurso
      .map((f) => ({
        _id: f._id,
        periodo: f.periodo,
        numeroFactura: f.numeroFactura,
        unidadNumero: unidades.get(f.unidadId)?.numero ?? f.apto ?? "—",
        unidadTorre: unidades.get(f.unidadId)?.torre ?? null,
        residenteNombre: f.residenteNombre,
        totalAPagar: f.totalAPagar,
        motivos: f.lecturaDudosa?.motivos ?? [],
        marcadaAt: f.lecturaDudosa?.marcadaAt ?? f.updatedAt,
        pdfUrl: f.pdfUrl ?? null,
      }))
      .sort((a, b) => b.periodo.localeCompare(a.periodo) || a.unidadNumero.localeCompare(b.unidadNumero));
  },
});

/**
 * La administración revisó el PDF y da por buena la lectura, aunque no
 * cuadre (por ejemplo, el documento de la contabilidad viene así). Queda
 * registrado quién y cuándo; los motivos originales se conservan. Desde ese
 * momento la factura se paga y concilia como cualquier otra.
 */
export const confirmarLectura = mutation({
  args: { facturaId: v.id("facturas") },
  handler: async (ctx, args) => {
    const factura = await ctx.db.get(args.facturaId);
    if (!factura) throw new Error("Factura no encontrada.");
    const { user } = await requireCondominioRole(ctx, factura.condominioId, [...CARGA_ROLES]);
    if (!factura.lecturaDudosa) throw new Error("La factura no tiene una lectura en revisión.");
    if (factura.lecturaDudosa.confirmada) return args.facturaId;
    const now = Date.now();
    await ctx.db.patch(args.facturaId, {
      lecturaDudosa: {
        ...factura.lecturaDudosa,
        confirmada: { userId: user._id, nombre: user.name, at: now },
      },
      /* Entró `pendiente` por ser dudosa; ahora sus números valen. */
      ...(factura.estado === "pendiente" ? { estado: estadoDeCarga(factura) } : {}),
      updatedAt: now,
    });
    await conciliarCadenaUnidad(ctx, factura.condominioId, factura.unidadId);
    return args.facturaId;
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

// ─────────────────────────────────────────────────────────────
// Re-procesamiento de lo ya cargado con el parser nuevo (Fase 2)
// ─────────────────────────────────────────────────────────────

/** La lectura nueva del PDF ya publicado de una factura (`FacturaLeida`, web). */
const lecturaNuevaValidator = v.object({
  facturaId: v.id("facturas"),
  vrAdmon: v.number(),
  lineas: v.array(lineValidator),
  saldoAFavor: v.number(),
  totalAPagar: v.number(),
  totalConDescuento: v.optional(v.number()),
  saldoAnteriorDocumento: v.optional(v.number()),
  periodoLabel: v.string(),
  motivos: v.array(v.string()),
});

/**
 * Aplica a facturas YA CARGADAS la lectura del parser nuevo de su propio PDF
 * y vuelve a conciliar sus cadenas: el plan de `lib/reproceso.ts`, unidad por
 * unidad (toda la cadena de cada unidad tocada).
 *
 * Por defecto NO escribe (`dryRun: true`): devuelve el plan —qué cambiaría en
 * cada factura y cómo quedaría cada unidad para la administración y para el
 * residente—. Con `dryRun: false` escribe exactamente ese plan.
 *
 * Es `internalMutation`: ningún cliente la puede llamar; solo `convex run`,
 * por lotes de pocas unidades (lee pagos y comprobantes de cada factura). Se
 * aplica SOLO con autorización explícita, después de revisar el informe con
 * la administración (docs/audits/FASE-2-FACTURACION.md, PASO 12).
 *
 * No toca facturas con un pago aprobado o un comprobante aprobado (F-02 es de
 * la Fase 3), ni las que su propio documento dice que son de otro período.
 */
export const reprocesarLecturas = internalMutation({
  args: {
    condominioId: v.id("condominios"),
    lecturas: v.array(lecturaNuevaValidator),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const ahora = Date.now();
    const lecturas = new Map(args.lecturas.map(({ facturaId, ...l }) => [facturaId as string, l]));

    const unidades = new Set<Id<"unidades">>();
    const ajenas: Id<"facturas">[] = [];
    for (const { facturaId } of args.lecturas) {
      const f = await ctx.db.get(facturaId);
      if (!f || f.condominioId !== args.condominioId) ajenas.push(facturaId);
      else unidades.add(f.unidadId);
    }

    const planes: PlanUnidad[] = [];
    for (const unidadId of unidades) {
      const cadena = (
        await ctx.db
          .query("facturas")
          .withIndex("by_unidad", (q) => q.eq("unidadId", unidadId))
          .collect()
      ).filter((f) => f.condominioId === args.condominioId);

      const conEvidencia = new Set<string>();
      for (const f of cadena) {
        const pago = await ctx.db
          .query("pagos")
          .withIndex("by_factura", (q) => q.eq("facturaId", f._id))
          .filter((q) => q.eq(q.field("estado"), "aprobada"))
          .first();
        const comprobante = await ctx.db
          .query("soportesPago")
          .withIndex("by_factura", (q) => q.eq("facturaId", f._id))
          .filter((q) => q.eq(q.field("estado"), "aprobado"))
          .first();
        if (pago || comprobante) conEvidencia.add(f._id);
      }

      const plan = planificarReproceso({ cadena, lecturas, conEvidencia, ahora });
      if (!dryRun) {
        for (const pf of plan.facturas) {
          if (pf.cambios.length === 0) continue;
          /* La marca conservada trae el `userId` de quien confirmó tal como
           * está en la base; las nuevas no traen confirmación. */
          await ctx.db.patch(pf.facturaId as Id<"facturas">, {
            ...(pf.parche as Partial<Doc<"facturas">>),
            updatedAt: ahora,
          });
        }
      }
      planes.push(plan);
    }

    return { dryRun, ajenas, unidades: planes };
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
 * No calcula nada nuevo. El estado de cada factura lo puso la conciliación y
 * la mora sale del vencimiento. Aquí sólo se ordena la cadena y se traduce.
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
    const filas = estadoCuentaDeCadena(cadena).map((fila, i) => ({
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
