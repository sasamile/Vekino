import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  requireCondominioRole,
  requireAppUser,
  getCurrentAppUser,
  getMembership,
  hasPlatformRole,
} from "./model/authz";
import { resolveUserImage } from "./model/userImage";
import {
  duracionVentana,
  formatearDuracion,
  fusionarTramos,
  msConectados,
  pctPermanencia,
  presenteEn,
  type Tramo,
  type Ventana,
} from "./lib/permanencia";
import { registrarBitacora } from "./salaBitacora";

/**
 * Sala de la asamblea: quién está conectado, cuánto tiempo estuvo y quién
 * estaba dentro en el instante exacto en que se votó cada punto.
 *
 * Va aparte de `asambleas.ts` (que ya pasa de 2.000 líneas) porque es un
 * problema distinto: aquel responde "¿entró?", este responde "¿cuánto
 * estuvo?". Los dos comparten `asambleaAsistentes` como fuente de quórum
 * acumulado; aquí vive el detalle temporal.
 */

const WRITE_ROLES = [
  "administrador",
  "junta_directiva",
  "representante_asamblea",
] as const;

/**
 * Cada cuánto debe latir el cliente. El corte por inactividad es 3× esto:
 * con un latido cada 30 s toleramos perder dos seguidos antes de dar a
 * alguien por desconectado. Un umbral más corto sacaría de la sala a media
 * asamblea cada vez que el wifi parpadea.
 */
export const LATIDO_MS = 30_000;
export const CORTE_INACTIVIDAD_MS = LATIDO_MS * 3;

// ─────────────────────────────────────────────────────────────
// Helpers compartidos (los usa también asambleas.ts)
// ─────────────────────────────────────────────────────────────

export type FilaSesion = {
  unidadId: Id<"unidades">;
  unidadNumero: string;
  userId: Id<"users">;
  userNombre: string;
  coeficiente?: number;
  esPoder?: boolean;
};

/**
 * Abre un tramo de conexión por unidad.
 *
 * Idempotente sobre tramos ABIERTOS: si la unidad ya tiene uno abierto, solo
 * refresca el latido. Eso permite llamarla en cada reconexión sin fabricar
 * tramos de cero milisegundos.
 */
export async function abrirSesiones(
  ctx: MutationCtx,
  args: {
    condominioId: Id<"condominios">;
    asambleaId: Id<"asambleas">;
    origen: "codigo" | "sala" | "manual_admin" | "poder_codigo" | "presencial";
    filas: FilaSesion[];
  },
): Promise<number> {
  const now = Date.now();
  let abiertas = 0;

  for (const f of args.filas) {
    const previa = await ctx.db
      .query("asambleaSesiones")
      .withIndex("by_asamblea_unidad", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("unidadId", f.unidadId),
      )
      .filter((q) => q.eq(q.field("abierta"), true))
      .first();

    if (previa) {
      await ctx.db.patch(previa._id, { ultimoLatido: now });
      continue;
    }

    await ctx.db.insert("asambleaSesiones", {
      condominioId: args.condominioId,
      asambleaId: args.asambleaId,
      unidadId: f.unidadId,
      unidadNumero: f.unidadNumero,
      userId: f.userId,
      userNombre: f.userNombre,
      coeficiente: f.coeficiente,
      esPoder: f.esPoder,
      entroEn: now,
      abierta: true,
      origen: args.origen,
      ultimoLatido: now,
    });
    abiertas++;
    await registrarBitacora(ctx, {
      condominioId: args.condominioId,
      asambleaId: args.asambleaId,
      tipo: "entrada",
      nombre: f.userNombre,
      detalle: `Unidad ${f.unidadNumero}${f.esPoder ? " · poder" : ""}`,
      userId: f.userId,
    });
  }

  return abiertas;
}

/** Cierra los tramos abiertos de una unidad. */
export async function cerrarSesionesUnidad(
  ctx: MutationCtx,
  args: {
    asambleaId: Id<"asambleas">;
    unidadId: Id<"unidades">;
    motivo: "salida" | "inactividad" | "retirada_admin" | "cierre_asamblea";
  },
): Promise<number> {
  const abiertas = await ctx.db
    .query("asambleaSesiones")
    .withIndex("by_asamblea_unidad", (q) =>
      q.eq("asambleaId", args.asambleaId).eq("unidadId", args.unidadId),
    )
    .filter((q) => q.eq(q.field("abierta"), true))
    .collect();

  const now = Date.now();
  const motivoDetalle: Record<typeof args.motivo, string> = {
    salida: "Salió de la sala",
    inactividad: "Desconectado por inactividad",
    retirada_admin: "Retirado por la mesa",
    cierre_asamblea: "Cierre de la asamblea",
  };
  for (const s of abiertas) {
    await ctx.db.patch(s._id, {
      abierta: false,
      salioEn: now,
      motivoSalida: args.motivo,
    });
    await registrarBitacora(ctx, {
      condominioId: s.condominioId,
      asambleaId: args.asambleaId,
      tipo: "salida",
      nombre: s.userNombre,
      detalle: `Unidad ${s.unidadNumero} · ${motivoDetalle[args.motivo]}`,
      userId: s.userId,
    });
  }
  return abiertas.length;
}

