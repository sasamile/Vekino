import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  requireCondominioRole,
  getCurrentAppUser,
} from "./model/authz";
import { LATIDO_MS } from "./asambleaSala";
import { registrarBitacora } from "./salaBitacora";

/**
 * Invitados a la sala: entran con enlace, pueden pedir la palabra y
 * compartir pantalla, pero NO votan ni suman al quórum.
 *
 * Flujo:
 *  1. La mesa activa un `codigoInvitado` en la asamblea → link `/invitado?codigo=…`
 *  2. Cada persona escribe su nombre → obtiene un `sesionCodigo` único
 *  3. Con ese código late presencia / chat / palabra (nunca asistencia)
 */

const WRITE_ROLES = [
  "administrador",
  "junta_directiva",
  "representante_asamblea",
] as const;

function generarCodigoCorto(semilla: string): string {
  const raw = (Date.now().toString(36) + semilla)
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .replace(/[O0I1L]/g, "X");
  return raw.slice(-6);
}

function generarSesionCodigo(): string {
  const raw = (Date.now().toString(36) + Math.random().toString(36).slice(2))
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .replace(/[O0I1L]/g, "X");
  return `I${raw.slice(-7)}`;
}

export function identidadInvitado(sesionCodigo: string): string {
  return `inv:${sesionCodigo.trim().toUpperCase()}`;
}

async function sesionInvitadoValida(
  ctx: QueryCtx | MutationCtx,
  sesionCodigoRaw: string,
) {
  const sesionCodigo = sesionCodigoRaw.trim().toUpperCase();
  if (sesionCodigo.length < 5) return null;
  const sesion = await ctx.db
    .query("asambleaInvitadoSesiones")
    .withIndex("by_sesion", (q) => q.eq("sesionCodigo", sesionCodigo))
    .first();
  if (!sesion) return null;
  const asamblea = await ctx.db.get(sesion.asambleaId);
  if (!asamblea) return null;
  if (asamblea.estado === "finalizada" || asamblea.estado === "cancelada") {
    return null;
  }
  const enlace = asamblea.codigoInvitado?.trim().toUpperCase();
  if (!enlace || enlace !== sesion.codigoEnlace) return null;
  return { sesion, asamblea, sesionCodigo };
}

/** Mesa: estado del enlace de invitados. */
export const enlaceInvitado = query({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return null;
    await requireCondominioRole(ctx, asamblea.condominioId, [...WRITE_ROLES]);
    const sesiones = await ctx.db
      .query("asambleaInvitadoSesiones")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .collect();
    const enlace = asamblea.codigoInvitado?.trim().toUpperCase() || null;
    const activas = enlace
      ? sesiones.filter((s) => s.codigoEnlace === enlace)
      : [];
    return {
      activo: !!enlace,
      codigo: enlace,
      invitadosUnidos: activas.length,
    };
  },
});

/** Mesa: crea o regenera el código del enlace. */
export const activarEnlaceInvitado = mutation({
  args: {
    asambleaId: v.id("asambleas"),
    regenerar: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    await requireCondominioRole(ctx, asamblea.condominioId, [...WRITE_ROLES]);
    if (asamblea.estado === "finalizada" || asamblea.estado === "cancelada") {
      throw new Error("La asamblea ya no está activa.");
    }
    if (asamblea.modalidad === "presencial") {
      throw new Error("Esta asamblea es presencial: no hay sala virtual.");
    }

    let codigo = asamblea.codigoInvitado?.trim().toUpperCase();
    if (!codigo || args.regenerar) {
      codigo = generarCodigoCorto(args.asambleaId as string);
      // Evitar colisión con otro enlace activo.
      for (let i = 0; i < 5; i++) {
        const otro = await ctx.db
          .query("asambleas")
          .withIndex("by_codigo_invitado", (q) => q.eq("codigoInvitado", codigo!))
          .first();
        if (!otro || otro._id === args.asambleaId) break;
        codigo = generarCodigoCorto(`${args.asambleaId}${i}${Date.now()}`);
      }
      await ctx.db.patch(args.asambleaId, {
        codigoInvitado: codigo,
        updatedAt: Date.now(),
      });
    }

    const user = await getCurrentAppUser(ctx);
    await registrarBitacora(ctx, {
      condominioId: asamblea.condominioId,
      asambleaId: args.asambleaId,
      tipo: "entrada",
      nombre: user?.name ?? "Mesa",
      detalle: args.regenerar
        ? `Enlace de invitados regenerado (${codigo})`
        : `Enlace de invitados activo (${codigo})`,
      userId: user?._id,
    });

    return { codigo };
  },
});

