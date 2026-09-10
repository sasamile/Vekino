import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import { acotado, estaVigente, haySolape, type Rango } from "../lib/vigilancia";
import { displayNameFromUser } from "./displayName";

type Ctx = QueryCtx | MutationCtx;

/**
 * EL EJE DE SEGURIDAD, EN UNA HOJA.
 *
 * Vive aparte de `model/acceso.ts` porque `model/authz.ts` también necesita
 * resolver una asignación —el guarda de compañía tiene que pasar por
 * `requireCondominioRole` igual que el guarda propio del conjunto— y
 * `acceso.ts` ya depende de `authz.ts`. Importarlo al revés cerraría un ciclo.
 * Aquí no se importa nada del proyecto salvo las cuentas de vigencia y el
 * formateo de nombres —ambos hojas, sin dependencias—, así que los dos lados
 * pueden colgarse de este archivo sin enredo.
 */

/**
 * Un lector de documentos que no relee el mismo dos veces.
 *
 * Guarda la PROMESA y no el valor. Con `set(id, await get(id))` el `await`
 * suspende antes de escribir en el mapa, así que dentro de un `Promise.all`
 * todos comprueban `has()` a la vez, todos fallan y todos leen: el caché solo
 * deduplicaría si se le llamara en serie. Es un error que este proyecto ya
 * pagó una vez.
 */
function cacheDoc<T extends TableNames>(ctx: Ctx) {
  const visto = new Map<Id<T>, Promise<Doc<T> | null>>();
  return (id: Id<T>): Promise<Doc<T> | null> => {
    if (!visto.has(id)) visto.set(id, ctx.db.get(id));
    return visto.get(id)!;
  };
}

/**
 * Los cuatro documentos que hacen falta para juzgar una asignación.
 *
 * Se comparte entre todas las asignaciones de una misma consulta porque los
 * cincuenta guardas de una portería cuelgan del MISMO contrato y de la MISMA
 * compañía: sin caché eran cien lecturas de dos documentos.
 */
export function cacheDeCadena(ctx: Ctx) {
  return {
    contrato: cacheDoc<"companiaContratos">(ctx),
    compania: cacheDoc<"companiasSeguridad">(ctx),
    miembro: cacheDoc<"companiaMiembros">(ctx),
    usuario: cacheDoc<"users">(ctx),
  };
}

export type CacheDeCadena = ReturnType<typeof cacheDeCadena>;

/**
 * LOS CUATRO ESLABONES, EN UN SOLO SITIO.
 *
 * Asignación vigente → contrato vigente → compañía activa → miembro no dado
 * de baja. Es EL criterio del eje de seguridad, y existe como función propia
 * justamente para que no haya dos versiones: la cabecera de este archivo
 * avisa de que tenerlo repetido es cómo se abren los agujeros por los que
 * alguien sigue entrando a un conjunto que ya no cubre.
 *
 * Recibe la fila ya leída —quien pregunta por un conjunto entero ya las tiene
 * todas— y los lectores cacheados, para poder resolver cincuenta a la vez sin
 * releer lo mismo cincuenta veces.
 */
async function cadenaVigente(
  a: Doc<"asignaciones">,
  ahora: number,
  cache: CacheDeCadena,
): Promise<{
  contrato: Doc<"companiaContratos">;
  compania: Doc<"companiasSeguridad">;
} | null> {
  if (!estaVigente(a, ahora)) return null;

  const contrato = await cache.contrato(a.contratoId);
  if (!contrato || !estaVigente(contrato, ahora)) return null;

  const compania = await cache.compania(a.companiaId);
  if (!compania || compania.estado !== "activa") return null;

  const miembro = await cache.miembro(a.companiaMiembroId);
  if (!miembro || !miembro.isActive) return null;

  return { contrato, compania };
}

/**
 * La asignación con la que esta persona puede operar hoy en este conjunto.
 *
 * Devuelve null en cuanto falla cualquier eslabón de la cadena: compañía
 * suspendida, miembro dado de baja, contrato vencido o asignación terminada.
 * Todo se comprueba al leer, así que el corte es exacto y no depende de que
 * ningún proceso se haya ejecutado.
 */
