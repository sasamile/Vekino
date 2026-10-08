import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { estadoCarga } from "../lib/estadoFactura";
import type { Tocada } from "./estadoFactura";

/**
 * EL ÚNICO ESCRITOR DE FACTURAS (Fase 3 de la auditoría de facturación, F-11).
 *
 * Había cinco rutas que insertaban o actualizaban facturas, cada una con su
 * regla: la subida de PDF (`bulkUpsert`) buscaba por (unidad, período); la
 * migración (`migrations.bulkFacturas`) solo por `legacyId` —y duplicaba lo
 * que ya había subido la web—; el script (`upsertFactura`) y la migración
 * pisaban el estado con el "pendiente" que mandan siempre; la alta manual
 * fallaba si existía. Ahora todas pasan por aquí:
 *
 *   · La identidad es una: (conjunto, unidad, período), por el índice
 *     `by_condominio_unidad_periodo`. El `legacyId` solo desempata.
 *   · Aquí NUNCA se escribe `estado`. Se escriben los números del documento;
 *     el estado lo calcula `model/estadoFactura.ts` (`recalcularCadena`), que
 *     quien llama ejecuta después por cada unidad tocada.
 *   · Lo que se escribe vuelve como `Tocada`, para que la bitácora diga qué
 *     hizo cada operación en cada factura.
 */

export type OrigenFactura = NonNullable<Doc<"facturas">["origen"]>;

/** Lo que trae el documento: lo que una carga escribe. */
export type DocumentoFactura = {
  numeroFactura: string;
  numeroInterno: string;
  periodoLabel: string;
  residenteNombre: string;
  apto?: string;
  vrAdmon: number;
  lineas: Doc<"facturas">["lineas"];
  saldoAFavor: number;
  totalAPagar: number;
  totalConDescuento?: number;
  saldoAnteriorDocumento?: number;
  fechaLimiteDescuento?: number;
  pdfUrl?: string;
};

export type EntradaFactura = DocumentoFactura & {
  condominioId: Id<"condominios">;
  unidadId: Id<"unidades">;
  periodo: string;
  membershipId?: Id<"memberships">;
  fechaEmision: number;
  fechaVencimiento: number;
  legacyId?: string;
  importacionId?: Id<"importaciones">;
  /** La marca de esta lectura (cargas de PDF). `undefined`: la lectura cuadra. */
  lecturaDudosa?: Doc<"facturas">["lecturaDudosa"];
  origen: OrigenFactura;
  /**
   * Solo al insertar, y solo la migración: el estado que traía la factura en
   * el sistema anterior, si era un juicio (pagada, abonada, vencida). Se
   * guarda como veredicto `heredado` —una inferencia, no evidencia— y lo
   * reemplaza el de la factura siguiente en cuanto se pueda juzgar.
   */
  veredictoHeredado?: "pagada" | "abonada" | "vencida";
};

export type SiExiste = "omitir" | "actualizar" | "error";

export type Escritura =
  | { accion: "insertada"; facturaId: Id<"facturas">; tocada: Tocada }
  | { accion: "actualizada"; facturaId: Id<"facturas">; tocada: Tocada | null }
  | { accion: "omitida"; facturaId: Id<"facturas"> }
  /** Dos facturas comparten la identidad: no se adivina cuál es. */
  | { accion: "ambigua" }
  /** El `legacyId` ya es de otra factura, con otra identidad. */
  | { accion: "conflicto_legacy"; facturaId: Id<"facturas"> };

const DETALLE_CREADA: Record<OrigenFactura, string> = {
  pdf: "Creada por la carga del PDF.",
  manual: "Creada a mano por la administración.",
  migracion: "Creada por la migración.",
  script: "Creada por un script de importación.",
};

const DETALLE_ACTUALIZADA: Record<OrigenFactura, string> = {
  pdf: "Actualizada con una nueva carga del PDF",
  manual: "Actualizada a mano",
  migracion: "Actualizada por la migración",
  script: "Actualizada por un script de importación",
};

