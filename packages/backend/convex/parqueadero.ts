import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireCondominioRole } from "./model/authz";
import { resolveMediaUrlList } from "./model/files";
import {
  agruparEnCobros,
  coincide,
  estadoDeReportesViejos,
  ocurrioEn,
  periodoSiguiente,
  totales,
  type EstadoCobro,
  type ReporteCobrable,
} from "./lib/cobroParqueadero";
import { TARIFAS_POR_DEFECTO } from "./lib/aporte";
import {
  aplicarAccionCobro,
  cobroDeReporte,
  cobroDeReporteSinCrear,
  historiaDeCobro,
  identidadDeReporte,
  tipoDeDescripcion,
  type ActorCobro,
} from "./model/cobroParqueadero";

/**
 * Cobros de parqueadero: lo que el guarda reporto y hay que pasar a la factura.
 *
 * El reporte viejo leia las FACTURAS y mostraba a quien el software contable
 * ya le habia cobrado. Arrancaba con todo el historico y no servia para
 * gestionar: decia lo que ya paso, no lo que hay que hacer.
 *
 * Este nace vacio y se llena solo con lo que se registra en la ronda, con
 * foto. Desde la Fase 4 cada fila es un COBRO —una casa, un vehiculo, un mes
 * (`cobrosParqueadero`)— que agrupa todos los reportes de ese carro en ese
 * mes, con un solo estado que mueven esta pantalla y Vigilancia. Ver
 * `model/cobroParqueadero.ts`.
 */

const ADMIN_ROLES = ["administrador", "junta_directiva", "contadora"] as const;

/** La tarifa que le toca a un vehiculo, para proponer el monto del cargo. */
function tarifaDe(
  tipo: string | undefined,
  tarifas: { tarifaCarro: number; tarifaMoto: number },
) {
  if (tipo?.toLowerCase() === "moto") return tarifas.tarifaMoto;
  /* Carro por defecto: si no se sabe que es, cobrar de menos es peor que
   * cobrar de mas, porque nadie reclama un cobro bajo y el dinero no entra. */
  return tarifas.tarifaCarro;
}