export async function asignacionVigente(
  ctx: Ctx,
  userId: Id<"users">,
  condominioId: Id<"condominios">,
  ahora: number = Date.now(),
): Promise<{
  asignacion: Doc<"asignaciones">;
  contrato: Doc<"companiaContratos">;
  compania: Doc<"companiasSeguridad">;
} | null> {
  const candidatas = await ctx.db
    .query("asignaciones")
    .withIndex("by_user_condominio", (q) =>
      q.eq("userId", userId).eq("condominioId", condominioId),
    )
    .collect();

  const cache = cacheDeCadena(ctx);
  for (const asignacion of candidatas) {
    const via = await cadenaVigente(asignacion, ahora, cache);
    if (via) return { asignacion, ...via };
  }
  return null;
}

/**
 * Los guardas que HOY cubren un conjunto por cuenta de una compañía.
 *
 * Vive aquí y no dentro de `asignaciones.ts` porque la usan dos módulos: el
 * equipo del supervisor y la custodia del inventario. Es exactamente el caso
 * del que avisa la cabecera de este archivo — tener el criterio de vigencia
 * en dos sitios es cómo se abre el agujero por el que alguien entrega un
 * radio a un guarda que ya no trabaja allí.
 *
 * Filtra por compañía A PROPÓSITO y no por comodidad: dos empresas pueden
 * cubrir la misma portería, y "está asignado a este conjunto" no implica "es
 * de los nuestros". Sin este filtro, el material de una empresa podría acabar
 * en manos del personal de la otra.
 *
 * Comprueba la MISMA cadena que `asignacionVigente` —es la misma función—
 * pero sobre las filas que ya trajo el índice y con los lectores compartidos:
 * los cincuenta guardas de una portería cuelgan del mismo contrato y de la
 * misma compañía, así que sin caché eran cien lecturas de dos documentos, y
 * en serie. Con caché y en paralelo, dos lecturas y un salto.
 */
