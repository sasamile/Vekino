import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireCondominioRole } from "./model/authz";
import { resolveMediaUrlList } from "./model/files";
import {
  coincide,
  estadoDe,
  ocurrioEn,
  periodoSiguiente,
  periodoValido,
  totales,
} from "./lib/cobroParqueadero";
import { TARIFAS_POR_DEFECTO } from "./lib/aporte";

/**
 * Cobros de parqueadero: lo que el guarda reporto y hay que pasar a la factura.
 *
 * El reporte viejo leia las FACTURAS y mostraba a quien el software contable
 * ya le habia cobrado. Arrancaba con todo el historico y no servia para
 * gestionar: decia lo que ya paso, no lo que hay que hacer.
 *
 * Este nace vacio y se llena solo con lo que se registra en la ronda, con
 * foto. Cada reporte es un cargo por pasar, y lleva su estado para que no se
 * cobre dos veces ni se quede ninguno sin cobrar.
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

    /* El monto propuesto sale de la tarifa del conjunto segun el tipo de
     * vehiculo; si ya se fijo uno al facturar, manda ese. */
    const monto = (r: {
      vehiculoDescripcion?: string;
      cobroMonto?: number;
    }): number =>
      r.cobroMonto ?? tarifaDe(r.vehiculoDescripcion?.split(" · ")[0], tarifas);

    const resumen = totales(deVehiculo, (r) => monto(r));

    let filtrados = deVehiculo;
    if (args.estado && args.estado !== "todos") {
      filtrados = filtrados.filter((r) => estadoDe(r) === args.estado);
    }
    if (args.periodo) {
      filtrados = filtrados.filter((r) => r.cobroPeriodo === args.periodo);
    }
    if (args.busqueda) {
      filtrados = filtrados.filter((r) => coincide(r, args.busqueda!));
    }

    /* Lo mas reciente arriba: lo que acaba de pasar es lo que hay que cobrar. */
    filtrados.sort((a, b) => ocurrioEn(b) - ocurrioEn(a));

    const filas = await Promise.all(
      filtrados.slice(0, 300).map(async (r) => ({
        _id: r._id,
        placa: r.vehiculoPlaca ?? "—",
        descripcion: r.vehiculoDescripcion ?? null,
        casas: (r.unidades ?? []).map((u) => u.numero),
        titulo: r.titulo,
        ocurrioEn: ocurrioEn(r),
        estado: estadoDe(r),
        monto: monto(r),
        periodo: r.cobroPeriodo ?? null,
        cobradoPor: r.cobradoPorNombre ?? null,
        nota: r.cobroNota ?? null,
        fotos: await resolveMediaUrlList(
          ctx,
          (r.fotos ?? []).map((f) => f.url),
        ),
      })),
    );

    /* Los periodos que ya se usaron, para el filtro de «ya facturados». */
    const periodos = [
      ...new Set(deVehiculo.map((r) => r.cobroPeriodo).filter(Boolean)),
    ].sort((a, b) => String(b).localeCompare(String(a)));

    return {
      filas,
      resumen,
      periodos,
      tarifas,
      /* El mes donde caeria un cargo de hoy, para proponerlo sin teclear. */
      periodoSugerido: periodoSiguiente(Date.now()),
    };
  },
});

/** Marca el cargo como pasado a la factura de un periodo. */
export const marcarFacturado = mutation({
  args: {
    reporteId: v.id("guardiaNovedadReportes"),
    periodo: v.string(),
    monto: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const r = await ctx.db.get(args.reporteId);
    if (!r) throw new Error("Reporte no encontrado.");
    const { user } = await requireCondominioRole(ctx, r.condominioId, [
      ...ADMIN_ROLES,
    ]);
    if (!periodoValido(args.periodo)) {
      throw new Error("El periodo debe tener la forma AAAA-MM.");
    }
    await ctx.db.patch(args.reporteId, {
      cobroEstado: "facturado",
      cobroPeriodo: args.periodo.trim(),
      cobroMonto: args.monto,
      cobradoPorNombre: user.name,
      cobradoEn: Date.now(),
      cobroNota: undefined,
    });
    return { ok: true as const };
  },
});

/** Descarta el cargo: se reporto pero no se va a cobrar, y se dice por que. */
export const descartar = mutation({
  args: {
    reporteId: v.id("guardiaNovedadReportes"),
    nota: v.string(),
  },
  handler: async (ctx, args) => {
    const r = await ctx.db.get(args.reporteId);
    if (!r) throw new Error("Reporte no encontrado.");
    const { user } = await requireCondominioRole(ctx, r.condominioId, [
      ...ADMIN_ROLES,
    ]);
    const nota = args.nota.trim();
    /* Se exige el motivo: un cargo que desaparece sin explicacion es
     * exactamente lo que despues nadie sabe justificar en una asamblea. */
    if (!nota) throw new Error("Escribe por qué no se va a cobrar.");
    await ctx.db.patch(args.reporteId, {
      cobroEstado: "descartado",
      cobroNota: nota,
      cobradoPorNombre: user.name,
      cobradoEn: Date.now(),
      cobroPeriodo: undefined,
    });
    return { ok: true as const };
  },
});

/** Devuelve un cargo a pendiente. Para deshacer una marca equivocada. */
export const devolverAPendiente = mutation({
  args: { reporteId: v.id("guardiaNovedadReportes") },
  handler: async (ctx, args) => {
    const r = await ctx.db.get(args.reporteId);
    if (!r) throw new Error("Reporte no encontrado.");
    await requireCondominioRole(ctx, r.condominioId, [...ADMIN_ROLES]);
    await ctx.db.patch(args.reporteId, {
      cobroEstado: "pendiente",
      cobroPeriodo: undefined,
      cobroNota: undefined,
      cobradoPorNombre: undefined,
      cobradoEn: undefined,
    });
    return { ok: true as const };
  },
});
