import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireCondominioRole } from "./model/authz";

/**
 * Historial: línea de tiempo unificada de actividad del condominio.
 * Agrega eventos recientes de varios módulos (comunicados, novedades, reservas,
 * PQRS, asambleas, documentos, sesiones de consejo) en un solo feed ordenado.
 *
 * Es de solo lectura: no existe una tabla `historial`, se compone en la query.
 */

type Evento = {
  id: string;
  modulo:
    | "comunicado"
    | "novedad"
    | "reserva"
    | "pqrs"
    | "asamblea"
    | "documento"
    | "consejo";
  titulo: string;
  detalle: string;
  autor: string | null;
  ts: number;
};

export const feed = query({
  args: {
    condominioId: v.id("condominios"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, []);
    const cid = args.condominioId;
    const take = args.limit ?? 60;

    const [comunicados, novedades, reservas, pqrs, asambleas, documentos, sesiones] =
      await Promise.all([
        ctx.db.query("comunicados").withIndex("by_condominio", (q) => q.eq("condominioId", cid)).order("desc").take(take),
        ctx.db.query("novedades").withIndex("by_condominio", (q) => q.eq("condominioId", cid)).order("desc").take(take),
        ctx.db.query("reservas").withIndex("by_condominio", (q) => q.eq("condominioId", cid)).order("desc").take(take),
        ctx.db.query("pqrs").withIndex("by_condominio", (q) => q.eq("condominioId", cid)).order("desc").take(take),
        ctx.db.query("asambleas").withIndex("by_condominio", (q) => q.eq("condominioId", cid)).order("desc").take(take),
        ctx.db.query("documentos").withIndex("by_condominio", (q) => q.eq("condominioId", cid)).order("desc").take(take),
        ctx.db.query("consejoSesiones").withIndex("by_condominio", (q) => q.eq("condominioId", cid)).order("desc").take(take),
      ]);

    const eventos: Evento[] = [];

    for (const c of comunicados) {
      eventos.push({
        id: c._id,
        modulo: "comunicado",
        titulo: c.titulo,
        detalle: c.prioridad === "normal" ? "Comunicado publicado" : `Comunicado ${c.prioridad}`,
        autor: c.autorNombre,
        ts: c.createdAt,
      });
    }
    for (const n of novedades) {
      eventos.push({
        id: n._id,
        modulo: "novedad",
        titulo: `${n.tipo.charAt(0).toUpperCase()}${n.tipo.slice(1)}${n.unidadNumero ? ` · Unidad ${n.unidadNumero}` : ""}`,
        detalle: n.descripcion,
        autor: n.autorNombre,
        ts: n.createdAt,
      });
    }
    for (const r of reservas) {
      eventos.push({
        id: r._id,
        modulo: "reserva",
        titulo: `Reserva ${r.zonaNombre}`,
        detalle: `Unidad ${r.unidadNumero} · ${r.fecha} ${r.horaInicio}–${r.horaFin} · ${r.estado}`,
        autor: r.solicitanteNombre,
        ts: r.createdAt,
      });
    }
    for (const p of pqrs) {
      eventos.push({
        id: p._id,
        modulo: "pqrs",
        titulo: `${p.radicado} · ${p.asunto}`,
        detalle: `${p.tipo} · ${p.estado}`,
        autor: p.solicitanteNombre,
        ts: p.createdAt,
      });
    }
    for (const a of asambleas) {
      eventos.push({
        id: a._id,
        modulo: "asamblea",
        titulo: a.titulo,
        detalle: `Asamblea ${a.tipo} · ${a.fecha} · ${a.estado}`,
        autor: null,
        ts: a.createdAt,
      });
    }
    for (const d of documentos) {
      eventos.push({
        id: d._id,
        modulo: "documento",
        titulo: d.nombre,
        detalle: `Documento (${d.categoria}) cargado`,
        autor: d.autorNombre,
        ts: d.createdAt,
      });
    }
    for (const s of sesiones) {
      eventos.push({
        id: s._id,
        modulo: "consejo",
        titulo: s.titulo,
        detalle: `Sesión de consejo ${s.tipo} · ${s.fecha}`,
        autor: null,
        ts: s.createdAt,
      });
    }

    eventos.sort((a, b) => b.ts - a.ts);
    return eventos.slice(0, take);
  },
});
