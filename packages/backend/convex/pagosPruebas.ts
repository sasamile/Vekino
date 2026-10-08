import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ambienteAval } from "./lib/avalProduccion";
import { formatoPesos } from "./lib/cartera";
import { recalcularCadena, type Tocada } from "./model/estadoFactura";

/**
 * Deshacer los pagos hechos contra la pasarela de PRUEBAS.
 *
 * Mientras dura la certificación con el banco, las transacciones salen contra
 * el ambiente QA de Aval: la plata no se mueve, pero el sistema no lo sabe.
 * Una transaccion aprobada en QA cuenta como pago igual que una de verdad, y
 * el residente ve su cuenta al dia sin haber pagado nada.
 *
 * Esto vive aparte de `pagos.ts` a proposito. Alli esta el camino normal del
 * dinero; aqui la excepcion temporal, para que se vea y se pueda borrar de un
 * solo golpe cuando la certificacion termine.
 *
 * Solo `internal`: no se llama desde la web ni desde la app, unicamente por
 * `npx convex run`. Nadie deberia poder despagar una factura desde un boton.
 *
 * ── Fase 3 (F-21) ────────────────────────────────────────────────────────
 *   · Solo toca pagos MARCADOS como de prueba (`esPrueba`), que la pasarela
 *     marca al crearlos cuando `AVAL_AMBIENTE` es "qa". Antes bastaba con
 *     que el pago no dijera "prod", y sin la variable todos decían "qa": en
 *     un deployment de produccion mal configurado, `revertirTodos` habria
 *     borrado pagos reales. Uno viejo, sin marca, se marca a mano y uno por
 *     uno (`marcarDePrueba`).
 *   · Se niega a correr en un deployment de produccion (o sin
 *     `AVAL_AMBIENTE`).
 *   · El estado de la factura no se reescribe aqui: se borra el pago y la
 *     cadena se vuelve a calcular (`recalcularCadena`), con su bitacora. Si
 *     hay otro pago o comprobante, sigue contando.
 */

/** Esta herramienta no corre donde los pagos son reales. */
function exigirAmbienteDePruebas() {
  if (ambienteAval(process.env) === "prod") {
    throw new Error(
      "Este deployment cobra en PRODUCCION (AVAL_AMBIENTE=prod): aqui no se borran pagos.",
    );
  }
}

/** Un pago de prueba nunca puede ser uno de produccion, y tiene que estar marcado. */
function exigirQueSeaDePrueba(pago: Doc<"pagos">) {
  if (pago.ambiente === "prod") {
    throw new Error(
      "Ese pago es de PRODUCCION: plata real. Esta herramienta no lo toca.",
    );
  }
  if (!pago.esPrueba) {
    throw new Error(
      "Ese pago no esta marcado como de prueba. Si lo es, marcalo primero con pagosPruebas:marcarDePrueba.",
    );
  }
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
        marcadoDePrueba: p.esPrueba === true,
        monto: p.monto,
        medioPago: p.medioPago ?? null,
        pmtAuthId: p.pmtAuthId ?? null,
        creado: new Date(p.createdAt).toISOString(),
        condominio: condominio?.name ?? "—",
        unidad: unidad?.numero ?? factura?.apto ?? "—",
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
 * Marca como de prueba un pago viejo (de antes de que la pasarela los
 * marcara). Uno por uno y a proposito: es la puerta para poder borrarlo.
 */
export const marcarDePrueba = internalMutation({
  args: { pagoId: v.id("pagos") },
  handler: async (ctx, args) => {
    exigirAmbienteDePruebas();
    const pago = await ctx.db.get(args.pagoId);
    if (!pago) throw new Error("Pago no encontrado.");
    if (pago.ambiente !== "qa") {
      throw new Error(`Solo se marca un pago hecho contra QA (este dice "${pago.ambiente}").`);
    }
    await ctx.db.patch(args.pagoId, { esPrueba: true, updatedAt: Date.now() });
    return { marcado: args.pagoId };
  },
});

function tocadaPorBorrado(pago: Doc<"pagos">): Tocada {
  return {
    detalle: `Se borró un pago de PRUEBA (pasarela QA) de ${formatoPesos(pago.monto)}.`,
    datos: { pagoId: pago._id, monto: pago.monto, estadoPago: pago.estado },
  };
}

/**
 * Borra un pago de prueba y vuelve a calcular su factura.
 *
 * Borra la fila en vez de marcarla anulada porque no es historia: es basura de
 * una prueba. Dejarla obliga a filtrarla en todos los reportes para siempre.
 * Lo que si queda es el evento en la bitacora de la factura.
 */
export const revertir = internalMutation({
  args: { pagoId: v.id("pagos") },
  handler: async (ctx, args) => {
    exigirAmbienteDePruebas();
    const pago = await ctx.db.get(args.pagoId);
    if (!pago) throw new Error("Pago no encontrado.");
    exigirQueSeaDePrueba(pago);

    const factura = await ctx.db.get(pago.facturaId);
    const antes = factura?.estado ?? null;
    await ctx.db.delete(args.pagoId);
    if (factura) {
      await recalcularCadena(ctx, factura.condominioId, factura.unidadId, {
        origen: "pago",
        actor: "pagosPruebas.revertir",
        tocadas: new Map([[factura._id, tocadaPorBorrado(pago)]]),
      });
    }
    const despues = factura ? (await ctx.db.get(factura._id))?.estado ?? null : null;
    return {
      borrado: args.pagoId,
      factura: factura?.numeroFactura ?? null,
      facturaAntes: antes,
      facturaDespues: despues,
    };
  },
});

/**
 * Lo mismo para todos los marcados de una vez: la limpieza del dia que se
 * certifique.
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
    exigirAmbienteDePruebas();
    const pagos = await ctx.db.query("pagos").collect();
    const resumen = { borrados: 0, sinMarca: 0, facturasCambiadas: 0 };
    const porUnidad = new Map<
      Id<"unidades">,
      { condominioId: Id<"condominios">; tocadas: Map<Id<"facturas">, Tocada>; antes: Map<Id<"facturas">, string> }
    >();

    for (const pago of pagos) {
      if (pago.ambiente === "prod") continue;
      if (!pago.esPrueba) {
        resumen.sinMarca++;
        continue;
      }
      const factura = await ctx.db.get(pago.facturaId);
      await ctx.db.delete(pago._id);
      resumen.borrados++;
      if (!factura) continue;
      const u = porUnidad.get(factura.unidadId) ?? {
        condominioId: factura.condominioId,
        tocadas: new Map(),
        antes: new Map(),
      };
      u.tocadas.set(factura._id, tocadaPorBorrado(pago));
      if (!u.antes.has(factura._id)) u.antes.set(factura._id, factura.estado);
      porUnidad.set(factura.unidadId, u);
    }

    for (const [unidadId, u] of porUnidad) {
      await recalcularCadena(ctx, u.condominioId, unidadId, {
        origen: "pago",
        actor: "pagosPruebas.revertirTodos",
        tocadas: u.tocadas,
      });
      for (const [facturaId, antes] of u.antes) {
        if ((await ctx.db.get(facturaId))?.estado !== antes) resumen.facturasCambiadas++;
      }
    }
    return resumen;
  },
});
