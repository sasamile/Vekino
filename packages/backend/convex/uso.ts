import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentAppUser, requirePlatformStaff } from "./model/authz";

/**
 * Uso de la plataforma: quién la abre, cuándo y para qué.
 *
 * Existe porque no teníamos con qué responder "¿esto le sirve a la gente?".
 * El único dato era `users.authId`: si alguien había entrado alguna vez. Con
 * eso no se decide qué construir después.
 *
 * Dos fuentes, deliberadamente:
 *  1. `actividadUso`, que el cliente alimenta al abrir cada sección. Empieza
 *     hoy, así que los primeros días el mapa se ve casi vacío.
 *  2. Las tablas de acciones que YA existían (pagos, votos, reservas, poderes,
 *     WhatsApp, soporte). No se instrumentaron para medir, pero cada fila
 *     tiene fecha y autor, así que sirven para reconstruir el pasado y que el
 *     panel diga algo desde el primer día.
 *
 * Sobre el costo: hoy la plataforma tiene ~180 acciones registradas en total,
 * así que recorrer esas tablas es gratis. Cuando crezcan habrá que precalcular
 * el resumen por día en vez de barrerlas en cada consulta — el índice `by_dia`
 * de `actividadUso` ya está puesto para eso.
 */

/** Ventana máxima del panel. Un año es lo que cabe en el mapa de calor. */
const DIAS_MAX = 366;

/** Módulos que se miden. El orden es el del panel. */
export const MODULOS = [
  "app",
  "pagos",
  "facturas",
  "asamblea",
  "reservas",
  "comunicados",
  "soporte",
  "whatsapp",
] as const;

export type Modulo = (typeof MODULOS)[number];

/** Epoch → "2026-08-07" en la zona horaria dada (no UTC). */
function diaEn(ts: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts));
}

/** "2026-08-07" → "2026-08" */
function mesDe(dia: string): string {
  return dia.slice(0, 7);
}

// ─────────────────────────────────────────────────────────────
// Escritura
// ─────────────────────────────────────────────────────────────

/**
 * Marca que el usuario actual usó un módulo hoy.
 *
 * Idempotente por (usuario, día, módulo): la llama el cliente al entrar a
 * cada sección y lo único que hace es sumar un contador. Si no hay sesión no
 * falla, simplemente no registra: no vale la pena romperle la pantalla a
 * nadie por una métrica.
 */
export const registrar = mutation({
  args: {
    modulo: v.string(),
    condominioId: v.optional(v.id("condominios")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) return null;
    const userId = user._id;

    const modulo = (MODULOS as readonly string[]).includes(args.modulo)
      ? args.modulo
      : "app";

    const condominio = args.condominioId
      ? await ctx.db.get(args.condominioId)
      : null;
    const dia = diaEn(Date.now(), condominio?.timezone ?? "America/Bogota");

    const ya = await ctx.db
      .query("actividadUso")
      .withIndex("by_user_dia_modulo", (q) =>
        q.eq("userId", userId).eq("dia", dia).eq("modulo", modulo),
      )
      .first();

    if (ya) {
      await ctx.db.patch(ya._id, {
        veces: ya.veces + 1,
        ultimoAt: Date.now(),
      });
      return null;
    }

    await ctx.db.insert("actividadUso", {
      userId,
      condominioId: args.condominioId,
      dia,
      modulo,
      veces: 1,
      ultimoAt: Date.now(),
    });
    return null;
  },
});

// ─────────────────────────────────────────────────────────────
// Lectura
// ─────────────────────────────────────────────────────────────

type Evento = {
  /** Clave del actor. Casi siempre `user:<id>`, pero `reservas` solo guarda
   *  la unidad, así que ahí es `unidad:<id>`. Sirve igual para contar
   *  "cuánta gente distinta", que es lo único que se le pregunta. */
  actor: string;
  condominioId?: Id<"condominios">;
  ts: number;
  modulo: Modulo;
};

/**
 * Reconstruye actividad a partir de las tablas que ya existían.
 *
 * Ninguna se creó para medir, pero todas guardan quién hizo qué y cuándo. Sin
 * esto el panel arrancaría en blanco y parecería roto, cuando en realidad hay
 * meses de historia que sí se pueden contar.
 */
async function eventosHistoricos(
  ctx: QueryCtx,
  desde: number,
  condominioId?: Id<"condominios">,
): Promise<Evento[]> {
  const out: Evento[] = [];
  const cabe = (d: { condominioId?: Id<"condominios"> }) =>
    !condominioId || d.condominioId === condominioId;

  const push = (
    filas: Array<Record<string, unknown>>,
    modulo: Modulo,
    campoActor: string,
    prefijo = "user",
  ) => {
    for (const f of filas) {
      const ts = f.createdAt as number | undefined;
      const actorId = f[campoActor] as string | undefined;
      const cid = f.condominioId as Id<"condominios"> | undefined;
      if (!ts || !actorId || ts < desde) continue;
      if (!cabe({ condominioId: cid })) continue;
      out.push({ actor: `${prefijo}:${actorId}`, condominioId: cid, ts, modulo });
    }
  };

  const [pagos, votos, asistentes, poderes, reservas, tickets, soportes] =
    await Promise.all([
      ctx.db.query("pagos").collect(),
      ctx.db.query("votosAsamblea").collect(),
      ctx.db.query("asambleaAsistentes").collect(),
      ctx.db.query("poderesAsamblea").collect(),
      ctx.db.query("reservas").collect(),
      ctx.db.query("soporteTickets").collect(),
      ctx.db.query("soportesPago").collect(),
    ]);

  push(pagos, "pagos", "userId");
  push(votos, "asamblea", "userId");
  push(asistentes, "asamblea", "userId");
  push(poderes, "asamblea", "otorganteUserId");
  // `reservas` no guarda quién la pidió, solo la unidad.
  push(reservas, "reservas", "unidadId", "unidad");
  push(tickets, "soporte", "userId");
  push(soportes, "pagos", "userId");

  return out;
}

