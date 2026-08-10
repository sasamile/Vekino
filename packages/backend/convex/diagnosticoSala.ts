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
 * Aquí no hay estimaciones de servilleta. Se ejecutan de verdad las lecturas
 * que hace cada consulta de la sala y se mide el tamaño real de lo que
 * devolvería, con los datos que hay AHORA en esa asamblea. Lo único que se
 * supone es la multiplicación: tantos suscriptores × tantas invalidaciones.
 *
 * Convex reejecuta una consulta y REENVÍA su resultado completo a cada
 * suscriptor cada vez que cambia cualquier documento que esa consulta leyó.
 * Por eso el precio de una asamblea no lo fija el video —que ni pasa por
 * aquí— sino cuántas veces se toca un documento que muchos están mirando.
 */

/** Tamaño de lo que viajaría por el cable. Aproximado pero medido, no inventado. */
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
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const costeDeLaSala = query({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);

    const asamblea = await ctx.db.get(args.asambleaId);
    if (!asamblea) return null;

    /* Cuánta gente hay. Es el multiplicador de todo lo demás: con 5 personas
     * cualquier descuido es gratis y con 173 el mismo descuido es la factura. */
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

    /* Suscriptores = personas con la sala abierta. Se usa el mayor de los dos
     * censos: quien tiene presencia pero no sesión (la mesa sin unidades)
     * también está suscrito y también paga. */
    const suscriptores = Math.max(presencias.length, sesionesAbiertas.length, 1);

    // ── El peso real de cada consulta que TODOS tienen suscrita ──────────

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

    /* `salaEnVivo` es la más despertada de la sala, así que se pesa lo que
     * de verdad devuelve: el censo de personas con foto y el resumen. */
    const pesoSalaEnVivo =
      pesar(
        presencias.slice(0, 100).map((p) => ({
          userId: p.userId ?? null,
          nombre: p.nombre,
          esMesa: p.esMesa,
          imageUrl: p.imageUrl ?? null,
        })),
      ) + 400;

    const consultas = [
      {
        nombre: "salaEnVivo",
        que: "Quiénes están en la sala y si hay quórum",
        quien: "todos",
        bytes: pesoSalaEnVivo,
        documentos: sesionesAbiertas.length + presencias.length + 3,
      },
      {
        nombre: "asambleas.get",
        que: "La ficha de la asamblea con el orden del día",
        quien: "todos",
        bytes: pesar(asamblea),
        documentos: 1,
      },
      {
        nombre: "listVotaciones",
        que: "Las votaciones y sus contadores",
        quien: "todos",
        bytes: pesar(votaciones),
        documentos: votaciones.length,
      },
      {
        nombre: "palabras",
        que: "Quién tiene la mano levantada",
        quien: "todos",
        bytes: pesar(palabras) + 200,
        documentos: palabras.length + 3,
      },
      {
        nombre: "salaCloudflare.pistas",
        que: "Qué micrófonos y cámaras están emitiendo",
        quien: "todos",
        bytes: pesar(pistas),
        documentos: pistas.length,
      },
    ];

    const pesoTodas = consultas.reduce((s, c) => s + c.bytes, 0);

    // ── Lo que cuesta cada cosa que pasa en una asamblea ─────────────────

    /* El efecto rebaño: ocho consultas leen el documento de la asamblea para
     * autorizar, así que tocarlo las despierta TODAS a la vez en todos. */
    const costeClicOrdenDia = pesoTodas * suscriptores;
    const costeVoto = (pesar(votaciones) + 300) * suscriptores;
    const costeEntrada = pesoSalaEnVivo * suscriptores;
    const costePista = pesar(pistas) * suscriptores;

    const eventos = [
      {
        evento: "La mesa marca un punto del orden del día",
        detalle:
          "Toca el documento de la asamblea, y ocho consultas lo leen para autorizar: se despiertan todas.",
        bytes: costeClicOrdenDia,
        vecesTipicas: 30,
      },
      {
        evento: "Alguien vota",
        detalle: "Recalcula los contadores de la votación, que todos tienen suscritos.",
        bytes: costeVoto,
        vecesTipicas: suscriptores * 8,
      },
      {
        evento: "Alguien entra o sale de la sala",
        detalle: "Cambia el censo de presencia.",
        bytes: costeEntrada,
        vecesTipicas: suscriptores * 2,
      },
      {
        evento: "Alguien abre o cierra su micrófono por primera vez",
        detalle: "Cambia el catálogo de pistas del SFU.",
        bytes: costePista,
        vecesTipicas: 40,
      },
    ];

    const totalEstimado = eventos.reduce(
      (s, e) => s + e.bytes * e.vecesTipicas,
      0,
    );

    return {
      asamblea: {
        titulo: asamblea.titulo,
        estado: asamblea.estado,
        fecha: asamblea.fecha,
      },
      suscriptores,
      consultas: consultas
        .sort((a, b) => b.bytes - a.bytes)
        .map((c) => ({ ...c, peso: legible(c.bytes) })),
      pesoTodasLasConsultas: legible(pesoTodas),
      eventos: eventos
        .map((e) => ({
          ...e,
          porVez: legible(e.bytes),
          total: legible(e.bytes * e.vecesTipicas),
          totalBytes: e.bytes * e.vecesTipicas,
        }))
        .sort((a, b) => b.totalBytes - a.totalBytes),
      totalEstimado: legible(totalEstimado),
      totalEstimadoBytes: totalEstimado,
      /* El aviso importa tanto como el número: 1 GB con cinco personas en una
       * prueba significa 30 GB el día de la asamblea de verdad. */
      advertencia:
        suscriptores < 20
          ? `Medido con ${suscriptores} conectados. El coste crece con el CUADRADO: multiplica por (173/${suscriptores})² ≈ ${Math.round((173 / suscriptores) ** 2)} para hacerte una idea de una asamblea llena.`
          : null,
    };
  },
});
