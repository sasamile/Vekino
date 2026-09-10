import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { exigirAcceso } from "./model/acceso";
import { asignacionVigente, guardasDelConjunto } from "./model/asignacion";
import { logNovedadItem } from "./model/inventarioNovedad";
import {
  aVistaCustodiaGuarda,
  cacheDeUsuarios,
  custodiaActiva,
  custodiaGuardaActiva,
  custodiasGuardaDeCondominio,
  custodiasGuardaDeItem,
} from "./model/inventarioCustodia";
import { MAX_OBSERVACION, normalizarTexto } from "./lib/inventario";

/**
 * LA CUSTODIA INTERNA DE UN CONJUNTO: el supervisor reparte el material.
 *
 * El nivel de abajo de la cadena:
 *
 *     compañía → elemento → conjunto → guarda
 *
 * El elemento NUNCA deja de ser de la compañía ni deja de estar asignado al
 * conjunto: que un guarda lo tenga es una custodia ANIDADA dentro de aquélla.
 * Por eso las filas de aquí cuelgan de `inventarioAsignaciones` y no del
 * elemento.
 *
 * Quién manda: el SUPERVISOR de ese conjunto, con la capacidad
 * `inventario.custodiar`. No el administrador de la compañía —que conserva la
 * consulta pero no reparte material dentro de una portería en la que no
 * está— ni el guarda, ni el administrador del conjunto.
 *
 * Lo que NO hay aquí, deliberadamente: mover el elemento a otro conjunto,
 * devolverlo a la compañía, archivarlo o tocar su estado. Eso es de las
 * tareas 1 y 2 y sigue siendo del administrador de la compañía.
 */

/** Cuántas custodias abiertas de una portería se leen de una vez. */
const TOPE_CUSTODIAS = 1000;

/** Cuántas filas de historial devuelve la ficha de un elemento. */
const TOPE_HISTORIAL = 100;

// ─────────────────────────────────────────────────────────────
// La cadena de comprobaciones
// ─────────────────────────────────────────────────────────────

type Contexto = {
  item: Doc<"inventarioItems">;
  /** La custodia del conjunto de la que cuelga todo. */
  asignacion: Doc<"inventarioAsignaciones">;
  condominioId: Id<"condominios">;
  /** El supervisor que obra. */
  user: Doc<"users">;
};

/**
 * Resuelve la cadena entera antes de dejar tocar nada.
 *
 *     elemento → su custodia de conjunto → ese conjunto →
 *     ¿el supervisor manda ahí? → ¿es de SU compañía?
 *
 * NINGÚN eslabón viene del cliente. El conjunto sale de la custodia activa del
 * elemento, no de los argumentos: si viniera de fuera, bastaría con mandar el
 * id de un conjunto donde uno sí es supervisor para operar sobre el material
 * de otro.
 *
 * La comprobación de compañía es la que no se ve venir. `exigirAcceso` dice
 * "esta persona es supervisora de este conjunto", y eso es cierto para los
 * supervisores de TODAS las empresas que lo cubran —dos compañías en la misma
 * portería es un caso real—. Sin comparar la compañía, el supervisor de la
 * empresa B podría repartir los radios de la empresa A.
 */
async function exigirCadena(
  ctx: QueryCtx | MutationCtx,
  itemId: Id<"inventarioItems">,
): Promise<Contexto> {
  const item = await ctx.db.get(itemId);
  if (!item) throw new Error("Elemento no encontrado.");

  /* Un elemento archivado no está en ninguna portería: la tarea 2 impide
   * archivar algo entregado, así que llegar aquí con uno archivado significa
   * que nunca salió. Se comprueba igualmente. */
  if (item.archivadoEn != null) {
    throw new Error("Este elemento está archivado.");
  }

  const asignacion = await custodiaActiva(ctx, item._id);
  if (!asignacion) {
    throw new Error(
      "Este elemento no está asignado a ningún conjunto ahora mismo.",
    );
  }

  const acceso = await exigirAcceso(
    ctx,
    asignacion.condominioId,
    "inventario.custodiar",
  );

  /* El elemento tiene que ser de la MISMA compañía por la que esta persona
   * supervisa el conjunto. */
  if (acceso.compania && acceso.compania._id !== item.companiaId) {
    throw new Error("Ese elemento no pertenece a tu compañía.");
  }

  return {
    item,
    asignacion,
    condominioId: asignacion.condominioId,
    user: acceso.user,
  };
}

