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
import { resolveTipoVehiculo } from "./model/placa";
import { normalizarTelefonoE164 } from "./lib/telefono";
import { internal } from "./_generated/api";

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
    coverImage: v.optional(v.string()),
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
      telefonoE164: normalizarTelefonoE164(args.telefono) ?? undefined,
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
        telefonoE164: normalizarTelefonoE164(u.telefono) ?? undefined,
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
          v.literal("saldo_a_favor"),
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
      // Un totalAPagar negativo es saldo a favor del residente, sin importar
      // qué estado haya mandado el script de migración.
      const row = { ...f, estado: f.totalAPagar < 0 ? ("saldo_a_favor" as const) : f.estado };

      const existing = await ctx.db
        .query("facturas")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", f.legacyId))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, { ...row, updatedAt: now });
        updated++;
      } else {
        await ctx.db.insert("facturas", { ...row, createdAt: now, updatedAt: now });
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
      placa: string,
    ): "carro" | "moto" | "bicicleta" | "otro" => {
      const s = (t ?? "").toUpperCase();
      if (s.includes("BICI")) return "bicicleta";
      if (s.includes("MOTO")) return "moto";
      if (s.includes("CARRO") || s.includes("AUTO") || s.includes("CAMION")) return "carro";
      // Inferir por placa (Colombia: carro …123, moto …12A)
      return resolveTipoVehiculo(placa);
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
        tipo: mapTipo(veh.tipo, placa),
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

/**
 * Backfill: corrige facturas con totalAPagar negativo (saldo a favor del
 * residente) que quedaron marcadas "pendiente" antes de existir ese estado.
 * Idempotente — se puede correr varias veces sin efecto tras la primera.
 */
export const fixSaldoAFavorEstado = internalMutation({
  args: {},
  handler: async (ctx) => {
    const candidatas = await ctx.db
      .query("facturas")
      .withIndex("by_estado", (q) => q.eq("estado", "pendiente"))
      .collect();

    let fixed = 0;
    const now = Date.now();
    for (const f of candidatas) {
      if (f.totalAPagar < 0) {
        await ctx.db.patch(f._id, { estado: "saldo_a_favor", updatedAt: now });
        fixed++;
      }
    }
    return { scanned: candidatas.length, fixed };
  },
});

/**
 * Backfill de `users.telefonoE164` desde `telefono` (formato libre migrado).
 *
 * Idempotente y por lotes: procesa 300 usuarios por invocación y se
 * auto-encadena vía scheduler hasta recorrer toda la tabla.
 *
 * Ejecutar una sola vez tras el deploy:
 *   bunx convex run migrations:backfillTelefonoE164
 */
export const backfillTelefonoE164 = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("users")
      .paginate({ cursor: args.cursor ?? null, numItems: 300 });

    let actualizados = 0;
    for (const user of page.page) {
      const e164 = normalizarTelefonoE164(user.telefono) ?? undefined;
      if (user.telefonoE164 !== e164) {
        await ctx.db.patch(user._id, { telefonoE164: e164 });
        actualizados++;
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.backfillTelefonoE164, {
        cursor: page.continueCursor,
      });
    }
    return { procesados: page.page.length, actualizados, continua: !page.isDone };
  },
});

// ─────────────────────────────────────────────────────────────
// VIGILANCIA — pasar los guardas existentes al eje de compañía
// ─────────────────────────────────────────────────────────────

/**
 * Vincula a los guardas actuales de un conjunto con una compañía.
 *
 * NO les quita el rol `guardia` de `memberships`. Es deliberado: mientras lo
 * conserven tienen acceso por las DOS vías, así que un fallo en la nueva no
 * deja a nadie fuera de su puesto a mitad de turno. Retirar el rol viejo es
 * una decisión posterior, cuando la vía nueva lleve tiempo funcionando.
 *
 * Idempotente: se puede correr las veces que haga falta. A quien ya tenga una
 * asignación vigente en ese conjunto se le salta.
 *
 *   bunx convex run migrations:migrarGuardiasACompania '{
 *     "condominioId": "…", "companiaId": "…", "contratoId": "…"
 *   }'
 *
 * OJO con la cuenta compartida de portería: si el conjunto opera con un solo
 * usuario para todos los turnos, esto crea UNA asignación para esa cuenta y
 * el modelo queda formalmente correcto pero operativamente vacío —los
 * indicadores seguirían midiendo la caseta y no a las personas—. En ese caso
 * lo correcto es dar de alta a cada guarda real con `companias:crearMiembro`
 * y tratar la cuenta compartida como un dato a retirar, no a portar.
 */
