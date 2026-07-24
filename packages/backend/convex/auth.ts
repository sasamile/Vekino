import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { verifyPassword } from "better-auth/crypto";
import { expo } from "@better-auth/expo";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import { sendPasswordResetEmail } from "./lib/brevo";

const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";
// Auth HTTP vive en Convex (.convex.site). Google OAuth debe usar esta URL
// como redirect: https://….convex.site/api/auth/callback/google
const convexSiteUrl = process.env.CONVEX_SITE_URL ?? siteUrl;
const appScheme = "vekino";
const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
// Sign in with Apple (iOS nativo): el token de identidad de Apple trae como
// audiencia el bundle id de la app. Better Auth verifica ese idToken contra las
// llaves públicas de Apple usando appBundleIdentifier — NO necesita clientSecret
// ni Services ID para el flujo nativo con idToken (solo verificación de firma).
const appleBundleId = process.env.APPLE_BUNDLE_ID?.trim() || "com.vekino.app";

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    baseURL: convexSiteUrl,
    // Orígenes de confianza: web, Convex site, app nativa (vekino://) y Expo Go (exp://)
    // exp:// es necesario porque el plugin expo() solo lo agrega si NODE_ENV==="development",
    // pero Convex siempre corre con NODE_ENV==="production".
    trustedOrigins: [siteUrl, convexSiteUrl, `${appScheme}://`, "exp://"],
    database: authComponent.adapter(ctx),
    socialProviders: {
      ...(googleClientId && googleClientSecret
        ? {
            google: {
              clientId: googleClientId,
              clientSecret: googleClientSecret,
            },
          }
        : {}),
      // Apple: solo flujo nativo con idToken (verificación de firma + audiencia).
      // clientSecret vacío es intencional: nunca se usa el flujo web de Apple.
      apple: {
        clientId: appleBundleId,
        clientSecret: "",
        appBundleIdentifier: appleBundleId,
      },
    },
    // Si el usuario ya existe con email/contraseña (emailVerified=false porque
    // no exigimos verificación), Better Auth bloquea el link implícito salvo:
    // - el proveedor en trustedProviders, y
    // - requireLocalEmailVerified: false (Google/Apple ya verifican el correo).
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google", "apple"],
        requireLocalEmailVerified: false,
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      sendResetPassword: async ({ user, token }) => {
        const webUrl = `${siteUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
        const appUrl = `${appScheme}://reset-password?token=${encodeURIComponent(token)}`;
        await sendPasswordResetEmail({
          to: { email: user.email, name: user.name },
          webUrl,
          appUrl,
        });
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