/** Cierra TODOS los tramos abiertos de la asamblea. La usa `setEstado`. */
export async function cerrarSesionesAsamblea(
  ctx: MutationCtx,
  asambleaId: Id<"asambleas">,
  motivo: "cierre_asamblea" | "retirada_admin" = "cierre_asamblea",
): Promise<number> {
  const abiertas = await ctx.db
    .query("asambleaSesiones")
    .withIndex("by_asamblea_abierta", (q) =>
      q.eq("asambleaId", asambleaId).eq("abierta", true),
    )
    .collect();

  const now = Date.now();
  const detalle =
    motivo === "cierre_asamblea"
      ? "Cierre de la asamblea"
      : "Retirado por la mesa";
  for (const s of abiertas) {
    await ctx.db.patch(s._id, {
      abierta: false,
      salioEn: now,
      motivoSalida: motivo,
    });
    await registrarBitacora(ctx, {
      condominioId: s.condominioId,
      asambleaId,
      tipo: "salida",
      nombre: s.userNombre,
      detalle: `Unidad ${s.unidadNumero} · ${detalle}`,
      userId: s.userId,
    });
  }
  return abiertas.length;
}

/** ¿La unidad de este usuario tiene conexión abierta? Para el gate de voto. */
export async function tieneConexionAbierta(
  ctx: QueryCtx | MutationCtx,
  asambleaId: Id<"asambleas">,
  unidadId: Id<"unidades">,
): Promise<boolean> {
  const s = await ctx.db
    .query("asambleaSesiones")
    .withIndex("by_asamblea_unidad", (q) =>
      q.eq("asambleaId", asambleaId).eq("unidadId", unidadId),
    )
    .filter((q) => q.eq(q.field("abierta"), true))
    .first();
  return s !== null;
}

// ─────────────────────────────────────────────────────────────
// Reconstrucción temporal
// ─────────────────────────────────────────────────────────────

type SesionDoc = Doc<"asambleaSesiones">;

/** Agrupa las sesiones por unidad y fusiona los tramos solapados. */
function tramosPorUnidad(sesiones: SesionDoc[], ahora: number) {
  const porUnidad = new Map<
    string,
    {
      unidadId: Id<"unidades">;
      unidadNumero: string;
      coeficiente: number;
      esPoder: boolean;
      nombres: Set<string>;
      tramos: Tramo[];
    }
  >();

  for (const s of sesiones) {
    const key = s.unidadId as string;
    const actual = porUnidad.get(key);
    const tramo: Tramo = { entroEn: s.entroEn, salioEn: s.salioEn ?? null };
    if (actual) {
      actual.tramos.push(tramo);
      actual.nombres.add(s.userNombre);
      if (s.esPoder) actual.esPoder = true;
      continue;
    }
    porUnidad.set(key, {
      unidadId: s.unidadId,
      unidadNumero: s.unidadNumero,
      coeficiente: s.coeficiente ?? 0,
      esPoder: !!s.esPoder,
      nombres: new Set([s.userNombre]),
      tramos: [tramo],
    });
  }

  for (const u of porUnidad.values()) {
    u.tramos = fusionarTramos(u.tramos, ahora);
  }
  return porUnidad;
}

/**
 * Ventana real de la asamblea, o `null` si todavía no ha empezado.
 *
 * NO cae a `createdAt`: una asamblea creada anteayer y aún sin iniciar daba
 * "duración 33 h 56 min", que es basura con pinta de dato. Sin `iniciadaEn`
 * y sin ninguna conexión, la respuesta correcta es "no ha empezado".
 */
function ventanaDe(
  asamblea: Doc<"asambleas">,
  sesiones: SesionDoc[],
): Ventana | null {
  const desde =
    asamblea.iniciadaEn ??
    (sesiones.length > 0
      ? Math.min(...sesiones.map((s) => s.entroEn))
      : null);
  if (desde === null) return null;
  return { desde, hasta: asamblea.finalizadaEn ?? null };
}

async function cargarSesiones(
  ctx: QueryCtx,
  asambleaId: Id<"asambleas">,
): Promise<SesionDoc[]> {
  return await ctx.db
    .query("asambleaSesiones")
    .withIndex("by_asamblea", (q) => q.eq("asambleaId", asambleaId))
    .collect();
}

// ─────────────────────────────────────────────────────────────
// Mutaciones de la sala
// ─────────────────────────────────────────────────────────────