export const migrarGuardiasACompania = internalMutation({
  args: {
    condominioId: v.id("condominios"),
    companiaId: v.id("companiasSeguridad"),
    contratoId: v.id("companiaContratos"),
    /** Por defecto, el inicio del contrato. */
    vigenciaDesde: v.optional(v.number()),
    /** Sin escribir nada, para revisar antes de ejecutar. */
    simular: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const contrato = await ctx.db.get(args.contratoId);
    if (!contrato) throw new Error("Contrato no encontrado.");
    if (contrato.companiaId !== args.companiaId) {
      throw new Error("Ese contrato no es de esa compañía.");
    }
    if (contrato.condominioId !== args.condominioId) {
      throw new Error("Ese contrato no es de ese conjunto.");
    }

    const desde = args.vigenciaDesde ?? contrato.vigenciaDesde;
    if (desde < contrato.vigenciaDesde) {
      throw new Error("La fecha de inicio queda fuera del contrato.");
    }

    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();
    const guardias = memberships.filter(
      (m) => m.isActive && m.roles.includes("guardia"),
    );

    const now = Date.now();
    const creados: string[] = [];
    const yaEstaban: string[] = [];
    const omitidos: string[] = [];

    for (const m of guardias) {
      const u = await ctx.db.get(m.userId);
      if (!u || !u.active) {
        omitidos.push(String(m.userId));
        continue;
      }

      /* Pertenecer a dos compañías a la vez no es un caso real, y la
       * migración no debe forzarlo: si ya es personal de otra empresa, se
       * informa y se deja como está. */
      const enOtra = (
        await ctx.db
          .query("companiaMiembros")
          .withIndex("by_user", (q) => q.eq("userId", m.userId))
          .collect()
      ).find((x) => x.isActive && x.companiaId !== args.companiaId);
      if (enOtra) {
        omitidos.push(u.email);
        continue;
      }

      const yaAsignado = (
        await ctx.db
          .query("asignaciones")
          .withIndex("by_user_condominio", (q) =>
            q.eq("userId", m.userId).eq("condominioId", args.condominioId),
          )
          .collect()
      ).some((a) => a.vigenciaHasta == null || a.vigenciaHasta >= now);
      if (yaAsignado) {
        yaEstaban.push(u.email);
        continue;
      }

      if (args.simular) {
        creados.push(u.email);
        continue;
      }

      let miembro = await ctx.db
        .query("companiaMiembros")
        .withIndex("by_compania_user", (q) =>
          q.eq("companiaId", args.companiaId).eq("userId", m.userId),
        )
        .unique();

      let miembroId;
      if (miembro) {
        miembroId = miembro._id;
        if (!miembro.isActive || !miembro.roles.includes("guardia")) {
          await ctx.db.patch(miembro._id, {
            roles: [...new Set([...miembro.roles, "guardia" as const])],
            isActive: true,
            updatedAt: now,
          });
        }
      } else {
        miembroId = await ctx.db.insert("companiaMiembros", {
          userId: m.userId,
          companiaId: args.companiaId,
          roles: ["guardia"],
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
      }

      await ctx.db.insert("asignaciones", {
        contratoId: args.contratoId,
        companiaMiembroId: miembroId,
        userId: m.userId,
        condominioId: args.condominioId,
        companiaId: args.companiaId,
        rol: "guardia",
        vigenciaDesde: desde,
        vigenciaHasta: contrato.vigenciaHasta,
        creadoPorUserId: m.userId,
        createdAt: now,
      });
      creados.push(u.email);
    }

    return {
      simulado: args.simular === true,
      guardiasEncontrados: guardias.length,
      creados,
      yaEstaban,
      omitidos,
    };
  },
});
