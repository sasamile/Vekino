import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  requireCondominioRole,
  requireAppUser,
  getCurrentAppUser,
  misUnidadIds,
} from "./model/authz";
import { resolveTipoVehiculo } from "./model/placa";
import { displayNameFromUser } from "./model/displayName";
import { normalizarPlaca } from "./lib/placa";
import { mapearTipo, resolverUnidad } from "./lib/importarVehiculos";

const ADMIN_ROLES = ["administrador", "junta_directiva", "contadora"] as const;

const tipoValidator = v.union(
  v.literal("carro"),
  v.literal("moto"),
  v.literal("bicicleta"),
  v.literal("otro")
);

/** Nombre del dueño (propietario) de la unidad, si hay vínculo. */
async function dueñoNombreUnidad(
  ctx: QueryCtx | MutationCtx,
  unidadId: Id<"unidades">,
): Promise<string | null> {
  const links = await ctx.db
    .query("usuarioUnidad")
    .withIndex("by_unidad", (q) => q.eq("unidadId", unidadId))
    .collect();
  if (links.length === 0) return null;
  const preferido =
    links.find((l) => l.vinculo === "propietario") ??
    links.find((l) => l.esPrincipal) ??
    links[0]!;
  const membership = await ctx.db.get(preferido.membershipId);
  if (!membership) return null;
  const usr = await ctx.db.get(membership.userId);
  if (!usr) return null;
  return displayNameFromUser(usr) || null;
}

export const listByCondominio = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, []);
    const vehiculos = await ctx.db
      .query("vehiculos")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();

    const unidadIds = [...new Set(vehiculos.map((v) => v.unidadId))];
    const unidades = await Promise.all(unidadIds.map((id) => ctx.db.get(id)));
    const unidadMap = new Map(
      unidades.filter(Boolean).map((u) => [u!._id, u!.numero]),
    );
    const duenos = await Promise.all(
      unidadIds.map(async (id) => [id, await dueñoNombreUnidad(ctx, id)] as const),
    );
    const duenoMap = new Map(duenos);

    return vehiculos
      .map((v) => ({
        ...v,
        tipo: resolveTipoVehiculo(v.placa, v.tipo),
        unidadNumero: unidadMap.get(v.unidadId) ?? "—",
        duenoNombre: duenoMap.get(v.unidadId) ?? null,
      }))
      // Los archivados al final; el resto por placa.
      .sort(
        (a, b) =>
          Number(!!a.archivadoEn) - Number(!!b.archivadoEn) ||
          a.placa.localeCompare(b.placa),
      );
  },
});

/** Conteos para KPIs (payload pequeño; escanea máx. 2000). Tipo por placa. */
export const countsByCondominio = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, []);
    const rows = await ctx.db
      .query("vehiculos")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .take(2000);
    let carro = 0;
    let moto = 0;
    let bicicleta = 0;
    for (const r of rows) {
      const tipo = resolveTipoVehiculo(r.placa, r.tipo);
      if (tipo === "carro") carro += 1;
      else if (tipo === "moto") moto += 1;
      else if (tipo === "bicicleta") bicicleta += 1;
    }
    return { total: rows.length, carro, moto, bicicleta };
  },
});

/**
 * Página de vehículos. Sin filtros: paginación real.
 * Con `q` o `tipo`: escanea un lote acotado (máx. 250).
 */
