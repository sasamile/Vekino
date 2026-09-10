import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { contratoVigente, exigirAccesoCompania } from "./model/acceso";
import { logNovedadItem } from "./model/inventarioNovedad";
import {
  aVistaCustodia,
  aVistaCustodiaGuarda,
  cacheDeCondominios,
  cacheDeUsuarios,
  custodiaActiva,
  custodiaGuardaActiva,
  custodiasDeItem,
  custodiasGuardaDeCondominio,
} from "./model/inventarioCustodia";
import { MAX_OBSERVACION, normalizarTexto } from "./lib/inventario";
import { estaVigente } from "./lib/vigilancia";

/**
 * LA CUSTODIA DE UN ELEMENTO: entregarlo a un conjunto y recuperarlo.
 *
 * En archivo propio y no dentro de `inventario.ts` por la misma razón que
 * `asignaciones.ts` no vive dentro de `companias.ts`: es la relación entre dos
 * ejes —el inventario de la empresa y los conjuntos que atiende— y no un
 * detalle de ninguno de los dos.
 *
 * Quién manda: SOLO el administrador de la compañía, con la capacidad
 * `inventario.gestionar` que ya existe. No se crean capacidades nuevas —
 * entregar un radio es gestionar el inventario, no otra cosa—. El
 * administrador del conjunto que RECIBE el elemento no interviene: el radio
 * sigue siendo de la empresa y es ella quien responde por él.
 *
 * Lo que NO hay aquí, deliberadamente: nada de guardas. La custodia de un
 * guarda dentro del conjunto es la tarea 3 y colgará de estas filas.
 */

/** Tope de custodias abiertas que se leen de una vez. Coherente con `inventario.ts`. */
const TOPE_CUSTODIAS = 1000;

/** Cuántas filas de historial devuelve la ficha de un elemento. */
const TOPE_HISTORIAL = 100;

// ─────────────────────────────────────────────────────────────
// Comprobaciones
// ─────────────────────────────────────────────────────────────

/**
 * Lee el elemento y comprueba que quien pregunta puede gestionarlo.
 *
 * La compañía sale del DOCUMENTO, nunca de los argumentos: es la misma regla
 * de `inventario.ts:exigirItem`, y es lo que impide que el id de un elemento
 * ajeno se cuele acompañado del id de la propia compañía.
 */
async function exigirItemGestionable(
  ctx: QueryCtx | MutationCtx,
  itemId: Id<"inventarioItems">,
): Promise<{ item: Doc<"inventarioItems">; user: Doc<"users"> }> {
  const item = await ctx.db.get(itemId);
  if (!item) throw new Error("Elemento no encontrado.");
  const { user } = await exigirAccesoCompania(
    ctx,
    item.companiaId,
    "inventario.gestionar",
  );
  return { item, user };
}

/**
 * Recorta y acota una observación.
 *
 * Lanza en vez de truncar: guardar en silencio la mitad de lo que alguien
 * escribió sobre por qué un radio no volvió es peor que pedirle que lo
 * resuma.
 */
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
 * Los conjuntos a los que esta compañía puede entregar hoy.
 *
 * Sale de los CONTRATOS vigentes, que es lo único que significa "los
 * condominios de la compañía" en este dominio: un conjunto no pertenece a una
 * empresa de vigilancia, la empresa lo atiende mientras dure el contrato.
 *
 * Los inactivos se excluyen aquí y además se rechazan al asignar: el
 * desplegable no puede ofrecer algo que la mutación va a negar.
 */
export const condominiosAsignables = query({
  args: { companiaId: v.id("companiasSeguridad") },
  handler: async (ctx, args) => {
    await exigirAccesoCompania(ctx, args.companiaId, "inventario.gestionar");

    const contratos = await ctx.db
      .query("companiaContratos")
      .withIndex("by_compania", (q) => q.eq("companiaId", args.companiaId))
      .collect();

    const vigentes = contratos.filter((k) => estaVigente(k));
    const condominio = cacheDeCondominios(ctx);

    const filas = await Promise.all(
      vigentes.map(async (k) => {
        const c = await condominio(k.condominioId);
        if (!c || !c.isActive) return null;
        return {
          condominioId: c._id,
          nombre: c.name,
          contratoId: k._id,
        };
      }),
    );

    return filas
      .filter((f): f is NonNullable<typeof f> => f !== null)
      /* Un conjunto con dos contratos vigentes solapados no debería existir
       * —`companias.crearContrato` lo impide— pero si existiera, el
       * desplegable no puede mostrarlo dos veces. */
      .filter((f, i, todas) =>
        todas.findIndex((o) => o.condominioId === f.condominioId) === i,
      )
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  },
});