/**
 * Señal de vida del residente que está en la sala.
 *
 * Refresca el latido de todas SUS unidades con tramo abierto. Si no tiene
 * ninguno abierto (se cayó y el cron ya lo cerró), abre uno nuevo: volver a
 * conectarse no debería exigir escribir el código otra vez, siempre que ya
 * hubiera registrado asistencia.
 */
export const latido = mutation({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    if (asamblea.estado !== "en_curso") {
      return { activo: false as const, unidades: 0 };
    }
    const user = await requireAppUser(ctx);

    // Solo puede latir por unidades que ya marcaron asistencia.
    const asistencias = await ctx.db
      .query("asambleaAsistentes")
      .withIndex("by_asamblea_user", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("userId", user._id),
      )
      .collect();
    if (asistencias.length === 0) {
      return { activo: false as const, unidades: 0 };
    }

    const now = Date.now();
    let refrescadas = 0;
    const reabrir: FilaSesion[] = [];

    for (const a of asistencias) {
      const abierta = await ctx.db
        .query("asambleaSesiones")
        .withIndex("by_asamblea_unidad", (q) =>
          q.eq("asambleaId", args.asambleaId).eq("unidadId", a.unidadId),
        )
        .filter((q) => q.eq(q.field("abierta"), true))
        .first();

      if (abierta) {
        await ctx.db.patch(abierta._id, { ultimoLatido: now });
        refrescadas++;
        continue;
      }
      reabrir.push({
        unidadId: a.unidadId,
        unidadNumero: a.unidadNumero,
        userId: a.userId,
        userNombre: a.userNombre,
        coeficiente: a.coeficiente,
        esPoder: a.esPoder,
      });
    }

    if (reabrir.length > 0) {
      /* `origen: "sala"`, no "codigo". Antes iba "codigo" a fuerza y el
       * paquete de auditoría acababa etiquetando como "Código en pantalla"
       * reconexiones que nadie registró con un código — justo en los datos
       * que sostienen una impugnación. */
      await abrirSesiones(ctx, {
        condominioId: asamblea.condominioId,
        asambleaId: args.asambleaId,
        origen: "sala",
        filas: reabrir,
      });
    }

    return {
      activo: true as const,
      unidades: refrescadas + reabrir.length,
      proximoLatidoMs: LATIDO_MS,
    };
  },
});

/** Salida explícita: el residente cierra la sala. */
export const salirDeSala = mutation({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    const user = await requireAppUser(ctx);

    const asistencias = await ctx.db
      .query("asambleaAsistentes")
      .withIndex("by_asamblea_user", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("userId", user._id),
      )
      .collect();

    let cerradas = 0;
    for (const a of asistencias) {
      cerradas += await cerrarSesionesUnidad(ctx, {
        asambleaId: args.asambleaId,
        unidadId: a.unidadId,
        motivo: "salida",
      });
    }
    return { cerradas };
  },
});

// ─────────────────────────────────────────────────────────────
// Presencia de PERSONAS en la pestaña (estilo Meet)
// ─────────────────────────────────────────────────────────────

async function upsertPresencia(
  ctx: MutationCtx,
  args: {
    condominioId: Id<"condominios">;
    asambleaId: Id<"asambleas">;
    userId?: Id<"users">;
    codigoPoder?: string;
    nombre: string;
    imageUrl?: string | null;
    esMesa: boolean;
  },
) {
  const now = Date.now();
  const imageUrl = args.imageUrl?.trim() || undefined;
  if (args.userId) {
    const ex = await ctx.db
      .query("salaPresencias")
      .withIndex("by_asamblea_user", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("userId", args.userId!),
      )
      .first();
    if (ex) {
      await ctx.db.patch(ex._id, {
        nombre: args.nombre,
        imageUrl,
        esMesa: args.esMesa,
        ultimoLatido: now,
      });
      return;
    }
  } else if (args.codigoPoder) {
    const ex = await ctx.db
      .query("salaPresencias")
      .withIndex("by_asamblea_codigo", (q) =>
        q
          .eq("asambleaId", args.asambleaId)
          .eq("codigoPoder", args.codigoPoder!),
      )
      .first();
    if (ex) {
      await ctx.db.patch(ex._id, {
        nombre: args.nombre,
        imageUrl,
        esMesa: false,
        ultimoLatido: now,
      });
      return;
    }
  } else {
    return;
  }

  await ctx.db.insert("salaPresencias", {
    condominioId: args.condominioId,
    asambleaId: args.asambleaId,
    userId: args.userId,
    codigoPoder: args.codigoPoder,
    nombre: args.nombre,
    imageUrl,
    esMesa: args.esMesa,
    ultimoLatido: now,
  });
}