export const listPage = query({
  args: {
    condominioId: v.id("condominios"),
    paginationOpts: paginationOptsValidator,
    q: v.optional(v.string()),
    tipo: v.optional(tipoValidator),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, []);
    const needle = args.q?.trim().toLowerCase() ?? "";
    const tipo = args.tipo;

    async function hydrate(v: {
      _id: Id<"vehiculos">;
      unidadId: Id<"unidades">;
      placa: string;
      tipo: string;
      marca?: string;
      color?: string;
      observaciones?: string;
      condominioId: Id<"condominios">;
      createdAt: number;
      updatedAt: number;
    }) {
      const unidad = await ctx.db.get(v.unidadId);
      const duenoNombre = await dueñoNombreUnidad(ctx, v.unidadId);
      return {
        ...v,
        tipo: resolveTipoVehiculo(v.placa, v.tipo),
        unidadNumero: unidad?.numero ?? "—",
        duenoNombre,
      };
    }

    if (needle || tipo) {
      const scan = await ctx.db
        .query("vehiculos")
        .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
        .order("desc")
        .take(250);
      const hydrated = await Promise.all(scan.map(hydrate));
      const filtered = hydrated.filter((v) => {
        if (tipo && v.tipo !== tipo) return false;
        if (!needle) return true;
        return (
          v.placa.toLowerCase().includes(needle) ||
          (v.marca ?? "").toLowerCase().includes(needle) ||
          (v.color ?? "").toLowerCase().includes(needle) ||
          v.unidadNumero.toLowerCase().includes(needle) ||
          (v.duenoNombre ?? "").toLowerCase().includes(needle)
        );
      });
      const limit = Math.min(args.paginationOpts.numItems || 30, 60);
      return {
        page: filtered.slice(0, limit),
        isDone: true,
        continueCursor: "",
      };
    }

    const result = await ctx.db
      .query("vehiculos")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .order("desc")
      .paginate(args.paginationOpts);

    const page = await Promise.all(result.page.map(hydrate));
    return { ...result, page };
  },
});

export const create = mutation({
  args: {
    condominioId: v.id("condominios"),
    unidadId: v.id("unidades"),
    placa: v.string(),
    tipo: v.optional(tipoValidator),
    marca: v.optional(v.string()),
    color: v.optional(v.string()),
    observaciones: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...ADMIN_ROLES]);
    const now = Date.now();
    const placa = args.placa.toUpperCase().trim();
    return await ctx.db.insert("vehiculos", {
      condominioId: args.condominioId,
      unidadId: args.unidadId,
      placa,
      tipo: resolveTipoVehiculo(placa, args.tipo),
      marca: args.marca?.trim(),
      color: args.color?.trim(),
      observaciones: args.observaciones?.trim(),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("vehiculos"),
    unidadId: v.id("unidades"),
    placa: v.string(),
    tipo: v.optional(tipoValidator),
    marca: v.optional(v.string()),
    color: v.optional(v.string()),
    observaciones: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Vehículo no encontrado.");
    await requireCondominioRole(ctx, existing.condominioId, [...ADMIN_ROLES]);
    const placa = args.placa.toUpperCase().trim();
    await ctx.db.patch(args.id, {
      unidadId: args.unidadId,
      placa,
      tipo: resolveTipoVehiculo(placa, args.tipo),
      marca: args.marca?.trim(),
      color: args.color?.trim(),
      observaciones: args.observaciones?.trim(),
      updatedAt: Date.now(),
    });
  },
});

/** Corrige tipo de todos los vehículos del condo según la placa. */
export const reclassifyByPlaca = mutation({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...ADMIN_ROLES]);
    const rows = await ctx.db
      .query("vehiculos")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();
    let updated = 0;
    const now = Date.now();
    for (const r of rows) {
      if (r.tipo === "bicicleta" || r.tipo === "otro") continue;
      const next = resolveTipoVehiculo(r.placa, r.tipo);
      if (next !== r.tipo) {
        await ctx.db.patch(r._id, { tipo: next, updatedAt: now });
        updated += 1;
      }
    }
    return { scanned: rows.length, updated };
  },
});

export const remove = mutation({
  args: { id: v.id("vehiculos") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Vehículo no encontrado.");
    await requireCondominioRole(ctx, existing.condominioId, [...ADMIN_ROLES]);
    await ctx.db.delete(args.id);
  },
});

const filaExcelValidator = v.object({
  placa: v.string(),
  unidad: v.string(),
  torre: v.optional(v.string()),
  tipo: v.optional(v.string()),
  marca: v.optional(v.string()),
  color: v.optional(v.string()),
  observaciones: v.optional(v.string()),
});

/**
 * Re-sube el Excel del parqueadero: actualiza por placa y crea las nuevas.
 *
 * Sin esto la administración tenía que editar carro por carro. La placa es
 * la llave — "ABC-123" y "abc 123" son el mismo. Si el carro cambió de casa,
 * se mueve; si estaba archivado, vuelve. Un campo vacío en el Excel no borra
 * lo que ya había.
 */
