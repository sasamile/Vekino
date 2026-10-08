import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { formatoPesos } from "../lib/cartera";
import {
  calcularCadena,
  igualVeredicto,
  type EstadoPagoCalculado,
  type PagoRegistrado,
  type VeredictoContable,
} from "../lib/estadoFactura";

/**
 * EL ÚNICO LUGAR QUE ESCRIBE `facturas.estado` (Fase 3 de la auditoría de
 * facturación).
 *
 * Toda ruta que cambia algo que mueve el estado —la carga de un PDF, un pago
 * de la pasarela, un comprobante aprobado, la confirmación de una lectura, el
 * re-procesamiento, la migración, el botón "Conciliar"— termina aquí:
 * `recalcularCadena` lee la cadena de la unidad, sus pagos y comprobantes
 * aprobados y sus discrepancias, calcula todo con `lib/estadoFactura.ts` y
 * escribe lo que cambió, con su evento en la bitácora (`facturaEventos`).
 */

export type OrigenEvento = Doc<"facturaEventos">["origen"];
type EstadoFactura = Doc<"facturas">["estado"];

/** Lo que la operación escribió en una factura: siempre deja su evento. */
export type Tocada = {
  detalle: string;
  datos?: unknown;
  /** La factura se acaba de crear: el evento no lleva estado anterior. */
  creada?: boolean;
  /** El estado antes de la operación, si la operación lo escribió (una creación). */
  estadoAntes?: EstadoFactura;
};

export type Contexto = {
  origen: OrigenEvento;
  /** Quién: el nombre de la persona, "Pasarela Aval", "Sistema" o el script. */
  actor?: string;
  actorUserId?: Id<"users">;
  tocadas?: Map<Id<"facturas">, Tocada>;
};

/** Lo que dice el veredicto, para la bitácora. */
const TEXTO_VEREDICTO: Record<VeredictoContable["estado"], string> = {
  pagada: "pagada",
  abonada: "abonada (pago parcial)",
  vencida: "vencida (sin pagar)",
  saldo_a_favor: "con saldo a favor",
  sin_veredicto: "sin veredicto",
};

const TEXTO_ESTADO: Record<EstadoFactura, string> = {
  pendiente: "pendiente",
  pagada: "pagada",
  vencida: "vencida",
  abonada: "abonada",
  saldo_a_favor: "saldo a favor",
};

/**
 * Los pagos que cuentan como evidencia en una unidad: los aprobados de la
 * pasarela (no los reversados) y los comprobantes aprobados con factura.
 */
export async function pagosRegistrados(
  ctx: QueryCtx,
  unidadId: Id<"unidades">,
): Promise<PagoRegistrado[]> {
  const [pagos, soportes] = await Promise.all([
    ctx.db
      .query("pagos")
      .withIndex("by_unidad", (q) => q.eq("unidadId", unidadId))
      .collect(),
    ctx.db
      .query("soportesPago")
      .withIndex("by_unidad", (q) => q.eq("unidadId", unidadId))
      .collect(),
  ]);
  return [
    ...pagos
      .filter((p) => p.estado === "aprobada")
      .map(
        (p): PagoRegistrado => ({
          id: p._id,
          facturaId: p.facturaId,
          origen: "pasarela",
          monto: p.monto,
          fecha: p.createdAt,
        }),
      ),
    ...soportes
      .filter((s) => s.estado === "aprobado" && s.facturaId)
      .map(
        (s): PagoRegistrado => ({
          id: s._id,
          facturaId: s.facturaId!,
          origen: "comprobante",
          monto: s.monto ?? 0,
          fecha: s.fechaPago ?? s.revisadoAt ?? s.createdAt,
          ...(s.montoAsumido || s.monto === undefined ? { asumido: true } : {}),
        }),
      ),
  ];
}

function igualEstadoPago(
  a: Doc<"facturas">["estadoPago"],
  b: EstadoPagoCalculado | null,
): boolean {
  if (!a || !b) return !a && !b;
  return (
    a.estado === b.estado &&
    a.montoPagado === b.montoPagado &&
    a.montoAdeudado === b.montoAdeudado &&
    a.conDescuento === b.conDescuento &&
    (a.excedente ?? null) === (b.excedente ?? null)
  );
}