async function borrarPresencia(
  ctx: MutationCtx,
  args: {
    asambleaId: Id<"asambleas">;
    userId?: Id<"users">;
    codigoPoder?: string;
    /** Si true, deja rastro en bitácora (salida explícita / inactividad). */
    registrarSalida?: boolean;
    motivo?: string;
  },
) {
  const registrar = async (ex: {
    condominioId: Id<"condominios">;
    asambleaId: Id<"asambleas">;
    nombre: string;
    userId?: Id<"users">;
  }) => {
    if (!args.registrarSalida) return;
    await registrarBitacora(ctx, {
      condominioId: ex.condominioId,
      asambleaId: ex.asambleaId,
      tipo: "salida",
      nombre: ex.nombre,
      detalle: args.motivo ?? "Salió de la sala",
      userId: ex.userId,
    });
  };

  if (args.userId) {
    const ex = await ctx.db
      .query("salaPresencias")
      .withIndex("by_asamblea_user", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("userId", args.userId!),
      )
      .first();
    if (ex) {
      await registrar(ex);
      await ctx.db.delete(ex._id);
    }
  }
  if (args.codigoPoder) {
    const ex = await ctx.db
      .query("salaPresencias")
      .withIndex("by_asamblea_codigo", (q) =>
        q
          .eq("asambleaId", args.asambleaId)
          .eq("codigoPoder", args.codigoPoder!),
      )
      .first();
    if (ex) {
      await registrar(ex);
      await ctx.db.delete(ex._id);
    }
  }
}

/** Latido de presencia: cualquiera con la sala abierta (mesa sin unidades también). */
export const latidoPresencia = mutation({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    if (asamblea.estado !== "en_curso") {
      return { activo: false as const };
    }
    const user = await requireAppUser(ctx);
    const membership = await getMembership(ctx, user._id, asamblea.condominioId);
    const esMesa =
      hasPlatformRole(user, "superadmin", "admin") ||
      (!!membership?.isActive &&
        membership.roles.some((r) =>
          (WRITE_ROLES as readonly string[]).includes(r),
        ));
    if (!membership?.isActive && !esMesa) {
      throw new Error("Sin acceso a este condominio.");
    }
    await upsertPresencia(ctx, {
      condominioId: asamblea.condominioId,
      asambleaId: args.asambleaId,
      userId: user._id,
      nombre: user.name,
      imageUrl: await resolveUserImage(ctx, user),
      esMesa,
    });
    return { activo: true as const, proximoLatidoMs: LATIDO_MS };
  },
});

export const salirPresencia = mutation({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) return { ok: true as const };
    await borrarPresencia(ctx, {
      asambleaId: args.asambleaId,
      userId: user._id,
      registrarSalida: true,
      motivo: "Salió de la sala",
    });
    return { ok: true as const };
  },
});

/** Presencia del apoderado (código de poder, sin cuenta). */
export const latidoPresenciaConCodigo = mutation({
  args: { codigo: v.string() },
  handler: async (ctx, args) => {
    const pack = await poderesPorCodigo(ctx, args.codigo);
    if (!pack) return { activo: false as const };
    const { poderes, asamblea, codigo } = pack;
    if (asamblea.estado !== "en_curso") return { activo: false as const };
    const repId = poderes[0]!.representanteUserId;
    let imageUrl: string | null = null;
    if (repId) {
      const u = await ctx.db.get(repId);
      imageUrl = await resolveUserImage(ctx, u);
    }
    await upsertPresencia(ctx, {
      condominioId: asamblea.condominioId,
      asambleaId: asamblea._id,
      userId: repId,
      codigoPoder: repId ? undefined : codigo,
      nombre: poderes[0]!.representanteNombre,
      imageUrl,
      esMesa: false,
    });
    return { activo: true as const, proximoLatidoMs: LATIDO_MS };
  },
});

export const salirPresenciaConCodigo = mutation({
  args: { codigo: v.string() },
  handler: async (ctx, args) => {
    const pack = await poderesPorCodigo(ctx, args.codigo);
    if (!pack) return { ok: true as const };
    const repId = pack.poderes[0]!.representanteUserId;
    await borrarPresencia(ctx, {
      asambleaId: pack.asamblea._id,
      userId: repId ?? undefined,
      codigoPoder: repId ? undefined : pack.codigo,
      registrarSalida: true,
      motivo: "Salió de la sala (apoderado)",
    });
    return { ok: true as const };
  },
});

/**
 * Cierra las conexiones que llevan rato sin latir. Lo llama el cron cada
 * minuto sobre TODAS las asambleas — por eso el índice arranca por
 * `abierta`, no por `asambleaId`.
 */