export const bulkUpsert = mutation({
  args: {
    condominioId: v.id("condominios"),
    filas: v.array(filaExcelValidator),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [...ADMIN_ROLES]);
    if (args.filas.length > 200) {
      throw new Error("Máximo 200 vehículos por carga. Parte el archivo.");
    }

    const unidades = await ctx.db
      .query("unidades")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();
    const unidadMin = unidades.map((u) => ({
      _id: u._id as string,
      numero: u.numero,
      torre: u.torre ?? null,
    }));

    const existentes = await ctx.db
      .query("vehiculos")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();
    const porPlaca = new Map<string, (typeof existentes)[number]>();
    for (const v of existentes) {
      const k = normalizarPlaca(v.placa);
      if (!k) continue;
      const prev = porPlaca.get(k);
      /* Si hay duplicados, nos quedamos con el que sigue en circulación. */
      if (!prev || (prev.archivadoEn && !v.archivadoEn)) porPlaca.set(k, v);
    }

    const now = Date.now();
    let creados = 0;
    let actualizados = 0;
    let restaurados = 0;
    const omitidos: { placa: string; motivo: string }[] = [];

    for (const fila of args.filas) {
      const placa = normalizarPlaca(fila.placa);
      if (!placa) {
        omitidos.push({ placa: fila.placa, motivo: "Sin placa" });
        continue;
      }
      const unidad = resolverUnidad(unidadMin, fila.unidad, fila.torre);
      if (!unidad.ok) {
        omitidos.push({
          placa,
          motivo:
            unidad.motivo === "ambigua"
              ? `La unidad ${fila.unidad} está en más de una torre. Indica la torre.`
              : `No hay una unidad ${fila.unidad} en el conjunto.`,
        });
        continue;
      }
      const unidadId = unidad.unidadId as Id<"unidades">;
      const tipo = mapearTipo(fila.tipo, placa);
      const existente = porPlaca.get(placa);

      if (existente) {
        const restaurar = Boolean(existente.archivadoEn);
        await ctx.db.patch(existente._id, {
          unidadId,
          placa,
          tipo: resolveTipoVehiculo(placa, tipo),
          ...(fila.marca ? { marca: fila.marca.trim() } : {}),
          ...(fila.color ? { color: fila.color.trim() } : {}),
          ...(fila.observaciones ? { observaciones: fila.observaciones.trim() } : {}),
          ...(restaurar ? { archivadoEn: undefined } : {}),
          updatedAt: now,
        });
        if (restaurar) restaurados += 1;
        actualizados += 1;
        porPlaca.set(placa, { ...existente, unidadId, placa, archivadoEn: undefined });
      } else {
        const id = await ctx.db.insert("vehiculos", {
          condominioId: args.condominioId,
          unidadId,
          placa,
          tipo: resolveTipoVehiculo(placa, tipo),
          marca: fila.marca?.trim() || undefined,
          color: fila.color?.trim() || undefined,
          observaciones: fila.observaciones?.trim() || undefined,
          createdAt: now,
          updatedAt: now,
        });
        const creado = await ctx.db.get(id);
        if (creado) porPlaca.set(placa, creado);
        creados += 1;
      }
    }

    return { creados, actualizados, restaurados, omitidos };
  },
});

// ─────────────────────────────────────────────────────────────
// API del propietario: registra y ve los vehículos de SUS unidades.
// ─────────────────────────────────────────────────────────────

/** Unidades vinculadas al usuario en el condominio. */
/** Vehículos de las unidades del usuario autenticado. */
export const listMios = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) return [];
    const unidadIds = await misUnidadIds(ctx, user._id, args.condominioId);
    if (unidadIds.size === 0) return [];

    const vehiculos = await ctx.db
      .query("vehiculos")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();

    /* Los archivados se devuelven marcados, no se esconden: el dueño tiene
     * que poder ver lo que retiró y volver a activarlo. */
    const mios = vehiculos.filter((veh) => unidadIds.has(veh.unidadId));
    const unidades = await Promise.all([...unidadIds].map((id) => ctx.db.get(id)));
    const numeros = new Map(
      unidades.filter(Boolean).map((u) => [u!._id, u!.numero]),
    );

    return mios
      .map((veh) => ({
        ...veh,
        tipo: resolveTipoVehiculo(veh.placa, veh.tipo),
        unidadNumero: numeros.get(veh.unidadId) ?? "—",
      }))
      .sort((a, b) => a.placa.localeCompare(b.placa));
  },
});

