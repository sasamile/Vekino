import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  getCurrentAppUser,
  getMembership,
  requireAppUser,
  vigentes,
} from "./model/authz";
import { normalizarTelefonoE164 } from "./lib/telefono";

/**
 * Las personas de una casa, administradas por su propietario.
 *
 * Hasta ahora solo la administración podía vincular a alguien con una
 * unidad. Eso significaba que dar de alta a un arrendatario —algo que pasa
 * todo el tiempo y que solo el dueño sabe cuándo ocurre— tenía que pedirse
 * por fuera del sistema.
 *
 * Dos figuras distintas:
 *
 *   · residente    — vive con el propietario. Vínculo indefinido.
 *   · arrendatario — usa la casa por un período. Vínculo CON VENCIMIENTO;
 *                    el día que se acaba deja de ver la casa (ver
 *                    `vigenciaHasta` en el schema).
 *
 * Los tres ven las mismas funcionalidades mientras el vínculo esté vigente.
 * La diferencia no es de permisos, es de duración y de quién responde.
 */

/** Solo el dueño de la casa da de alta a los demás. */
const PUEDE_ADMINISTRAR = "propietario";

/** Lo que el propietario puede crear. No puede fabricar otro propietario. */
const vinculoCreable = v.union(v.literal("residente"), v.literal("arrendatario"));

/** Un contrato que vence "el 31" cubre el 31 completo. */
const FIN_DEL_DIA = 24 * 60 * 60 * 1000;

/**
 * Comprueba que quien llama es propietario de esa unidad.
 *
 * Se exige el vínculo, no el rol: ser administrador del conjunto no lo hace
 * dueño de una casa ajena, y ser dueño no requiere ningún rol operativo.
 */
async function exigirPropietario(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  unidadId: Id<"unidades">,
) {
  const unidad = await ctx.db.get(unidadId);
  if (!unidad) throw new Error("Unidad no encontrada.");

  const membership = await getMembership(ctx, userId, unidad.condominioId);
  if (!membership?.isActive) throw new Error("Sin acceso a este condominio.");

  const links = await ctx.db
    .query("usuarioUnidad")
    .withIndex("by_membership", (q) => q.eq("membershipId", membership._id))
    .collect();

  const suya = vigentes(links).some(
    (l) => l.unidadId === unidadId && l.vinculo === PUEDE_ADMINISTRAR,
  );
  if (!suya) {
    throw new Error("Solo el propietario de la casa puede hacer esto.");
  }
  return { unidad, membership };
}

/** Las personas vinculadas a una casa del usuario actual. */
export const miHogar = query({
  args: { unidadId: v.id("unidades") },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) return null;

    const unidad = await ctx.db.get(args.unidadId);
    if (!unidad) return null;
    const membership = await getMembership(ctx, user._id, unidad.condominioId);
    if (!membership?.isActive) return null;

    /* Que la casa sea suya se comprueba con el vínculo, no con el rol.
     * Cualquiera vinculado ve quién más está; solo el dueño puede cambiarlo. */
    const mis = await ctx.db
      .query("usuarioUnidad")
      .withIndex("by_membership", (q) => q.eq("membershipId", membership._id))
      .collect();
    const mio = vigentes(mis).find((l) => l.unidadId === args.unidadId);
    if (!mio) return null;

    const todos = await ctx.db
      .query("usuarioUnidad")
      .withIndex("by_unidad", (q) => q.eq("unidadId", args.unidadId))
      .collect();

    const personas = await Promise.all(
      todos.map(async (l) => {
        const m = await ctx.db.get(l.membershipId);
        const u = m ? await ctx.db.get(m.userId) : null;
        const vencido =
          l.vigenciaHasta != null && Date.now() >= l.vigenciaHasta + FIN_DEL_DIA;
        return {
          _id: l._id,
          nombre: u?.name ?? "—",
          email: u?.email ?? null,
          telefono: u?.telefono ?? null,
          vinculo: l.vinculo,
          vigenciaDesde: l.vigenciaDesde ?? null,
          vigenciaHasta: l.vigenciaHasta ?? null,
          vencido,
          esYo: m?.userId === user._id,
        };
      }),
    );

    return {
      unidadNumero: unidad.numero,
      unidadTorre: unidad.torre ?? null,
      soyPropietario: mio.vinculo === PUEDE_ADMINISTRAR,
      personas: personas.sort(
        (a, b) =>
          Number(a.vencido) - Number(b.vencido) ||
          a.vinculo.localeCompare(b.vinculo),
      ),
    };
  },
});

/**
 * El propietario da de alta a alguien en su casa.
 *
 * Crea la persona si no existía. NO le manda las credenciales: enviar
 * correos es cosa de la administración, y que un propietario pudiera
 * disparar correos desde aquí sería una vía fácil de abuso. La persona queda
 * creada y la administración le entrega el acceso.
 */