export const cerrarSesionesInactivas = internalMutation({
  args: {},
  handler: async (ctx) => {
    const limite = Date.now() - CORTE_INACTIVIDAD_MS;
    const vencidas = await ctx.db
      .query("asambleaSesiones")
      .withIndex("by_abierta_latido", (q) =>
        q.eq("abierta", true).lt("ultimoLatido", limite),
      )
      .take(500);

    const now = Date.now();
    for (const s of vencidas) {
      await ctx.db.patch(s._id, {
        abierta: false,
        salioEn: s.ultimoLatido,
        motivoSalida: "inactividad",
      });
      await registrarBitacora(ctx, {
        condominioId: s.condominioId,
        asambleaId: s.asambleaId,
        tipo: "salida",
        nombre: s.userNombre,
        detalle: `Unidad ${s.unidadNumero} · Desconectado por inactividad`,
        userId: s.userId,
      });
    }

    // Presencias (personas en pestaña) sin latido → se borran.
    const presenciasVencidas = await ctx.db
      .query("salaPresencias")
      .withIndex("by_latido", (q) => q.lt("ultimoLatido", limite))
      .take(500);
    for (const p of presenciasVencidas) {
      await registrarBitacora(ctx, {
        condominioId: p.condominioId,
        asambleaId: p.asambleaId,
        tipo: "salida",
        nombre: p.nombre,
        detalle: "Desconectado por inactividad",
        userId: p.userId,
      });
      await ctx.db.delete(p._id);
    }

    if (vencidas.length > 0 || presenciasVencidas.length > 0) {
      console.info(
        `[asambleaSala] ${vencidas.length} sesiones + ${presenciasVencidas.length} presencias por inactividad`,
      );
    }
    return {
      cerradas: vencidas.length,
      presencias: presenciasVencidas.length,
    };
  },
});

// ─────────────────────────────────────────────────────────────
// Consultas
// ─────────────────────────────────────────────────────────────

/**
 * Estado de la sala AHORA: cuántas unidades conectadas y qué coeficiente
 * representan. Es el número que la mesa proyecta durante la asamblea.
 */
export const salaEnVivo = query({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return null;
    await requireCondominioRole(ctx, asamblea.condominioId, []);

    const abiertas = await ctx.db
      .query("asambleaSesiones")
      .withIndex("by_asamblea_abierta", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("abierta", true),
      )
      .collect();

    const unidades = await ctx.db
      .query("unidades")
      .withIndex("by_condominio", (q) =>
        q.eq("condominioId", asamblea.condominioId),
      )
      .collect();

    // Una unidad conectada dos veces (dueño + apoderado) cuenta UNA.
    const porUnidad = new Map<string, number>();
    for (const s of abiertas) {
      porUnidad.set(s.unidadId as string, s.coeficiente ?? 0);
    }

    const totalCoef = unidades.reduce((s, u) => s + (u.coeficiente ?? 0), 0);
    const coefConectado = [...porUnidad.values()].reduce((s, c) => s + c, 0);
    const pct =
      totalCoef > 0
        ? (coefConectado / totalCoef) * 100
        : unidades.length > 0
          ? (porUnidad.size / unidades.length) * 100
          : 0;

    const presencias = await ctx.db
      .query("salaPresencias")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .collect();
    const ahora = Date.now();
    const vivas = presencias.filter(
      (p) => ahora - p.ultimoLatido < CORTE_INACTIVIDAD_MS,
    );

    return {
      unidadesConectadas: porUnidad.size,
      /** Personas con la pestaña de la sala abierta (estilo Meet). */
      personasEnSala: vivas.length,
      personas: vivas
        .sort((a, b) => b.ultimoLatido - a.ultimoLatido)
        .slice(0, 100)
        .map((p) => ({
          userId: p.userId ?? null,
          nombre: p.nombre,
          esMesa: p.esMesa,
          esInvitado: !!p.codigoInvitado,
          imageUrl: p.imageUrl ?? null,
        })),
      totalUnidades: unidades.length,
      pctCoeficiente: Math.round(pct * 100) / 100,
      quorumRequerido: asamblea.quorumRequerido ?? 51,
      hayQuorum: pct >= (asamblea.quorumRequerido ?? 51),
      iniciadaEn: asamblea.iniciadaEn ?? null,
      exigeConexionParaVotar: !!asamblea.exigirConexionParaVotar,
      conectados: abiertas
        .sort((a, b) => b.entroEn - a.entroEn)
        .slice(0, 300)
        .map((s) => ({
          unidadNumero: s.unidadNumero,
          userNombre: s.userNombre,
          entroEn: s.entroEn,
          esPoder: !!s.esPoder,
          origen: s.origen,
        })),
    };
  },
});

/**
 * Quórum reconstruido en un instante cualquiera.
 *
 * Sirve para responder "¿había quórum a las 19:42, cuando se aprobó el
 * presupuesto?" — que es la única pregunta que importa cuando alguien
 * impugna una decisión concreta y no la asamblea entera.
 */
