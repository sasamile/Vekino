import { query } from "./_generated/server";
import { requirePlatformStaff } from "./model/authz";

/**
 * Estadísticas del panel maestro (solo staff de plataforma / superadmin).
 * Control maestro: visión global de todo el SaaS.
 */
export const stats = query({
  args: {},
  handler: async (ctx) => {
    await requirePlatformStaff(ctx);

    const [condominios, users, memberships, unidades, tickets] =
      await Promise.all([
        ctx.db.query("condominios").collect(),
        ctx.db.query("users").collect(),
        ctx.db.query("memberships").collect(),
        ctx.db.query("unidades").collect(),
        ctx.db.query("soporteTickets").order("desc").take(8),
      ]);

    const membersByCondo = new Map<string, number>();
    for (const m of memberships) {
      if (!m.isActive) continue;
      const key = m.condominioId;
      membersByCondo.set(key, (membersByCondo.get(key) ?? 0) + 1);
    }

    const unitsByCondo = new Map<string, number>();
    for (const u of unidades) {
      const key = u.condominioId;
      unitsByCondo.set(key, (unitsByCondo.get(key) ?? 0) + 1);
    }

    const ranking = [...condominios]
      .map((c) => ({
        id: c._id,
        name: c.name,
        city: c.city ?? null,
        isActive: c.isActive,
        plan: c.subscriptionPlan ?? null,
        members: membersByCondo.get(c._id) ?? 0,
        unidades: unitsByCondo.get(c._id) ?? 0,
        createdAt: c.createdAt,
      }))
      .sort((a, b) => b.members - a.members || a.name.localeCompare(b.name));

    const recientes = [...condominios]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 6)
      .map((c) => ({
        id: c._id,
        name: c.name,
        city: c.city ?? null,
        isActive: c.isActive,
        plan: c.subscriptionPlan ?? null,
        members: membersByCondo.get(c._id) ?? 0,
        unidades: unitsByCondo.get(c._id) ?? 0,
        createdAt: c.createdAt,
      }));

    const ticketsAbiertos = tickets.filter(
      (t) => t.estado === "abierto" || t.estado === "en_gestion",
    ).length;

    return {
      condominios: {
        total: condominios.length,
        activos: condominios.filter((c) => c.isActive).length,
        inactivos: condominios.filter((c) => !c.isActive).length,
      },
      usuarios: {
        total: users.length,
        activos: users.filter((u) => u.active).length,
        inactivos: users.filter((u) => !u.active).length,
        superadmins: users.filter((u) => u.platformRole === "superadmin")
          .length,
        admins: users.filter((u) => u.platformRole === "admin").length,
        sinRolPlataforma: users.filter((u) => !u.platformRole).length,
      },
      membresias: {
        total: memberships.length,
        activas: memberships.filter((m) => m.isActive).length,
      },
      unidades: {
        total: unidades.length,
      },
      soporte: {
        abiertos: ticketsAbiertos,
        recientes: tickets.map((t) => ({
          id: t._id,
          asunto: t.asunto,
          estado: t.estado,
          categoria: t.categoria,
          userNombre: t.userNombre,
          condominioNombre: t.condominioNombre ?? null,
          createdAt: t.createdAt,
        })),
      },
      ranking,
      recientes,
    };
  },
});