/**
 * Qué elementos tiene HOY un conjunto concreto.
 *
 * Por `by_compania_condominio_devuelta`: una lectura indexada que no toca el
 * inventario de la compañía. Preguntarlo recorriendo los elementos y mirando su
 * custodia costaría el inventario entero para responder por una sola portería.
 */
export const porCondominio = query({
  args: {
    companiaId: v.id("companiasSeguridad"),
    condominioId: v.id("condominios"),
  },
  handler: async (ctx, args) => {
    await exigirAccesoCompania(ctx, args.companiaId, "inventario.ver");

    /* Por (compañía, conjunto) y no solo por conjunto. Acotar la lectura con
     * el índice compartido y filtrar DESPUÉS por compañía se lleva las filas
     * más antiguas del conjunto, que pueden ser todas de la otra empresa: la
     * pantalla diría "no hay material aquí" teniéndolo. */
    const abiertas = await ctx.db
      .query("inventarioAsignaciones")
      .withIndex("by_compania_condominio_devuelta", (q) =>
        q
          .eq("companiaId", args.companiaId)
          .eq("condominioId", args.condominioId)
          .eq("devueltaEn", undefined),
      )
      .order("desc")
      .take(TOPE_CUSTODIAS + 1);

    const truncado = abiertas.length > TOPE_CUSTODIAS;
    const mias = abiertas.slice(0, TOPE_CUSTODIAS);

    const items = await Promise.all(mias.map((a) => ctx.db.get(a.itemId)));

    /* Quién tiene cada elemento DENTRO del conjunto.
     *
     * El administrador de la compañía no puede repartir material en una
     * portería —eso es del supervisor, que está allí— pero sí tiene que poder
     * ver dónde está el suyo: es su patrimonio y él responde por él. Consulta
     * sí, acción no.
     *
     * Una lectura indexada para todas las filas, no una por elemento. */
    const { porItem: enManos } = await custodiasGuardaDeCondominio(
      ctx,
      args.companiaId,
      args.condominioId,
      TOPE_CUSTODIAS,
    );
    const usuario = cacheDeUsuarios(ctx);

    const filas = (
      await Promise.all(
        mias.map(async (a, i) => {
          const item = items[i];
          if (!item) return null;
          const c = enManos.get(item._id);
          return {
            asignacionId: a._id,
            itemId: item._id,
            nombre: item.nombre,
            serial: item.serial ?? null,
            fotoUrl: item.fotoUrl ?? null,
            estado: item.estado,
            asignadaEn: a.asignadaEn,
            observacionAsignacion: a.observacionAsignacion ?? null,
            /* Sin marcar pendientes: quién sigue asignado al conjunto es una
             * pregunta del supervisor, y resolverla aquí costaría leer el
             * equipo de cada portería para pintar una lista. */
            custodiaGuarda: c
              ? await aVistaCustodiaGuarda(ctx, c, usuario)
              : null,
          };
        }),
      )
    )
      .filter((f): f is NonNullable<typeof f> => f !== null)
      .sort((a, b) => b.asignadaEn - a.asignadaEn);

    /* El recuento no puede presentarse como exacto si se quedó corto: es el
     * número con el que se cuadra un inventario. */
    return { items: filas, truncado };
  },
});

/**
 * Los conjuntos donde la compañía TIENE material hoy.
 *
 * Distinto de `condominiosAsignables`, y por eso no se derivan uno del otro:
 * aquel dice a dónde se PUEDE entregar (contrato vigente, conjunto activo);
 * éste dice dónde HAY algo. Se separan porque el caso interesante es
 * justamente el que a aquel se le escapa — material que quedó dentro cuando
 * el contrato terminó o el conjunto se dio de baja, que es la primera
 * pregunta al cerrar una relación comercial.
 *
 * Sale del mismo índice que ya sostiene el listado, así que no cuesta una
 * lectura nueva por conjunto.
 */
