import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireAppUser, requireCondominioRole, hasPlatformRole } from "./model/authz";
import { calcularQuorum } from "./model/quorum";
import {
  configRedactor,
  etiquetaRedactor,
  redactarConModelo,
} from "./lib/redactor";

/**
 * El acta de la asamblea.
 *
 * ── La regla que gobierna este archivo ────────────────────────────────────
 * El acta tiene dos capas y NO se mezclan:
 *
 *   · Capa dura   — quórum, coeficientes, asistentes, votos, porcentajes,
 *                   horas. Sale de la base de datos, es determinista y se
 *                   puede volver a generar idéntica. Si alguien impugna una
 *                   decisión, esto es lo que se defiende.
 *
 *   · Capa blanda — el resumen en prosa de qué se discutió en cada punto.
 *                   La redacta un modelo a partir de la transcripción.
 *
 * Un modelo NUNCA produce un número de este documento. Si redactara el
 * porcentaje de quórum, tarde o temprano se inventaría uno, y sería un dato
 * inventado dentro de un documento con efectos legales. Por eso el resumen
 * se pide sin cifras y vive en su propia tabla.
 *
 * Lo que sale de aquí es un BORRADOR. El acta la firman el presidente y el
 * secretario de la asamblea; nada se publica solo.
 */

const WRITE_ROLES = [
  "administrador",
  "junta_directiva",
  "representante_asamblea",
] as const;

