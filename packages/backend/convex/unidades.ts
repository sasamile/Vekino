import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, mutation } from "./_generated/server";
import { requireCondominioRole } from "./model/authz";
import { tipoUnidadValidator, estadoUnidadValidator } from "./model/roles";

export const listByCondominio = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, []); // cualquier miembro
    return await ctx.db
      .query("unidades")
      .withIndex("by_condominio", (q) =>
        q.eq("condominioId", args.condominioId),
      )
      .collect();
  },
});

/** Unidades del condominio + los residentes vinculados a cada una. */
export const listDetailed = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [
      "administrador",
      "junta_directiva",
    ]);

    const unidades = await ctx.db
      .query("unidades")
      .withIndex("by_condominio", (q) =>
        q.eq("condominioId", args.condominioId),
      )
      .collect();

    return await Promise.all(
      unidades.map(async (u) => {
        const links = await ctx.db
          .query("usuarioUnidad")
          .withIndex("by_unidad", (q) => q.eq("unidadId", u._id))
          .collect();
        const residentes = await Promise.all(
          links.map(async (l) => {
            const m = await ctx.db.get(l.membershipId);
            const user = m ? await ctx.db.get(m.userId) : null;
            return {
              name: user?.name ?? null,
              email: user?.email ?? null,
              vinculo: l.vinculo,
            };
          }),
        );
        return {
          _id: u._id,
          numero: u.numero,
          torre: u.torre ?? null,
          tipo: u.tipo,
          estado: u.estado,
          coeficiente: u.coeficiente ?? null,
          residentes,
        };
      }),
    );
  },
});

/**
 * Página de unidades (mobile). Sin `q`: paginación real + residentes por página.
 * Con `q`: busca número/torre en un lote acotado (máx. 250).
 */
export const listPage = query({
  args: {
    condominioId: v.id("condominios"),
    paginationOpts: paginationOptsValidator,
    q: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, [
      "administrador",
      "junta_directiva",
    ]);

    const needle = args.q?.trim().toLowerCase() ?? "";

    async function detailOf(u: {
      _id: any;
      numero: string;
      torre?: string;
      tipo: string;
      estado: string;
      coeficiente?: number;
    }) {
      const links = await ctx.db
        .query("usuarioUnidad")
        .withIndex("by_unidad", (q) => q.eq("unidadId", u._id))
        .collect();
      const residentes = await Promise.all(
        links.map(async (l) => {
          const m = await ctx.db.get(l.membershipId);
          const user = m ? await ctx.db.get(m.userId) : null;
          return {
            name: user?.name ?? null,
            email: user?.email ?? null,
            vinculo: l.vinculo,
          };
        }),
      );
      return {
        _id: u._id,
        numero: u.numero,
        torre: u.torre ?? null,
        tipo: u.tipo,
        estado: u.estado,
        coeficiente: u.coeficiente ?? null,
        residentes,
      };
    }

    if (needle) {
      const scan = await ctx.db
        .query("unidades")
        .withIndex("by_condominio", (q) =>
          q.eq("condominioId", args.condominioId),
        )
        .order("desc")
        .take(250);

      // Hidrata el lote para poder filtrar también por nombre de residente.
      const detailed = await Promise.all(scan.map(detailOf));
      const matched = detailed.filter((u) => {
        const label = `${u.torre ?? ""} ${u.numero}`.toLowerCase();
        if (label.includes(needle) || u.numero.toLowerCase().includes(needle)) {
          return true;
        }
        return u.residentes.some((r) =>
          (r.name ?? "").toLowerCase().includes(needle),
        );
      });
      const limit = Math.min(args.paginationOpts.numItems || 30, 60);
      return {
        page: matched.slice(0, limit),
        isDone: true,
        continueCursor: "",
      };
    }

    const result = await ctx.db
      .query("unidades")
      .withIndex("by_condominio", (q) =>
        q.eq("condominioId", args.condominioId),
      )
      .order("desc")
      .paginate(args.paginationOpts);

    const page = await Promise.all(result.page.map(detailOf));
    return { ...result, page };
  },
});

export const create = mutation({
  args: {
    condominioId: v.id("condominios"),
    tipo: tipoUnidadValidator,
    numero: v.string(),
    torre: v.optional(v.string()),
    bloque: v.optional(v.string()),
    coeficiente: v.optional(v.number()),
    estado: v.optional(estadoUnidadValidator),
  },
  handler: async (ctx, args) => {
    await requireCondominioRole(ctx, args.condominioId, ["administrador"]);
    const now = Date.now();
    return await ctx.db.insert("unidades", {
      condominioId: args.condominioId,
      tipo: args.tipo,
      estado: args.estado ?? "desocupada",
      numero: args.numero,
      torre: args.torre,
      bloque: args.bloque,
      coeficiente: args.coeficiente,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Actualiza campos de una unidad (admin). */
export const update = mutation({
  args: {
    unidadId: v.id("unidades"),
    numero: v.optional(v.string()),
    torre: v.optional(v.string()),
    tipo: v.optional(tipoUnidadValidator),
    estado: v.optional(estadoUnidadValidator),
    coeficiente: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const unidad = await ctx.db.get(args.unidadId);
    if (!unidad) throw new Error("Unidad no encontrada.");
    await requireCondominioRole(ctx, unidad.condominioId, ["administrador"]);

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.numero !== undefined) {
      const numero = args.numero.trim();
      if (!numero) throw new Error("El número no puede estar vacío.");
      patch.numero = numero;
    }
    if (args.torre !== undefined) {
      const torre = args.torre.trim();
      patch.torre = torre || undefined;
    }
    if (args.tipo !== undefined) patch.tipo = args.tipo;
    if (args.estado !== undefined) patch.estado = args.estado;
    if (args.coeficiente !== undefined) patch.coeficiente = args.coeficiente;

    await ctx.db.patch(args.unidadId, patch);
    return args.unidadId;
  },
});