export const condominiosConMaterial = query({
  args: { companiaId: v.id("companiasSeguridad") },
  handler: async (ctx, args) => {
    await exigirAccesoCompania(ctx, args.companiaId, "inventario.ver");

    const abiertas = await ctx.db
      .query("inventarioAsignaciones")
      .withIndex("by_compania_devuelta", (q) =>
        q.eq("companiaId", args.companiaId).eq("devueltaEn", undefined),
      )
      .order("desc")
      .take(TOPE_CUSTODIAS);

    const cuantos = new Map<Id<"condominios">, number>();
    for (const a of abiertas) {
      cuantos.set(a.condominioId, (cuantos.get(a.condominioId) ?? 0) + 1);
    }

    const condominio = cacheDeCondominios(ctx);
    const filas = await Promise.all(
      [...cuantos].map(async ([condominioId, elementos]) => {
        const c = await condominio(condominioId);
        return {
          condominioId,
          nombre: c?.name ?? "(conjunto eliminado)",
          /* Para poder advertir de que ahí ya no se puede entregar más, pero
           * sí recuperar lo que quedó. */
          activo: c?.isActive ?? false,
          elementos,
        };
      }),
    );
    return filas.sort((a, b) => a.nombre.localeCompare(b.nombre));
  },
});

/**
 * El historial de custodias de un elemento.
 *
 * Complementa la línea de tiempo de novedades en vez de repetirla: las
 * novedades cuentan lo que pasó en prosa y en orden; esto da el dato
 * estructurado —salida, vuelta, quién y con qué observación— que hace falta
 * para cuadrar un inventario o reclamar un faltante.
 */
export const historialDeItem = query({
  args: { itemId: v.id("inventarioItems") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Elemento no encontrado.");
    await exigirAccesoCompania(ctx, item.companiaId, "inventario.ver");

    const filas = await custodiasDeItem(ctx, args.itemId, TOPE_HISTORIAL);
    const condominio = cacheDeCondominios(ctx);
    const usuario = cacheDeUsuarios(ctx);
    return await Promise.all(
      filas.map((a) => aVistaCustodia(ctx, a, condominio, usuario)),
    );
  },
});

// ─────────────────────────────────────────────────────────────
// Escritura
// ─────────────────────────────────────────────────────────────

/**
 * Entrega un elemento a un conjunto.
 *
 * Las seis comprobaciones van todas en el servidor, ninguna delegada a la
 * pantalla:
 *   1. quien obra puede gestionar el inventario DE ESA compañía;
 *   2. el elemento existe;
 *   3. el elemento no está archivado;
 *   4. la compañía atiende ese conjunto HOY (contrato vigente);
 *   5. el conjunto está activo;
 *   6. el elemento no está ya entregado en otro sitio.
 *
 * El doble submit no necesita nada especial: una mutación de Convex es una
 * transacción serializable, así que la segunda llamada lee la custodia que
 * abrió la primera y se rechaza sola. Lo que protege no es un candado, es que
 * la comprobación y la escritura ocurren dentro de la misma transacción.
 */
export const asignar = mutation({
  args: {
    itemId: v.id("inventarioItems"),
    condominioId: v.id("condominios"),
    observacion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { item, user } = await exigirItemGestionable(ctx, args.itemId);

    if (item.archivadoEn != null) {
      throw new Error(
        "Este elemento está archivado y no se puede entregar a un conjunto.",
      );
    }

    const condominio = await ctx.db.get(args.condominioId);
    if (!condominio) throw new Error("Conjunto no encontrado.");

    /* El contrato es lo que convierte "es un conjunto" en "es UN CONJUNTO
     * NUESTRO". Sin esto, el id de cualquier condominio del SaaS valdría, que
     * es exactamente la fuga de aislamiento que hay que cerrar. */
    const contrato = await contratoVigente(
      ctx,
      item.companiaId,
      args.condominioId,
      Date.now(),
    );
    if (!contrato) {
      throw new Error(
        "Tu compañía no tiene un contrato vigente con ese conjunto.",
      );
    }

    /* Un conjunto dado de baja no recibe material nuevo. Devolver desde uno
     * inactivo SÍ se permite —ver `devolver`—: hay que poder recuperar lo que
     * quedó dentro. */
    if (!condominio.isActive) {
      throw new Error("Ese conjunto está inactivo y no puede recibir elementos.");
    }

    const abierta = await custodiaActiva(ctx, item._id);
    if (abierta) {
      const dondeEsta = await ctx.db.get(abierta.condominioId);
      throw new Error(
        abierta.condominioId === args.condominioId
          ? `Este elemento ya está entregado en ${dondeEsta?.name ?? "ese conjunto"}.`
          : `Este elemento está entregado en ${dondeEsta?.name ?? "otro conjunto"}. Devuélvelo antes de asignarlo.`,
      );
    }

    const observacion = exigirObservacion(args.observacion);
    const ahora = Date.now();

    const asignacionId = await ctx.db.insert("inventarioAsignaciones", {
      itemId: item._id,
      companiaId: item.companiaId,
      condominioId: args.condominioId,
      contratoId: contrato._id,
      asignadaEn: ahora,
      asignadaPorUserId: user._id,
      ...(observacion ? { observacionAsignacion: observacion } : {}),
      createdAt: ahora,
    });

    /* El mismo mecanismo de auditoría de la tarea 1, no uno paralelo. El
     * nombre del conjunto va COPIADO dentro del texto: dentro de un año, si
     * lo renombran o lo borran, la línea tiene que seguir diciendo a dónde
     * fue. El id estructurado va aparte, en `condominioId`. */
    await logNovedadItem(ctx, {
      itemId: item._id,
      companiaId: item.companiaId,
      tipo: "ITEM_ASSIGNED_TO_CONDOMINIUM",
      descripcion: observacion
        ? `Entregado al conjunto ${condominio.name}. ${observacion}`
        : `Entregado al conjunto ${condominio.name}.`,
      condominioId: args.condominioId,
      actor: user,
    });

    return { asignacionId };
  },
});

