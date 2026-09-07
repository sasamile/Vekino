import { v } from "convex/values";
import { query, mutation, action } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { createAuth } from "./auth";
import {
  getCurrentAppUser,
  requireAppUser,
  requirePlatformStaff,
} from "./model/authz";
import { exigirAccesoCompania, getCompaniaMiembro } from "./model/acceso";
import {
  companiaRoleValidator,
  estadoCompaniaValidator,
} from "./model/roles";
import { estadoVigencia, haySolape, estaVigente } from "./lib/vigilancia";
import { normalizarTelefonoE164 } from "./lib/telefono";
import { displayNameFromUser } from "./model/displayName";

/**
 * Compañías de vigilancia: la empresa, su personal y sus contratos.
 *
 * Las asignaciones —quién opera en qué conjunto— viven en `asignaciones.ts`,
 * porque son la relación entre los dos ejes y no un detalle de la compañía.
 *
 * Quién manda sobre qué:
 *   - Crear compañías y firmar contratos es de la PLATAFORMA. Es la relación
 *     comercial del SaaS, no una decisión de la empresa de vigilancia ni del
 *     conjunto.
 *   - Administrar el personal propio es de la compañía (`admin_compania`).
 */

// ─────────────────────────────────────────────────────────────
// Lectura
// ─────────────────────────────────────────────────────────────

/** Compañías con sus conteos. Solo plataforma. */
export const listAll = query({
  args: { soloActivas: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);
    const todas = await ctx.db.query("companiasSeguridad").order("desc").collect();
    const filtradas = args.soloActivas
      ? todas.filter((c) => c.estado === "activa")
      : todas;

    return await Promise.all(
      filtradas.map(async (c) => {
        const miembros = await ctx.db
          .query("companiaMiembros")
          .withIndex("by_compania", (q) => q.eq("companiaId", c._id))
          .collect();
        const contratos = await ctx.db
          .query("companiaContratos")
          .withIndex("by_compania", (q) => q.eq("companiaId", c._id))
          .collect();
        const activos = miembros.filter((m) => m.isActive);
        return {
          ...c,
          personalCount: activos.length,
          supervisorCount: activos.filter((m) => m.roles.includes("supervisor"))
            .length,
          guardiaCount: activos.filter((m) => m.roles.includes("guardia")).length,
          contratosVigentes: contratos.filter((k) => estaVigente(k)).length,
        };
      }),
    );
  },
});

/** Hidrata un miembro con su perfil de usuario. */
async function hidratarMiembro(ctx: QueryCtx, m: Doc<"companiaMiembros">) {
  const u = await ctx.db.get(m.userId);
  const asignaciones = await ctx.db
    .query("asignaciones")
    .withIndex("by_miembro", (q) => q.eq("companiaMiembroId", m._id))
    .collect();
  return {
    _id: m._id,
    userId: m.userId,
    nombre: u ? displayNameFromUser(u) : "(perfil eliminado)",
    email: u?.email ?? null,
    telefono: u?.telefono ?? null,
    activoEnPlataforma: u?.active ?? false,
    roles: m.roles,
    cargo: m.cargo ?? null,
    isActive: m.isActive,
    /* Cuántos conjuntos cubre hoy. Es lo que la compañía mira para saber a
     * quién puede mandar a otro sitio. */
    asignacionesVigentes: asignaciones.filter((a) => estaVigente(a)).length,
    createdAt: m.createdAt,
  };
}