export const quorumEnInstante = query({
  args: { asambleaId: v.id("asambleas"), instante: v.number() },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return null;
    await requireCondominioRole(ctx, asamblea.condominioId, []);

    const sesiones = await cargarSesiones(ctx, args.asambleaId);
    const unidades = await ctx.db
      .query("unidades")
      .withIndex("by_condominio", (q) =>
        q.eq("condominioId", asamblea.condominioId),
      )
      .collect();

    const ahora = Date.now();
    const porUnidad = tramosPorUnidad(sesiones, ahora);

    let coefPresente = 0;
    let unidadesPresentes = 0;
    for (const u of porUnidad.values()) {
      if (!presenteEn(u.tramos, args.instante, ahora)) continue;
      unidadesPresentes++;
      coefPresente += u.coeficiente;
    }

    const totalCoef = unidades.reduce((s, u) => s + (u.coeficiente ?? 0), 0);
    const pct =
      totalCoef > 0
        ? (coefPresente / totalCoef) * 100
        : unidades.length > 0
          ? (unidadesPresentes / unidades.length) * 100
          : 0;

    const requerido = asamblea.quorumRequerido ?? 51;
    return {
      instante: args.instante,
      unidadesPresentes,
      totalUnidades: unidades.length,
      pctCoeficiente: Math.round(pct * 100) / 100,
      quorumRequerido: requerido,
      hayQuorum: pct >= requerido,
    };
  },
});

/**
 * Permanencia por unidad: cuánto estuvo conectada cada una respecto a la
 * duración real de la asamblea.
 *
 * Ordena por permanencia ascendente: lo primero que quiere ver la mesa es
 * quién se fue temprano, no quién se quedó.
 */
export const permanencia = query({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return null;
    await requireCondominioRole(ctx, asamblea.condominioId, [...WRITE_ROLES]);

    const sesiones = await cargarSesiones(ctx, args.asambleaId);
    const ahora = Date.now();
    const ventana = ventanaDe(asamblea, sesiones);

    if (!ventana) {
      return {
        sinIniciar: true as const,
        iniciadaEn: null,
        finalizadaEn: null,
        enCurso: false,
        msTotales: 0,
        duracionTotal: null,
        unidades: [],
        pctPromedio: 0,
      };
    }

    const msTotales = duracionVentana(ventana, ahora);
    const porUnidad = tramosPorUnidad(sesiones, ahora);

    const filas = [...porUnidad.values()]
      .map((u) => {
        const ms = msConectados(u.tramos, ventana, ahora);
        const sigueConectada = u.tramos.some((t) => t.salioEn === null);
        return {
          unidadNumero: u.unidadNumero,
          personas: [...u.nombres].join(", "),
          esPoder: u.esPoder,
          coeficiente: u.coeficiente,
          msConectado: ms,
          duracion: formatearDuracion(ms),
          pct: pctPermanencia(ms, msTotales),
          tramos: u.tramos.length,
          reconexiones: Math.max(0, u.tramos.length - 1),
          primeraEntrada: Math.min(...u.tramos.map((t) => t.entroEn)),
          ultimaSalida: sigueConectada
            ? null
            : Math.max(...u.tramos.map((t) => t.salioEn ?? 0)),
          sigueConectada,
        };
      })
      .sort((a, b) => a.msConectado - b.msConectado);

    return {
      sinIniciar: false as const,
      iniciadaEn: ventana.desde,
      finalizadaEn: ventana.hasta,
      enCurso: ventana.hasta === null,
      msTotales,
      duracionTotal: formatearDuracion(msTotales),
      unidades: filas,
      // Promedio de permanencia: un solo número para el encabezado del acta.
      pctPromedio:
        filas.length > 0
          ? Math.round(
              (filas.reduce((s, f) => s + f.pct, 0) / filas.length) * 100,
            ) / 100
          : 0,
    };
  },
});

/**
 * Integridad de una votación: cruza cada voto contra las conexiones para
 * detectar los que se emitieron sin estar en la sala.
 *
 * No bloquea nada — reporta. La decisión de anular un voto es de la mesa, no
 * de un query. Para bloquear de entrada está `exigirConexionParaVotar` en la
 * asamblea.
 */
export const integridadVotacion = query({
  args: { votacionId: v.id("votaciones") },
  handler: async (ctx, args) => {
    const votacion = await ctx.db.get(args.votacionId);
    if (!votacion) return null;
    await requireCondominioRole(ctx, votacion.condominioId, [...WRITE_ROLES]);

    const asamblea = await ctx.db.get(votacion.asambleaId);
    if (!asamblea) return null;

    const sesiones = await cargarSesiones(ctx, votacion.asambleaId);
    const ahora = Date.now();
    const porUnidad = tramosPorUnidad(sesiones, ahora);

    const votos = await ctx.db
      .query("votosAsamblea")
      .withIndex("by_votacion", (q) => q.eq("votacionId", args.votacionId))
      .collect();

    /* Sin sesiones registradas no hay nada que cruzar: es una asamblea
     * presencial o anterior a la sala. Devolvemos `aplicable: false` en vez
     * de marcar todos los votos como sospechosos, que sería una alarma
     * falsa con toda la lista en rojo. */
    if (sesiones.length === 0) {
      return {
        aplicable: false as const,
        totalVotos: votos.length,
        sinConexion: [],
        abiertaEn: votacion.abiertaEn ?? null,
        cerradaEn: votacion.cerradaEn ?? null,
      };
    }

    const sinConexion = votos
      .filter((vt) => {
        const u = porUnidad.get(vt.unidadId as string);
        if (!u) return true; // votó una unidad que nunca se conectó
        return !presenteEn(u.tramos, vt.createdAt, ahora);
      })
      .map((vt) => ({
        unidadNumero: vt.unidadNumero,
        opcionIndex: vt.opcionIndex,
        votadoEn: vt.createdAt,
        coeficiente: vt.coeficiente ?? null,
      }));

    return {
      aplicable: true as const,
      totalVotos: votos.length,
      sinConexion,
      abiertaEn: votacion.abiertaEn ?? null,
      cerradaEn: votacion.cerradaEn ?? null,
    };
  },
});

