import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { exigirAccesoCompania } from "./model/acceso";
import { logNovedadItem, historialDeItem } from "./model/inventarioNovedad";
import { displayNameFromUser } from "./model/displayName";
import {
  MAX_DESCRIPCION,
  MAX_FILAS_IMPORTACION,
  MAX_NOMBRE,
  MAX_SERIAL,
  calcularCambios,
  normalizarSerial,
  normalizarTexto,
  resumirCambios,
  validarImportacion,
  type FilaCruda,
  type InformeImportacion,
} from "./lib/inventario";

/**
 * INVENTARIO DE UNA COMPAÑÍA DE VIGILANCIA.
 *
 * Los elementos físicos de la empresa —radios, linternas, chalecos— y todo lo
 * que les ha pasado.
 *
 * Quién manda sobre qué:
 *   - El inventario es de la COMPAÑÍA y lo lleva su administrador
 *     (`inventario.gestionar`). La plataforma tiene el paso libre de siempre.
 *   - El conjunto no pinta nada aquí. Un radio no pertenece a una portería:
 *     está en una, que es otra cosa, y esa es la tarea 2.
 *
 * NINGUNA función acepta `companiaId` del cliente cuando ya puede deducirlo
 * del documento sobre el que obra. Es la misma regla que `exigirAccesoContrato`
 * aplica a los contratos, y es la que impide que alguien edite un elemento
 * ajeno mandando el id de su propia compañía.
 */

/**
 * Cuántos elementos devuelve un listado como mucho.
 *
 * Convex tiene un tope de documentos leídos por consulta, y `collect()` sobre
 * el inventario de una compañía no lo respeta solo: una empresa grande dejaría
 * de poder abrir la pestaña, y el fallo llegaría como un error del runtime en
 * vez de como algo que se entienda. Con tope, la pantalla siempre carga y
 * avisa de que hay más; para encontrar uno concreto está el buscador, que
 * resuelve en el servidor sobre el mismo tope.
 */
const TOPE_LISTADO = 1000;

/** Igual, para los contadores de las pestañas. Se muestran como "2000+". */
const TOPE_CONTEO = 2000;

// ─────────────────────────────────────────────────────────────
// Ayudas internas
// ─────────────────────────────────────────────────────────────

/** Un elemento sigue de alta mientras no tenga fecha de archivo. */
function estaActivo(item: Doc<"inventarioItems">): boolean {
  return item.archivadoEn == null;
}

/**
 * Lee un elemento y comprueba, de una vez, que quien pregunta puede tocarlo.
 *
 * La compañía sale del DOCUMENTO, nunca de los argumentos: es lo único que
 * garantiza que el id de un elemento de otra empresa no se pueda colar
 * acompañado del id de la propia.
 */
async function exigirItem(
  ctx: QueryCtx | MutationCtx,
  itemId: Id<"inventarioItems">,
  capacidad: "inventario.ver" | "inventario.gestionar",
): Promise<{ item: Doc<"inventarioItems">; user: Doc<"users"> }> {
  const item = await ctx.db.get(itemId);
  if (!item) throw new Error("Elemento no encontrado.");
  const { user } = await exigirAccesoCompania(ctx, item.companiaId, capacidad);
  return { item, user };
}

/**
 * El elemento ACTIVO que ya usa ese serial en esta compañía, si lo hay.
 *
 * Solo entre los activos, a propósito: el serial de un radio dado de baja
 * queda libre. Lo contrario significaría que una compañía que renueva su
 * flota no puede volver a registrar los seriales que ya tuvo, y el histórico
 * —que es justo lo que el archivo conserva— pasaría a estorbar.
 *
 * Convex no tiene UNIQUE. La comprobación va aquí, en código, leyendo por
 * `by_compania_serial`, igual que el proyecto ya hace con `companiasSeguridad
 * .nit` y `users.email`. Y a diferencia de un SELECT en SQL, esto SÍ es
 * suficiente: la mutación entera es una transacción serializable, así que
 * entre la lectura y la escritura no se puede colar nadie.
 */