export const listar = query({
  args: {
    condominioId: v.id("condominios"),
    /** "pendiente" | "facturado" | "descartado" | "todos" */
    estado: v.optional(v.string()),
    /** Solo los facturados en este periodo. */
    periodo: v.optional(v.string()),
    busqueda: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...ADMIN_ROLES]);
    const condominio = await ctx.db.get(args.condominioId);
    const tarifas = condominio?.aporteVoluntario ?? TARIFAS_POR_DEFECTO;

    const todos = await ctx.db
      .query("guardiaNovedadReportes")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();

    /* Solo los que senalan un vehiculo: una novedad de una gotera no es un
     * cargo de parqueadero. */
    const deVehiculo = todos.filter((r) => r.vehiculoPlaca);

    const cobros = await ctx.db
      .query("cobrosParqueadero")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();

    /* La casa de hoy de cada vehiculo, para los reportes viejos que nombran
     * varias casas (`casaDelCobro`). */
    const vehiculos = await ctx.db
      .query("vehiculos")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();
    const casaDeVehiculo = new Map(vehiculos.map((x) => [x._id as string, x.unidadId as string]));

    const grupos = agruparEnCobros(
      deVehiculo.map((r) => ({ ...r, _id: r._id as string, cargoId: r.cargoId as string | undefined })),
      cobros.map((c) => ({ ...c, _id: c._id as string, unidadId: c.unidadId as string | undefined })),
      (r) => (r.vehiculoId ? casaDeVehiculo.get(r.vehiculoId) : null),
    );

    /* El monto propuesto sale de la tarifa del conjunto segun el tipo de
     * vehiculo; si ya se fijo uno al facturar, manda ese. */
    const tipoDe = (g: (typeof grupos)[number]) =>
      g.cobro?.tipoVehiculo ?? tipoDeDescripcion(g.reportes[0]?.vehiculoDescripcion);
    const monto = (g: (typeof grupos)[number]) => g.monto ?? tarifaDe(tipoDe(g), tarifas);

    /* Los totales cuentan COBROS, no reportes: tres rondas del mismo carro en
     * el mes son un cobro (#40). */
    const comoCobrable = (g: (typeof grupos)[number]): ReporteCobrable => ({
      cobroEstado: g.estado,
      cobroPeriodo: g.periodoFactura,
      vehiculoPlaca: g.placa,
      unidades: g.casa ? [{ numero: g.casa.numero }] : g.reportes[0]?.unidades,
      titulo: g.reportes.map((r) => r.titulo).join(" "),
      createdAt: g.reportes[0]!.createdAt,
    });
    const montoDe = new Map<ReporteCobrable, number>();
    for (const g of grupos) montoDe.set(comoCobrable(g), monto(g));
    const resumen = totales([...montoDe.keys()], (c) => montoDe.get(c) ?? 0);

    let filtrados = grupos;
    if (args.estado && args.estado !== "todos") {
      filtrados = filtrados.filter((g) => g.estado === args.estado);
    }
    if (args.periodo) {
      filtrados = filtrados.filter((g) => g.periodoFactura === args.periodo);
    }
    if (args.busqueda) {
      filtrados = filtrados.filter((g) => coincide(comoCobrable(g), args.busqueda!));
    }

    /* Lo mas reciente arriba: lo que acaba de pasar es lo que hay que cobrar. */
    const ultimo = (g: (typeof grupos)[number]) => Math.max(...g.reportes.map(ocurrioEn));
    filtrados.sort((a, b) => ultimo(b) - ultimo(a));

    const filas = await Promise.all(
      filtrados.slice(0, 300).map(async (g) => {
        /* La fila se identifica por su primer reporte: es lo que mandan las
         * acciones (`reporteId`), y lo que ya mandaba la web anterior. */
        const primero = g.reportes[0]!;
        const nombradas = [
          ...new Set(g.reportes.flatMap((r) => (r.unidades ?? []).map((u) => u.numero))),
        ];
        return {
          _id: primero._id as Id<"guardiaNovedadReportes">,
          cargoId: (g.cobro?._id ?? null) as Id<"cobrosParqueadero"> | null,
          placa: g.placa ?? "—",
          descripcion: primero.vehiculoDescripcion ?? null,
          /* La casa a la que se le cobra. Un reporte viejo que nombra varias
           * casas sin la del vehiculo queda "sin casa" (`casaPorDefinir`). */
          casas: g.casa ? [g.casa.numero] : nombradas,
          casaPorDefinir: !g.casa,
          /** Las demas casas que nombraron los reportes: contexto, no se les cobra. */
          casasNombradas: nombradas,
          /** El mes en que se parqueo (hora de Colombia). */
          periodoParqueo: g.periodo,
          reportes: g.reportes.length,
          ocurrencias: g.reportes.map(ocurrioEn).sort((a, b) => b - a),
          titulo: primero.titulo,
          ocurrioEn: ultimo(g),
          estado: g.estado as EstadoCobro,
          monto: monto(g),
          /** El periodo de la cuenta de cobro donde quedo, si se facturo. */
          periodo: g.periodoFactura ?? null,
          cobradoPor: g.cobro?.actualizadoPorNombre ?? primero.cobradoPorNombre ?? null,
          nota: g.nota ?? null,
          /** Reportes viejos que no estaban de acuerdo en su estado. */
          mezclado: g.mezclado,
          fotos: await resolveMediaUrlList(
            ctx,
            g.reportes.flatMap((r) => (r.fotos ?? []).map((f) => f.url)),
          ),
        };
      }),
    );

    /* Los periodos que ya se usaron, para el filtro de «ya facturados». */
    const periodos = [
      ...new Set(grupos.map((g) => g.periodoFactura).filter(Boolean)),
    ].sort((a, b) => String(b).localeCompare(String(a)));

    return {
      filas,
      resumen: { ...resumen, reportes: deVehiculo.length },
      periodos,
      tarifas,
      /* El mes donde caeria un cargo de hoy, para proponerlo sin teclear. */
      periodoSugerido: periodoSiguiente(Date.now()),
    };
  },
});

async function reporteYActor(
  ctx: MutationCtx,
  reporteId: Id<"guardiaNovedadReportes">,
): Promise<{ reporte: Doc<"guardiaNovedadReportes">; actor: ActorCobro }> {
  const reporte = await ctx.db.get(reporteId);
  if (!reporte) throw new Error("Reporte no encontrado.");
  const { user } = await requireCondominioRole(ctx, reporte.condominioId, [...ADMIN_ROLES]);
  return { reporte, actor: { userId: user._id, nombre: user.name } };
}

/**
 * Marca el cobro como pasado a la factura de un periodo.
 *
 * Cualquier reporte del cobro lo identifica. Un cobro ya facturado no se
 * vuelve a facturar, ni en otro periodo (#42).
 */
export const marcarFacturado = mutation({
  args: {
    reporteId: v.id("guardiaNovedadReportes"),
    periodo: v.string(),
    monto: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { reporte, actor } = await reporteYActor(ctx, args.reporteId);
    const cobro = await cobroDeReporte(ctx, reporte, actor, "cobros");
    await aplicarAccionCobro(
      ctx,
      cobro,
      "facturar",
      { periodoFactura: args.periodo, monto: args.monto, reporteId: args.reporteId },
      actor,
      "cobros",
    );
    return { ok: true as const };
  },
});

/** Descarta el cobro: se reporto pero no se va a cobrar, y se dice por que. */
export const descartar = mutation({
  args: {
    reporteId: v.id("guardiaNovedadReportes"),
    nota: v.string(),
  },
  handler: async (ctx, args) => {
    const { reporte, actor } = await reporteYActor(ctx, args.reporteId);
    const cobro = await cobroDeReporte(ctx, reporte, actor, "cobros");
    await aplicarAccionCobro(
      ctx,
      cobro,
      "descartar",
      { nota: args.nota, reporteId: args.reporteId },
      actor,
      "cobros",
    );
    return { ok: true as const };
  },
});

