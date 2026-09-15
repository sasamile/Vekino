import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  esValorIncidenteValido,
  liquidarDeposito,
  montosDeDepositoResuelto,
  type Liquidacion,
} from "../lib/depositoReserva";

/**
 * Incidentes y liquidación del depósito de una reserva.
 *
 * Portería (`guardia.ts`) y oficina (`reservas.ts`) tienen cada una su
 * endpoint —con sus roles y sus efectos: portería valida la salida y escribe
 * en la minuta, oficina no—, pero la regla de dinero es UNA y vive aquí. Si
 * cada archivo validara por su cuenta, tarde o temprano uno dejaría devolver
 * lo que el otro no.
 *
 * La concurrencia la cubre Convex: cada mutación es una transacción
 * serializable. La devolución lee el depósito y el rango `by_reserva` de los
 * incidentes; si otra mutación toca cualquiera de los dos a la vez, una se
 * reintenta y vuelve a validar contra el estado nuevo. Por eso dos personas
 * no pueden devolver el mismo depósito, ni valorar un incidente mientras se
 * liquida.
 */

type Ctx = QueryCtx | MutationCtx;

export const MAX_FOTOS_INCIDENTE = 6;

export type FotoIncidente = { url: string; nombre?: string };

export async function depositoDeReserva(ctx: Ctx, reservaId: Id<"reservas">) {
  return await ctx.db
    .query("guardiaReservaDepositos")
    .withIndex("by_reserva", (q) => q.eq("reservaId", reservaId))
    .first();
}

export async function incidentesDeReserva(ctx: Ctx, reservaId: Id<"reservas">) {
  return await ctx.db
    .query("reservaIncidentes")
    .withIndex("by_reserva", (q) => q.eq("reservaId", reservaId))
    .collect();
}

/**
 * Lanza si el depósito de la reserva ya se liquidó.
 *
 * Una vez entregado el dinero, los incidentes son el respaldo de esa
 * entrega: crear, valorar o descartar después cambiaría la explicación de un
 * pago que ya ocurrió.
 */
export async function exigirIncidentesAbiertos(ctx: Ctx, reservaId: Id<"reservas">) {
  const dep = await depositoDeReserva(ctx, reservaId);
  if (dep && dep.estado !== "registrado") {
    throw new Error(
      "El depósito de esta reserva ya fue liquidado: sus incidentes no se pueden modificar.",
    );
  }
}

function limpiarFotos(fotos: FotoIncidente[] | undefined): FotoIncidente[] | undefined {
  const limpias = (fotos ?? [])
    .map((f) => ({ url: f.url.trim(), nombre: f.nombre?.trim() || undefined }))
    .filter((f) => f.url.length > 0);
  if (limpias.length > MAX_FOTOS_INCIDENTE) {
    throw new Error(`Máximo ${MAX_FOTOS_INCIDENTE} fotos por incidente.`);
  }
  return limpias.length > 0 ? limpias : undefined;
}

/**
 * Crea un incidente.
 *
 * `valor` solo llega desde oficina: el endpoint de portería no lo declara en
 * sus argumentos, así que un guarda no tiene cómo mandarlo. Con valor, quien
 * lo registra es también quien lo valoró.
 */
export async function crearIncidente(
  ctx: MutationCtx,
  args: {
    reserva: Doc<"reservas">;
    user: Doc<"users">;
    origen: "porteria" | "administracion";
    descripcion: string;
    fotos?: FotoIncidente[];
    valor?: number;
  },
): Promise<Id<"reservaIncidentes">> {
  const { reserva, user } = args;
  if (reserva.estado !== "aprobada") {
    throw new Error("Solo se registran incidentes en reservas aprobadas.");
  }
  const descripcion = args.descripcion.trim();
  if (!descripcion) throw new Error("Describe el incidente.");
  if (args.valor !== undefined && !esValorIncidenteValido(args.valor)) {
    throw new Error("El valor del incidente debe ser mayor a 0.");
  }
  await exigirIncidentesAbiertos(ctx, reserva._id);

  const ahora = Date.now();
  const valorado = args.valor !== undefined;
  const id = await ctx.db.insert("reservaIncidentes", {
    condominioId: reserva.condominioId,
    reservaId: reserva._id,
    descripcion,
    fotos: limpiarFotos(args.fotos),
    estado: valorado ? "valorado" : "pendiente",
    valor: args.valor,
    origen: args.origen,
    reportadoPorUserId: user._id,
    reportadoPorNombre: user.name,
    ...(valorado
      ? { revisadoPorUserId: user._id, revisadoPorNombre: user.name, revisadoEn: ahora }
      : {}),
    createdAt: ahora,
    updatedAt: ahora,
  });
  await ctx.db.patch(reserva._id, { updatedAt: ahora });
  return id;
}

/** La administración decide: le pone valor o lo descarta. */
export async function revisarIncidente(
  ctx: MutationCtx,
  args: {
    incidente: Doc<"reservaIncidentes">;
    user: Doc<"users">;
    decision: { tipo: "valorar"; valor: number } | { tipo: "descartar" };
    nota?: string;
  },
) {
  const { incidente, user, decision } = args;
  if (decision.tipo === "valorar" && !esValorIncidenteValido(decision.valor)) {
    throw new Error("El valor del incidente debe ser mayor a 0.");
  }
  await exigirIncidentesAbiertos(ctx, incidente.reservaId);

  const ahora = Date.now();
  await ctx.db.patch(incidente._id, {
    estado: decision.tipo === "valorar" ? "valorado" : "descartado",
    /* Descartar borra el valor: un descartado con cifra se lee como si
     * contara. */
    valor: decision.tipo === "valorar" ? decision.valor : undefined,
    revisadoPorUserId: user._id,
    revisadoPorNombre: user.name,
    revisadoEn: ahora,
    notaRevision: args.nota?.trim() || undefined,
    updatedAt: ahora,
  });
  await ctx.db.patch(incidente.reservaId, { updatedAt: ahora });
}

