import { v } from "convex/values";
import { query } from "./_generated/server";
import { requirePlatformStaff } from "./model/authz";

/**
 * Cuánto va a costar esta asamblea, ANTES de celebrarla.
 *
 * Existe por una factura de +185 GB que nadie vio venir. El problema no fue
 * que el sistema consumiera mucho: fue que consumir mucho era invisible hasta
 * que llegaba el cobro, un mes después, cuando ya no se podía hacer nada.
 *
 * Los PESOS son medidos: se ejecutan de verdad las lecturas de cada consulta
 * de la sala y se pesa lo que devolvería con los datos que hay ahora. Lo que
 * se modela es cómo crecen al haber más gente, y eso NO es un único factor
 * para todo — que fue el primer error de esta pantalla:
 *
 *   · La ficha de la asamblea pesa lo mismo con 1 persona que con 173. Su
 *     coste crece con N, porque son N los que la reciben.
 *   · El censo de la sala LISTA a las personas: pesa más cuanta más hay. Su
 *     coste crece con N × N.
 *   · Y algunos sucesos ocurren más veces cuanta más gente haya (votar), lo
 *     que añade otra N encima.
 *
 * Multiplicarlo todo por N² inflaba la factura unas treinta veces.
 */

// ── Precios de Convex, plan Professional (convex.dev/pricing) ────────────
const USD_POR_GB_IO = 0.2;
const USD_POR_MILLON_LLAMADAS = 2;
/** Solo para dar una idea en pesos; se enseña el cambio usado. */
const COP_POR_USD = 4100;

function pesar(valor: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(valor)).length;
  } catch {
    return 0;
  }
}