export const agregarPersona = mutation({
  args: {
    unidadId: v.id("unidades"),
    nombre: v.string(),
    email: v.string(),
    telefono: v.optional(v.string()),
    vinculo: vinculoCreable,
    /** Obligatoria para el arrendatario: es lo que lo hace temporal. */
    vigenciaDesde: v.optional(v.number()),
    vigenciaHasta: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const yo = await requireAppUser(ctx);
    const { unidad } = await exigirPropietario(ctx, yo._id, args.unidadId);

    const email = args.email.trim().toLowerCase();
    const nombre = args.nombre.trim();
    if (!email || !nombre) throw new Error("Nombre y correo son obligatorios.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error("El correo no parece válido.");
    }

    /* El arrendatario SIN fecha de fin sería un vínculo indefinido, que es
     * justo lo que no es. Sin esto, el acceso no se cortaría nunca. */
    if (args.vinculo === "arrendatario" && !args.vigenciaHasta) {
      throw new Error("El arrendatario necesita una fecha de fin.");
    }
    if (
      args.vigenciaDesde &&
      args.vigenciaHasta &&
      args.vigenciaHasta < args.vigenciaDesde
    ) {
      throw new Error("La fecha de fin va después de la de inicio.");
    }

    const now = Date.now();
    const telefono = args.telefono?.trim() || undefined;

    // ── La persona ──
    const existente = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    let userId: Id<"users">;
    if (existente) {
      userId = existente._id;
      /* Patch condicional: en Convex un `undefined` BORRA el campo, y no se
       * le puede borrar el teléfono a alguien por volverlo a vincular. */
      const patch: Record<string, unknown> = { updatedAt: now };
      if (telefono) {
        patch.telefono = telefono;
        patch.telefonoE164 = normalizarTelefonoE164(telefono) ?? undefined;
      }
      await ctx.db.patch(userId, patch);
    } else {
      userId = await ctx.db.insert("users", {
        name: nombre,
        email,
        telefono,
        telefonoE164: telefono
          ? (normalizarTelefonoE164(telefono) ?? undefined)
          : undefined,
        emailVerified: false,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    // ── Su membresía en el condominio ──
    let membership = await getMembership(ctx, userId, unidad.condominioId);
    if (!membership) {
      const id = await ctx.db.insert("memberships", {
        userId,
        condominioId: unidad.condominioId,
        /* Mismo rol que el dueño: dentro de su casa ven lo mismo. La
         * diferencia entre las tres figuras es de duración, no de permisos. */
        roles: ["propietario"],
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      membership = (await ctx.db.get(id))!;
    } else if (!membership.isActive) {
      await ctx.db.patch(membership._id, { isActive: true, updatedAt: now });
    }

    // ── El vínculo con la casa ──
    const previos = await ctx.db
      .query("usuarioUnidad")
      .withIndex("by_membership", (q) => q.eq("membershipId", membership!._id))
      .collect();
    const yaEsta = previos.find((l) => l.unidadId === args.unidadId);

    if (yaEsta) {
      /* Renovar en vez de duplicar: es el caso de un arrendatario que
       * extiende el contrato. */
      await ctx.db.patch(yaEsta._id, {
        vinculo: args.vinculo,
        vigenciaDesde: args.vigenciaDesde,
        vigenciaHasta: args.vigenciaHasta,
        creadoPorUserId: yo._id,
      });
      return { renovado: true as const, userId };
    }

    await ctx.db.insert("usuarioUnidad", {
      membershipId: membership._id,
      unidadId: args.unidadId,
      condominioId: unidad.condominioId,
      vinculo: args.vinculo,
      esPrincipal: previos.length === 0,
      vigenciaDesde: args.vigenciaDesde,
      vigenciaHasta: args.vigenciaHasta,
      creadoPorUserId: yo._id,
      createdAt: now,
    });
    return { renovado: false as const, userId };
  },
});

/**
 * El propietario termina el vínculo de alguien con su casa.
 *
 * Se borra el vínculo, no la persona ni su cuenta: pudo haber firmado
 * poderes, votado en una asamblea o recibido paquetes, y todo eso tiene que
 * seguir diciendo quién fue.
 */
export const quitarPersona = mutation({
  args: { vinculoId: v.id("usuarioUnidad") },
  handler: async (ctx, args) => {
    const yo = await requireAppUser(ctx);
    const link = await ctx.db.get(args.vinculoId);
    if (!link) return;
    await exigirPropietario(ctx, yo._id, link.unidadId);

    if (link.vinculo === PUEDE_ADMINISTRAR) {
      throw new Error("El propietario no se puede quitar a sí mismo.");
    }
    await ctx.db.delete(args.vinculoId);
  },
});

/** Ajusta las fechas de un arrendatario (renovación o terminación anticipada). */
export const cambiarVigencia = mutation({
  args: {
    vinculoId: v.id("usuarioUnidad"),
    vigenciaDesde: v.optional(v.number()),
    vigenciaHasta: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const yo = await requireAppUser(ctx);
    const link = await ctx.db.get(args.vinculoId);
    if (!link) throw new Error("Vínculo no encontrado.");
    await exigirPropietario(ctx, yo._id, link.unidadId);

    if (link.vinculo === "arrendatario" && !args.vigenciaHasta) {
      throw new Error("El arrendatario necesita una fecha de fin.");
    }
    await ctx.db.patch(args.vinculoId, {
      vigenciaDesde: args.vigenciaDesde,
      vigenciaHasta: args.vigenciaHasta,
    });
  },
});
