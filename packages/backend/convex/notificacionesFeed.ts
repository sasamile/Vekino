import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  getCurrentAppUser,
  requireAppUser,
  getMembership,
  misUnidadIds,
} from "./model/authz";

/**
 * Bandeja de novedades del residente.
 *
 * El feed se DERIVA de lo que ya existe (facturas, comunicados, documentos,
 * visitantes, asambleas) en vez de escribirse en una tabla aparte. Así no hay
 * que instrumentar cada mutation y la bandeja funciona con el histórico que ya
 * está cargado. El costo es leer varias tablas por consulta, acotado con
 * `take` por fuente y una ventana de tiempo.
 *
 * Lo "no leído" se calcula contra `users.notificacionesVistasAt`.
 */

/** Cuánto historial mira la bandeja. */
const VENTANA_DIAS = 45;
/** Máximo por fuente antes de mezclar (evita que una fuente ahogue al resto). */
const POR_FUENTE = 15;
/** Máximo que devuelve la bandeja ya mezclada. */
const TOTAL = 40;

type Item = {
  id: string;
  tipo: "factura" | "comunicado" | "documento" | "visitante" | "asamblea";
  titulo: string;
  detalle: string | null;
  createdAt: number;
  /** Ruta de la app a la que lleva el toque. */
  ruta: string;
};

export const feed = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) return { items: [], sinLeer: 0, vistasAt: 0 };

    const membership = await getMembership(ctx, user._id, args.condominioId);
    if (!membership || !membership.isActive) {
      return { items: [], sinLeer: 0, vistasAt: 0 };
    }

    const desde = Date.now() - VENTANA_DIAS * 24 * 60 * 60 * 1000;
    const unidadIds = await misUnidadIds(ctx, user._id, args.condominioId);
    const items: Item[] = [];

    // ── Facturas de SUS unidades ────────────────────────────────
    if (unidadIds.size > 0) {
      const facturas = await ctx.db
        .query("facturas")
        .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
        .order("desc")
        .take(120);
      for (const f of facturas) {
        if (!unidadIds.has(f.unidadId) || f.createdAt < desde) continue;
        if (items.filter((i) => i.tipo === "factura").length >= POR_FUENTE) break;
        items.push({
          id: f._id,
          tipo: "factura",
          titulo: `Factura de ${f.periodoLabel}`,
          detalle:
            f.estado === "pagada"
              ? "Pagada"
              : `Por pagar · ${formatoCOP(f.totalAPagar)}`,
          createdAt: f.createdAt,
          ruta: "/(app)/(tabs)/facturas",
        });
      }
    }

    // ── Comunicados del condominio ──────────────────────────────
    const comunicados = await ctx.db
      .query("comunicados")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .take(POR_FUENTE);
    for (const c of comunicados) {
      if (c.createdAt < desde) continue;
      items.push({
        id: c._id,
        tipo: "comunicado",
        titulo: c.titulo,
        detalle: c.prioridad === "normal" ? "Nuevo aviso" : etiquetaPrioridad(c.prioridad),
        createdAt: c.createdAt,
        ruta: "/(app)/(tabs)/comunicados",
      });
    }

    // ── Documentos publicados ───────────────────────────────────
    const documentos = await ctx.db
      .query("documentos")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .take(POR_FUENTE);
    for (const d of documentos) {
      if (d.createdAt < desde) continue;
      items.push({
        id: d._id,
        tipo: "documento",
        titulo: d.nombre,
        detalle: "Documento nuevo",
        createdAt: d.createdAt,
        ruta: "/(app)/documentos",
      });
    }

    // ── Visitantes autorizados para SUS unidades ────────────────
    if (unidadIds.size > 0) {
      const visitantes = await ctx.db
        .query("visitantes")
        .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
        .order("desc")
        .take(120);
      for (const vis of visitantes) {
        if (!unidadIds.has(vis.unidadId) || vis.createdAt < desde) continue;
        if (items.filter((i) => i.tipo === "visitante").length >= POR_FUENTE) break;
        items.push({
          id: vis._id,
          tipo: "visitante",
          titulo: vis.nombre,
          detalle:
            vis.fechaIngreso != null
              ? "Ingresó al conjunto"
              : "Visitante autorizado",
          createdAt: vis.fechaIngreso ?? vis.createdAt,
          ruta: "/(app)/visitantes",
        });
      }
    }

    // ── Asambleas convocadas ────────────────────────────────────
    const asambleas = await ctx.db
      .query("asambleas")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .take(POR_FUENTE);
    for (const a of asambleas) {
      if (a.createdAt < desde) continue;
      items.push({
        id: a._id,
        tipo: "asamblea",
        titulo: a.titulo,
        detalle: `Asamblea · ${a.fecha}`,
        createdAt: a.createdAt,
        ruta: "/(app)/asambleas",
      });
    }

    items.sort((a, b) => b.createdAt - a.createdAt);
    const recortado = items.slice(0, TOTAL);
    const vistasAt = user.notificacionesVistasAt ?? 0;

    return {
      items: recortado,
      sinLeer: recortado.filter((i) => i.createdAt > vistasAt).length,
      vistasAt,
    };
  },
});

/** Marca la bandeja como vista (apaga el punto de la campana). */
export const marcarVistas = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAppUser(ctx);
    await ctx.db.patch(user._id, { notificacionesVistasAt: Date.now() });
  },
});

function etiquetaPrioridad(p: string): string {
  return p === "urgente" ? "Urgente" : "Importante";
}

function formatoCOP(valor: number): string {
  // Sin Intl: el runtime de Convex no garantiza los locales completos.
  const entero = Math.round(valor).toString();
  const conPuntos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `$ ${conPuntos}`;
}