/**
 * Enciende o apaga la exigencia de estar conectado para votar.
 *
 * Es una decisión de la mesa, no del código: en una asamblea mixta hay gente
 * en el salón sin sala virtual, y encenderlo ahí los dejaría sin voto.
 */
export const exigirConexionParaVotar = mutation({
  args: { asambleaId: v.id("asambleas"), exigir: v.boolean() },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    await requireCondominioRole(ctx, asamblea.condominioId, [...WRITE_ROLES]);

    if (args.exigir && asamblea.modalidad === "presencial") {
      throw new Error(
        "Esta asamblea es presencial: no hay sala virtual a la que conectarse.",
      );
    }
    await ctx.db.patch(args.asambleaId, {
      exigirConexionParaVotar: args.exigir,
      updatedAt: Date.now(),
    });
    return { exigir: args.exigir };
  },
});

/** Mi estado en la sala, para que el cliente sepa si debe latir. */
export const miSala = query({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    /* Devuelve null en vez de lanzar cuando no hay usuario o membresía.
     *
     * Esta query es la PRIMERA que dispara la página de la sala, y el
     * cliente de Convex la ejecuta antes de terminar de adjuntar el token
     * de sesión: con `requireAppUser` ese instante sin token reventaba con
     * un overlay de error aunque la persona SÍ estuviera logueada. La
     * página trata null como "sin acceso" y el gate de autenticación vive
     * en el cliente (useConvexAuth). */
    const user = await getCurrentAppUser(ctx);
    if (!user) return null;
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return null;

    const membresia = await getMembership(ctx, user._id, asamblea.condominioId);
    const esPlataforma = hasPlatformRole(user, "superadmin", "admin");
    if (!membresia?.isActive && !esPlataforma) return null;

    const asistencias = await ctx.db
      .query("asambleaAsistentes")
      .withIndex("by_asamblea_user", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("userId", user._id),
      )
      .collect();

    let conectadas = 0;
    for (const a of asistencias) {
      if (await tieneConexionAbierta(ctx, args.asambleaId, a.unidadId)) {
        conectadas++;
      }
    }

    /* El rol se resuelve aquí y no en la URL: la sala es UNA ruta para todos
     * (`/sala/...`, fuera de los dos shells de la app), así que el cliente no
     * puede deducir de la ruta si eres mesa o residente. */
    const esMesa =
      esPlataforma ||
      (!!membresia?.isActive &&
        membresia.roles.some((r) =>
          (WRITE_ROLES as readonly string[]).includes(r),
        ));

    /** Solo administrador (o plataforma) gestiona el enlace de invitados. */
    const puedeGestionarInvitados =
      esPlataforma ||
      (!!membresia?.isActive && membresia.roles.includes("administrador"));

    /* La palabra: quien la tiene concedida puede publicar en el servidor de
     * medios. El permiso se resuelve AQUÍ y viaja firmado en el token
     * (`salaToken.ts`); si se calculara en el cliente, cualquiera se daría
     * el micrófono editando el JavaScript. */
    const palabra = await ctx.db
      .query("salaPalabra")
      .withIndex("by_asamblea_user", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("userId", user._id),
      )
      .first();

    const esPresidente = asamblea.presidenteUserId === user._id;

    return {
      esMesa,
      esPresidente,
      puedeGestionarInvitados,
      /** Identidad y nombre para el servidor de medios. */
      identidad: user._id as string,
      nombre: user.name,
      tienePalabra: palabra?.estado === "concedida",
      /** Mesa, presidente o con palabra concedida pueden publicar A/V. */
      puedePublicar: esMesa || esPresidente || palabra?.estado === "concedida",
      enCurso: asamblea.estado === "en_curso",
      registrado: asistencias.length > 0,
      unidades: asistencias.length,
      unidadesConectadas: conectadas,
      debeLatir: asamblea.estado === "en_curso" && asistencias.length > 0,
      /** La mesa (sin unidades) también late presencia para contar en el Meet. */
      debeLatirPresencia: asamblea.estado === "en_curso",
      latidoMs: LATIDO_MS,
      exigeConexionParaVotar: !!asamblea.exigirConexionParaVotar,
    };
  },
});