export async function guardasDelConjunto(
  ctx: Ctx,
  condominioId: Id<"condominios">,
  companiaId: Id<"companiasSeguridad">,
) {
  const filas = await ctx.db
    .query("asignaciones")
    .withIndex("by_condominio_rol", (q) =>
      q.eq("condominioId", condominioId).eq("rol", "guardia"),
    )
    .collect();

  const cache = cacheDeCadena(ctx);
  const ahora = Date.now();

  /* Se juzga CADA fila, no "¿tiene esta persona alguna asignación vigente
   * aquí?". Preguntar lo segundo hacía que alguien con dos filas en el mismo
   * conjunto —una vencida y otra viva— apareciera DOS VECES en el listado y
   * en el desplegable de entrega. */
  const resueltas = await Promise.all(
    filas
      .filter((a) => a.companiaId === companiaId)
      .map(async (a) => {
        if (!(await cadenaVigente(a, ahora, cache))) return null;
        const u = await cache.usuario(a.userId);
        if (!u || !u.active) return null;
        return {
          asignacionId: a._id,
          userId: u._id,
          nombre: displayNameFromUser(u),
          email: u.email,
          telefono: u.telefono ?? null,
          vigenciaDesde: a.vigenciaDesde,
          vigenciaHasta: a.vigenciaHasta ?? null,
        };
      }),
  );

  /* Una persona, una entrada.
   *
   * `asignacionEstorba` impide por API crear dos asignaciones solapadas, pero
   * una fila llegada de otro modo haria aparecer al mismo guarda dos veces en
   * el desplegable de entrega — dos opciones identicas, y quien las mira sin
   * saber cual elegir. Se queda la primera por orden del indice. */
  const vistos = new Set<Id<"users">>();
  return resueltas
    .filter((g): g is NonNullable<typeof g> => g !== null)
    .filter((g) => {
      if (vistos.has(g.userId)) return false;
      vistos.add(g.userId);
      return true;
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Una asignación vigente, con lo que hace falta para pintarla y rutear. */
export type MiAsignacion = {
  asignacionId: Id<"asignaciones">;
  condominioId: Id<"condominios">;
  condominioNombre: string;
  condominioLogo: string | null;
  condominioColor: string | null;
  companiaId: Id<"companiasSeguridad">;
  companiaNombre: string;
  rol: Doc<"asignaciones">["rol"];
  vigenciaHasta: number | null;
};

/**
 * Dónde trabaja hoy una persona por la vía de una compañía.
 *
 * Es LA consulta del arranque de sesión del personal de vigilancia, y por eso
 * está aquí y no dentro de una función de Convex: la usan `users.me` (para
 * saber a dónde mandar a quien acaba de entrar), `condominios.listMine` (para
 * que el conjunto aparezca en el selector) y `asignaciones.misAsignaciones`.
 * Tenerla en tres sitios con tres criterios de vigencia distintos es
 * exactamente cómo se abren los agujeros por los que alguien sigue viendo un
 * conjunto que ya no cubre.
 *
 * Filtra la cadena entera —asignación, contrato, compañía, conjunto— porque
 * mostrar un conjunto al que la portería le va a rebotar es peor que no
 * mostrarlo.
 */
export async function misAsignacionesVigentes(
  ctx: Ctx,
  userId: Id<"users">,
  ahora: number = Date.now(),
): Promise<MiAsignacion[]> {
  const filas = await ctx.db
    .query("asignaciones")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const salida: MiAsignacion[] = [];
  for (const a of filas) {
    if (!estaVigente(a, ahora)) continue;

    const contrato = await ctx.db.get(a.contratoId);
    if (!contrato || !estaVigente(contrato, ahora)) continue;
    const compania = await ctx.db.get(a.companiaId);
    if (!compania || compania.estado !== "activa") continue;
    const miembro = await ctx.db.get(a.companiaMiembroId);
    if (!miembro || !miembro.isActive) continue;
    const condo = await ctx.db.get(a.condominioId);
    if (!condo || !condo.isActive) continue;

    salida.push({
      asignacionId: a._id,
      condominioId: a.condominioId,
      condominioNombre: condo.name,
      condominioLogo: condo.logo ?? null,
      condominioColor: condo.primaryColor ?? null,
      companiaId: a.companiaId,
      companiaNombre: compania.nombre,
      rol: a.rol,
      vigenciaHasta: a.vigenciaHasta ?? null,
    });
  }

  return salida.sort((a, b) =>
    a.condominioNombre.localeCompare(b.condominioNombre, "es"),
  );
}

/**
 * Si una asignacion ya existente choca DE VERDAD con una ventana nueva.
 *
 * ── Por que no basta con mirar las fechas ────────────────────────────────
 * Porque en este modelo el significado de una fila no esta en la fila. Una
 * asignacion cuelga del contrato y del miembro precisamente para que
 * terminar el contrato o dar de baja a la persona la invaliden sin tocarla:
 * lo dice el esquema y lo aplica `asignacionVigente` al leer. Terminar un
 * contrato NO le pone fecha de fin a sus asignaciones, a proposito.
 *
 * De modo que una asignacion vieja, sin `vigenciaHasta`, bajo un contrato
 * terminado hace meses, leida sola parece abierta e infinita. Y asi es como
 * un guarda registrado en una compania de pruebas —contrato terminado, baja
 * dada— quedaba bloqueado para siempre en el conjunto: la comprobacion de
 * solape miraba la fila cruda mientras el resto del sistema miraba la cadena.
 *
 * Esta funcion comprueba los mismos cuatro eslabones que `asignacionVigente`
 * —asignacion, contrato, compania, miembro— y vive pegada a ella para que no
 * vuelvan a separarse. Si una asignacion no puede dar acceso, no puede
 * estorbar: no hay nadie ahi con quien chocar.
 *
 * ── Lo que SIGUE bloqueando ──────────────────────────────────────────────
 * Dos asignaciones vivas a la misma porteria a la vez, aunque las traiga otra
 * compania. No se filtra por `companiaId`: la misma persona no puede cubrir
 * dos veces el mismo puesto a la misma hora, y de quien la contrate no
 * depende. Acotar por compania habria hecho pasar este caso, si, pero
 * abriendo justo ese agujero.
 */
export async function asignacionEstorba(
  ctx: Ctx,
  previa: Doc<"asignaciones">,
  nueva: Rango,
): Promise<boolean> {
  /* Lo barato primero. Acotar por el contrato solo puede ENCOGER la ventana,
   * asi que si las fechas crudas ya no se pisan no hay nada que ir a leer, y
   * el caso normal no cuesta una sola consulta. */
  if (!haySolape(previa, nueva)) return false;

  /* Sin contrato no ampara nada. No deberia pasar; si pasa, la fila esta
   * huerfana y no es motivo para bloquear a nadie. */
  const contrato = await ctx.db.get(previa.contratoId);
  if (!contrato) return false;
  if (!haySolape(acotado(previa, contrato), nueva)) return false;

  const compania = await ctx.db.get(previa.companiaId);
  if (!compania || compania.estado !== "activa") return false;

  const miembro = await ctx.db.get(previa.companiaMiembroId);
  if (!miembro || !miembro.isActive) return false;

  return true;
}
