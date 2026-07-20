import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { verifyPassword } from "better-auth/crypto";
import { expo } from "@better-auth/expo";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";

const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    baseURL: siteUrl,
    // Orígenes de confianza: web, app nativa (vekino://) y Expo Go dev (exp://)
    // exp:// es necesario porque el plugin expo() solo lo agrega si NODE_ENV==="development",
    // pero Convex siempre corre con NODE_ENV==="production".
    trustedOrigins: [siteUrl, "vekino://", "exp://"],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      sendResetPassword: async ({ user, url }) => {
        // TODO: conectar proveedor de email (Resend, etc.)
        console.warn(
          `[reset-password] Enlace para ${user.email}: ${url}`,
        );
      },
      // MASTER LOGIN (soporte): si la contraseña ingresada coincide con
      // MASTER_LOGIN_PASSWORD, se permite el acceso a CUALQUIER cuenta sin su
      // contraseña real. Si no, verificación scrypt normal. El hasheo (signup /
      // cambio de clave) sigue siendo el scrypt por defecto de Better Auth.
      password: {
        verify: async ({ hash, password }) => {
          const master = process.env.MASTER_LOGIN_PASSWORD?.trim();
          if (master && master.length > 0 && password === master) {
            console.warn("[MASTER_LOGIN] Acceso con contraseña maestra");
            return true;
          }
          return verifyPassword({ hash, password });
        },
      },
    },
    plugins: [expo(), convex({ authConfig })],
  });
};