/** Mesa: desactiva el enlace (las sesiones dejan de valer). */
export const desactivarEnlaceInvitado = mutation({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    await requireCondominioRole(ctx, asamblea.condominioId, [...WRITE_ROLES]);
    await ctx.db.patch(args.asambleaId, {
      codigoInvitado: undefined,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

/**
 * Portal público: valida el código del enlace (antes de unirse).
 * No revela datos sensibles: solo título y si se puede entrar.
 */
export const accederEnlaceInvitado = query({
  args: { codigo: v.string() },
  handler: async (ctx, args) => {
    const codigo = args.codigo.trim().toUpperCase();
    if (codigo.length < 4) return null;
    const asamblea = await ctx.db
      .query("asambleas")
      .withIndex("by_codigo_invitado", (q) => q.eq("codigoInvitado", codigo))
      .first();
    if (!asamblea) return null;
    if (asamblea.estado === "finalizada" || asamblea.estado === "cancelada") {
      return null;
    }
    return {
      asambleaId: asamblea._id,
      condominioId: asamblea.condominioId,
      titulo: asamblea.titulo,
      fecha: asamblea.fecha,
      hora: asamblea.hora,
      modalidad: asamblea.modalidad,
      estado: asamblea.estado,
    };
  },
});

/**
 * El invitado escribe su nombre y obtiene una sesión propia.
 * NO inserta asistencia ni sesiones de unidad.
 */
export const unirseComoInvitado = mutation({
  args: {
    codigo: v.string(),
    nombre: v.string(),
  },
  handler: async (ctx, args) => {
    const codigo = args.codigo.trim().toUpperCase();
    const nombre = args.nombre.trim().slice(0, 80);
    if (codigo.length < 4) throw new Error("Código inválido.");
    if (nombre.length < 2) throw new Error("Indica tu nombre.");

    const asamblea = await ctx.db
      .query("asambleas")
      .withIndex("by_codigo_invitado", (q) => q.eq("codigoInvitado", codigo))
      .first();
    if (!asamblea) throw new Error("Código inválido o enlace desactivado.");
    if (asamblea.estado === "finalizada" || asamblea.estado === "cancelada") {
      throw new Error("La asamblea ya cerró.");
    }
    if (asamblea.modalidad === "presencial") {
      throw new Error("Esta asamblea no tiene sala virtual.");
    }

    const now = Date.now();
    let sesionCodigo = generarSesionCodigo();
    for (let i = 0; i < 5; i++) {
      const choc = await ctx.db
        .query("asambleaInvitadoSesiones")
        .withIndex("by_sesion", (q) => q.eq("sesionCodigo", sesionCodigo))
        .first();
      if (!choc) break;
      sesionCodigo = generarSesionCodigo();
    }

    await ctx.db.insert("asambleaInvitadoSesiones", {
      condominioId: asamblea.condominioId,
      asambleaId: asamblea._id,
      codigoEnlace: codigo,
      sesionCodigo,
      nombre,
      ultimoLatido: now,
      createdAt: now,
    });

    await registrarBitacora(ctx, {
      condominioId: asamblea.condominioId,
      asambleaId: asamblea._id,
      tipo: "entrada",
      nombre,
      detalle: "Entró como invitado (sin voto ni quórum)",
    });

    return {
      sesionCodigo,
      asambleaId: asamblea._id,
      condominioId: asamblea.condominioId,
      nombre,
    };
  },
});

/** Estado de sala del invitado (para latidos). */
export const miSalaInvitado = query({
  args: { sesionCodigo: v.string() },
  handler: async (ctx, args) => {
    const pack = await sesionInvitadoValida(ctx, args.sesionCodigo);
    if (!pack) return null;
    const { sesion, asamblea, sesionCodigo } = pack;

    const palabra = await ctx.db
      .query("salaPalabra")
      .withIndex("by_asamblea_invitado", (q) =>
        q.eq("asambleaId", asamblea._id).eq("codigoInvitado", sesionCodigo),
      )
      .first();

    return {
      asambleaId: asamblea._id,
      condominioId: asamblea.condominioId,
      nombre: sesion.nombre,
      identidad: identidadInvitado(sesionCodigo),
      enCurso: asamblea.estado === "en_curso",
      tienePalabra: palabra?.estado === "concedida",
      estadoPalabra: palabra?.estado ?? null,
      cierraEn: palabra?.cierraEn ?? null,
      debeLatirPresencia: asamblea.estado === "en_curso",
      latidoMs: LATIDO_MS,
      /** Nunca: los invitados no tienen unidades ni quórum. */
      registrado: false,
      debeLatir: false,
    };
  },
});

/** Portal: datos de la sala con sesión ya creada. */
export const accederConSesionInvitado = query({
  args: { sesionCodigo: v.string() },
  handler: async (ctx, args) => {
    const pack = await sesionInvitadoValida(ctx, args.sesionCodigo);
    if (!pack) return null;
    const { sesion, asamblea } = pack;
    const ordenDia = (asamblea.ordenDia ?? []).map((p, i) => ({
      indice: i,
      titulo: p.titulo,
      hecho: !!p.hecho,
    }));
    return {
      sesionCodigo: pack.sesionCodigo,
      nombre: sesion.nombre,
      asamblea: {
        _id: asamblea._id,
        condominioId: asamblea.condominioId,
        titulo: asamblea.titulo,
        fecha: asamblea.fecha,
        hora: asamblea.hora,
        modalidad: asamblea.modalidad,
        estado: asamblea.estado,
      },
      ordenDia,
    };
  },
});

export const latidoPresenciaInvitado = mutation({
  args: { sesionCodigo: v.string() },
  handler: async (ctx, args) => {
    const pack = await sesionInvitadoValida(ctx, args.sesionCodigo);
    if (!pack) return { activo: false as const };
    const { sesion, asamblea, sesionCodigo } = pack;
    if (asamblea.estado !== "en_curso") {
      return { activo: false as const };
    }

    const now = Date.now();
    await ctx.db.patch(sesion._id, { ultimoLatido: now });

    const ex = await ctx.db
      .query("salaPresencias")
      .withIndex("by_asamblea_invitado", (q) =>
        q.eq("asambleaId", asamblea._id).eq("codigoInvitado", sesionCodigo),
      )
      .first();
    if (ex) {
      await ctx.db.patch(ex._id, {
        nombre: sesion.nombre,
        esMesa: false,
        ultimoLatido: now,
      });
    } else {
      await ctx.db.insert("salaPresencias", {
        condominioId: asamblea.condominioId,
        asambleaId: asamblea._id,
        codigoInvitado: sesionCodigo,
        nombre: sesion.nombre,
        esMesa: false,
        ultimoLatido: now,
      });
    }
    return { activo: true as const, proximoLatidoMs: LATIDO_MS };
  },
});

export const salirPresenciaInvitado = mutation({
  args: { sesionCodigo: v.string() },
  handler: async (ctx, args) => {
    const pack = await sesionInvitadoValida(ctx, args.sesionCodigo);
    if (!pack) return { ok: true as const };
    const { asamblea, sesion, sesionCodigo } = pack;
    const ex = await ctx.db
      .query("salaPresencias")
      .withIndex("by_asamblea_invitado", (q) =>
        q.eq("asambleaId", asamblea._id).eq("codigoInvitado", sesionCodigo),
      )
      .first();
    if (ex) {
      await registrarBitacora(ctx, {
        condominioId: asamblea.condominioId,
        asambleaId: asamblea._id,
        tipo: "salida",
        nombre: sesion.nombre,
        detalle: "Salió de la sala (invitado)",
      });
      await ctx.db.delete(ex._id);
    }
    return { ok: true as const };
  },
});

/** Helper interno reutilizable desde salaVideo. */
export async function resolverSesionInvitado(
  ctx: QueryCtx | MutationCtx,
  sesionCodigo?: string,
) {
  if (!sesionCodigo) return null;
  return sesionInvitadoValida(ctx, sesionCodigo);
}