/**
 * Todo lo que pinta el panel de uso, en una sola consulta: el mapa de calor
 * por día, los usuarios activos por mes y el desglose por módulo.
 */
export const panel = query({
  args: {
    condominioId: v.optional(v.id("condominios")),
    dias: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);

    const dias = Math.min(Math.max(args.dias ?? 90, 14), DIAS_MAX);
    const desde = Date.now() - dias * 24 * 60 * 60 * 1000;

    const condo = args.condominioId
      ? await ctx.db.get(args.condominioId)
      : null;
    const tz = condo?.timezone ?? "America/Bogota";

    // ── Lo medido a propósito ──
    const medidos = await ctx.db.query("actividadUso").collect();

    // ── Lo reconstruido de las tablas de acciones ──
    const historicos = await eventosHistoricos(ctx, desde, args.condominioId);

    /* Un día cuenta una vez por persona aunque haya hecho diez cosas: la
     * pregunta es cuánta gente distinta apareció, no cuántos clics dio. */
    const porDia = new Map<string, Set<string>>();
    const porDiaAcciones = new Map<string, number>();
    const porMes = new Map<string, Set<string>>();
    const porModulo = new Map<string, { usuarios: Set<string>; acciones: number }>();

    const anota = (
      dia: string,
      userId: string,
      modulo: string,
      acciones: number,
    ) => {
      if (dia < diaEn(desde, tz)) return;
      if (!porDia.has(dia)) porDia.set(dia, new Set());
      porDia.get(dia)!.add(userId);
      porDiaAcciones.set(dia, (porDiaAcciones.get(dia) ?? 0) + acciones);

      const mes = mesDe(dia);
      if (!porMes.has(mes)) porMes.set(mes, new Set());
      porMes.get(mes)!.add(userId);

      if (!porModulo.has(modulo)) {
        porModulo.set(modulo, { usuarios: new Set(), acciones: 0 });
      }
      const m = porModulo.get(modulo)!;
      m.usuarios.add(userId);
      m.acciones += acciones;
    };

    for (const f of medidos) {
      if (args.condominioId && f.condominioId !== args.condominioId) continue;
      anota(f.dia, `user:${f.userId}`, f.modulo, f.veces);
    }
    for (const e of historicos) {
      anota(diaEn(e.ts, tz), e.actor, e.modulo, 1);
    }

    const mapa = [...porDia.entries()]
      .map(([dia, usuarios]) => ({
        dia,
        usuarios: usuarios.size,
        acciones: porDiaAcciones.get(dia) ?? 0,
      }))
      .sort((a, b) => a.dia.localeCompare(b.dia));

    const meses = [...porMes.entries()]
      .map(([mes, usuarios]) => ({ mes, usuarios: usuarios.size }))
      .sort((a, b) => a.mes.localeCompare(b.mes));

    const modulos = [...porModulo.entries()]
      .map(([modulo, v]) => ({
        modulo,
        usuarios: v.usuarios.size,
        acciones: v.acciones,
      }))
      .sort((a, b) => b.usuarios - a.usuarios);

    /* El denominador. Sin él, "12 personas activas" no dice nada: son muy
     * distintas 12 de 20 que 12 de 400. */
    const memberships = args.condominioId
      ? await ctx.db
          .query("memberships")
          .withIndex("by_condominio", (q) =>
            q.eq("condominioId", args.condominioId!),
          )
          .collect()
      : await ctx.db.query("memberships").collect();

    const vistos = new Set<string>();
    let totalUsuarios = 0;
    let hanEntradoAlgunaVez = 0;
    for (const m of memberships) {
      if (!m.isActive || vistos.has(m.userId)) continue;
      const u = await ctx.db.get(m.userId);
      if (!u || !u.active) continue;
      vistos.add(m.userId);
      totalUsuarios++;
      if (u.authId) hanEntradoAlgunaVez++;
    }

    const activosSet = new Set<string>();
    for (const s of porDia.values()) for (const u of s) activosSet.add(u);

    return {
      desde: diaEn(desde, tz),
      hasta: diaEn(Date.now(), tz),
      mapa,
      meses,
      modulos,
      totalUsuarios,
      hanEntradoAlgunaVez,
      activosEnPeriodo: activosSet.size,
      /* Honestidad sobre el dato: la medición explícita arrancó tarde, así que
       * el panel avisa desde cuándo hay datos de verdad y no de reconstrucción. */
      midiendoDesde:
        medidos.length > 0
          ? medidos.map((m) => m.dia).sort()[0]!
          : null,
    };
  },
});