function legible(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function dinero(usd: number): string {
  if (usd < 0.01) return "menos de US$0,01";
  const cop = Math.round((usd * COP_POR_USD) / 100) * 100;
  return `US$${usd.toFixed(2)} · ${cop.toLocaleString("es-CO")} pesos`;
}

export const costeDeLaSala = query({
  args: {
    asambleaId: v.id("asambleas"),
    /** Con cuánta gente simular. Sin esto usa los que haya conectados ahora. */
    simular: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);

    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return null;

    const sesionesAbiertas = await ctx.db
      .query("asambleaSesiones")
      .withIndex("by_asamblea_abierta", (q) =>
        q.eq("asambleaId", args.asambleaId).eq("abierta", true),
      )
      .collect();
    const presencias = await ctx.db
      .query("salaPresencias")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .collect();

    const conectadosAhora = Math.max(
      presencias.length,
      sesionesAbiertas.length,
      0,
    );

    /* Con quién simular. Si no lo piden, se usa el censo de unidades: es el
     * número que importa —la asamblea llena— y no el de la sala vacía de un
     * martes por la tarde. */
    const unidades = await ctx.db
      .query("unidades")
      .withIndex("by_condominio", (q) =>
        q.eq("condominioId", asamblea.condominioId),
      )
      .collect();
    const N = Math.max(
      1,
      Math.round(args.simular ?? Math.max(conectadosAhora, unidades.length, 1)),
    );

    const votaciones = await ctx.db
      .query("votaciones")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .collect();
    const palabras = await ctx.db
      .query("salaPalabra")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .collect();
    const pistas = await ctx.db
      .query("salaPistasCf")
      .withIndex("by_asamblea", (q) => q.eq("asambleaId", args.asambleaId))
      .collect();

    // ── Pesos medidos, y cómo crecen ────────────────────────────────────

    const pesoFicha = pesar(asamblea);
    const pesoVotaciones = pesar(votaciones) + 120;
    const pesoPalabras = pesar(palabras) + 200;
    const pesoPistas = pesar(pistas) + 20;

    /* El censo sí crece con la gente: se mide lo que ocupa UNA persona en la
     * lista y se multiplica, con el tope de 100 que aplica la consulta. */
    const muestra = presencias[0];
    const bytesPorPersona = muestra
      ? pesar({
          userId: muestra.userId ?? null,
          nombre: muestra.nombre,
          esMesa: muestra.esMesa,
          imageUrl: muestra.imageUrl ?? null,
        })
      : 160;
    const pesoCenso = (n: number) => 400 + bytesPorPersona * Math.min(n, 100);

    const consultas = [
      { nombre: "asambleas.get", que: "La ficha con el orden del día", bytes: pesoFicha, docs: 1, creceConGente: false },
      { nombre: "listVotaciones", que: "Las votaciones y sus contadores", bytes: pesoVotaciones, docs: votaciones.length, creceConGente: false },
      { nombre: "salaEnVivo", que: "Quiénes están y si hay quórum", bytes: pesoCenso(N), docs: N * 2 + 3, creceConGente: true },
      { nombre: "palabras", que: "Quién tiene la mano levantada", bytes: pesoPalabras, docs: palabras.length + 3, creceConGente: false },
      { nombre: "salaCloudflare.pistas", que: "Qué micrófonos están emitiendo", bytes: pesoPistas, docs: pistas.length, creceConGente: false },
    ];
    const pesoTodas = consultas.reduce((s, c) => s + c.bytes, 0);

    // ── Lo que cuesta cada suceso, ya proyectado a N personas ───────────
    //
    // `veces` es lo único supuesto de aquí. Los pesos están medidos.

    const numVotaciones = Math.max(votaciones.length, 1);

    const eventos = [
      {
        evento: "Entrar todos a la sala",
        detalle: "Cada quien recibe una vez todo lo que tiene suscrito.",
        bytesPorVez: pesoTodas,
        veces: N,
      },
      {
        evento: "La mesa marca un punto del orden del día",
        detalle:
          "Toca el documento de la asamblea, y ocho consultas lo leen para autorizar: se despiertan todas, en todos.",
        bytesPorVez: pesoTodas * N,
        veces: 30,
      },
      {
        evento: "Alguien vota",
        detalle:
          "Recalcula los contadores de la votación, que todos tienen suscritos. Ocurre una vez por persona y votación.",
        bytesPorVez: pesoVotaciones * N,
        veces: N * numVotaciones,
      },
      {
        evento: "Alguien entra o sale de la sala",
        detalle:
          "Cambia el censo — y el censo lista a las personas, así que pesa más cuanta más gente hay.",
        bytesPorVez: pesoCenso(N) * N,
        veces: N * 2,
      },
      {
        evento: "Alguien abre su micrófono por primera vez",
        detalle: "Cambia el catálogo de pistas del SFU.",
        bytesPorVez: pesoPistas * N,
        veces: Math.min(N, 40),
      },
    ].map((e) => {
      const bytes = e.bytesPorVez * e.veces;
      /* Cada reejecución cuenta como una llamada a función, y ese es un
       * contador aparte que se paga aparte. */
      const llamadas = e.evento.startsWith("Entrar")
        ? N * consultas.length
        : e.veces * N;
      return { ...e, bytes, llamadas };
    });

    const totalBytes = eventos.reduce((s, e) => s + e.bytes, 0);
    const totalLlamadas = eventos.reduce((s, e) => s + e.llamadas, 0);

    const usdIo = (totalBytes / 1024 ** 3) * USD_POR_GB_IO;
    const usdLlamadas = (totalLlamadas / 1_000_000) * USD_POR_MILLON_LLAMADAS;

    return {
      asamblea: {
        titulo: asamblea.titulo,
        estado: asamblea.estado,
        fecha: asamblea.fecha,
      },
      conectadosAhora,
      unidades: unidades.length,
      simuladoCon: N,
      pesoTodasLasConsultas: legible(pesoTodas),
      consultas: consultas
        .slice()
        .sort((a, b) => b.bytes - a.bytes)
        .map((c) => ({ ...c, peso: legible(c.bytes) })),
      eventos: eventos
        .slice()
        .sort((a, b) => b.bytes - a.bytes)
        .map((e) => ({
          evento: e.evento,
          detalle: e.detalle,
          porVez: legible(e.bytesPorVez),
          veces: e.veces,
          total: legible(e.bytes),
          totalBytes: e.bytes,
        })),
      totalTransferido: legible(totalBytes),
      totalLlamadas,
      costo: {
        transferencia: dinero(usdIo),
        llamadas: dinero(usdLlamadas),
        total: dinero(usdIo + usdLlamadas),
        usd: usdIo + usdLlamadas,
      },
      /* Lo incluido es MENSUAL y compartido con todo lo demás: la app entera
       * consume del mismo saco, así que una asamblea que se coma la mitad ya
       * es un problema aunque "quepa". */
      porcentajeDelPlanMensual:
        Math.round(((totalBytes / 1024 ** 3) / 50) * 1000) / 10,
      precios: {
        io: `US$${USD_POR_GB_IO} por GB (50 GB incluidos al mes)`,
        llamadas: `US$${USD_POR_MILLON_LLAMADAS} por millón (25M incluidas al mes)`,
        cambio: `${COP_POR_USD.toLocaleString("es-CO")} pesos por dólar`,
      },
    };
  },
});
