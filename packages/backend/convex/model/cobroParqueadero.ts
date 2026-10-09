import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  casaDelCobro,
  claveCobro,
  estadoDeReportesViejos,
  periodoDeReporte,
  periodoValido,
  transicionCobro,
  type AccionCobro,
  type EstadoCobro,
} from "../lib/cobroParqueadero";

/**
 * Cobros de parqueadero (Fase 4, F-08): el UNICO codigo que escribe su estado.
 *
 * Lo usan las dos pantallas que antes llevaban cada una su estado —Cobros de
 * parqueadero (`parqueadero.ts`) y Vigilancia (`guardia.gestionarNovedad`)—
 * y la ronda del guarda al reportar (`guardia.reportarNovedad`). Cada cambio
 * pasa por `transicionCobro` y deja su evento en `cobroParqueaderoEventos`.
 */

type Ctx = QueryCtx | MutationCtx;
type Reporte = Doc<"guardiaNovedadReportes">;
type Cobro = Doc<"cobrosParqueadero">;

export type ActorCobro = { userId?: Id<"users">; nombre: string };
export type OrigenCobro = Doc<"cobroParqueaderoEventos">["origen"];

/** "carro" de "Carro · Mazda · Gris": decide la tarifa. */
export function tipoDeDescripcion(descripcion: string | undefined): string | undefined {
  const tipo = descripcion?.split(" · ")[0]?.trim().toLowerCase();
  return tipo || undefined;
}

/** La casa a la que responde hoy el vehiculo de un reporte, si se sabe. */
async function unidadDelVehiculo(ctx: Ctx, r: Reporte): Promise<Id<"unidades"> | null> {
  if (!r.vehiculoId) return null;
  const veh = await ctx.db.get(r.vehiculoId);
  return veh?.unidadId ?? null;
}

/** La identidad que le toca a un reporte que todavia no tiene su cobro. */
export async function identidadDeReporte(ctx: Ctx, r: Reporte) {
  const casa = casaDelCobro(
    (r.unidades ?? []).map((u) => ({ unidadId: u.unidadId as string, numero: u.numero })),
    await unidadDelVehiculo(ctx, r),
  );
  const periodo = periodoDeReporte(r);
  return {
    casa: casa as { unidadId: Id<"unidades">; numero: string } | null,
    periodo,
    clave: claveCobro({ unidadId: casa?.unidadId, placa: r.vehiculoPlaca, periodo }),
  };
}

export async function cobroPorClave(
  ctx: Ctx,
  condominioId: Id<"condominios">,
  clave: string,
): Promise<Cobro | null> {
  return await ctx.db
    .query("cobrosParqueadero")
    .withIndex("by_condominio_clave", (q) => q.eq("condominioId", condominioId).eq("clave", clave))
    .unique();
}

/**
 * Los reportes viejos (sin cobro enlazado) de una clave.
 *
 * Por el indice del vehiculo cuando el reporte lo tiene —todos los reales—, y
 * si no, recorriendo los del conjunto.
 */
async function reportesViejosDeClave(
  ctx: Ctx,
  base: Reporte,
  clave: string,
): Promise<Reporte[]> {
  const candidatos = base.vehiculoId
    ? await ctx.db
        .query("guardiaNovedadReportes")
        .withIndex("by_vehiculo", (q) => q.eq("vehiculoId", base.vehiculoId))
        .collect()
    : await ctx.db
        .query("guardiaNovedadReportes")
        .withIndex("by_condominio", (q) => q.eq("condominioId", base.condominioId))
        .collect();
  const mios: Reporte[] = [];
  for (const r of candidatos) {
    if (r.cargoId || !r.vehiculoPlaca || r.condominioId !== base.condominioId) continue;
    if ((await identidadDeReporte(ctx, r)).clave === clave) mios.push(r);
  }
  return mios;
}

/**
 * El cobro de un reporte de vehiculo, sin escribir nada.
 *
 * Enlazado, el suyo. Viejo, el guardado con su misma clave, o null si nadie lo
 * ha gestionado todavia (entonces su estado sale de los reportes viejos).
 */
export async function cobroDeReporteSinCrear(ctx: Ctx, r: Reporte): Promise<Cobro | null> {
  if (r.cargoId) {
    const cobro = await ctx.db.get(r.cargoId);
    if (cobro) return cobro;
  }
  if (!r.vehiculoPlaca) return null;
  return await cobroPorClave(ctx, r.condominioId, (await identidadDeReporte(ctx, r)).clave);
}