/** Detalle: compañía + personal + contratos. */
export const detail = query({
  args: { companiaId: v.id("companiasSeguridad") },
  handler: async (ctx, args) => {
    // Ver el detalle exige plataforma o pertenecer a la compañía.
    const user = await requireAppUser(ctx);
    const compania = await ctx.db.get(args.companiaId);
    if (!compania) return null;

    const esPlataforma =
      user.platformRole === "superadmin" || user.platformRole === "admin";
    if (!esPlataforma) {
      const miembro = await getCompaniaMiembro(ctx, user._id);
      if (!miembro || miembro.companiaId !== args.companiaId) {
        throw new Error("No pertenece a esta compañía.");
      }
    }

    const miembrosRaw = await ctx.db
      .query("companiaMiembros")
      .withIndex("by_compania", (q) => q.eq("companiaId", args.companiaId))
      .collect();
    const personal = await Promise.all(
      miembrosRaw.map((m) => hidratarMiembro(ctx, m)),
    );

    const contratosRaw = await ctx.db
      .query("companiaContratos")
      .withIndex("by_compania", (q) => q.eq("companiaId", args.companiaId))
      .collect();
    const contratos = await Promise.all(
      contratosRaw.map(async (k) => {
        const condo = await ctx.db.get(k.condominioId);
        const asigs = await ctx.db
          .query("asignaciones")
          .withIndex("by_contrato", (q) => q.eq("contratoId", k._id))
          .collect();
        return {
          _id: k._id,
          condominioId: k.condominioId,
          condominioNombre: condo?.name ?? "(conjunto eliminado)",
          vigenciaDesde: k.vigenciaDesde,
          vigenciaHasta: k.vigenciaHasta ?? null,
          estado: estadoVigencia(k),
          notas: k.notas ?? null,
          asignacionesVigentes: asigs.filter((a) => estaVigente(a)).length,
          createdAt: k.createdAt,
        };
      }),
    );

    return {
      compania,
      personal: personal.sort((a, b) => a.nombre.localeCompare(b.nombre)),
      contratos: contratos.sort((a, b) => b.vigenciaDesde - a.vigenciaDesde),
    };
  },
});

/**
 * La compañía del usuario actual, para el ruteo tras el login.
 *
 * Devuelve null para todo el mundo que no sea personal de vigilancia, que es
 * la inmensa mayoría: una lectura por índice y fuera.
 */
export const miCompania = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) return null;
    const miembro = await getCompaniaMiembro(ctx, user._id);
    if (!miembro) return null;
    const compania = await ctx.db.get(miembro.companiaId);
    if (!compania) return null;
    return {
      companiaId: compania._id,
      nombre: compania.nombre,
      estado: compania.estado,
      logo: compania.logo ?? null,
      primaryColor: compania.primaryColor ?? null,
      roles: miembro.roles,
    };
  },
});

/**
 * Contratos vigentes de un conjunto: quién le presta el servicio hoy.
 *
 * La lee el administrador del conjunto, que tiene derecho a saber qué empresa
 * cubre su portería, y la plataforma.
 */
export const contratosDeCondominio = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    const esPlataforma =
      user.platformRole === "superadmin" || user.platformRole === "admin";
    if (!esPlataforma) {
      const membership = await ctx.db
        .query("memberships")
        .withIndex("by_condominio_user", (q) =>
          q.eq("condominioId", args.condominioId).eq("userId", user._id),
        )
        .unique();
      const puede =
        !!membership &&
        membership.isActive &&
        membership.roles.some((r) =>
          ["administrador", "junta_directiva"].includes(r),
        );
      if (!puede) throw new Error("No tiene acceso a este conjunto.");
    }

    const contratos = await ctx.db
      .query("companiaContratos")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();

    return await Promise.all(
      contratos.map(async (k) => {
        const c = await ctx.db.get(k.companiaId);
        return {
          _id: k._id,
          companiaId: k.companiaId,
          companiaNombre: c?.nombre ?? "(compañía eliminada)",
          companiaEstado: c?.estado ?? null,
          vigenciaDesde: k.vigenciaDesde,
          vigenciaHasta: k.vigenciaHasta ?? null,
          estado: estadoVigencia(k),
        };
      }),
    );
  },
});

// ─────────────────────────────────────────────────────────────
// Compañía
// ─────────────────────────────────────────────────────────────

