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

    const condominios = await ctx.db.query("condominios").collect();
    const users = await ctx.db.query("users").collect();

    return {
      condominios: {
        total: condominios.length,
        activos: condominios.filter((c) => c.isActive).length,
        inactivos: condominios.filter((c) => !c.isActive).length,
      },
      usuarios: {
        total: users.length,
        superadmins: users.filter((u) => u.platformRole === "superadmin").length,
        admins: users.filter((u) => u.platformRole === "admin").length,
      },
    };
  },
});