async function anotar(
  ctx: MutationCtx,
  cobro: Pick<Cobro, "_id" | "condominioId">,
  evento: Omit<
    Doc<"cobroParqueaderoEventos">,
    "_id" | "_creationTime" | "cargoId" | "condominioId" | "at" | "actorUserId" | "actorNombre"
  >,
  actor: ActorCobro,
) {
  await ctx.db.insert("cobroParqueaderoEventos", {
    cargoId: cobro._id,
    condominioId: cobro.condominioId,
    ...evento,
    actorUserId: actor.userId,
    actorNombre: actor.nombre,
    at: Date.now(),
  });
}

/**
 * Crea el cobro de una clave a partir de sus reportes viejos y los enlaza.
 *
 * El estado inicial es el que decian esos reportes (`estadoDeReportesViejos`):
 * hoy todos estan pendientes, pero si alguno ya se habia marcado "cobrada" o
 * "facturado", el cobro nace facturado y no se vuelve a ofrecer.
 */
async function crearCobro(
  ctx: MutationCtx,
  datos: {
    condominioId: Id<"condominios">;
    clave: string;
    casa: { unidadId: Id<"unidades">; numero: string } | null;
    periodo: string;
    placa: string;
    vehiculoId?: Id<"vehiculos">;
    tipoVehiculo?: string;
  },
  viejos: Reporte[],
  actor: ActorCobro,
  origen: OrigenCobro,
): Promise<Cobro> {
  const inicial = estadoDeReportesViejos(viejos);
  const ahora = Date.now();
  const id = await ctx.db.insert("cobrosParqueadero", {
    condominioId: datos.condominioId,
    clave: datos.clave,
    unidadId: datos.casa?.unidadId,
    unidadNumero: datos.casa?.numero,
    vehiculoId: datos.vehiculoId,
    placa: datos.placa,
    tipoVehiculo: datos.tipoVehiculo,
    periodo: datos.periodo,
    estado: inicial.estado,
    periodoFactura: inicial.periodoFactura,
    monto: inicial.monto,
    nota: inicial.nota,
    createdAt: ahora,
  });
  for (const r of viejos) await ctx.db.patch(r._id, { cargoId: id });
  await anotar(
    ctx,
    { _id: id, condominioId: datos.condominioId },
    {
      accion: viejos.length > 0 ? "agrupar" : "crear",
      estadoDespues: inicial.estado,
      periodoFactura: inicial.periodoFactura,
      monto: inicial.monto,
      nota:
        viejos.length > 0
          ? `Agrupa ${viejos.length} reporte(s) de ${datos.placa} en ${datos.periodo}` +
            (inicial.mezclado ? "; los reportes tenían estados distintos" : "")
          : undefined,
      origen,
    },
    actor,
  );
  return (await ctx.db.get(id))!;
}

/**
 * El cobro de un reporte de vehiculo, creandolo si hace falta.
 *
 * Un reporte viejo arrastra a los demas reportes viejos de su misma clave: se
 * crea (o se encuentra) el cobro y todos quedan enlazados. Asi, gestionar uno
 * gestiona el mes entero, venga de la pantalla que venga.
 */
export async function cobroDeReporte(
  ctx: MutationCtx,
  r: Reporte,
  actor: ActorCobro,
  origen: OrigenCobro,
): Promise<Cobro> {
  if (!r.vehiculoPlaca) throw new Error("Este reporte no señala un vehículo: no es un cobro de parqueadero.");
  if (r.cargoId) {
    const cobro = await ctx.db.get(r.cargoId);
    if (cobro) return cobro;
  }
  const { casa, periodo, clave } = await identidadDeReporte(ctx, r);
  const viejos = await reportesViejosDeClave(ctx, r, clave);
  const existente = await cobroPorClave(ctx, r.condominioId, clave);
  if (existente) {
    for (const v of viejos) await ctx.db.patch(v._id, { cargoId: existente._id });
    return existente;
  }
  return await crearCobro(
    ctx,
    {
      condominioId: r.condominioId,
      clave,
      casa,
      periodo,
      placa: r.vehiculoPlaca,
      vehiculoId: r.vehiculoId,
      tipoVehiculo: tipoDeDescripcion(r.vehiculoDescripcion),
    },
    viejos,
    actor,
    origen,
  );
}

