import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  operationalRoleValidator,
  platformRoleValidator,
  tipoDocumentoValidator,
  subscriptionPlanValidator,
  tipoUnidadValidator,
  estadoUnidadValidator,
  vinculoUnidadValidator,
} from "./model/roles";

/**
 * FUNCIONES DE MIGRACIÓN (Fase 2)
 *
 * Son `internalMutation`: NO se pueden llamar desde el cliente. Se invocan
 * desde el script de migración (`bun run migrate`) o vía `convex run` con
 * deploy key, mientras se importan los usuarios y condominios activos de las
 * bases antiguas (Arboledas Campestre, Ciudad del Campo).
 *
 * Todas son idempotentes (upsert por clave natural) para poder re-ejecutar.
 */

/** Upsert de condominio por su nombre de base de datos anterior. */
export const upsertCondominio = internalMutation({
  args: {
    legacyDatabaseName: v.string(),
    legacyId: v.optional(v.string()),
    name: v.string(),
    subdomain: v.optional(v.string()),
    nit: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    timezone: v.optional(v.string()),
    logo: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    subscriptionPlan: v.optional(subscriptionPlanValidator),
    unitLimit: v.optional(v.number()),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("condominios")
      .withIndex("by_legacyDatabaseName", (q) =>
        q.eq("legacyDatabaseName", args.legacyDatabaseName),
      )
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("condominios", {
      ...args,
      country: "Colombia",
      timezone: args.timezone ?? "America/Bogota",
      activeModules: [],
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Upsert de usuario (perfil de aplicación) por email. */
export const upsertUser = internalMutation({
  args: {
    email: v.string(),
    name: v.string(),
    emailVerified: v.optional(v.boolean()),
    image: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    tipoDocumento: v.optional(tipoDocumentoValidator),
    numeroDocumento: v.optional(v.string()),
    telefono: v.optional(v.string()),
    active: v.optional(v.boolean()),
    platformRole: v.optional(platformRoleValidator),
    legacyId: v.optional(v.string()),
    legacyDatabaseName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();

    const now = Date.now();
    const data = {
      name: args.name,
      email: args.email,
      emailVerified: args.emailVerified ?? false,
      image: args.image,
      firstName: args.firstName,
      lastName: args.lastName,
      tipoDocumento: args.tipoDocumento,
      numeroDocumento: args.numeroDocumento,
      telefono: args.telefono,
      active: args.active ?? true,
      platformRole: args.platformRole,
      legacyId: args.legacyId,
      legacyDatabaseName: args.legacyDatabaseName,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    }
    return await ctx.db.insert("users", { ...data, createdAt: now });
  },
});

/** Upsert de membresía por (condominio, usuario). */
export const upsertMembership = internalMutation({
  args: {
    userEmail: v.string(),
    legacyDatabaseName: v.string(),
    roles: v.array(operationalRoleValidator),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.userEmail))
      .unique();
    if (!user) throw new Error(`Usuario no encontrado: ${args.userEmail}`);

    const condominio = await ctx.db
      .query("condominios")
      .withIndex("by_legacyDatabaseName", (q) =>
        q.eq("legacyDatabaseName", args.legacyDatabaseName),
      )
      .unique();
    if (!condominio)
      throw new Error(`Condominio no encontrado: ${args.legacyDatabaseName}`);

    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_condominio_user", (q) =>
        q.eq("condominioId", condominio._id).eq("userId", user._id),
      )
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        roles: args.roles,
        isActive: args.isActive ?? true,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("memberships", {
      userId: user._id,
      condominioId: condominio._id,
      roles: args.roles,
      isActive: args.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Bulk: usuarios (perfil) + membresía (roles operativos) de un condominio.
 * Idempotente por email. Preserva platformRole y authId de usuarios existentes.
 */
export const bulkUsers = internalMutation({
  args: {
    legacyDatabaseName: v.string(),
    users: v.array(
      v.object({
        legacyId: v.string(),
        email: v.string(),
        name: v.string(),
        emailVerified: v.optional(v.boolean()),
        image: v.optional(v.string()),
        firstName: v.optional(v.string()),
        lastName: v.optional(v.string()),
        tipoDocumento: v.optional(tipoDocumentoValidator),
        numeroDocumento: v.optional(v.string()),
        telefono: v.optional(v.string()),
        active: v.optional(v.boolean()),
        roles: v.array(operationalRoleValidator),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const condominio = await ctx.db
      .query("condominios")
      .withIndex("by_legacyDatabaseName", (q) =>
        q.eq("legacyDatabaseName", args.legacyDatabaseName),
      )
      .unique();
    if (!condominio)
      throw new Error(`Condominio no encontrado: ${args.legacyDatabaseName}`);

    const now = Date.now();
    let usersUpserted = 0;
    let membershipsUpserted = 0;

    for (const u of args.users) {
      const profile = {
        name: u.name,
        email: u.email,
        emailVerified: u.emailVerified ?? false,
        image: u.image,
        firstName: u.firstName,
        lastName: u.lastName,
        tipoDocumento: u.tipoDocumento,
        numeroDocumento: u.numeroDocumento,
        telefono: u.telefono,
        active: u.active ?? true,
        legacyId: u.legacyId,
        legacyDatabaseName: args.legacyDatabaseName,
        updatedAt: now,
      };

      const existing = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", u.email))
        .unique();

      let userId;
      if (existing) {
        // No tocar platformRole ni authId de un usuario existente.
        await ctx.db.patch(existing._id, profile);
        userId = existing._id;
      } else {
        userId = await ctx.db.insert("users", {
          ...profile,
          platformRole: undefined,
          createdAt: now,
        });
      }
      usersUpserted++;

      const membership = await ctx.db
        .query("memberships")
        .withIndex("by_condominio_user", (q) =>
          q.eq("condominioId", condominio._id).eq("userId", userId),
        )
        .unique();
      if (membership) {
        await ctx.db.patch(membership._id, {
          roles: u.roles,
          isActive: true,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("memberships", {
          userId,
          condominioId: condominio._id,
          roles: u.roles,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
      }
      membershipsUpserted++;
    }

    return { usersUpserted, membershipsUpserted };
  },
});

/** Bulk: unidades de un condominio. Idempotente por legacyId. */
export const bulkUnidades = internalMutation({
  args: {
    legacyDatabaseName: v.string(),
    unidades: v.array(
      v.object({
        legacyId: v.string(),
        tipo: tipoUnidadValidator,
        estado: estadoUnidadValidator,
        numero: v.string(),
        torre: v.optional(v.string()),
        coeficiente: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const condominio = await ctx.db
      .query("condominios")
      .withIndex("by_legacyDatabaseName", (q) =>
        q.eq("legacyDatabaseName", args.legacyDatabaseName),
      )
      .unique();
    if (!condominio)
      throw new Error(`Condominio no encontrado: ${args.legacyDatabaseName}`);

    const now = Date.now();
    let upserted = 0;
    for (const un of args.unidades) {
      const existing = await ctx.db
        .query("unidades")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", un.legacyId))
        .unique();
      const data = {
        condominioId: condominio._id,
        tipo: un.tipo,
        estado: un.estado,
        numero: un.numero,
        torre: un.torre,
        coeficiente: un.coeficiente,
        legacyId: un.legacyId,
        updatedAt: now,
      };
      if (existing) await ctx.db.patch(existing._id, data);
      else await ctx.db.insert("unidades", { ...data, createdAt: now });
      upserted++;
    }
    return { upserted };
  },
});

/** Bulk: relación usuario↔unidad. Idempotente por (membership, unidad). */
export const bulkUsuarioUnidad = internalMutation({
  args: {
    legacyDatabaseName: v.string(),
    links: v.array(
      v.object({
        userLegacyId: v.string(),
        unidadLegacyId: v.string(),
        vinculo: vinculoUnidadValidator,
        esPrincipal: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const condominio = await ctx.db
      .query("condominios")
      .withIndex("by_legacyDatabaseName", (q) =>
        q.eq("legacyDatabaseName", args.legacyDatabaseName),
      )
      .unique();
    if (!condominio)
      throw new Error(`Condominio no encontrado: ${args.legacyDatabaseName}`);

    const now = Date.now();
    let linked = 0;
    let skipped = 0;

    for (const l of args.links) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", l.userLegacyId))
        .unique();
      const unidad = await ctx.db
        .query("unidades")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", l.unidadLegacyId))
        .unique();
      if (!user || !unidad) {
        skipped++;
        continue;
      }
      const membership = await ctx.db
        .query("memberships")
        .withIndex("by_condominio_user", (q) =>
          q.eq("condominioId", condominio._id).eq("userId", user._id),
        )
        .unique();
      if (!membership) {
        skipped++;
        continue;
      }

      // Dedupe por (membership, unidad)
      const existingLinks = await ctx.db
        .query("usuarioUnidad")
        .withIndex("by_membership", (q) => q.eq("membershipId", membership._id))
        .collect();
      const dupe = existingLinks.find((x) => x.unidadId === unidad._id);
      if (dupe) {
        await ctx.db.patch(dupe._id, {
          vinculo: l.vinculo,
          esPrincipal: l.esPrincipal ?? dupe.esPrincipal,
        });
      } else {
        await ctx.db.insert("usuarioUnidad", {
          membershipId: membership._id,
          unidadId: unidad._id,
          condominioId: condominio._id,
          vinculo: l.vinculo,
          esPrincipal: l.esPrincipal ?? false,
          createdAt: now,
        });
      }
      linked++;
    }
    return { linked, skipped };
  },
});

/**
 * Devuelve el condominioId + mapeos unidadLegacyId→newId + memberships de Arboleda.
 * Solo para scripts de migración.
 */
export const getArboledaMappings = internalQuery({
  args: { legacyDatabaseName: v.string() },
  handler: async (ctx, args) => {
    const condominio = await ctx.db
      .query("condominios")
      .withIndex("by_legacyDatabaseName", (q) =>
        q.eq("legacyDatabaseName", args.legacyDatabaseName),
      )
      .unique();
    if (!condominio) throw new Error(`Condominio no encontrado: ${args.legacyDatabaseName}`);

    const unidades = await ctx.db
      .query("unidades")
      .withIndex("by_condominio", (q) => q.eq("condominioId", condominio._id))
      .collect();

    const unitMap = unidades
      .filter((u) => u.legacyId)
      .map((u) => ({ legacyId: u.legacyId!, newId: u._id }));

    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_condominio", (q) => q.eq("condominioId", condominio._id))
      .collect();

    const memberUserIds = memberships.map((m) => m.userId);
    const users = await Promise.all(memberUserIds.map((uid) => ctx.db.get(uid)));

    const memberMap = memberships.map((m, i) => {
      const user = users[i];
      return {
        membershipId: m._id,
        userId: m.userId,
        email: user?.email ?? null,
      };
    });

    return { condominioId: condominio._id, unitMap, memberMap };
  },
});

/**
 * Bulk insert de facturas (idempotente por legacyId).
 */
export const bulkFacturas = internalMutation({
  args: {
    facturas: v.array(
      v.object({
        legacyId: v.string(),
        condominioId: v.id("condominios"),
        unidadId: v.id("unidades"),
        membershipId: v.optional(v.id("memberships")),
        numeroFactura: v.string(),
        numeroInterno: v.string(),
        periodo: v.string(),
        periodoLabel: v.string(),
        residenteNombre: v.string(),
        apto: v.optional(v.string()),
        vrAdmon: v.number(),
        lineas: v.array(
          v.object({
            codigo: v.number(),
            concepto: v.string(),
            saldoAnterior: v.number(),
            actual: v.number(),
            total: v.number(),
          }),
        ),
        saldoAFavor: v.number(),
        totalAPagar: v.number(),
        totalConDescuento: v.optional(v.number()),
        fechaEmision: v.number(),
        fechaVencimiento: v.number(),
        estado: v.union(
          v.literal("pendiente"),
          v.literal("pagada"),
          v.literal("vencida"),
          v.literal("abonada"),
        ),
        pdfUrl: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;

    for (const f of args.facturas) {
      const existing = await ctx.db
        .query("facturas")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", f.legacyId))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, { ...f, updatedAt: now });
        updated++;
      } else {
        await ctx.db.insert("facturas", { ...f, createdAt: now, updatedAt: now });
        inserted++;
      }
    }
    return { inserted, updated };
  },
});

/**
 * Lista facturas CDC (con pdfUrl) para el script fix-descuento-cdc.
 * Solo facturas que aún no tienen totalConDescuento.
 */
export const listCdcFacturasForFix = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("facturas").collect();
    return all
      .filter((f) => f.pdfUrl && f.totalConDescuento == null)
      .map((f) => ({ _id: f._id, numeroFactura: f.numeroFactura, pdfUrl: f.pdfUrl! }));
  },
});

/**
 * Actualiza solo totalConDescuento en una factura.
 */
export const setTotalConDescuento = internalMutation({
  args: { id: v.id("facturas"), totalConDescuento: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { totalConDescuento: args.totalConDescuento, updatedAt: Date.now() });
  },
});

/**
 * Crea / promueve el superadmin (control maestro). Ejecutar una vez:
 *   convex run migrations:bootstrapSuperadmin '{"email":"...","name":"..."}'
 * NOTA: crea el PERFIL. La credencial (contraseña) se crea al registrarse ese
 * email por Better Auth, o se migra en el import de cuentas.
 */
export const bootstrapSuperadmin = internalMutation({
  args: { email: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        platformRole: "superadmin",
        active: true,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("users", {
      name: args.name,
      email: args.email,
      emailVerified: true,
      active: true,
      platformRole: "superadmin",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Bulk: vehículos desde el sistema anterior. Idempotente por legacyId. */
export const bulkVehiculos = internalMutation({
  args: {
    legacyDatabaseName: v.string(),
    vehiculos: v.array(
      v.object({
        legacyId: v.string(),
        unidadLegacyId: v.string(),
        placa: v.string(),
        tipo: v.optional(v.string()),
        observaciones: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const condominio = await ctx.db
      .query("condominios")
      .withIndex("by_legacyDatabaseName", (q) =>
        q.eq("legacyDatabaseName", args.legacyDatabaseName),
      )
      .unique();
    if (!condominio)
      throw new Error(`Condominio no encontrado: ${args.legacyDatabaseName}`);

    const mapTipo = (
      t: string | undefined,
    ): "carro" | "moto" | "bicicleta" | "otro" => {
      const s = (t ?? "").toUpperCase();
      if (s.includes("MOTO")) return "moto";
      if (s.includes("BICI")) return "bicicleta";
      if (s.includes("CARRO") || s.includes("AUTO") || s.includes("CAMION")) return "carro";
      return t ? "otro" : "carro";
    };

    const now = Date.now();
    let upserted = 0;
    let skipped = 0;

    for (const veh of args.vehiculos) {
      const placa = veh.placa.toUpperCase().trim();
      if (!placa) {
        skipped++;
        continue;
      }
      const unidad = await ctx.db
        .query("unidades")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", veh.unidadLegacyId))
        .unique();
      if (!unidad || unidad.condominioId !== condominio._id) {
        skipped++;
        continue;
      }

      const existing = await ctx.db
        .query("vehiculos")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", veh.legacyId))
        .unique();

      const data = {
        condominioId: condominio._id,
        unidadId: unidad._id,
        placa,
        tipo: mapTipo(veh.tipo),
        observaciones: veh.observaciones?.trim() || undefined,
        legacyId: veh.legacyId,
        updatedAt: now,
      };
      if (existing) await ctx.db.patch(existing._id, data);
      else await ctx.db.insert("vehiculos", { ...data, createdAt: now });
      upserted++;
    }

    return { upserted, skipped };
  },
});