function igualMarca(
  a: Doc<"facturas">["pagoEnVerificacion"],
  b: Doc<"facturas">["pagoEnVerificacion"],
): boolean {
  if (!a || !b) return !a && !b;
  return (
    a.monto === b.monto &&
    a.discrepancias.length === b.discrepancias.length &&
    a.discrepancias.every((id) => b.discrepancias.includes(id))
  );
}

async function registrarEvento(
  ctx: MutationCtx,
  f: Doc<"facturas">,
  evento: {
    origen: OrigenEvento;
    estadoAntes?: EstadoFactura;
    estadoDespues: EstadoFactura;
    detalle: string;
    datos?: unknown;
    actor?: string;
    actorUserId?: Id<"users">;
    at: number;
  },
) {
  await ctx.db.insert("facturaEventos", {
    facturaId: f._id,
    condominioId: f.condominioId,
    unidadId: f.unidadId,
    periodo: f.periodo,
    ...(evento.estadoAntes ? { estadoAntes: evento.estadoAntes } : {}),
    estadoDespues: evento.estadoDespues,
    origen: evento.origen,
    ...(evento.actor ? { actor: evento.actor } : {}),
    ...(evento.actorUserId ? { actorUserId: evento.actorUserId } : {}),
    detalle: evento.detalle,
    ...(evento.datos !== undefined ? { datos: evento.datos } : {}),
    at: evento.at,
  });
}

/** Deja en la bitácora un evento que no cambia el estado (p. ej. un rechazo informado). */
export async function anotarEvento(
  ctx: MutationCtx,
  f: Doc<"facturas">,
  contexto: Contexto,
  detalle: string,
  datos?: unknown,
) {
  await registrarEvento(ctx, f, {
    origen: contexto.origen,
    estadoAntes: f.estado,
    estadoDespues: f.estado,
    detalle,
    datos,
    actor: contexto.actor,
    actorUserId: contexto.actorUserId,
    at: Date.now(),
  });
}

/**
 * Recalcula y escribe TODA la cadena de una unidad: estado, evidencia,
 * veredicto, discrepancias y la marca de "pago en verificación" de la
 * vigente. Deja un evento por cada factura tocada por la operación y por cada
 * una cuyo estado o marca cambió.
 *
 * Devuelve cuántas facturas pasaron a cada estado de veredicto (para los
 * conteos que ya devolvían `bulkUpsert` y `reconciliar`).
 */