async function esMesa(
  ctx: Parameters<typeof requireCondominioRole>[0],
  condominioId: Id<"condominios">,
  user: { _id: Id<"users">; platformRole?: string | null },
) {
  if (hasPlatformRole(user as never, "superadmin", "admin")) return true;
  try {
    await requireCondominioRole(ctx, condominioId, [...WRITE_ROLES]);
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Capa dura: todo lo que el acta calcula, sin modelo de por medio
// ─────────────────────────────────────────────────────────────

/**
 * Todo lo que necesita el acta, en una sola consulta.
 *
 * Se arma acá y no en el navegador porque los coeficientes y el quórum son
 * exactamente lo que se discute cuando se impugna un acta: tienen que salir
 * de la base, no de una suma hecha en el cliente.
 */
export const paquete = query({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return null;
    await requireCondominioRole(ctx, asamblea.condominioId, [...WRITE_ROLES]);

    const condominio = await ctx.db.get(asamblea.condominioId);

    const unidades = await ctx.db
      .query("unidades")
      .withIndex("by_condominio", (q) => q.eq("condominioId", asamblea.condominioId))
      .collect();
    const totalCoef = unidades.reduce((s, u) => s + (u.coeficiente ?? 0), 0);

    const asistentes = await ctx.db
      .query("asambleaAsistentes")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .collect();

    const poderes = await ctx.db
      .query("poderesAsamblea")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .collect();

    // MISMO cálculo que proyecta la mesa en la asamblea (model/quorum.ts).
    // Antes esto sumaba solo `asistentes` y dejaba fuera las unidades
    // representadas por un apoderado presente: el acta reportaba un quórum
    // MENOR al anunciado en vivo, que es material de impugnación.
    const q = calcularQuorum({ asistentes, poderes, unidades });
    const presenteCoef = q.presenteCoef;
    const quorumPct = q.pct;

    // ── Votaciones con su desglose por coeficiente ──
    const votaciones = await ctx.db
      .query("votaciones")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .collect();

    const resultados = await Promise.all(
      votaciones
        .filter((vt) => vt.abiertaAlgunaVez === true || vt.estado === "abierta")
        .map(async (vt) => {
          const votos = await ctx.db
            .query("votosAsamblea")
            .withIndex("by_votacion", (q) => q.eq("votacionId", vt._id))
            .collect();
          return {
            votacionId: vt._id as string,
            pregunta: vt.pregunta,
            estado: vt.estado,
            abiertaEn: vt.abiertaEn ?? null,
            cerradaEn: vt.cerradaEn ?? null,
            totalVotos: votos.length,
            opciones: vt.opciones.map((o, i) => {
              const propios = votos.filter((x) => x.opcionIndex === i);
              return {
                texto: o.texto,
                votos: propios.length,
                coeficiente:
                  Math.round(
                    propios.reduce((s, x) => s + (x.coeficiente ?? 0), 0) * 100,
                  ) / 100,
              };
            }),
          };
        }),
    );

    // ── Cronología ──
    const eventos = await ctx.db
      .query("salaBitacora")
      .withIndex("by_asamblea_created", (q) => q.eq("asambleaId", args.asambleaId))
      .order("asc")
      .take(1000);

    const resumen = await ctx.db
      .query("asambleaResumenes")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .first();

    // Cuántas frases hay: le dice a la interfaz si vale la pena resumir.
    const algunaIntervencion = await ctx.db
      .query("salaIntervenciones")
      .withIndex("by_asamblea_inicio", (q) => q.eq("asambleaId", args.asambleaId))
      .first();

    return {
      condominioNombre: condominio?.name ?? "",
      asamblea: {
        titulo: asamblea.titulo,
        tipo: asamblea.tipo,
        modalidad: asamblea.modalidad,
        estado: asamblea.estado,
        fecha: asamblea.fecha,
        hora: asamblea.hora,
        lugar: asamblea.lugar ?? null,
        iniciadaEn: asamblea.iniciadaEn ?? null,
        finalizadaEn: asamblea.finalizadaEn ?? null,
        presidenteNombre: asamblea.presidenteNombre ?? null,
      },
      quorum: {
        requerido: asamblea.quorumRequerido ?? 51,
        alcanzado: Math.round(quorumPct * 100) / 100,
        unidadesPresentes: asistentes.length,
        totalUnidades: unidades.length,
        coeficientePresente: Math.round(presenteCoef * 100) / 100,
        coeficienteTotal: Math.round(totalCoef * 100) / 100,
        poderesValidados: poderes.filter((p) => p.validado).length,
      },
      asistentes: asistentes
        .slice()
        .sort((a, b) =>
          a.unidadNumero.localeCompare(b.unidadNumero, undefined, { numeric: true }),
        )
        .map((a) => ({
          unidadNumero: a.unidadNumero,
          userNombre: a.userNombre,
          coeficiente: a.coeficiente ?? null,
          esPoder: !!a.esPoder,
          createdAt: a.createdAt,
        })),
      /* `agenda` es el orden del día viejo (solo títulos) y `ordenDia` el
       * estructurado. Se normalizan a la misma forma acá para que el acta no
       * tenga que saber cuál de los dos traía la asamblea. */
      ordenDia: (
        asamblea.ordenDia ??
        asamblea.agenda.map((t) => ({
          titulo: t,
          descripcion: undefined,
          hecho: undefined,
          votacionId: undefined,
        }))
      ).map((p, i) => ({
        indice: i,
        titulo: p.titulo,
        descripcion: p.descripcion ?? null,
        hecho: p.hecho === true,
        votacionId: (p.votacionId as string | undefined) ?? null,
      })),
      resultados,
      cronologia: eventos.map((e) => ({
        tipo: e.tipo,
        nombre: e.nombre,
        detalle: e.detalle ?? null,
        createdAt: e.createdAt,
      })),
      resumen: resumen
        ? {
            puntos: resumen.puntos,
            modelo: resumen.modelo,
            generadoEn: resumen.generadoEn,
          }
        : null,
      hayTranscripcion: algunaIntervencion != null,
      generadoEn: Date.now(),
    };
  },
});

// ─────────────────────────────────────────────────────────────
// Capa blanda: el resumen redactado
// ─────────────────────────────────────────────────────────────

/** Lo que se dijo, agrupado por punto. Insumo del resumen. */
export const dichoPorPunto = internalQuery({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return null;

    const filas = await ctx.db
      .query("salaIntervenciones")
      .withIndex("by_asamblea_inicio", (q) => q.eq("asambleaId", args.asambleaId))
      .order("asc")
      // Una asamblea de cuatro horas cabe de sobra; el tope es un seguro.
      .take(4000);

    const orden = asamblea.ordenDia ?? asamblea.agenda.map((t) => ({ titulo: t }));
    const porPunto = new Map<number, { nombre: string; texto: string }[]>();
    for (const f of filas) {
      // Lo dicho antes de abrir el primer punto se agrupa en el índice 0.
      const i = f.puntoIndice ?? 0;
      const lista = porPunto.get(i) ?? [];
      lista.push({ nombre: f.nombre, texto: f.texto });
      porPunto.set(i, lista);
    }

    return {
      condominioId: asamblea.condominioId,
      puntos: orden.map((p, i) => ({
        puntoIndice: i,
        titulo: p.titulo,
        dicho: porPunto.get(i) ?? [],
      })),
    };
  },
});