/**
 * Liquida el depósito y registra la devolución.
 *
 * El monto lo decide el servidor con los incidentes que hay AHORA; el cliente
 * no manda cuánto devolver. Manda `saldoEsperado`, lo que tenía en pantalla,
 * y si no coincide se rechaza: alguien valoró algo mientras tanto y quien
 * entrega el dinero tiene que verlo antes.
 *
 * Compatibilidad con las apps instaladas antes de este cambio:
 * - `devuelto: false` (la retención a criterio) se rechaza siempre. Mantenerla
 *   sería justo la puerta que este flujo cierra.
 * - Sin `saldoEsperado` solo se acepta la devolución completa sin incidentes:
 *   es lo único que una pantalla vieja puede estar mostrando bien. Si hay
 *   incidentes, esa pantalla diría "Devuelto" mientras se entrega menos.
 */
export async function liquidarYDevolver(
  ctx: MutationCtx,
  args: {
    deposito: Doc<"guardiaReservaDepositos">;
    user: Doc<"users">;
    devuelto?: boolean;
    razon?: string;
    saldoEsperado?: number;
    fotoUrl?: string;
    fotoStorageId?: Id<"_storage">;
  },
): Promise<Liquidacion> {
  const { deposito: dep, user } = args;
  if (args.devuelto === false) {
    throw new Error(
      "Ya no se puede retener el depósito a criterio. Registra un incidente: la administración lo valora y el descuento se calcula solo.",
    );
  }
  if (dep.estado !== "registrado") throw new Error("El depósito ya fue resuelto.");

  const incidentes = await incidentesDeReserva(ctx, dep.reservaId);
  const liq = liquidarDeposito(dep.monto, incidentes);

  if (!liq.puedeLiquidar) {
    throw new Error(
      liq.pendientes === 1
        ? "Hay un incidente pendiente de valoración: la administración debe valorarlo o descartarlo antes de devolver el depósito."
        : `Hay ${liq.pendientes} incidentes pendientes de valoración: la administración debe valorarlos o descartarlos antes de devolver el depósito.`,
    );
  }
  if (args.saldoEsperado === undefined) {
    if (liq.razonObligatoria) {
      throw new Error(
        "Esta reserva tiene incidentes. Actualiza la aplicación para ver el descuento antes de devolver el depósito.",
      );
    }
  } else if (args.saldoEsperado !== liq.saldoDevolucion) {
    throw new Error(
      "El saldo a devolver cambió mientras tenías la pantalla abierta. Revisa los incidentes y vuelve a intentarlo.",
    );
  }
  const razon = args.razon?.trim();
  if (liq.razonObligatoria && !razon) {
    throw new Error("Hubo incidentes en esta reserva: indica la razón de la devolución.");
  }

  const ahora = Date.now();
  await ctx.db.patch(dep._id, {
    estado: liq.estadoResultante,
    observacionesSalida: razon || undefined,
    fotoSalidaStorageId: args.fotoStorageId,
    fotoSalidaUrl: args.fotoUrl,
    resueltoPorNombre: user.name,
    resueltoPorUserId: user._id,
    fechaResolucion: ahora,
    totalIncidentes: liq.totalIncidentes,
    montoDescontado: liq.totalDescuento,
    montoDevuelto: liq.saldoDevolucion,
  });
  await ctx.db.patch(dep.reservaId, { updatedAt: ahora });
  return liq;
}

/**
 * Lo que las pantallas necesitan del depósito y sus incidentes, ya calculado.
 *
 * Web y móvil pintan estas cifras; no las recalculan.
 */
export async function cajaDeposito(
  ctx: Ctx,
  reservaId: Id<"reservas">,
  dep: Doc<"guardiaReservaDepositos"> | null,
) {
  const incidentes = await incidentesDeReserva(ctx, reservaId);
  const abierto = !dep || dep.estado === "registrado";
  return {
    incidentes: incidentes
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((i) => ({
        _id: i._id,
        descripcion: i.descripcion,
        fotos: i.fotos ?? [],
        estado: i.estado,
        valor: i.valor ?? null,
        origen: i.origen,
        reportadoPorNombre: i.reportadoPorNombre,
        revisadoPorNombre: i.revisadoPorNombre ?? null,
        revisadoEn: i.revisadoEn ?? null,
        notaRevision: i.notaRevision ?? null,
        createdAt: i.createdAt,
      })),
    /** Se pueden crear, valorar o descartar incidentes. */
    incidentesAbiertos: abierto,
    /** Solo mientras el depósito está en custodia: lo que se devolvería hoy. */
    liquidacion: dep && dep.estado === "registrado" ? liquidarDeposito(dep.monto, incidentes) : null,
    /** Solo si ya se resolvió: lo que se devolvió y descontó de verdad. */
    liquidado: dep ? montosDeDepositoResuelto(dep) : null,
  };
}