/**
 * La compañía por la que esta persona supervisa el conjunto.
 *
 * Se saca del acceso y no de los argumentos. Para el personal de vigilancia
 * siempre existe; para el staff de plataforma —que tiene paso libre a todo
 * pero no pertenece a ninguna empresa— no hay compañía que deducir, y esta
 * pantalla no es la suya: la plataforma consulta el inventario desde la ficha
 * de la compañía. Se dice en vez de enseñar una lista vacía o, peor, la de
 * todas las empresas mezcladas.
 */
function exigirCompaniaDelAcceso(
  compania: Doc<"companiasSeguridad"> | null,
): Id<"companiasSeguridad"> {
  if (!compania) {
    throw new Error(
      "Esta vista es la del supervisor de una compañía. Consulta el inventario desde la ficha de la compañía.",
    );
  }
  return compania._id;
}

function exigirObservacion(bruto: string | undefined): string | undefined {
  const texto = normalizarTexto(bruto);
  if (texto && texto.length > MAX_OBSERVACION) {
    throw new Error(
      `La observación no puede superar ${MAX_OBSERVACION} caracteres.`,
    );
  }
  return texto;
}

// ─────────────────────────────────────────────────────────────
// Lectura
// ─────────────────────────────────────────────────────────────

/**
 * Los guardas a los que este supervisor puede entregar material hoy.
 *
 * Sale de `guardasDelConjunto`, la misma función que arma el equipo del
 * supervisor: comprueba la cadena entera —asignación, contrato, compañía,
 * miembro— y filtra por compañía, así que no puede ofrecer a un guarda de la
 * empresa de al lado que cubre la misma portería.
 */
export const guardasDisponibles = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    const acceso = await exigirAcceso(
      ctx,
      args.condominioId,
      "inventario.custodiar",
    );
    const companiaId = exigirCompaniaDelAcceso(acceso.compania);
    const guardas = await guardasDelConjunto(ctx, args.condominioId, companiaId);
    return guardas.map((g) => ({ userId: g.userId, nombre: g.nombre }));
  },
});

/**
 * El material que este conjunto tiene hoy, y en manos de quién.
 *
 * DOS lecturas indexadas para toda la pantalla, pase lo que pase:
 *   1. las custodias de conjunto abiertas de esta compañía en este conjunto;
 *   2. las custodias de guarda abiertas, indexadas por elemento.
 * Más una por elemento para hidratarlo, que es inevitable —son documentos
 * distintos— pero va en paralelo y no encadenada.
 *
 * Los guardas vigentes se resuelven UNA vez para todo el listado: es lo que
 * permite marcar los pendientes sin preguntar por cada fila.
 */
export const itemsDelCondominio = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    const acceso = await exigirAcceso(
      ctx,
      args.condominioId,
      "inventario.custodiar",
    );
    const companiaId = exigirCompaniaDelAcceso(acceso.compania);

    const asignaciones = await ctx.db
      .query("inventarioAsignaciones")
      .withIndex("by_compania_condominio_devuelta", (q) =>
        q
          .eq("companiaId", companiaId)
          .eq("condominioId", args.condominioId)
          .eq("devueltaEn", undefined),
      )
      .order("desc")
      .take(TOPE_CUSTODIAS + 1);

    const truncado = asignaciones.length > TOPE_CUSTODIAS;
    const enElConjunto = asignaciones.slice(0, TOPE_CUSTODIAS);

    const { porItem: custodias } = await custodiasGuardaDeCondominio(
      ctx,
      companiaId,
      args.condominioId,
      TOPE_CUSTODIAS,
    );

    /* Una sola resolución de "quién sigue asignado", no una por fila. */
    const vigentes = new Set(
      (await guardasDelConjunto(ctx, args.condominioId, companiaId)).map(
        (g) => g.userId,
      ),
    );
    const usuario = cacheDeUsuarios(ctx);

    const items = await Promise.all(
      enElConjunto.map((a) => ctx.db.get(a.itemId)),
    );

    const filas = await Promise.all(
      enElConjunto.map(async (a, i) => {
        const item = items[i];
        if (!item) return null;
        const c = custodias.get(item._id);
        return {
          itemId: item._id,
          nombre: item.nombre,
          serial: item.serial ?? null,
          descripcion: item.descripcion ?? null,
          fotoUrl: item.fotoUrl ?? null,
          /* El estado FÍSICO. No se mezcla con la custodia: un radio averiado
           * en manos de Juan tiene que poder decir las dos cosas. */
          estado: item.estado,
          asignadaEnElConjuntoDesde: a.asignadaEn,
          custodia: c
            ? await aVistaCustodiaGuarda(ctx, c, usuario, vigentes)
            : null,
        };
      }),
    );

    const utiles = filas.filter((f): f is NonNullable<typeof f> => f !== null);

    return {
      items: utiles.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
      truncado,
      /* Cuántos elementos están en manos de alguien que ya no cubre este
       * conjunto. Es el número que hay que mirar antes de cerrar un turno. */
      pendientes: utiles.filter((f) => f.custodia?.pendiente === true).length,
    };
  },
});