async function serialEnUso(
  ctx: QueryCtx | MutationCtx,
  companiaId: Id<"companiasSeguridad">,
  serial: string,
  exceptoItemId?: Id<"inventarioItems">,
): Promise<Doc<"inventarioItems"> | null> {
  const iguales = await ctx.db
    .query("inventarioItems")
    .withIndex("by_compania_serial", (q) =>
      q.eq("companiaId", companiaId).eq("serial", serial),
    )
    .collect();
  return (
    iguales.find((i) => estaActivo(i) && i._id !== exceptoItemId) ?? null
  );
}

/**
 * De los seriales que trae el archivo, cuáles están ya ocupados.
 *
 * Se pregunta por los del ARCHIVO y no se lee el inventario entero: el coste
 * queda acotado por el tamaño de la carga (500 filas como mucho) en vez de por
 * el tamaño de la bodega. Traer todos los seriales activos con `collect()`
 * parecía más barato —una sola consulta— pero es justo al revés: en una
 * compañía con miles de elementos revienta el tope de documentos por consulta
 * de Convex, y entonces la importación deja de funcionar del todo.
 *
 * Cada búsqueda va por `by_compania_serial`, así que es un salto de índice,
 * no un recorrido.
 */
async function serialesOcupados(
  ctx: QueryCtx | MutationCtx,
  companiaId: Id<"companiasSeguridad">,
  candidatos: ReadonlySet<string>,
): Promise<Set<string>> {
  const ocupados = new Set<string>();
  await Promise.all(
    [...candidatos].map(async (serial) => {
      if (await serialEnUso(ctx, companiaId, serial)) ocupados.add(serial);
    }),
  );
  return ocupados;
}

/** Los seriales distintos que trae el archivo, ya normalizados. */
function serialesDelArchivo(filas: readonly FilaCruda[]): Set<string> {
  const out = new Set<string>();
  for (const f of filas) {
    const s = normalizarSerial(f.serial);
    if (s) out.add(s);
  }
  return out;
}

function exigirLongitudes(args: {
  nombre: string;
  serial: string | null;
  descripcion: string | undefined;
}) {
  if (!args.nombre) throw new Error("El nombre es obligatorio.");
  if (args.nombre.length > MAX_NOMBRE) {
    throw new Error(`El nombre no puede superar ${MAX_NOMBRE} caracteres.`);
  }
  if (args.serial && args.serial.length > MAX_SERIAL) {
    throw new Error(`El serial no puede superar ${MAX_SERIAL} caracteres.`);
  }
  if (args.descripcion && args.descripcion.length > MAX_DESCRIPCION) {
    throw new Error(
      `La descripción no puede superar ${MAX_DESCRIPCION} caracteres.`,
    );
  }
}

