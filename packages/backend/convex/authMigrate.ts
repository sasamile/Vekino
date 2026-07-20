import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { createAuth } from "./auth";

/** DEV: diagnostica si un email tiene usuario + credencial en Better Auth. */
export const checkAuthByEmail = internalAction({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const auth = createAuth(ctx);
    const authCtx = await auth.$context;
    const ia = authCtx.internalAdapter;
    const found = await ia.findUserByEmail(args.email.trim().toLowerCase());
    if (!found) return { authUser: false as const, hasCredential: false as const };
    const accounts = await ia.findAccounts(found.user.id);
    const cred = accounts.find((a) => a.providerId === "credential");
    return {
      authUser: true as const,
      hasCredential: !!cred,
      providers: accounts.map((a) => a.providerId),
    };
  },
});

/** DEV: elimina un usuario de Better Auth (y sus cuentas/sesiones) por email. */
export const deleteAuthUserByEmail = internalAction({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const auth = createAuth(ctx);
    const authCtx = await auth.$context;
    const ia = authCtx.internalAdapter;
    const found = await ia.findUserByEmail(args.email);
    if (!found) return { deleted: false };
    await ia.deleteUserSessions(found.user.id);
    await ia.deleteAccounts(found.user.id);
    await ia.deleteUser(found.user.id);
    return { deleted: true };
  },
});

/**
 * MIGRACIÓN DE CREDENCIALES (Fase 2 — auth)
 *
 * Importa usuarios + cuentas de credencial (email/password) al componente
 * Better Auth CON EL HASH EXISTENTE INTACTO. El sistema antiguo también usa
 * Better Auth (scrypt por defecto, formato `salt:hash`), así que los hashes son
 * directamente compatibles y NADIE tiene que restablecer su contraseña.
 *
 * Idempotente: si el email ya existe en Better Auth, se omite.
 * Es `internalAction` → solo se invoca desde el script de migración / CLI.
 */
export const importCredentials = internalAction({
  args: {
    accounts: v.array(
      v.object({
        email: v.string(),
        name: v.string(),
        emailVerified: v.optional(v.boolean()),
        hash: v.string(), // account.password del sistema antiguo (scrypt salt:hash)
      }),
    ),
  },
  handler: async (ctx, args) => {
    const auth = createAuth(ctx);
    const authCtx = await auth.$context;
    const ia = authCtx.internalAdapter;

    let created = 0;
    let skipped = 0;
    let errors = 0;
    const errorEmails: string[] = [];

    for (const a of args.accounts) {
      try {
        const existing = await ia.findUserByEmail(a.email);
        if (existing) {
          skipped++;
          continue;
        }
        const user = await ia.createUser({
          email: a.email,
          name: a.name,
          emailVerified: a.emailVerified ?? false,
        });
        await ia.createAccount({
          userId: user.id,
          providerId: "credential",
          accountId: user.id,
          password: a.hash,
        });
        created++;
      } catch (e) {
        errors++;
        errorEmails.push(a.email);
      }
    }

    return { created, skipped, errors, errorEmails: errorEmails.slice(0, 10) };
  },
});