// ─────────────────────────────────────────────────────────────
// Apoderado por código (sin cuenta)
// ─────────────────────────────────────────────────────────────

async function poderesPorCodigo(
  ctx: QueryCtx | MutationCtx,
  codigoRaw: string,
) {
  const codigo = codigoRaw.trim().toUpperCase();
  if (codigo.length < 4) return null;
  const poderes = await ctx.db
    .query("poderesAsamblea")
    .withIndex("by_codigo", (q) => q.eq("codigoAcceso", codigo))
    .collect();
  if (poderes.length === 0) return null;
  const asamblea = await ctx.db.get(poderes[0]!.asambleaId);
  if (!asamblea) return null;
  if (asamblea.estado === "finalizada" || asamblea.estado === "cancelada") {
    return null;
  }
  return { codigo, poderes, asamblea };
}

/** Estado de sala del apoderado (para saber si debe latir). */
export const miSalaConCodigo = query({
  args: { codigo: v.string() },
  handler: async (ctx, args) => {
    const pack = await poderesPorCodigo(ctx, args.codigo);
    if (!pack) return null;
    const { poderes, asamblea } = pack;

    let conectadas = 0;
    let registradas = 0;
    for (const p of poderes) {
      const asis = await ctx.db
        .query("asambleaAsistentes")
        .withIndex("by_asamblea_unidad", (q) =>
          q.eq("asambleaId", asamblea._id).eq("unidadId", p.unidadId),
        )
        .first();
      if (!asis) continue;
      registradas++;
      if (await tieneConexionAbierta(ctx, asamblea._id, p.unidadId)) {
        conectadas++;
      }
    }

    return {
      asambleaId: asamblea._id,
      enCurso: asamblea.estado === "en_curso",
      registrado: registradas === poderes.length && poderes.length > 0,
      unidades: poderes.length,
      unidadesConectadas: conectadas,
      debeLatir: asamblea.estado === "en_curso" && registradas > 0,
      debeLatirPresencia: asamblea.estado === "en_curso",
      latidoMs: LATIDO_MS,
      exigeConexionParaVotar: !!asamblea.exigirConexionParaVotar,
    };
  },
});

/** Latido del apoderado: mantiene abiertas las sesiones de sus unidades. */
export const latidoConCodigo = mutation({
  args: { codigo: v.string() },
  handler: async (ctx, args) => {
    const pack = await poderesPorCodigo(ctx, args.codigo);
    if (!pack) return { activo: false as const, unidades: 0 };
    const { poderes, asamblea } = pack;
    if (asamblea.estado !== "en_curso") {
      return { activo: false as const, unidades: 0 };
    }

    const now = Date.now();
    let refrescadas = 0;
    const reabrir: FilaSesion[] = [];

    for (const p of poderes) {
      const asis = await ctx.db
        .query("asambleaAsistentes")
        .withIndex("by_asamblea_unidad", (q) =>
          q.eq("asambleaId", asamblea._id).eq("unidadId", p.unidadId),
        )
        .first();
      if (!asis) continue;

      const abierta = await ctx.db
        .query("asambleaSesiones")
        .withIndex("by_asamblea_unidad", (q) =>
          q.eq("asambleaId", asamblea._id).eq("unidadId", p.unidadId),
        )
        .filter((q) => q.eq(q.field("abierta"), true))
        .first();

      if (abierta) {
        await ctx.db.patch(abierta._id, { ultimoLatido: now });
        refrescadas++;
        continue;
      }
      reabrir.push({
        unidadId: asis.unidadId,
        unidadNumero: asis.unidadNumero,
        userId: asis.userId,
        userNombre: asis.userNombre,
        coeficiente: asis.coeficiente,
        esPoder: true,
      });
    }

    if (reabrir.length > 0) {
      await abrirSesiones(ctx, {
        condominioId: asamblea.condominioId,
        asambleaId: asamblea._id,
        origen: "poder_codigo",
        filas: reabrir,
      });
    }

    return {
      activo: true as const,
      unidades: refrescadas + reabrir.length,
      proximoLatidoMs: LATIDO_MS,
    };
  },
});

/** El apoderado cierra la pestaña / sale de la sala. */
export const salirDeSalaConCodigo = mutation({
  args: { codigo: v.string() },
  handler: async (ctx, args) => {
    const pack = await poderesPorCodigo(ctx, args.codigo);
    if (!pack) return { cerradas: 0 };
    const { poderes, asamblea } = pack;

    let cerradas = 0;
    for (const p of poderes) {
      cerradas += await cerrarSesionesUnidad(ctx, {
        asambleaId: asamblea._id,
        unidadId: p.unidadId,
        motivo: "salida",
      });
    }
    return { cerradas };
  },
});