/** El historial de manos por las que ha pasado un elemento. */
export const historialDeItem = query({
  args: { itemId: v.id("inventarioItems") },
  handler: async (ctx, args) => {
    const { item, condominioId } = await exigirCadena(ctx, args.itemId);

    const acceso = await exigirAcceso(
      ctx,
      condominioId,
      "inventario.custodiar",
    );
    const companiaId = exigirCompaniaDelAcceso(acceso.compania);
    const vigentes = new Set(
      (await guardasDelConjunto(ctx, condominioId, companiaId)).map(
        (g) => g.userId,
      ),
    );

    const filas = await custodiasGuardaDeItem(ctx, item._id, TOPE_HISTORIAL);
    const usuario = cacheDeUsuarios(ctx);
    return await Promise.all(
      filas.map((c) => aVistaCustodiaGuarda(ctx, c, usuario, vigentes)),
    );
  },
});

// ─────────────────────────────────────────────────────────────
// Escritura
// ─────────────────────────────────────────────────────────────

/**
 * Entrega a un guarda un elemento que el conjunto ya tiene.
 *
 * Las comprobaciones, todas en el servidor y en este orden:
 *   1. el elemento existe y no está archivado;
 *   2. está asignado a un conjunto AHORA (si no, no hay nada que repartir);
 *   3. quien obra es supervisor de ESE conjunto;
 *   4. el elemento es de la compañía por la que lo supervisa;
 *   5. el guarda tiene asignación VIGENTE en ese conjunto, con rol de guarda,
 *      y por la misma compañía;
 *   6. el elemento no está ya en manos de otro guarda.
 *
 * El doble submit no necesita candado: la mutación es una transacción
 * serializable, así que la segunda llamada lee la custodia que abrió la
 * primera y se rechaza sola.
 */
export const entregar = mutation({
  args: {
    itemId: v.id("inventarioItems"),
    guardaUserId: v.id("users"),
    observacion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { item, asignacion, condominioId, user } = await exigirCadena(
      ctx,
      args.itemId,
    );

    /* La cadena entera del guarda, no solo su id.
     *
     * `asignacionVigente` comprueba asignación, contrato, compañía activa y
     * miembro no dado de baja: el mismo criterio con el que la portería le
     * deja entrar. Comprobar solo que existe el `userId` habría dejado
     * entregar material a alguien despedido la semana pasada. */
    const via = await asignacionVigente(ctx, args.guardaUserId, condominioId);
    if (!via) {
      throw new Error(
        "Esa persona no tiene una asignación vigente en este conjunto.",
      );
    }
    if (via.asignacion.rol !== "guardia") {
      throw new Error("Esa persona no está asignada como guarda aquí.");
    }
    /* Y de NUESTRA compañía: dos empresas pueden cubrir la misma portería, y
     * el material de una no se le entrega al personal de la otra. */
    if (via.asignacion.companiaId !== item.companiaId) {
      throw new Error("Ese guarda es de otra compañía.");
    }

    const yaLoTiene = await custodiaGuardaActiva(ctx, item._id);
    if (yaLoTiene) {
      const quien = await ctx.db.get(yaLoTiene.guardaUserId);
      throw new Error(
        yaLoTiene.guardaUserId === args.guardaUserId
          ? "Ese guarda ya tiene este elemento."
          : `Este elemento lo tiene ${quien?.name ?? "otro guarda"}. Regístrale la devolución antes de entregarlo.`,
      );
    }

    const observacion = exigirObservacion(args.observacion);
    const ahora = Date.now();
    const guarda = await ctx.db.get(args.guardaUserId);

    const custodiaId = await ctx.db.insert("inventarioCustodiaGuardas", {
      /* Cuelga de la custodia del conjunto: cerrarla invalida ésta sin tocar
       * una fila, igual que `asignaciones` cuelga del contrato. */
      inventarioAsignacionId: asignacion._id,
      itemId: item._id,
      companiaId: item.companiaId,
      condominioId,
      guardaUserId: args.guardaUserId,
      entregadaEn: ahora,
      entregadaPorUserId: user._id,
      ...(observacion ? { observacionEntrega: observacion } : {}),
      createdAt: ahora,
    });

    /* El mismo mecanismo de auditoría de las tareas 1 y 2, no uno nuevo. El
     * nombre del guarda va copiado dentro del texto —si se da de baja, la
     * línea tiene que seguir diciendo a quién se le entregó— y el id
     * estructurado va en `guardaUserId`, que la tarea 1 dejó declarado. */
    await logNovedadItem(ctx, {
      itemId: item._id,
      companiaId: item.companiaId,
      tipo: "ITEM_ASSIGNED_TO_GUARD",
      descripcion: observacion
        ? `Entregado al guarda ${guarda?.name ?? "(sin nombre)"}. ${observacion}`
        : `Entregado al guarda ${guarda?.name ?? "(sin nombre)"}.`,
      condominioId,
      guardaUserId: args.guardaUserId,
      actor: user,
    });

    return { custodiaId };
  },
});

