import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/** Inspecciona un usuario por email: rol de plataforma + membresías (dev). */
export const inspectUserByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .unique();
    if (!user) return { found: false };
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const withNames = await Promise.all(
      memberships.map(async (m) => {
        const c = await ctx.db.get(m.condominioId);
        return { condominio: c?.name ?? null, roles: m.roles };
      }),
    );
    return {
      found: true,
      name: user.name,
      email: user.email,
      platformRole: user.platformRole ?? null,
      hasAuthId: !!user.authId,
      memberships: withNames,
    };
  },
});

/** Conteo rápido de todas las tablas (dev). */
export const counts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [condominios, users, memberships, unidades, usuarioUnidad] =
      await Promise.all([
        ctx.db.query("condominios").collect(),
        ctx.db.query("users").collect(),
        ctx.db.query("memberships").collect(),
        ctx.db.query("unidades").collect(),
        ctx.db.query("usuarioUnidad").collect(),
      ]);
    return {
      condominios: condominios.length,
      users: users.length,
      memberships: memberships.length,
      unidades: unidades.length,
      usuarioUnidad: usuarioUnidad.length,
    };
  },
});

/**
 * Utilidades SOLO para desarrollo. Son `internalMutation` (no accesibles desde
 * el cliente). No usar en producción.
 */

/** Elimina un condominio por nombre exacto (solo dev / limpieza de pruebas). */
export const purgeCondominioByName = internalMutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("condominios").collect();
    let deleted = 0;
    for (const c of rows) {
      if (c.name === args.name) {
        await ctx.db.delete(c._id);
        deleted++;
      }
    }
    return { deleted };
  },
});

/** Elimina el perfil de aplicación de un usuario y sus membresías por email. */
export const purgeUserByEmail = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    if (!user) return { deleted: false };

    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const m of memberships) await ctx.db.delete(m._id);

    await ctx.db.delete(user._id);
    return { deleted: true, membershipsDeleted: memberships.length };
  },
});

/**
 * SOLO LECTURA: muestra qué se borraría de un visitante antes de tocar nada.
 *
 * La minuta no guarda el id del visitante (`minutaEventos` solo tiene texto),
 * así que los eventos se buscan por coincidencia en el resumen. Por eso hay
 * que revisarlos a ojo antes de borrar: el emparejamiento es difuso.
 */
export const inspeccionarVisitante = internalQuery({
  args: { documento: v.string() },
  handler: async (ctx, args) => {
    const doc = args.documento.trim();
    const visitantes = await ctx.db.query("visitantes").collect();
    const coinciden = visitantes.filter((v) => (v.documento ?? "") === doc);

    const eventos = await ctx.db.query("minutaEventos").collect();
    const nombres = coinciden.map((v) => v.nombre.toLowerCase());
    const relacionados = eventos.filter((e) => {
      const r = e.resumen.toLowerCase();
      return r.includes(doc) || nombres.some((n) => n && r.includes(n));
    });

    return {
      visitantes: coinciden.map((v) => ({
        id: v._id,
        nombre: v.nombre,
        documento: v.documento,
        estado: v.estado,
        unidadId: v.unidadId,
        createdAt: new Date(v.createdAt).toISOString(),
      })),
      minutaEventos: relacionados.map((e) => ({
        id: e._id,
        modulo: e.modulo,
        tipo: e.tipo,
        unidad: e.unidad,
        resumen: e.resumen,
        createdAt: new Date(e.createdAt).toISOString(),
      })),
    };
  },
});

/**
 * Borra registros puntuales por id exacto (limpieza de pruebas).
 *
 * Recibe los ids ya verificados con `inspeccionarVisitante` en vez de volver a
 * buscar por texto: al borrar no queremos emparejamientos difusos.
 */
export const borrarRegistrosDePrueba = internalMutation({
  args: {
    visitantes: v.array(v.id("visitantes")),
    minutaEventos: v.array(v.id("minutaEventos")),
  },
  handler: async (ctx, args) => {
    let visitantes = 0;
    for (const id of args.visitantes) {
      if (await ctx.db.get(id)) {
        await ctx.db.delete(id);
        visitantes++;
      }
    }
    let eventos = 0;
    for (const id of args.minutaEventos) {
      if (await ctx.db.get(id)) {
        await ctx.db.delete(id);
        eventos++;
      }
    }
    return { visitantesBorrados: visitantes, eventosBorrados: eventos };
  },
});