/**
 * Devuelve un cobro a pendiente. Para deshacer una marca equivocada.
 *
 * Antes borraba el periodo, quien y cuando sin dejar rastro. Ahora el estado
 * anterior, el periodo y el motivo quedan en la historia del cobro.
 */
export const devolverAPendiente = mutation({
  args: {
    reporteId: v.id("guardiaNovedadReportes"),
    nota: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { reporte, actor } = await reporteYActor(ctx, args.reporteId);
    const cobro = await cobroDeReporte(ctx, reporte, actor, "cobros");
    await aplicarAccionCobro(
      ctx,
      cobro,
      "devolver",
      { nota: args.nota, reporteId: args.reporteId },
      actor,
      "cobros",
    );
    return { ok: true as const };
  },
});

/** La historia del cobro al que pertenece un reporte: quien, cuando y que. */
export const historial = query({
  args: { reporteId: v.id("guardiaNovedadReportes") },
  handler: async (ctx, args) => {
    const reporte = await ctx.db.get(args.reporteId);
    if (!reporte) return [];
    await requireCondominioRole(ctx, reporte.condominioId, [...ADMIN_ROLES]);
    const cobro = await cobroDeReporteSinCrear(ctx, reporte);
    if (!cobro) return [];
    return (await historiaDeCobro(ctx, cobro._id)).map((e) => ({
      _id: e._id,
      accion: e.accion,
      estadoAntes: e.estadoAntes ?? null,
      estadoDespues: e.estadoDespues,
      periodoFacturaAntes: e.periodoFacturaAntes ?? null,
      periodoFactura: e.periodoFactura ?? null,
      nota: e.nota ?? null,
      origen: e.origen,
      actorNombre: e.actorNombre,
      at: e.at,
    }));
  },
});

/**
 * Agrupa en cobros los reportes de vehiculo ya guardados (Fase 4).
 *
 * No hace falta para que las pantallas muestren un cobro por mes —agrupan al
 * leer— ni para gestionarlos —el primer cambio enlaza todo el mes—. Sirve
 * para dejar la base ordenada de una vez, con un evento de agrupacion por
 * cobro.
 *
 * `dryRun` vale `true` por defecto: dice que haria sin escribir. Aplicarlo es
 * una escritura sobre datos reales y requiere autorizacion.
 */
export const agruparReportes = internalMutation({
  args: {
    condominioId: v.id("condominios"),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const reportes = (
      await ctx.db
        .query("guardiaNovedadReportes")
        .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
        .collect()
    ).filter((r) => r.vehiculoPlaca);
    const sueltos = reportes.filter((r) => !r.cargoId);

    const porClave = new Map<
      string,
      { identidad: Awaited<ReturnType<typeof identidadDeReporte>>; reportes: typeof sueltos }
    >();
    for (const r of sueltos) {
      const identidad = await identidadDeReporte(ctx, r);
      const g = porClave.get(identidad.clave) ?? { identidad, reportes: [] };
      g.reportes.push(r);
      porClave.set(identidad.clave, g);
    }

    const plan: {
      clave: string;
      casa: string | null;
      periodo: string;
      reportes: number;
      /** Se unen a un cobro que ya existe (lo creo un reporte nuevo del mismo mes). */
      cobroExistente: boolean;
      estado: EstadoCobro;
      mezclado: boolean;
    }[] = [];
    for (const g of porClave.values()) {
      const existente = await ctx.db
        .query("cobrosParqueadero")
        .withIndex("by_condominio_clave", (q) =>
          q.eq("condominioId", args.condominioId).eq("clave", g.identidad.clave),
        )
        .unique();
      const inicial = estadoDeReportesViejos(g.reportes);
      plan.push({
        clave: g.identidad.clave,
        casa: g.identidad.casa?.numero ?? null,
        periodo: g.identidad.periodo,
        reportes: g.reportes.length,
        cobroExistente: !!existente,
        estado: existente?.estado ?? inicial.estado,
        mezclado: inicial.mezclado,
      });
    }

    let creados = 0;
    let enlazados = 0;
    if (!dryRun) {
      const actor = { nombre: "parqueadero.agruparReportes" };
      for (const g of porClave.values()) {
        /* `cobroDeReporte` encuentra o crea el cobro de la clave y enlaza todos
         * sus reportes viejos; con el primero basta. */
        await cobroDeReporte(ctx, g.reportes[0]!, actor, "migracion");
        enlazados += g.reportes.length;
      }
      creados = plan.filter((p) => !p.cobroExistente).length;
    }

    return {
      dryRun,
      reportesDeVehiculo: reportes.length,
      yaEnlazados: reportes.length - sueltos.length,
      reportesPorEnlazar: sueltos.length,
      cobros: plan.length,
      cobrosConVariosReportes: plan.filter((p) => p.reportes > 1).length,
      sinCasa: plan.filter((p) => p.casa === null).length,
      conEstadosMezclados: plan.filter((p) => p.mezclado).length,
      porEstado: plan.reduce<Record<string, number>>((m, p) => {
        m[p.estado] = (m[p.estado] ?? 0) + 1;
        return m;
      }, {}),
      creados,
      enlazados,
      plan,
    };
  },
});