/**
 * Un reporte nuevo de la ronda entra a su cobro del mes: el que ya existia
 * para esa casa, placa y mes, o uno nuevo. Si el cobro ya estaba facturado,
 * el reporte se suma como evidencia y NO genera otro cargo.
 */
export async function agregarReporteACobro(
  ctx: MutationCtx,
  reporteId: Id<"guardiaNovedadReportes">,
  datos: {
    condominioId: Id<"condominios">;
    casa: { unidadId: Id<"unidades">; numero: string } | null;
    periodo: string;
    placa: string;
    vehiculoId?: Id<"vehiculos">;
    tipoVehiculo?: string;
  },
  actor: ActorCobro,
): Promise<Id<"cobrosParqueadero">> {
  const clave = claveCobro({ unidadId: datos.casa?.unidadId, placa: datos.placa, periodo: datos.periodo });
  let cobro = await cobroPorClave(ctx, datos.condominioId, clave);
  if (!cobro) {
    const nuevo = (await ctx.db.get(reporteId))!;
    const viejos = (await reportesViejosDeClave(ctx, nuevo, clave)).filter((r) => r._id !== reporteId);
    cobro = await crearCobro(ctx, { ...datos, clave }, viejos, actor, "reporte");
  }
  await ctx.db.patch(reporteId, { cargoId: cobro._id });
  await anotar(
    ctx,
    cobro,
    {
      accion: "agregar_reporte",
      estadoAntes: cobro.estado,
      estadoDespues: cobro.estado,
      reporteId,
      origen: "reporte",
    },
    actor,
  );
  return cobro._id;
}

/**
 * Mueve el estado de un cobro. Lanza con el mensaje estable de
 * `transicionCobro` si la transicion no esta permitida.
 */
export async function aplicarAccionCobro(
  ctx: MutationCtx,
  cobro: Cobro,
  accion: AccionCobro,
  datos: { periodoFactura?: string; monto?: number; nota?: string; reporteId?: Id<"guardiaNovedadReportes"> },
  actor: ActorCobro,
  origen: OrigenCobro,
): Promise<EstadoCobro> {
  const t = transicionCobro(cobro.estado, accion, cobro.periodoFactura);
  if (!t.ok) throw new Error(t.mensaje);

  let parche: Partial<Cobro>;
  if (accion === "facturar") {
    const periodo = datos.periodoFactura?.trim() ?? "";
    if (!periodoValido(periodo)) throw new Error("El periodo debe tener la forma AAAA-MM.");
    if (datos.monto !== undefined && (!Number.isFinite(datos.monto) || datos.monto < 0)) {
      throw new Error("El valor del cobro no es válido.");
    }
    parche = { estado: "facturado", periodoFactura: periodo, monto: datos.monto, nota: undefined };
  } else if (accion === "descartar") {
    const nota = datos.nota?.trim() ?? "";
    /* Se exige el motivo: un cargo que desaparece sin explicacion es
     * exactamente lo que despues nadie sabe justificar en una asamblea. */
    if (!nota) throw new Error("Escribe por qué no se va a cobrar.");
    parche = { estado: "descartado", nota, periodoFactura: undefined, monto: undefined };
  } else {
    parche = { estado: "pendiente", periodoFactura: undefined, monto: undefined, nota: undefined };
  }

  await ctx.db.patch(cobro._id, {
    ...parche,
    actualizadoPorUserId: actor.userId,
    actualizadoPorNombre: actor.nombre,
    actualizadoEn: Date.now(),
  });
  await anotar(
    ctx,
    cobro,
    {
      accion,
      estadoAntes: cobro.estado,
      estadoDespues: t.hacia,
      periodoFacturaAntes: cobro.periodoFactura,
      periodoFactura: parche.periodoFactura,
      montoAntes: cobro.monto,
      monto: parche.monto,
      /* Al descartar, el motivo. Al devolver, el porque si lo dieron; el
       * motivo del descarte anterior sigue en su propio evento. */
      nota: accion === "descartar" ? parche.nota : datos.nota?.trim() || undefined,
      reporteId: datos.reporteId,
      origen,
    },
    actor,
  );
  return t.hacia;
}

/** La historia de un cobro, en orden. */
export async function historiaDeCobro(ctx: Ctx, cargoId: Id<"cobrosParqueadero">) {
  const eventos = await ctx.db
    .query("cobroParqueaderoEventos")
    .withIndex("by_cargo", (q) => q.eq("cargoId", cargoId))
    .collect();
  return eventos.sort((a, b) => a.at - b.at);
}