/** Comprueba que el NIT no lo tenga ya otra compañía. */
async function exigirNitLibre(
  ctx: QueryCtx,
  nit: string | undefined,
  excepto?: Id<"companiasSeguridad">,
) {
  if (!nit) return;
  /* Convex no tiene UNIQUE: la unicidad se comprueba leyendo por índice antes
   * de escribir, igual que se hace hoy con `users.email`. */
  const otras = await ctx.db
    .query("companiasSeguridad")
    .withIndex("by_nit", (q) => q.eq("nit", nit))
    .collect();
  if (otras.some((c) => c._id !== excepto)) {
    throw new Error("Ya existe una compañía con ese NIT.");
  }
}

export const create = mutation({
  args: {
    nombre: v.string(),
    nit: v.optional(v.string()),
    contactoEmail: v.optional(v.string()),
    contactoTelefono: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);
    const nombre = args.nombre.trim();
    if (!nombre) throw new Error("El nombre es obligatorio.");

    const nit = args.nit?.trim() || undefined;
    await exigirNitLibre(ctx, nit);

    const now = Date.now();
    return await ctx.db.insert("companiasSeguridad", {
      nombre,
      nit,
      contactoEmail: args.contactoEmail?.trim().toLowerCase() || undefined,
      contactoTelefono: args.contactoTelefono?.trim() || undefined,
      primaryColor: args.primaryColor?.trim() || undefined,
      estado: "activa",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Datos de contacto y marca. Los puede editar la propia compañía. */
export const update = mutation({
  args: {
    companiaId: v.id("companiasSeguridad"),
    nombre: v.optional(v.string()),
    nit: v.optional(v.string()),
    contactoEmail: v.optional(v.string()),
    contactoTelefono: v.optional(v.string()),
    logo: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await exigirAccesoCompania(ctx, args.companiaId, "seguridad.personal");

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.nombre !== undefined) {
      const nombre = args.nombre.trim();
      if (!nombre) throw new Error("El nombre no puede estar vacío.");
      patch.nombre = nombre;
    }
    if (args.nit !== undefined) {
      const nit = args.nit.trim() || undefined;
      await exigirNitLibre(ctx, nit, args.companiaId);
      patch.nit = nit;
    }
    if (args.contactoEmail !== undefined) {
      patch.contactoEmail = args.contactoEmail.trim().toLowerCase() || undefined;
    }
    if (args.contactoTelefono !== undefined) {
      patch.contactoTelefono = args.contactoTelefono.trim() || undefined;
    }
    if (args.logo !== undefined) patch.logo = args.logo.trim() || undefined;
    if (args.primaryColor !== undefined) {
      patch.primaryColor = args.primaryColor.trim() || undefined;
    }

    await ctx.db.patch(args.companiaId, patch);
    return args.companiaId;
  },
});

/**
 * Activa, suspende o da de baja una compañía. Solo plataforma.
 *
 * Suspender corta la operación de TODO su personal en TODOS sus contratos a
 * la vez: `asignacionVigente` deja de resolver en cuanto el estado no es
 * "activa". Los contratos y las asignaciones quedan intactos, que es
 * exactamente la diferencia entre suspender y terminar.
 */
export const setEstado = mutation({
  args: {
    companiaId: v.id("companiasSeguridad"),
    estado: estadoCompaniaValidator,
  },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);
    const compania = await ctx.db.get(args.companiaId);
    if (!compania) throw new Error("Compañía no encontrada.");

    await ctx.db.patch(args.companiaId, {
      estado: args.estado,
      updatedAt: Date.now(),
    });

    // Para que la interfaz pueda decir a cuánta gente y cuántos conjuntos afecta.
    const contratos = await ctx.db
      .query("companiaContratos")
      .withIndex("by_compania", (q) => q.eq("companiaId", args.companiaId))
      .collect();
    const asignaciones = await ctx.db
      .query("asignaciones")
      .withIndex("by_compania", (q) => q.eq("companiaId", args.companiaId))
      .collect();
    return {
      estado: args.estado,
      condominiosAfectados: contratos.filter((k) => estaVigente(k)).length,
      personasAfectadas: new Set(
        asignaciones.filter((a) => estaVigente(a)).map((a) => a.userId),
      ).size,
    };
  },
});

// ─────────────────────────────────────────────────────────────
// Personal de la compañía
// ─────────────────────────────────────────────────────────────

/**
 * Crea o reactiva el perfil de un miembro de la compañía. Sin contraseña.
 *
 * Réplica de `memberships.upsertCondoMemberProfile` en el otro eje, y por el
 * mismo motivo: la credencial se crea en la action, que sí puede hablar con
 * Better Auth.
 */
export const upsertMiembroProfile = mutation({
  args: {
    companiaId: v.id("companiasSeguridad"),
    email: v.string(),
    name: v.string(),
    telefono: v.optional(v.string()),
    roles: v.array(companiaRoleValidator),
    cargo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await exigirAccesoCompania(ctx, args.companiaId, "seguridad.personal");

    const email = args.email.trim().toLowerCase();
    const name = args.name.trim();
    if (!email || !name) throw new Error("Nombre y correo son obligatorios.");
    if (args.roles.length === 0) throw new Error("Selecciona al menos un rol.");

    const now = Date.now();
    const telefono = args.telefono?.trim() || undefined;
    const telefonoE164 = normalizarTelefonoE164(telefono) ?? undefined;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    let userId: Id<"users">;
    let existed = false;
    if (existing) {
      userId = existing._id;
      existed = true;
      /* Patch condicional: en Convex, patch con undefined BORRA el campo. Un
       * residente al que se da de alta como guarda no debe perder su
       * teléfono porque el formulario venga vacío. */
      const patch: Record<string, unknown> = { active: true, updatedAt: now };
      if (args.telefono !== undefined) {
        patch.telefono = telefono;
        patch.telefonoE164 = telefonoE164;
      }
      await ctx.db.patch(existing._id, patch);
    } else {
      userId = await ctx.db.insert("users", {
        name,
        email,
        telefono,
        telefonoE164,
        emailVerified: false,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    const previo = await ctx.db
      .query("companiaMiembros")
      .withIndex("by_compania_user", (q) =>
        q.eq("companiaId", args.companiaId).eq("userId", userId),
      )
      .unique();

    /* Pertenecer a dos compañías a la vez no es un caso real, y permitirlo
     * dejaría `getCompaniaMiembro` eligiendo arbitrariamente entre dos. */
    const enOtra = (
      await ctx.db
        .query("companiaMiembros")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    ).find((m) => m.isActive && m.companiaId !== args.companiaId);
    if (enOtra) {
      throw new Error(
        "Esa persona ya es personal activo de otra compañía. Debe darse de baja allí primero.",
      );
    }

    let miembroId: Id<"companiaMiembros">;
    if (previo) {
      miembroId = previo._id;
      await ctx.db.patch(previo._id, {
        roles: args.roles,
        cargo: args.cargo?.trim() || undefined,
        isActive: true,
        updatedAt: now,
      });
    } else {
      miembroId = await ctx.db.insert("companiaMiembros", {
        userId,
        companiaId: args.companiaId,
        roles: args.roles,
        cargo: args.cargo?.trim() || undefined,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { userId, miembroId, email, name, existed };
  },
});

/**
 * Alta completa de personal: perfil + credencial + membresía de compañía.
 *
 * Calcada de `users.createCondoMember`, que es el camino que el proyecto ya
 * usa para dar de alta gente con contraseña. Si la persona ya tenía cuenta
 * —un residente que además trabaja de guarda— se le respeta y solo se le
 * añade el vínculo con la compañía.
 */
export const crearMiembro = action({
  args: {
    companiaId: v.id("companiasSeguridad"),
    email: v.string(),
    name: v.string(),
    password: v.string(),
    telefono: v.optional(v.string()),
    roles: v.array(companiaRoleValidator),
    cargo: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    ok: true;
    userId: Id<"users">;
    miembroId: Id<"companiaMiembros">;
    existed: boolean;
  }> => {
    const password = args.password.trim();
    if (password.length < 8) {
      throw new Error("La contraseña debe tener al menos 8 caracteres.");
    }

    const perfil: {
      userId: Id<"users">;
      miembroId: Id<"companiaMiembros">;
      email: string;
      name: string;
      existed: boolean;
    } = await ctx.runMutation(api.companias.upsertMiembroProfile, {
      companiaId: args.companiaId,
      email: args.email,
      name: args.name,
      telefono: args.telefono,
      roles: args.roles,
      cargo: args.cargo,
    });

    const auth = createAuth(ctx);
    const authCtx = await auth.$context;
    const ia = authCtx.internalAdapter;
    const hashed = await authCtx.password.hash(password);

    const found = await ia.findUserByEmail(perfil.email);
    let authUserId: string;
    if (!found) {
      const created = await ia.createUser({
        email: perfil.email,
        name: perfil.name,
        emailVerified: false,
      });
      authUserId = created.id;
      await ia.createAccount({
        userId: created.id,
        providerId: "credential",
        accountId: created.id,
        password: hashed,
      });
    } else {
      authUserId = found.user.id;
      const accounts = await ia.findAccounts(found.user.id);
      const credential = accounts.find((a) => a.providerId === "credential");
      if (!credential) {
        await ia.createAccount({
          userId: found.user.id,
          providerId: "credential",
          accountId: found.user.id,
          password: hashed,
        });
      } else {
        await ia.updatePassword(found.user.id, hashed);
      }
    }

    await ctx.runMutation(api.users.linkAuthId, {
      userId: perfil.userId,
      authId: authUserId,
    });

    return {
      ok: true as const,
      userId: perfil.userId,
      miembroId: perfil.miembroId,
      existed: perfil.existed,
    };
  },
});

export const setRolesMiembro = mutation({
  args: {
    miembroId: v.id("companiaMiembros"),
    roles: v.array(companiaRoleValidator),
    cargo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const miembro = await ctx.db.get(args.miembroId);
    if (!miembro) throw new Error("Miembro no encontrado.");
    await exigirAccesoCompania(ctx, miembro.companiaId, "seguridad.personal");

    if (args.roles.length === 0) throw new Error("Selecciona al menos un rol.");

    /* Quitarle un rol a alguien que está asignado con ese rol dejaría una
     * asignación que ya no puede ejercerse. Se avisa en vez de romperla en
     * silencio: la decisión de terminar la asignación es de quien manda. */
    const asignaciones = await ctx.db
      .query("asignaciones")
      .withIndex("by_miembro", (q) => q.eq("companiaMiembroId", args.miembroId))
      .collect();
    const enConflicto = asignaciones.filter(
      (a) => estaVigente(a) && !args.roles.includes(a.rol),
    );
    if (enConflicto.length > 0) {
      throw new Error(
        `Tiene ${enConflicto.length} asignación(es) vigente(s) con un rol que estás quitando. Termínalas primero.`,
      );
    }

    await ctx.db.patch(args.miembroId, {
      roles: args.roles,
      cargo: args.cargo?.trim() || undefined,
      updatedAt: Date.now(),
    });
    return args.miembroId;
  },
});

/**
 * Da de baja a un miembro. No borra: pone `isActive` en false.
 *
 * Sus asignaciones dejan de resolver de inmediato porque
 * `asignacionVigente` comprueba el miembro, pero se les pone también fecha de
 * fin para que el histórico diga hasta cuándo estuvo, y no solo que ya no
 * está.
 */
export const desactivarMiembro = mutation({
  args: { miembroId: v.id("companiaMiembros") },
  handler: async (ctx, args) => {
    const miembro = await ctx.db.get(args.miembroId);
    if (!miembro) throw new Error("Miembro no encontrado.");
    await exigirAccesoCompania(ctx, miembro.companiaId, "seguridad.personal");

    const now = Date.now();
    await ctx.db.patch(args.miembroId, { isActive: false, updatedAt: now });

    const asignaciones = await ctx.db
      .query("asignaciones")
      .withIndex("by_miembro", (q) => q.eq("companiaMiembroId", args.miembroId))
      .collect();
    let cerradas = 0;
    for (const a of asignaciones) {
      if (!estaVigente(a, now)) continue;
      await ctx.db.patch(a._id, { vigenciaHasta: now });
      cerradas++;
    }
    return { ok: true as const, asignacionesCerradas: cerradas };
  },
});

// ─────────────────────────────────────────────────────────────
// Contratos compañía ↔ conjunto
// ─────────────────────────────────────────────────────────────

/**
 * Firma un contrato. Solo plataforma.
 *
 * Es lo que autoriza a la compañía sobre un conjunto: sin contrato vigente,
 * ninguna asignación de esa empresa resuelve.
 */
export const crearContrato = mutation({
  args: {
    companiaId: v.id("companiasSeguridad"),
    condominioId: v.id("condominios"),
    vigenciaDesde: v.number(),
    vigenciaHasta: v.optional(v.number()),
    notas: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requirePlatformStaff(ctx);

    const compania = await ctx.db.get(args.companiaId);
    if (!compania) throw new Error("Compañía no encontrada.");
    if (compania.estado === "inactiva") {
      throw new Error("No se puede contratar una compañía dada de baja.");
    }
    const condominio = await ctx.db.get(args.condominioId);
    if (!condominio) throw new Error("Conjunto no encontrado.");

    if (
      args.vigenciaHasta != null &&
      args.vigenciaHasta < args.vigenciaDesde
    ) {
      throw new Error("La fecha de fin no puede ser anterior a la de inicio.");
    }

    /* Dos contratos vigentes a la vez de la MISMA compañía en el MISMO
     * conjunto son un duplicado, no un caso real. Compañías DISTINTAS sí
     * pueden solaparse: ese solape es justo el empalme cuando un conjunto
     * cambia de empresa. */
    const previos = await ctx.db
      .query("companiaContratos")
      .withIndex("by_condominio_compania", (q) =>
        q.eq("condominioId", args.condominioId).eq("companiaId", args.companiaId),
      )
      .collect();
    const nuevo = {
      vigenciaDesde: args.vigenciaDesde,
      vigenciaHasta: args.vigenciaHasta,
    };
    if (previos.some((k) => haySolape(k, nuevo))) {
      throw new Error(
        "Esa compañía ya tiene un contrato que se solapa con esas fechas en este conjunto.",
      );
    }

    const now = Date.now();
    return await ctx.db.insert("companiaContratos", {
      companiaId: args.companiaId,
      condominioId: args.condominioId,
      vigenciaDesde: args.vigenciaDesde,
      vigenciaHasta: args.vigenciaHasta,
      notas: args.notas?.trim() || undefined,
      creadoPorUserId: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Termina un contrato poniéndole fecha de fin.
 *
 * No borra nada ni recorre sus asignaciones: dejan de resolver solas porque
 * `asignacionVigente` comprueba el contrato. Ése es el motivo de que la
 * asignación cuelgue del contrato y no del conjunto.
 */
export const terminarContrato = mutation({
  args: {
    contratoId: v.id("companiaContratos"),
    vigenciaHasta: v.number(),
  },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);
    const contrato = await ctx.db.get(args.contratoId);
    if (!contrato) throw new Error("Contrato no encontrado.");
    if (args.vigenciaHasta < contrato.vigenciaDesde) {
      throw new Error("La fecha de fin no puede ser anterior a la de inicio.");
    }

    await ctx.db.patch(args.contratoId, {
      vigenciaHasta: args.vigenciaHasta,
      updatedAt: Date.now(),
    });

    const asignaciones = await ctx.db
      .query("asignaciones")
      .withIndex("by_contrato", (q) => q.eq("contratoId", args.contratoId))
      .collect();
    return {
      ok: true as const,
      /* Para que la interfaz pueda decir a cuánta gente deja sin acceso
       * cuando llegue la fecha. */
      personasAfectadas: new Set(
        asignaciones
          .filter((a) => a.vigenciaHasta == null || a.vigenciaHasta > args.vigenciaHasta)
          .map((a) => a.userId),
      ).size,
    };
  },
});