/**
 * Recibe de vuelta un elemento que tenía un guarda.
 *
 * NO termina la asignación del elemento al conjunto: el radio vuelve al
 * cuarto de la portería, no a la bodega de la empresa. Después de esto el
 * elemento queda libre para entregárselo a otro guarda del mismo conjunto.
 *
 * A propósito NO exige que el guarda siga asignado. Si a Juan se le acabó el
 * contrato y aparece con el radio un mes después, recibírselo es exactamente
 * lo que hay que poder hacer; exigirlo dejaría el pendiente abierto para
 * siempre.
 */
export const recibir = mutation({
  args: {
    itemId: v.id("inventarioItems"),
    observacion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { item, user, condominioId } = await exigirCadena(ctx, args.itemId);

    const abierta = await custodiaGuardaActiva(ctx, item._id);
    /* Idempotente, igual que el resto del módulo: con dos pestañas abiertas,
     * el segundo clic no reescribe quién lo recibió ni añade otra línea. */
    if (!abierta) return { yaEstaba: true as const };

    const observacion = exigirObservacion(args.observacion);
    const guarda = await ctx.db.get(abierta.guardaUserId);
    const ahora = Date.now();

    await ctx.db.patch(abierta._id, {
      devueltaEn: ahora,
      devueltaPorUserId: user._id,
      ...(observacion ? { observacionDevolucion: observacion } : {}),
    });

    await logNovedadItem(ctx, {
      itemId: item._id,
      companiaId: item.companiaId,
      tipo: "ITEM_RETURNED_BY_GUARD",
      descripcion: observacion
        ? `Devuelto por el guarda ${guarda?.name ?? "(sin nombre)"}. ${observacion}`
        : `Devuelto por el guarda ${guarda?.name ?? "(sin nombre)"}.`,
      condominioId,
      guardaUserId: abierta.guardaUserId,
      actor: user,
    });

    return { yaEstaba: false as const, custodiaId: abierta._id };
  },
});

/**
 * Registra una novedad sobre el elemento. NO cambia su estado.
 *
 * Va al MISMO historial que todo lo demás. El modelo de la tarea 1 ya lo
 * soportaba entero —conjunto, guarda, actor, descripción, fecha— así que no
 * hace falta ni una tabla nueva ni un campo nuevo: solo un literal más en el
 * enum. Una segunda bitácora habría partido en dos la historia del elemento,
 * que es lo único que este módulo tiene que saber contar entero.
 *
 * Y NO toca `estado`, deliberadamente. "El radio presenta interferencia" es
 * una observación, no un diagnóstico; convertirla en `averiado` dejaría que
 * cualquiera sacara material de circulación con una frase. Los tres ejes
 * —evento, estado y custodia— siguen separados, igual que desde la tarea 1.
 *
 * Si hay un guarda con el elemento, la novedad queda ligada a él sin que haya
 * que decirlo: es la información que hace falta para reclamar después.
 */
export const registrarNovedad = mutation({
  args: {
    itemId: v.id("inventarioItems"),
    descripcion: v.string(),
  },
  handler: async (ctx, args) => {
    const { item, user, condominioId } = await exigirCadena(ctx, args.itemId);

    const descripcion = normalizarTexto(args.descripcion);
    if (!descripcion) throw new Error("Escribe la novedad.");
    if (descripcion.length > MAX_OBSERVACION) {
      throw new Error(
        `La novedad no puede superar ${MAX_OBSERVACION} caracteres.`,
      );
    }

    const abierta = await custodiaGuardaActiva(ctx, item._id);

    const novedadId = await logNovedadItem(ctx, {
      itemId: item._id,
      companiaId: item.companiaId,
      tipo: "ITEM_NOTE",
      descripcion,
      condominioId,
      ...(abierta ? { guardaUserId: abierta.guardaUserId } : {}),
      actor: user,
    });

    return { novedadId };
  },
});
