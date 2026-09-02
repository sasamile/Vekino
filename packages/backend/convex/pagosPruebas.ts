import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Deshacer los pagos hechos contra la pasarela de PRUEBAS.
 *
 * Mientras dura la certificación con el banco, las transacciones salen contra
 * el ambiente QA de Aval: la plata no se mueve, pero el sistema no lo sabe.
 * Una transaccion aprobada en QA marca la factura como pagada igual que una
 * de verdad, y el residente ve su cuenta al dia sin haber pagado nada.
 *
 * Esto vive aparte de `pagos.ts` a proposito. Alli esta el camino normal del
 * dinero; aqui la excepcion temporal, para que se vea y se pueda borrar de un
 * solo golpe cuando la certificacion termine.
 *
 * Solo `internal`: no se llama desde la web ni desde la app, unicamente por
 * `npx convex run`. Nadie deberia poder despagar una factura desde un boton.
 */

/** Un pago de prueba nunca puede ser uno de produccion. */
function exigirQueSeaDePrueba(ambiente: string) {
  if (ambiente === "prod") {
    throw new Error(
      "Ese pago es de PRODUCCION: plata real. Esta herramienta no lo toca.",
    );
  }
}

/**
 * A que estado vuelve una factura a la que le quitamos el pago.
 *
 * No se puede recalcular desde la contabilidad —eso lo hace `facturas.ts`
 * mirando el saldo anterior del mes SIGUIENTE, y la factura recien pagada
 * suele ser la ultima de la cadena, sin mes siguiente del cual deducirlo—.
 * Asi que se reconstruye con lo unico que si sabemos con certeza: si ya paso
 * la fecha de vencimiento.
 */
function estadoSinPago(fechaVencimiento: number): "pendiente" | "vencida" {
  return fechaVencimiento < Date.now() ? "vencida" : "pendiente";
}

/**
 * ¿Queda algun pago REAL que justifique que la factura siga pagada?
 *
 * Sin esta comprobacion, borrar una prueba sobre una factura que ademas se
 * pago de verdad la devolveria a pendiente y le cobrariamos dos veces al
 * residente. Prefiero dejar una factura pagada de mas que cobrarla de mas.
 */
async function tienePagoReal(
  ctx: MutationCtx,
  facturaId: Id<"facturas">,
  exceptoPagoId: Id<"pagos">,
) {
  const pagos = await ctx.db
    .query("pagos")
    .withIndex("by_factura", (q) => q.eq("facturaId", facturaId))
    .collect();
  return pagos.some(
    (p) =>
      p._id !== exceptoPagoId && p.ambiente === "prod" && p.estado === "aprobada",
  );
}

/** Todo lo que se pago contra QA, con el contexto para decidir que borrar. */
export const listar = internalQuery({
  args: {},
  handler: async (ctx) => {
    const pagos = await ctx.db.query("pagos").collect();
    const dePrueba = pagos
      .filter((p) => p.ambiente !== "prod")
      .sort((a, b) => b.createdAt - a.createdAt);

    const filas = [];
    for (const p of dePrueba) {
      const factura = await ctx.db.get(p.facturaId);
      const unidad = await ctx.db.get(p.unidadId);
      const condominio = await ctx.db.get(p.condominioId);
      filas.push({
        pagoId: p._id,
        estadoPago: p.estado,
        monto: p.monto,
        medioPago: p.medioPago ?? null,
        pmtAuthId: p.pmtAuthId ?? null,
        creado: new Date(p.createdAt).toISOString(),
        condominio: condominio?.name ?? "—",
        unidad: unidad?.numero ?? factura?.apto ?? "—",
        residente: factura?.residenteNombre ?? "—",
        factura: factura?.numeroFactura ?? "—",
        estadoFactura: factura?.estado ?? "—",
        /* Lo unico que de verdad importa mirar: una factura pagada por una
         * transaccion de QA es plata que nadie recibio. */
        falsoPositivo: p.estado === "aprobada" && factura?.estado === "pagada",
      });
    }
    return filas;
  },
});

/**
 * Borra un pago de prueba y devuelve su factura al estado que tenia.
 *
 * Borra la fila en vez de marcarla anulada porque no es historia: es basura de
 * una prueba. Dejarla obliga a filtrarla en todos los reportes para siempre.
 */
export const revertir = internalMutation({
  args: { pagoId: v.id("pagos") },
  handler: async (ctx, args) => {
    const pago = await ctx.db.get(args.pagoId);
    if (!pago) throw new Error("Pago no encontrado.");
    exigirQueSeaDePrueba(pago.ambiente);

    const factura = await ctx.db.get(pago.facturaId);
    let facturaVolvioA: string | null = null;

    if (factura && factura.estado === "pagada") {
      if (await tienePagoReal(ctx, factura._id, pago._id)) {
        facturaVolvioA = "pagada (hay un pago real: no se toca)";
      } else {
        const estado = estadoSinPago(factura.fechaVencimiento);
        await ctx.db.patch(factura._id, { estado, updatedAt: Date.now() });
        facturaVolvioA = estado;
      }
    } else if (factura) {
      facturaVolvioA = `${factura.estado} (no estaba pagada)`;
    }

    await ctx.db.delete(args.pagoId);
    return {
      borrado: args.pagoId,
      factura: factura?.numeroFactura ?? null,
      facturaVolvioA,
    };
  },
});

/**
 * Lo mismo para todos de una vez: la limpieza del dia que se certifique.
 *
 * Pide `confirmar: "SI"` escrito a mano. Un borrado masivo no deberia poder
 * dispararse por una flecha arriba en la terminal.
 */
export const revertirTodos = internalMutation({
  args: { confirmar: v.string() },
  handler: async (ctx, args) => {
    if (args.confirmar !== "SI") {
      throw new Error('Para borrar todos los pagos de prueba pasa confirmar: "SI".');
    }
    const pagos = await ctx.db.query("pagos").collect();
    const resumen = { borrados: 0, facturasRevertidas: 0, respetadas: 0 };

    for (const pago of pagos) {
      if (pago.ambiente === "prod") continue;
      const factura = await ctx.db.get(pago.facturaId);
      if (factura && factura.estado === "pagada") {
        if (await tienePagoReal(ctx, factura._id, pago._id)) {
          resumen.respetadas++;
        } else {
          await ctx.db.patch(factura._id, {
            estado: estadoSinPago(factura.fechaVencimiento),
            updatedAt: Date.now(),
          });
          resumen.facturasRevertidas++;
        }
      }
      await ctx.db.delete(pago._id);
      resumen.borrados++;
    }
    return resumen;
  },
});
