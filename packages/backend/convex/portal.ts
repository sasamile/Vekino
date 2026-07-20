import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  getCurrentAppUser,
  getMembership,
  hasPlatformRole,
} from "./model/authz";

/**
 * PORTAL DEL RESIDENTE / PROPIETARIO
 *
 * A diferencia de `condominios.adminHome` (que exige rol administrativo), este
 * home autoriza a CUALQUIER miembro activo del condominio: propietario,
 * arrendatario, residente, apoderado, etc. Es la puerta de entrada al área
 * "/mi/[id]" que ve la persona que vive en el conjunto.
 *
 * Devuelve la marca del condominio (para el tema/logo del portal) y las unidades
 * vinculadas a la persona (su apartamento/casa), con su vínculo y coeficiente.
 */
export const home = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) return { allowed: false as const };

    const condominio = await ctx.db.get(args.condominioId);
    if (!condominio) return { allowed: false as const };

    const isPlatform = hasPlatformRole(user, "superadmin", "admin");
    const membership = await getMembership(ctx, user._id, args.condominioId);
    const isMember = !!membership && membership.isActive;

    // Solo miembros del condominio (o staff de plataforma, para previsualizar).
    if (!isPlatform && !isMember) return { allowed: false as const };

    // Unidades vinculadas a la persona dentro de este condominio.
    let unidades: {
      _id: string;
      numero: string;
      torre: string | null;
      bloque: string | null;
      tipo: Doc<"unidades">["tipo"];
      estado: Doc<"unidades">["estado"];
      coeficiente: number | null;
      vinculo: Doc<"usuarioUnidad">["vinculo"];
      esPrincipal: boolean;
    }[] = [];

    if (membership) {
      const links = await ctx.db
        .query("usuarioUnidad")
        .withIndex("by_membership", (q) => q.eq("membershipId", membership._id))
        .collect();

      const rows = await Promise.all(
        links.map(async (l) => {
          const u = await ctx.db.get(l.unidadId);
          if (!u) return null;
          return {
            _id: u._id as string,
            numero: u.numero,
            torre: u.torre ?? null,
            bloque: u.bloque ?? null,
            tipo: u.tipo,
            estado: u.estado,
            coeficiente: u.coeficiente ?? null,
            vinculo: l.vinculo,
            esPrincipal: l.esPrincipal,
          };
        }),
      );

      unidades = rows
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .sort((a, b) => Number(b.esPrincipal) - Number(a.esPrincipal));
    }

    return {
      allowed: true as const,
      isPlatform,
      userId: user._id as string,
      userName: user.name,
      userEmail: user.email,
      myRoles: membership?.roles ?? [],
      membershipId: (membership?._id ?? null) as string | null,
      unidades,
      condominio: {
        _id: condominio._id as string,
        name: condominio.name,
        city: condominio.city ?? null,
        address: condominio.address ?? null,
        nit: condominio.nit ?? null,
        logo: condominio.logo ?? null,
        primaryColor: condominio.primaryColor ?? null,
        avalPortalUrl: condominio.avalPortalUrl ?? null,
      },
    };
  },
});

/**
 * Actividad del usuario para la home del portal (stat cards + secciones):
 * reservas activas (pendientes/aprobadas) de sus unidades y PQRS abiertos.
 * No usa fecha del servidor (las queries son deterministas); el cliente filtra
 * por fecha si lo necesita.
 */
export const misActividades = query({
  args: { condominioId: v.id("condominios") },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) return { reservasActivas: [], ticketsAbiertos: 0 };

    const membership = await getMembership(ctx, user._id, args.condominioId);

    // PQRS abiertos del usuario
    const pqrs = await ctx.db
      .query("pqrs")
      .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
      .collect();
    const ticketsAbiertos = pqrs.filter(
      (p) =>
        p.solicitanteUserId === user._id &&
        (p.estado === "abierto" || p.estado === "en_gestion"),
    ).length;

    // Reservas activas de las unidades del usuario
    let reservasActivas: {
      _id: string;
      zonaNombre: string;
      unidadNumero: string;
      fecha: string;
      horaInicio: string;
      horaFin: string;
      estado: Doc<"reservas">["estado"];
    }[] = [];

    if (membership) {
      const links = await ctx.db
        .query("usuarioUnidad")
        .withIndex("by_membership", (q) => q.eq("membershipId", membership._id))
        .collect();
      const unidadIds = new Set(links.map((l) => l.unidadId));

      if (unidadIds.size > 0) {
        const reservas = await ctx.db
          .query("reservas")
          .withIndex("by_condominio", (q) => q.eq("condominioId", args.condominioId))
          .collect();
        reservasActivas = reservas
          .filter(
            (r) =>
              unidadIds.has(r.unidadId) &&
              (r.estado === "pendiente" || r.estado === "aprobada"),
          )
          .sort((a, b) => b.fecha.localeCompare(a.fecha))
          .slice(0, 5)
          .map((r) => ({
            _id: r._id as string,
            zonaNombre: r.zonaNombre,
            unidadNumero: r.unidadNumero,
            fecha: r.fecha,
            horaInicio: r.horaInicio,
            horaFin: r.horaFin,
            estado: r.estado,
          }));
      }
    }

    return { reservasActivas, ticketsAbiertos };
  },
});
