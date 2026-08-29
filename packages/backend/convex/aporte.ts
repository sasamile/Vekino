import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireCondominioRole } from "./model/authz";
import {
  SIGNIFICADO,
  TARIFAS_POR_DEFECTO,
  aporteDeFactura,
  estadoAporte,
  type TarifasAporte,
} from "./lib/aporte";

/**
 * Aporte voluntario de areas comunes: quien tiene derecho a parquear.
 *
 * El dato no se captura en ningun lado: viene en las facturas que ya sube la
 * administracion, en la linea "CONT VOLUNTARIA AREAS COMUN". Aqui solo se
 * lee y se compara contra la tarifa configurada. Ver `lib/aporte.ts`.
 */

const GUARD_ROLES = ["guardia", "administrador", "junta_directiva"] as const;
const ADMIN_ROLES = ["administrador", "junta_directiva"] as const;

async function tarifasDe(
  ctx: QueryCtx,
  condominioId: Id<"condominios">,
): Promise<TarifasAporte> {
  const c = await ctx.db.get(condominioId);
  return c?.aporteVoluntario ?? TARIFAS_POR_DEFECTO;
}

/** Tipo de tarifa que le corresponde a un vehiculo. */
function tipoTarifa(tipo: string): "carro" | "moto" | null {
  if (tipo === "carro") return "carro";
  if (tipo === "moto") return "moto";
  // La bicicleta no paga cupo, y "otro" no se sabe contra que comparar.
  return null;
}

/** La factura mas reciente de una unidad. */
async function ultimaFactura(ctx: QueryCtx, unidadId: Id<"unidades">) {
  const facturas = await ctx.db
    .query("facturas")
    .withIndex("by_unidad", (q) => q.eq("unidadId", unidadId))
    .collect();
  /* Por periodo ("2026-08"), no por fecha de carga: se pueden subir fuera de
   * orden y lo que importa es cual es la mas nueva del conjunto. */
  return facturas.sort((a, b) => b.periodo.localeCompare(a.periodo))[0] ?? null;
}

/**
 * El guarda consulta una placa y ve si tiene derecho a parquear.
 *
 * Devuelve el estado de la CASA, no del vehiculo: el aporte se cobra por
 * unidad y la factura no dice a que placa corresponde. Si la casa esta al
 * dia, todos sus vehiculos entran; si debe, ninguno.
 *
 * Cuando la casa tiene mas vehiculos que cupos pagados, se dice cuantos son:
 * el sistema no puede saber cual de los dos carros pago, pero el guarda si
 * necesita enterarse de que la cuenta no cuadra.
 */
export const consultarPlaca = query({
  args: { condominioId: v.id("condominios"), placa: v.string() },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...GUARD_ROLES]);

    const aguja = args.placa.replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (aguja.length < 3) return null;

    const vehiculos = await ctx.db
      .query("vehiculos")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();

    const veh = vehiculos.find(
      (x) =>
        !x.archivadoEn &&
        x.placa.replace(/[^a-z0-9]/gi, "").toUpperCase() === aguja,
    );
    if (!veh) return { encontrado: false as const, placa: args.placa.trim().toUpperCase() };

    const unidad = await ctx.db.get(veh.unidadId);
    const factura = await ultimaFactura(ctx, veh.unidadId);
    const tarifas = await tarifasDe(ctx, args.condominioId);
    const monto = factura ? aporteDeFactura(factura.lineas) : 0;
    const estado = estadoAporte(monto, tipoTarifa(veh.tipo), tarifas);

    /* Cuantos vehiculos de la casa comparten el cupo. Si pago un cupo y hay
     * dos carros, el guarda tiene que verlo. */
    const deLaCasa = vehiculos.filter(
      (x) => !x.archivadoEn && x.unidadId === veh.unidadId,
    );
    const cuposPagados =
      estado.tarifaUsada > 0 ? Math.min(estado.mesesEquivalentes, 1) : 0;

    return {
      encontrado: true as const,
      placa: veh.placa,
      tipo: veh.tipo,
      descripcion: [veh.marca, veh.color].filter(Boolean).join(" · ") || null,
      unidadNumero: unidad?.numero ?? null,
      unidadTorre: unidad?.torre ?? null,
      color: estado.color,
      significado: SIGNIFICADO[estado.color],
      enMora: estado.enMora,
      mesesAtraso: estado.mesesAtraso,
      montoPendiente: monto,
      periodoFactura: factura?.periodo ?? null,
      vehiculosEnLaCasa: deLaCasa.length,
      cuposPagados,
    };
  },
});