export async function recalcularCadena(
  ctx: MutationCtx,
  condominioId: Id<"condominios">,
  unidadId: Id<"unidades">,
  contexto: Contexto,
): Promise<{ pagadas: number; abonadas: number; vencidas: number }> {
  const cadena = (
    await ctx.db
      .query("facturas")
      .withIndex("by_unidad", (q) => q.eq("unidadId", unidadId))
      .collect()
  ).filter((f) => f.condominioId === condominioId);
  const ids = new Set<string>(cadena.map((f) => f._id));
  const pagos = (await pagosRegistrados(ctx, unidadId)).filter((p) => ids.has(p.facturaId));
  const guardadas = (
    await ctx.db
      .query("discrepanciasPago")
      .withIndex("by_unidad", (q) => q.eq("unidadId", unidadId))
      .collect()
  ).filter((d) => d.condominioId === condominioId);

  const r = calcularCadena({ cadena, pagos, discrepancias: guardadas });
  const ahora = Date.now();
  const porId = new Map(cadena.map((f) => [f._id as string, f]));
  const actor = { actor: contexto.actor, actorUserId: contexto.actorUserId };

  // 1. Discrepancias
  const refAId = new Map<string, Id<"discrepanciasPago">>(guardadas.map((d) => [d._id, d._id]));
  for (const op of r.discrepancias) {
    if (op.tipo === "crear") {
      const anterior = porId.get(op.facturaId)!;
      const id = await ctx.db.insert("discrepanciasPago", {
        condominioId,
        unidadId,
        facturaId: op.facturaId as Id<"facturas">,
        facturaSiguienteId: op.facturaSiguienteId as Id<"facturas">,
        periodo: op.periodo,
        periodoSiguiente: op.periodoSiguiente,
        ...op.calculo,
        ...separarPagos(ctx, op.pagoIds),
        estado: "abierta",
        createdAt: ahora,
        updatedAt: ahora,
      });
      refAId.set(op.ref, id);
      await registrarEvento(ctx, anterior, {
        origen: "discrepancia",
        estadoAntes: anterior.estado,
        estadoDespues: r.facturas.get(anterior._id)!.estado,
        detalle: `Discrepancia: Vekino registró ${formatoPesos(op.calculo.montoPagado)} pagados, pero la factura de ${op.periodoSiguiente} arrastra ${formatoPesos(op.calculo.saldoAnteriorSiguiente)} de saldo anterior. Quedan ${formatoPesos(op.calculo.montoNoAplicado)} en verificación.`,
        datos: { discrepanciaId: id, ...op.calculo },
        ...actor,
        at: ahora,
      });
    } else if (op.tipo === "actualizar" || op.tipo === "reabrir") {
      const d = guardadas.find((g) => g._id === op.id)!;
      await ctx.db.patch(d._id, {
        ...op.calculo,
        ...separarPagos(ctx, op.pagoIds),
        ...(op.tipo === "reabrir" ? { estado: "abierta" as const, resolucion: undefined } : {}),
        updatedAt: ahora,
      });
      const anterior = porId.get(d.facturaId);
      if (anterior) {
        await registrarEvento(ctx, anterior, {
          origen: "discrepancia",
          estadoAntes: anterior.estado,
          estadoDespues: r.facturas.get(anterior._id)!.estado,
          detalle:
            op.tipo === "reabrir"
              ? `Discrepancia reabierta: la factura de ${d.periodoSiguiente} vuelve a no reflejar ${formatoPesos(op.calculo.montoNoAplicado)} pagados.`
              : `Discrepancia actualizada: ${formatoPesos(op.calculo.montoNoAplicado)} en verificación.`,
          datos: { discrepanciaId: d._id, ...op.calculo },
          ...actor,
          at: ahora,
        });
      }
    } else {
      const d = guardadas.find((g) => g._id === op.id)!;
      await ctx.db.patch(d._id, {
        estado: "resuelta",
        resolucion: {
          tipo: op.resolucion,
          ...(op.facturaId ? { facturaId: op.facturaId as Id<"facturas"> } : {}),
          at: ahora,
        },
        updatedAt: ahora,
      });
      const anterior = porId.get(d.facturaId);
      if (anterior) {
        const porQue = {
          documento_corregido: `la factura de ${d.periodoSiguiente} ya refleja el pago`,
          aplicado_en_documento_posterior: "un documento posterior muestra el pago aplicado",
          pago_reversado: "el pago ya no está registrado (reversado)",
        }[op.resolucion];
        await registrarEvento(ctx, anterior, {
          origen: "discrepancia",
          estadoAntes: anterior.estado,
          estadoDespues: r.facturas.get(anterior._id)!.estado,
          detalle: `Discrepancia resuelta: ${porQue}.`,
          datos: { discrepanciaId: d._id, resolucion: op.resolucion },
          ...actor,
          at: ahora,
        });
      }
    }
  }

  // 2. Facturas
  const conteo = { pagadas: 0, abonadas: 0, vencidas: 0 };
  for (const f of cadena) {
    const res = r.facturas.get(f._id)!;
    const parche: Partial<Doc<"facturas">> = {};
    if (res.estado !== f.estado) parche.estado = res.estado;
    if (!igualEstadoPago(f.estadoPago, res.estadoPago)) {
      parche.estadoPago = res.estadoPago ? { ...res.estadoPago, actualizadoAt: ahora } : undefined;
    }
    if (!igualVeredicto(f.veredictoContable, res.veredicto)) {
      parche.veredictoContable = res.veredicto
        ? {
            ...res.veredicto,
            facturaSiguienteId: res.veredicto.facturaSiguienteId as Id<"facturas"> | undefined,
            at: ahora,
          }
        : undefined;
    }
    const marca = res.pagoEnVerificacion
      ? {
          monto: res.pagoEnVerificacion.monto,
          discrepancias: res.pagoEnVerificacion.refs
            .map((ref) => refAId.get(ref))
            .filter((id): id is Id<"discrepanciasPago"> => !!id),
        }
      : undefined;
    const cambiaMarca = !igualMarca(f.pagoEnVerificacion, marca);
    if (cambiaMarca) parche.pagoEnVerificacion = marca;

    if (Object.keys(parche).length > 0) {
      await ctx.db.patch(f._id, { ...parche, updatedAt: ahora });
    }

    if (res.causa === "veredicto" && parche.estado) {
      if (res.estado === "pagada") conteo.pagadas++;
      else if (res.estado === "abonada") conteo.abonadas++;
      else if (res.estado === "vencida") conteo.vencidas++;
    }

    const tocada = contexto.tocadas?.get(f._id);
    if (tocada) {
      const cambio =
        tocada.creada || (tocada.estadoAntes ?? f.estado) === res.estado
          ? ""
          : ` Pasó de ${TEXTO_ESTADO[tocada.estadoAntes ?? f.estado]} a ${TEXTO_ESTADO[res.estado]}.`;
      await registrarEvento(ctx, f, {
        origen: contexto.origen,
        ...(tocada.creada ? {} : { estadoAntes: tocada.estadoAntes ?? f.estado }),
        estadoDespues: res.estado,
        detalle: `${tocada.detalle}${cambio}`,
        datos: {
          ...(tocada.datos && typeof tocada.datos === "object" ? (tocada.datos as object) : {}),
          ...(res.estadoPago ? { estadoPago: res.estadoPago } : {}),
          ...(res.veredicto ? { veredicto: res.veredicto } : {}),
        },
        ...actor,
        at: ahora,
      });
    } else if (parche.estado) {
      const v = res.veredicto;
      const detalle =
        res.causa === "veredicto" && v
          ? v.motivo === "heredado"
            ? `Se conserva el estado que traía de antes (${TEXTO_VEREDICTO[v.estado]}).`
            : `La factura siguiente dice que quedó ${TEXTO_VEREDICTO[v.estado]}${
                v.saldoAnteriorSiguiente !== undefined
                  ? ` (saldo anterior ${formatoPesos(v.saldoAnteriorSiguiente)})`
                  : ""
              }.`
          : res.causa === "evidencia"
            ? res.estadoPago
              ? `Los pagos registrados la dejan ${TEXTO_ESTADO[res.estado]}.`
              : "Ya no tiene pagos registrados."
            : `El documento la deja ${TEXTO_ESTADO[res.estado]}.`;
      await registrarEvento(ctx, f, {
        origen: res.causa === "veredicto" ? "conciliacion" : contexto.origen,
        estadoAntes: f.estado,
        estadoDespues: res.estado,
        detalle,
        datos: {
          causa: res.causa,
          disparador: contexto.origen,
          ...(v ? { veredicto: v } : {}),
          ...(res.estadoPago ? { estadoPago: res.estadoPago } : {}),
        },
        ...actor,
        at: ahora,
      });
    }

    if (cambiaMarca && !tocada) {
      await registrarEvento(ctx, f, {
        origen: "discrepancia",
        estadoAntes: f.estado,
        estadoDespues: res.estado,
        detalle: marca
          ? `Pago en verificación: ${formatoPesos(marca.monto)} pagados que la contabilidad aún no refleja. No se cobra en línea mientras tanto.`
          : "Ya no hay pagos en verificación: se puede pagar.",
        datos: { pagoEnVerificacion: marca ?? null },
        ...actor,
        at: ahora,
      });
    }
  }

  return conteo;
}

/**
 * Los ids de los pagos de una discrepancia vienen mezclados (pasarela y
 * comprobantes): cada uno va a su lista.
 */
function separarPagos(ctx: QueryCtx, ids: readonly string[]) {
  const pagoIds: Id<"pagos">[] = [];
  const soporteIds: Id<"soportesPago">[] = [];
  for (const id of ids) {
    const pago = ctx.db.normalizeId("pagos", id);
    if (pago) {
      pagoIds.push(pago);
      continue;
    }
    const soporte = ctx.db.normalizeId("soportesPago", id);
    if (soporte) soporteIds.push(soporte);
  }
  return { pagoIds, soporteIds };
}

/** Recalcula cada unidad tocada, una vez. */
export async function recalcularUnidades(
  ctx: MutationCtx,
  unidades: ReadonlyMap<Id<"unidades">, Id<"condominios">>,
  contexto: Contexto,
) {
  const total = { pagadas: 0, abonadas: 0, vencidas: 0 };
  for (const [unidadId, condominioId] of unidades) {
    const c = await recalcularCadena(ctx, condominioId, unidadId, contexto);
    total.pagadas += c.pagadas;
    total.abonadas += c.abonadas;
    total.vencidas += c.vencidas;
  }
  return total;
}