/**
 * Recupera un elemento de un conjunto: cierra la custodia abierta.
 *
 * Se cierra la fila poniéndole `devueltaEn`; NO se borra ni se reescribe nada
 * de la salida. El ciclo compañía → A → compañía → B deja dos filas, y por eso
 * la pregunta "¿por dónde ha pasado?" tiene respuesta.
 *
 * A propósito NO exige contrato vigente ni conjunto activo: si el contrato se
 * acabó o el conjunto se dio de baja con material dentro, recuperarlo es
 * justamente lo que hay que poder hacer. Exigirlo dejaría radios atrapados en
 * el sistema para siempre.
 *
 * Recibe el elemento y no la asignación: quien pulsa "devolver" está mirando
 * un elemento, y resolver la custodia abierta aquí evita que el cliente pueda
 * mandar el id de una custodia que ya cerró otro.
 */
export const devolver = mutation({
  args: {
    itemId: v.id("inventarioItems"),
    observacion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { item, user } = await exigirItemGestionable(ctx, args.itemId);

    const abierta = await custodiaActiva(ctx, item._id);
    /* Idempotente, igual que `inventario.archivar`. Con dos pestañas abiertas
     * el segundo clic no puede reescribir quién la recibió ni correr la fecha,
     * ni añadir una segunda línea al historial. */
    if (!abierta) return { yaEstaba: true as const };

    /* NO se devuelve a la bodega lo que un guarda tiene en la mano.
     *
     * Cerrar la custodia del conjunto invalida la del guarda —cuelga de ella—
     * así que hacerlo con una abierta borraría del mapa un elemento que sigue
     * físicamente con una persona, y nadie volvería a preguntarle por él.
     * Primero se lo recibe el supervisor, y entonces vuelve. */
    const enManos = await custodiaGuardaActiva(ctx, item._id);
    if (enManos) {
      const guarda = await ctx.db.get(enManos.guardaUserId);
      throw new Error(
        `Este elemento lo tiene el guarda ${guarda?.name ?? "(sin nombre)"} en el conjunto. El supervisor debe registrarle la devolución antes de que el elemento vuelva a la compañía.`,
      );
    }

    const condominio = await ctx.db.get(abierta.condominioId);
    const observacion = exigirObservacion(args.observacion);
    const ahora = Date.now();

    await ctx.db.patch(abierta._id, {
      devueltaEn: ahora,
      devueltaPorUserId: user._id,
      ...(observacion ? { observacionDevolucion: observacion } : {}),
    });

    await logNovedadItem(ctx, {
      itemId: item._id,
      companiaId: item.companiaId,
      tipo: "ITEM_RETURNED_FROM_CONDOMINIUM",
      descripcion: observacion
        ? `Devuelto por el conjunto ${condominio?.name ?? "(conjunto eliminado)"}. ${observacion}`
        : `Devuelto por el conjunto ${condominio?.name ?? "(conjunto eliminado)"}.`,
      condominioId: abierta.condominioId,
      actor: user,
    });

    return { yaEstaba: false as const, asignacionId: abierta._id };
  },
});