/** Lo que significa cada color. Para pintar la leyenda sin repetir textos. */
export const leyenda = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...GUARD_ROLES]);
    const tarifas = await tarifasDe(ctx, args.condominioId);
    return { significado: SIGNIFICADO, tarifas };
  },
});

/**
 * Reporte de los vehiculos con aporte voluntario.
 *
 * Lo que pidio la administracion: placa, casa, nombre, cuanto tiempo tuvo el
 * cupo, en que periodos y cuanto suma.
 *
 * Va por MESES y no por dias porque las facturas son mensuales: no existe en
 * ningun lado el dia en que empezo o termino un cupo. Decir "45 dias"
 * cuando lo unico que se sabe es "un mes y medio de facturas" seria inventar
 * precision.
 */
export const reporte = query({
  args: {
    condominioId: v.id("condominios"),
    /** "2026-04". Inclusive. */
    desde: v.string(),
    /** "2026-08". Inclusive. */
    hasta: v.string(),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...ADMIN_ROLES]);
    const tarifas = await tarifasDe(ctx, args.condominioId);

    const facturas = await ctx.db
      .query("facturas")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();

    /* Los periodos son "AAAA-MM", asi que comparar como texto ya ordena. */
    const enRango = facturas.filter(
      (f) => f.periodo >= args.desde && f.periodo <= args.hasta,
    );

    // Aporte por unidad y por periodo.
    const porUnidad = new Map<
      string,
      { periodos: { periodo: string; monto: number }[]; total: number }
    >();
    for (const f of enRango) {
      const monto = aporteDeFactura(f.lineas);
      if (monto <= 0) continue;
      const k = f.unidadId as string;
      const e = porUnidad.get(k) ?? { periodos: [], total: 0 };
      e.periodos.push({ periodo: f.periodo, monto });
      e.total += monto;
      porUnidad.set(k, e);
    }

    const vehiculos = await ctx.db
      .query("vehiculos")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();

    const filas = await Promise.all(
      [...porUnidad.entries()].map(async ([unidadId, datos]) => {
        const unidad = await ctx.db.get(unidadId as Id<"unidades">);
        const suyos = vehiculos.filter(
          (x) => !x.archivadoEn && (x.unidadId as string) === unidadId,
        );
        const periodos = datos.periodos.sort((a, b) =>
          a.periodo.localeCompare(b.periodo),
        );

        /* El responsable de la casa: se toma de la factura, que ya trae el
         * nombre copiado del periodo correspondiente. */
        const factura = enRango.find((f) => (f.unidadId as string) === unidadId);

        const tipo = suyos.some((x) => x.tipo === "carro")
          ? ("carro" as const)
          : suyos.some((x) => x.tipo === "moto")
            ? ("moto" as const)
            : null;
        const estado = estadoAporte(
          periodos[periodos.length - 1]?.monto ?? 0,
          tipo,
          tarifas,
        );

        return {
          unidadId,
          unidadNumero: unidad?.numero ?? "—",
          unidadTorre: unidad?.torre ?? null,
          residenteNombre: factura?.residenteNombre ?? "—",
          placas: suyos.map((x) => x.placa),
          tipos: [...new Set(suyos.map((x) => x.tipo))],
          meses: periodos.length,
          desde: periodos[0]?.periodo ?? null,
          hasta: periodos[periodos.length - 1]?.periodo ?? null,
          valorTotal: datos.total,
          color: estado.color,
          enMora: estado.enMora,
        };
      }),
    );

    filas.sort((a, b) =>
      a.unidadNumero.localeCompare(b.unidadNumero, undefined, { numeric: true }),
    );

    return {
      filas,
      resumen: {
        casas: filas.length,
        valorTotal: filas.reduce((s, f) => s + f.valorTotal, 0),
        enMora: filas.filter((f) => f.enMora).length,
        sinVehiculo: filas.filter((f) => f.placas.length === 0).length,
      },
      tarifas,
    };
  },
});

/** La administracion ajusta las tarifas y el umbral de mora. */
export const configurar = mutation({
  args: {
    condominioId: v.id("condominios"),
    tarifaCarro: v.number(),
    tarifaMoto: v.number(),
    mesesParaMora: v.number(),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...ADMIN_ROLES]);
    if (args.tarifaCarro < 0 || args.tarifaMoto < 0) {
      throw new Error("Las tarifas no pueden ser negativas.");
    }
    if (args.mesesParaMora < 1) {
      throw new Error("El umbral de mora es de al menos un mes.");
    }
    await ctx.db.patch(args.condominioId, {
      aporteVoluntario: {
        tarifaCarro: args.tarifaCarro,
        tarifaMoto: args.tarifaMoto,
        mesesParaMora: args.mesesParaMora,
      },
      updatedAt: Date.now(),
    });
  },
});