/** El propietario registra un vehículo en una de SUS unidades. */
export const createMio = mutation({
  args: {
    condominioId: v.id("condominios"),
    unidadId: v.id("unidades"),
    placa: v.string(),
    tipo: v.optional(tipoValidator),
    marca: v.optional(v.string()),
    color: v.optional(v.string()),
    observaciones: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    const unidadIds = await misUnidadIds(ctx, user._id, args.condominioId);
    if (!unidadIds.has(args.unidadId)) {
      throw new Error("Esa unidad no está vinculada a tu cuenta.");
    }
    const placa = args.placa.toUpperCase().trim();
    if (!placa) throw new Error("La placa es obligatoria.");

    const now = Date.now();
    return await ctx.db.insert("vehiculos", {
      condominioId: args.condominioId,
      unidadId: args.unidadId,
      placa,
      tipo: resolveTipoVehiculo(placa, args.tipo),
      marca: args.marca?.trim(),
      color: args.color?.trim(),
      observaciones: args.observaciones?.trim(),
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** El propietario edita un vehículo de SUS unidades. */
export const updateMio = mutation({
  args: {
    id: v.id("vehiculos"),
    placa: v.optional(v.string()),
    tipo: v.optional(tipoValidator),
    marca: v.optional(v.string()),
    color: v.optional(v.string()),
    observaciones: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    const veh = await ctx.db.get(args.id);
    if (!veh) throw new Error("Vehículo no encontrado.");
    const unidadIds = await misUnidadIds(ctx, user._id, veh.condominioId);
    if (!unidadIds.has(veh.unidadId)) throw new Error("No autorizado.");

    const placa = args.placa?.toUpperCase().trim();
    if (args.placa !== undefined && !placa) {
      throw new Error("La placa es obligatoria.");
    }

    // El tipo se reevalúa contra la placa final (misma regla que createMio).
    const placaFinal = placa ?? veh.placa;
    await ctx.db.patch(args.id, {
      ...(placa ? { placa } : {}),
      tipo: resolveTipoVehiculo(placaFinal, args.tipo ?? veh.tipo),
      ...(args.marca !== undefined ? { marca: args.marca.trim() } : {}),
      ...(args.color !== undefined ? { color: args.color.trim() } : {}),
      ...(args.observaciones !== undefined
        ? { observaciones: args.observaciones.trim() }
        : {}),
      updatedAt: Date.now(),
    });
    return args.id;
  },
});

/** El propietario elimina un vehículo de SUS unidades. */
/**
 * El propietario retira un vehículo suyo. NO lo borra: lo archiva.
 *
 * Borrarlo dejaría cojo al vigilante. Los reportes de portería copian la
 * placa, así que un reporte viejo no se pierde — pero la placa sí
 * desaparecería del buscador, y si alguien pregunta por un caso de hace tres
 * meses no habría cómo llegar al vehículo. Archivado deja de aparecer donde
 * estorba y sigue existiendo donde hace falta.
 *
 * De paso resuelve el caso contrario: si el carro vuelve, se desarchiva en
 * vez de quedar registrado dos veces con la misma placa.
 */
export const removeMio = mutation({
  args: { id: v.id("vehiculos") },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    const veh = await ctx.db.get(args.id);
    if (!veh) throw new Error("Vehículo no encontrado.");
    const unidadIds = await misUnidadIds(ctx, user._id, veh.condominioId);
    if (!unidadIds.has(veh.unidadId)) throw new Error("No autorizado.");
    await ctx.db.patch(args.id, {
      archivadoEn: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/** Vuelve a poner en circulación un vehículo archivado. */
export const restaurarMio = mutation({
  args: { id: v.id("vehiculos") },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    const veh = await ctx.db.get(args.id);
    if (!veh) throw new Error("Vehículo no encontrado.");
    const unidadIds = await misUnidadIds(ctx, user._id, veh.condominioId);
    if (!unidadIds.has(veh.unidadId)) throw new Error("No autorizado.");
    await ctx.db.patch(args.id, {
      archivadoEn: undefined,
      updatedAt: Date.now(),
    });
  },
});