/** La forma en que la pantalla consume un elemento. */
function aVista(item: Doc<"inventarioItems">) {
  return {
    _id: item._id,
    companiaId: item.companiaId,
    nombre: item.nombre,
    serial: item.serial ?? null,
    descripcion: item.descripcion ?? null,
    fotoUrl: item.fotoUrl ?? null,
    estado: item.estado,
    archivado: !estaActivo(item),
    archivadoEn: item.archivadoEn ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

// ─────────────────────────────────────────────────────────────
// Lectura
// ─────────────────────────────────────────────────────────────

/**
 * El inventario de una compañía. Activos o archivados, nunca mezclados.
 *
 * La separación se hace EN LA BASE con `by_compania_archivado` y no filtrando
 * en memoria: que un elemento dado de baja no salga entre los activos es una
 * regla del modelo, no una decisión de pintado — el mismo criterio que
 * `companias.listAll` aplica a las compañías archivadas.
 *
 * La búsqueda sí se resuelve en memoria sobre lo ya leído. Convex no tiene
 * índice de texto, y montar uno para el inventario de UNA compañía —cientos de
 * filas, no millones— sería complicar el modelo por un problema que no existe.
 * Una sola lectura indexada y ninguna consulta por elemento: sin N+1.
 */
export const listar = query({
  args: {
    companiaId: v.id("companiasSeguridad"),
    archivo: v.optional(v.union(v.literal("activos"), v.literal("archivados"))),
    busqueda: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await exigirAccesoCompania(ctx, args.companiaId, "inventario.ver");

    const archivados = args.archivo === "archivados";
    const items = await ctx.db
      .query("inventarioItems")
      .withIndex("by_compania_archivado", (q) =>
        archivados
          ? /* Los archivados llevan un timestamp; los activos no llevan campo,
             * y en el orden de Convex `undefined` va antes que cualquier
             * número. Así que "> 0" es exactamente "tiene fecha de archivo", y
             * las dos vistas salen del mismo índice sin leer la otra mitad. */
            q.eq("companiaId", args.companiaId).gt("archivadoEn", 0)
          : q.eq("companiaId", args.companiaId).eq("archivadoEn", undefined),
      )
      .order("desc")
      .take(TOPE_LISTADO + 1);

    const truncado = items.length > TOPE_LISTADO;
    if (truncado) items.length = TOPE_LISTADO;

    const q = normalizarTexto(args.busqueda)?.toLowerCase();
    const filtrados = q
      ? items.filter(
          (i) =>
            i.nombre.toLowerCase().includes(q) ||
            (i.serial ?? "").toLowerCase().includes(q) ||
            (i.descripcion ?? "").toLowerCase().includes(q),
        )
      : items;

    return {
      items: filtrados.map(aVista),
      /* Cuántos hay en esta vista antes de buscar, para poder decir "3 de 84"
       * sin que la pantalla tenga que recordar el total. */
      totalSinFiltrar: items.length,
      total: filtrados.length,
      /* La pantalla tiene que poder decir que no lo está enseñando todo. Callar
       * esto es peor que el propio tope: quien busca un elemento y no lo ve
       * concluye que no existe. */
      truncado,
    };
  },
});

/**
 * Cuántos elementos hay en cada pestaña.
 *
 * Convex no tiene una operación de conteo: contar es leer. Así que se lee cada
 * mitad por su índice y con tope, y se dice si el número se quedó corto — un
 * contador que miente es peor que uno que dice "2000+".
 */
export const conteos = query({
  args: { companiaId: v.id("companiasSeguridad") },
  handler: async (ctx, args) => {
    await exigirAccesoCompania(ctx, args.companiaId, "inventario.ver");

    const [activos, archivados] = await Promise.all([
      ctx.db
        .query("inventarioItems")
        .withIndex("by_compania_archivado", (q) =>
          q.eq("companiaId", args.companiaId).eq("archivadoEn", undefined),
        )
        .take(TOPE_CONTEO + 1),
      ctx.db
        .query("inventarioItems")
        .withIndex("by_compania_archivado", (q) =>
          q.eq("companiaId", args.companiaId).gt("archivadoEn", 0),
        )
        .take(TOPE_CONTEO + 1),
    ]);

    return {
      activos: Math.min(activos.length, TOPE_CONTEO),
      archivados: Math.min(archivados.length, TOPE_CONTEO),
      aproximado:
        activos.length > TOPE_CONTEO || archivados.length > TOPE_CONTEO,
    };
  },
});

/**
 * Un elemento con su historial completo.
 *
 * El nombre de quien obró va COPIADO en cada novedad, así que pintar cien
 * líneas de historial no cuesta cien lecturas de `users`. Es la razón de que
 * `inventarioNovedades.actorNombre` exista.
 */
export const detalle = query({
  args: {
    itemId: v.id("inventarioItems"),
    limiteHistorial: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { item } = await exigirItem(ctx, args.itemId, "inventario.ver");
    const novedades = await historialDeItem(
      ctx,
      item._id,
      Math.min(args.limiteHistorial ?? 100, 200),
    );

    const archivadoPor = item.archivadoPorUserId
      ? await ctx.db.get(item.archivadoPorUserId)
      : null;

    return {
      item: {
        ...aVista(item),
        archivadoPorNombre: archivadoPor
          ? displayNameFromUser(archivadoPor)
          : null,
      },
      historial: novedades.map((n) => ({
        _id: n._id,
        tipo: n.tipo,
        descripcion: n.descripcion,
        cambios: n.cambios ?? [],
        actorNombre: n.actorNombre,
        createdAt: n.createdAt,
      })),
    };
  },
});

// ─────────────────────────────────────────────────────────────
// Escritura
// ─────────────────────────────────────────────────────────────

export const crear = mutation({
  args: {
    companiaId: v.id("companiasSeguridad"),
    nombre: v.string(),
    serial: v.optional(v.string()),
    descripcion: v.optional(v.string()),
    fotoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await exigirAccesoCompania(
      ctx,
      args.companiaId,
      "inventario.gestionar",
    );

    const nombre = normalizarTexto(args.nombre) ?? "";
    const serial = normalizarSerial(args.serial);
    const descripcion = normalizarTexto(args.descripcion);
    const fotoUrl = normalizarTexto(args.fotoUrl);
    exigirLongitudes({ nombre, serial, descripcion });

    if (serial) {
      const choca = await serialEnUso(ctx, args.companiaId, serial);
      if (choca) {
        throw new Error(
          `Ya existe un elemento activo con el serial ${serial}: "${choca.nombre}".`,
        );
      }
    }

    const ahora = Date.now();
    const itemId = await ctx.db.insert("inventarioItems", {
      companiaId: args.companiaId,
      nombre,
      ...(serial ? { serial } : {}),
      ...(descripcion ? { descripcion } : {}),
      ...(fotoUrl ? { fotoUrl } : {}),
      /* Nace disponible y no lo elige nadie: hoy es el único valor posible.
       * El día que existan `averiado` o `mantenimiento` los moverá una
       * operación propia, no el formulario de alta. */
      estado: "disponible",
      creadoPorUserId: user._id,
      createdAt: ahora,
      updatedAt: ahora,
    });

    await logNovedadItem(ctx, {
      itemId,
      companiaId: args.companiaId,
      tipo: "ITEM_CREATED",
      descripcion: "Elemento creado en el inventario.",
      actor: user,
    });

    return itemId;
  },
});

/**
 * Edita un elemento.
 *
 * Semántica de FORMULARIO COMPLETO: lo que no venga se borra. La pantalla
 * manda siempre los cuatro campos, así que "ausente" solo puede significar
 * que el usuario vació la casilla. La alternativa —ausente = no tocar— haría
 * imposible quitar una descripción, que es una operación perfectamente
 * normal.
 *
 * No se puede editar un elemento archivado. Un registro dado de baja es un
 * hecho del pasado; retocarlo falsearía justo lo que el archivo conserva.
 */
export const editar = mutation({
  args: {
    itemId: v.id("inventarioItems"),
    nombre: v.string(),
    serial: v.optional(v.string()),
    descripcion: v.optional(v.string()),
    fotoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { item, user } = await exigirItem(
      ctx,
      args.itemId,
      "inventario.gestionar",
    );
    if (!estaActivo(item)) {
      /* No se ofrece "desarchivar" porque no existe: dar de baja un elemento es
       * definitivo en esta primera etapa, y el mensaje no puede prometer una
       * salida que la pantalla no tiene. Si más adelante hace falta reactivar,
       * la fila y su historial siguen enteros y solo hay que limpiar
       * archivadoEn, igual que hace companias.setEstado. */
      throw new Error(
        "Este elemento está archivado y ya no se puede editar. Su historial se conserva; si vuelve al servicio, regístralo como un elemento nuevo.",
      );
    }

    const nombre = normalizarTexto(args.nombre) ?? "";
    const serial = normalizarSerial(args.serial);
    const descripcion = normalizarTexto(args.descripcion);
    const fotoUrl = normalizarTexto(args.fotoUrl);
    exigirLongitudes({ nombre, serial, descripcion });

    if (serial) {
      const choca = await serialEnUso(ctx, item.companiaId, serial, item._id);
      if (choca) {
        throw new Error(
          `Ya existe un elemento activo con el serial ${serial}: "${choca.nombre}".`,
        );
      }
    }

    const despues = { nombre, serial, descripcion, fotoUrl };
    const cambios = calcularCambios(item, despues);

    /* Sin cambios no se escribe nada, ni fila ni novedad. Guardar dos veces
     * seguidas no debe dejar dos entradas idénticas en el historial: eso lo
     * vuelve ilegible justo cuando más se necesita. */
    if (cambios.length === 0) return { cambios: 0 };

    await ctx.db.patch(item._id, {
      nombre,
      serial: serial ?? undefined,
      descripcion,
      fotoUrl,
      actualizadoPorUserId: user._id,
      updatedAt: Date.now(),
    });

    await logNovedadItem(ctx, {
      itemId: item._id,
      companiaId: item.companiaId,
      tipo: "ITEM_UPDATED",
      descripcion: resumirCambios(cambios),
      cambios,
      actor: user,
    });

    return { cambios: cambios.length };
  },
});

/**
 * Archiva un elemento. NO hay borrado físico y no lo va a haber.
 *
 * La fila se queda, con la fecha y con quién ordenó la baja —igual que
 * `companiasSeguridad.archivadaEn` / `archivadaPorUserId`—, y su historial
 * entero sigue ahí: es exactamente lo que se consulta el día que aparece un
 * faltante y hay que reconstruir por dónde pasó el aparato.
 *
 * `motivo` es opcional y va al historial. Sin él, la línea dice que se
 * archivó pero no por qué, que es lo primero que se pregunta meses después.
 */
export const archivar = mutation({
  args: {
    itemId: v.id("inventarioItems"),
    motivo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { item, user } = await exigirItem(
      ctx,
      args.itemId,
      "inventario.gestionar",
    );
    /* Idempotente: archivar dos veces no reescribe la fecha ni añade una
     * segunda línea al historial. Con dos pestañas abiertas pasa. */
    if (!estaActivo(item)) return { yaEstaba: true };

    const motivo = normalizarTexto(args.motivo);
    const ahora = Date.now();

    await ctx.db.patch(item._id, {
      archivadoEn: ahora,
      archivadoPorUserId: user._id,
      updatedAt: ahora,
    });

    await logNovedadItem(ctx, {
      itemId: item._id,
      companiaId: item.companiaId,
      tipo: "ITEM_ARCHIVED",
      descripcion: motivo
        ? `Elemento archivado. Motivo: ${motivo}`
        : "Elemento archivado.",
      actor: user,
    });

    return { yaEstaba: false };
  },
});

// ─────────────────────────────────────────────────────────────
// Carga masiva
// ─────────────────────────────────────────────────────────────

const filaValidator = v.object({
  nombre: v.optional(v.string()),
  serial: v.optional(v.string()),
  descripcion: v.optional(v.string()),
  fotoUrl: v.optional(v.string()),
});

function exigirArchivoUsable(filas: readonly unknown[]) {
  if (filas.length === 0) {
    throw new Error(
      "El archivo no tiene ninguna fila con datos debajo de los encabezados.",
    );
  }
  if (filas.length > MAX_FILAS_IMPORTACION) {
    throw new Error(
      `El archivo trae ${filas.length} filas y el máximo por carga es ${MAX_FILAS_IMPORTACION}. Pártelo en varios archivos.`,
    );
  }
}

/**
 * Revisa el archivo SIN escribir nada y explica fila por fila qué falla.
 *
 * Existe para que el administrador vea las cuatro filas malas de cien antes
 * de decidir, en vez de descubrirlas cuando ya entraron noventa y seis. La
 * validación es la misma función pura que usa la escritura —`validarImportacion`—
 * así que la previsualización no puede mentir sobre lo que va a pasar.
 */
export const previsualizarImportacion = query({
  args: {
    companiaId: v.id("companiasSeguridad"),
    filas: v.array(filaValidator),
  },
  handler: async (ctx, args): Promise<InformeImportacion> => {
    await exigirAccesoCompania(ctx, args.companiaId, "inventario.gestionar");
    exigirArchivoUsable(args.filas);
    const filas = args.filas as FilaCruda[];
    const ocupados = await serialesOcupados(
      ctx,
      args.companiaId,
      serialesDelArchivo(filas),
    );
    return validarImportacion(filas, ocupados);
  },
});

/**
 * Carga el archivo. TODO O NADA, por construcción.
 *
 * Una mutación de Convex es una transacción: o se confirma entera o no se
 * confirma nada. No existe el estado a medias en el que entraron cuarenta
 * elementos y el resto se perdió sin que nadie sepa cuáles.
 *
 * Dos modos, y el estricto es el de por omisión:
 *   - estricto (`omitirInvalidas: false`): si hay una sola fila mala NO se
 *     escribe nada y se devuelve el informe completo. La respuesta a "hay 4
 *     filas malas de 100" es la lista de las 4 con su motivo, no un error.
 *   - tolerante (`omitirInvalidas: true`): entran las buenas y se devuelve el
 *     detalle de las descartadas. Lo elige el usuario a la vista del informe,
 *     nunca por defecto.
 *
 * Se revalida aquí aunque la pantalla ya haya previsualizado: entre una cosa
 * y otra pudo crearse un elemento con uno de esos seriales, y el cliente no
 * es fuente de verdad de nada.
 */
export const importar = mutation({
  args: {
    companiaId: v.id("companiasSeguridad"),
    filas: v.array(filaValidator),
    omitirInvalidas: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await exigirAccesoCompania(
      ctx,
      args.companiaId,
      "inventario.gestionar",
    );
    exigirArchivoUsable(args.filas);

    const filas = args.filas as FilaCruda[];
    const ocupados = await serialesOcupados(
      ctx,
      args.companiaId,
      serialesDelArchivo(filas),
    );
    const informe = validarImportacion(filas, ocupados);

    if (informe.validas === 0) {
      /* Nada que hacer. Se devuelve el informe en vez de lanzar: el usuario
       * necesita ver POR QUÉ no sirve ninguna, y un throw solo le daría una
       * frase. */
      return { aplicado: false, importados: 0, informe };
    }
    if (informe.invalidas > 0 && !args.omitirInvalidas) {
      return { aplicado: false, importados: 0, informe };
    }

    const ahora = Date.now();
    let importados = 0;

    for (const fila of informe.filas) {
      if (fila.estado !== "valida") continue;
      const { item } = fila;

      const itemId = await ctx.db.insert("inventarioItems", {
        companiaId: args.companiaId,
        nombre: item.nombre,
        ...(item.serial ? { serial: item.serial } : {}),
        ...(item.descripcion ? { descripcion: item.descripcion } : {}),
        ...(item.fotoUrl ? { fotoUrl: item.fotoUrl } : {}),
        estado: "disponible",
        creadoPorUserId: user._id,
        createdAt: ahora,
        updatedAt: ahora,
      });

      await logNovedadItem(ctx, {
        itemId,
        companiaId: args.companiaId,
        tipo: "ITEM_IMPORTED",
        /* Se guarda la fila del Excel de la que salió. Cuando aparezcan
         * doscientos elementos iguales, esto es lo que permite volver al
         * archivo y ver de dónde vino cada uno. */
        descripcion: `Elemento cargado desde archivo de Excel (fila ${fila.fila}).`,
        actor: user,
      });

      importados += 1;
    }

    return { aplicado: true, importados, informe };
  },
});