/** Los campos del documento que se comparan y se escriben al actualizar. */
const CAMPOS_DOCUMENTO = [
  "numeroFactura",
  "numeroInterno",
  "periodoLabel",
  "residenteNombre",
  "apto",
  "vrAdmon",
  "lineas",
  "saldoAFavor",
  "totalAPagar",
  "totalConDescuento",
  "saldoAnteriorDocumento",
  "fechaLimiteDescuento",
  "pdfUrl",
] as const;

/**
 * Campos que una carga sin ellos NO borra: un script que no manda el PDF o el
 * apartamento no le quita a la factura el que ya tenía.
 */
const SOLO_SI_VIENEN: ReadonlySet<string> = new Set(["apto", "pdfUrl"]);

/** JSON con las llaves ordenadas y sin las `undefined`: compara contenido, no orden. */
function canonico(x: unknown): string {
  if (x === undefined || x === null) return "null";
  if (Array.isArray(x)) return `[${x.map(canonico).join(",")}]`;
  if (typeof x === "object") {
    return `{${Object.entries(x as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonico(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(x);
}

function igual(a: unknown, b: unknown): boolean {
  return canonico(a) === canonico(b);
}

/** La identidad de una factura: la de (conjunto, unidad, período). */
export async function facturasDeIdentidad(
  ctx: MutationCtx,
  condominioId: Id<"condominios">,
  unidadId: Id<"unidades">,
  periodo: string,
): Promise<Doc<"facturas">[]> {
  return await ctx.db
    .query("facturas")
    .withIndex("by_condominio_unidad_periodo", (q) =>
      q.eq("condominioId", condominioId).eq("unidadId", unidadId).eq("periodo", periodo),
    )
    .collect();
}

/**
 * Inserta o actualiza una factura por su identidad.
 *
 * `siExiste` decide qué hacer si ya hay una: omitirla, actualizar sus números
 * o fallar. Puede ser una función de la existente (la migración solo
 * actualiza lo que ella misma creó). Una factura `manual` siempre la
 * reemplaza el PDF del mismo período, aunque se haya pedido "solo nuevas":
 * era un sustituto mientras llegaba el documento.
 *
 * Opciones:
 *   · `conLectura`: la marca de lectura dudosa se reemplaza por la de esta
 *     lectura (una lectura que cuadra la quita). Solo las cargas de PDF.
 *   · `conFechas`: también la emisión y el vencimiento. La migración y los
 *     scripts traen los suyos; una re-carga de PDF no re-fecha (el
 *     vencimiento nuevo es solo para lo que entra desde la Fase 3).
 *   · `soloDefinidos`: un campo que no viene no borra el guardado (la
 *     migración no trae, p. ej., el saldo anterior del documento).
 */
export async function escribirFactura(
  ctx: MutationCtx,
  e: EntradaFactura,
  opciones: {
    siExiste: SiExiste | ((existente: Doc<"facturas">) => SiExiste);
    conLectura?: boolean;
    conFechas?: boolean;
    soloDefinidos?: boolean;
  },
): Promise<Escritura> {
  const mismas = await facturasDeIdentidad(ctx, e.condominioId, e.unidadId, e.periodo);
  let existente: Doc<"facturas"> | null = null;
  if (mismas.length === 1) existente = mismas[0]!;
  else if (mismas.length > 1) {
    existente = (e.legacyId ? mismas.find((f) => f.legacyId === e.legacyId) : undefined) ?? null;
    if (!existente) return { accion: "ambigua" };
  }

  const ahora = Date.now();

  if (!existente) {
    if (e.legacyId) {
      const conLegacy = await ctx.db
        .query("facturas")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", e.legacyId))
        .first();
      if (conLegacy) return { accion: "conflicto_legacy", facturaId: conLegacy._id };
    }
    const { lecturaDudosa, veredictoHeredado, ...resto } = e;
    const facturaId = await ctx.db.insert("facturas", {
      ...resto,
      ...(lecturaDudosa ? { lecturaDudosa } : {}),
      ...(veredictoHeredado
        ? { veredictoContable: { estado: veredictoHeredado, motivo: "heredado" as const, at: ahora } }
        : {}),
      /* El de carga. `recalcularCadena` le pone el definitivo. */
      estado: estadoCarga(e),
      createdAt: ahora,
      updatedAt: ahora,
    });
    return {
      accion: "insertada",
      facturaId,
      tocada: { creada: true, detalle: DETALLE_CREADA[e.origen] },
    };
  }

  const siExiste =
    typeof opciones.siExiste === "function" ? opciones.siExiste(existente) : opciones.siExiste;
  const reemplazaManual = existente.origen === "manual" && e.origen === "pdf";
  if (siExiste === "error" && !reemplazaManual) {
    throw new Error("Ya existe una factura para esta unidad en ese período.");
  }
  if (siExiste === "omitir" && !reemplazaManual) {
    return { accion: "omitida", facturaId: existente._id };
  }

  const parche: Record<string, unknown> = {};
  const cambios: { campo: string; antes: unknown; despues: unknown }[] = [];
  const poner = (campo: string, valor: unknown) => {
    const antes = (existente as Record<string, unknown>)[campo];
    if (igual(antes, valor)) return;
    parche[campo] = valor;
    cambios.push({ campo, antes, despues: valor });
  };

  for (const campo of CAMPOS_DOCUMENTO) {
    const valor = e[campo];
    if (valor === undefined && (opciones.soloDefinidos || SOLO_SI_VIENEN.has(campo))) continue;
    poner(campo, valor);
  }
  if (opciones.conLectura) poner("lecturaDudosa", e.lecturaDudosa);
  if (opciones.conFechas || reemplazaManual) {
    poner("fechaEmision", e.fechaEmision);
    poner("fechaVencimiento", e.fechaVencimiento);
  }
  if (e.membershipId) poner("membershipId", e.membershipId);
  if (e.legacyId && !existente.legacyId) poner("legacyId", e.legacyId);
  if (e.importacionId) poner("importacionId", e.importacionId);
  if (reemplazaManual) poner("origen", "pdf");

  if (cambios.length === 0) {
    return { accion: "actualizada", facturaId: existente._id, tocada: null };
  }
  await ctx.db.patch(existente._id, { ...parche, updatedAt: ahora });
  return {
    accion: "actualizada",
    facturaId: existente._id,
    tocada: {
      detalle: `${reemplazaManual ? "El PDF reemplazó la factura hecha a mano" : DETALLE_ACTUALIZADA[e.origen]} (${cambios
        .map((c) => c.campo)
        .join(", ")}).`,
      datos: { cambios: cambios.filter((c) => c.campo !== "lineas") },
    },
  };
}

/**
 * Escribe números del documento en una factura ya identificada (el
 * re-procesamiento, la corrección de un descuento). Nunca el estado.
 */
export async function actualizarDocumento(
  ctx: MutationCtx,
  factura: Doc<"facturas">,
  parche: Partial<
    Pick<
      Doc<"facturas">,
      | "vrAdmon"
      | "lineas"
      | "saldoAFavor"
      | "totalAPagar"
      | "totalConDescuento"
      | "saldoAnteriorDocumento"
      | "fechaLimiteDescuento"
      | "periodoLabel"
      | "lecturaDudosa"
      | "fechaEmision"
      | "fechaVencimiento"
    >
  >,
  detalle: string,
): Promise<Tocada | null> {
  const cambios: { campo: string; antes: unknown; despues: unknown }[] = [];
  const escribir: Record<string, unknown> = {};
  /* Un campo presente con `undefined` se borra (p. ej. la marca de una
   * lectura que ahora cuadra): Convex lo quita con el parche. */
  for (const [campo, valor] of Object.entries(parche)) {
    const antes = (factura as Record<string, unknown>)[campo];
    if (igual(antes, valor)) continue;
    escribir[campo] = valor;
    cambios.push({ campo, antes, despues: valor });
  }
  if (cambios.length === 0) return null;
  await ctx.db.patch(factura._id, { ...escribir, updatedAt: Date.now() });
  return {
    detalle: `${detalle} (${cambios.map((c) => c.campo).join(", ")}).`,
    datos: { cambios: cambios.filter((c) => c.campo !== "lineas") },
  };
}