export const guardarResumen = internalMutation({
  args: {
    asambleaId: v.id("asambleas"),
    condominioId: v.id("condominios"),
    generadoPorUserId: v.id("users"),
    modelo: v.string(),
    puntos: v.array(
      v.object({
        puntoIndice: v.number(),
        titulo: v.string(),
        resumen: v.string(),
        intervenciones: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const previo = await ctx.db
      .query("asambleaResumenes")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .first();

    const fila = {
      condominioId: args.condominioId,
      asambleaId: args.asambleaId,
      puntos: args.puntos,
      modelo: args.modelo,
      generadoEn: Date.now(),
      generadoPorUserId: args.generadoPorUserId,
    };

    if (previo) await ctx.db.replace(previo._id, fila);
    else await ctx.db.insert("asambleaResumenes", fila);
  },
});

/**
 * Instrucción al modelo.
 *
 * Lo importante no es lo que pide sino lo que prohíbe: sin cifras, sin
 * resultados de votación y sin nada que no se haya dicho. Todo eso ya está
 * en el acta, calculado de la base; si el modelo también lo escribiera,
 * habría dos versiones del mismo número en un documento legal y la que se
 * lee primero sería la inventada.
 */
const INSTRUCCION = `Eres el secretario de una asamblea de propiedad horizontal en Colombia y estás redactando el acta.

Vas a recibir la transcripción de lo que se habló en UN punto del orden del día. Escribe un resumen en prosa, en español neutro y en tercera persona, como se redacta un acta.

Reglas estrictas:
- NO inventes nada. Si algo no se dijo, no lo escribas.
- NO escribas cifras, porcentajes, cantidades de votos ni resultados de votación. Esos datos van en otra parte del acta, calculados aparte. Si en la conversación se mencionaron cifras, refiérete a ellas de forma cualitativa ("se presentó el presupuesto", no "se presentó un presupuesto de X").
- NO opines ni concluyas. Limítate a relatar qué se planteó, quién lo planteó y qué posturas se expresaron.
- Si la transcripción está incompleta o es confusa, dilo de forma llana en vez de rellenar.
- Usa los nombres tal como aparecen.
- Entre 2 y 6 frases. Si hubo poco contenido, una frase basta.

Responde ÚNICAMENTE con el texto del resumen, sin encabezados ni comillas.`;

function mensajeUsuario(
  titulo: string,
  dicho: { nombre: string; texto: string }[],
): string {
  const transcripcion = dicho
    .map((d) => `${d.nombre}: ${d.texto}`)
    .join("\n")
    // Un punto muy largo se recorta antes de enviarlo: no vale la pena
    // pagar por una ventana enorme para resumir en cinco frases.
    .slice(0, 60_000);
  return `Punto del orden del día: ${titulo}\n\nTranscripción:\n${transcripcion}`;
}

/**
 * Redacta el resumen de cada punto a partir de la transcripción.
 *
 * Un punto por llamada, y no toda la asamblea de una: así cada resumen ve
 * solo su propia conversación y no puede mezclar lo que se discutió en otro
 * punto, que es el error más fácil de cometer y el más difícil de detectar
 * leyendo el acta.
 */
export const generarResumen = action({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args): Promise<{ puntos: number; sinTranscripcion: number }> => {
    const user = await ctx.runQuery(internal.acta.usuarioMesa, {
      asambleaId: args.asambleaId,
    });
    if (!user) throw new Error("Solo la mesa puede generar el acta.");

    const cfg = configRedactor();
    if (!cfg) {
      throw new Error(
        "No hay modelo configurado para redactar. Pon ANTHROPIC_API_KEY, OPENAI_API_KEY o ACTA_API_KEY en Convex. El acta con los datos se puede descargar igual, solo que sin los resúmenes.",
      );
    }

    const datos = await ctx.runQuery(internal.acta.dichoPorPunto, {
      asambleaId: args.asambleaId,
    });
    if (!datos) throw new Error("Asamblea no encontrada.");

    const puntos: {
      puntoIndice: number;
      titulo: string;
      resumen: string;
      intervenciones: number;
    }[] = [];
    let sinTranscripcion = 0;

    for (const p of datos.puntos) {
      if (p.dicho.length === 0) {
        sinTranscripcion++;
        puntos.push({
          puntoIndice: p.puntoIndice,
          titulo: p.titulo,
          resumen: "",
          intervenciones: 0,
        });
        continue;
      }
      const resumen = await redactarConModelo(
        cfg,
        INSTRUCCION,
        mensajeUsuario(p.titulo, p.dicho),
      );
      puntos.push({
        puntoIndice: p.puntoIndice,
        titulo: p.titulo,
        resumen,
        intervenciones: p.dicho.length,
      });
    }

    await ctx.runMutation(internal.acta.guardarResumen, {
      asambleaId: args.asambleaId,
      condominioId: datos.condominioId,
      generadoPorUserId: user.userId,
      modelo: etiquetaRedactor(cfg),
      puntos,
    });

    return { puntos: puntos.length, sinTranscripcion };
  },
});

/** Comprueba que quien pide el resumen es de la mesa. Para la acción. */
export const usuarioMesa = internalQuery({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return null;
    const user = await requireAppUser(ctx);
    if (!(await esMesa(ctx, asamblea.condominioId, user))) return null;
    return { userId: user._id };
  },
});

/**
 * La secretaría reescribe el resumen de un punto.
 *
 * Que se pueda editar no es un extra: lo que redacta el modelo es un
 * borrador, y quien firma el acta tiene que poder dejarla como corresponde
 * antes de hacerlo.
 */
export const editarResumen = mutation({
  args: {
    asambleaId: v.id("asambleas"),
    puntoIndice: v.number(),
    resumen: v.string(),
  },
  handler: async (ctx, args) => {
    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) throw new Error("Asamblea no encontrada.");
    const user = await requireAppUser(ctx);
    if (!(await esMesa(ctx, asamblea.condominioId, user))) {
      throw new Error("Solo la mesa puede editar el acta.");
    }

    const fila = await ctx.db
      .query("asambleaResumenes")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .first();
    if (!fila) throw new Error("Todavía no hay un resumen generado.");

    const puntos = fila.puntos.map((p) =>
      p.puntoIndice === args.puntoIndice
        ? { ...p, resumen: args.resumen.trim(), editado: true }
        : p,
    );
    await ctx.db.patch(fila._id, { puntos });
  },
});
