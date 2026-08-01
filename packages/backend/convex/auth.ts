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
// Solo para el flujo web de Apple (Sign in with Apple JS / redirect).
const appleServicesId = process.env.APPLE_SERVICES_ID?.trim() ?? "";
const appleClientSecret = process.env.APPLE_CLIENT_SECRET?.trim() ?? "";

/** Orígenes extra (coma-separados), p. ej. previews de Vercel. */
function extraTrustedOrigins(): string[] {
  const raw = process.env.AUTH_TRUSTED_ORIGINS?.trim() ?? "";
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    baseURL: convexSiteUrl,
    // Orígenes de confianza: web, Convex site, app nativa (vekino://) y Expo Go.
    // Convex corre con NODE_ENV=production, así que el plugin expo() NO agrega
    // exp:// solo. Incluimos wildcards para IPs LAN de Expo Go (docs Better Auth).
    trustedOrigins: [
      siteUrl,
      convexSiteUrl,
      // Previews / dominio de Vercel si SITE_URL apunta a otro host canónico.
      "https://*.vercel.app",
      ...extraTrustedOrigins(),
      `${appScheme}://`,
      `${appScheme}://*`,
      "exp://",
      "exp://**",
      "exp://192.168.*.*:*/**",
      "exp://10.*.*.*:*/**",
      "exp://172.*.*.*:*/**",
    ],
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
      // Apple:
      // - Nativo (iOS): idToken; se valida firma + audiencia contra appBundleIdentifier.
      // - Web: necesita un Services ID + client secret (JWT) de Apple. Si no están
      //   configurados, clientId cae al bundle id y solo funciona el flujo nativo.
      apple: {
        clientId: appleServicesId || appleBundleId,
        clientSecret: appleClientSecret,
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

      /* OAuth entre dominios distintos (arreglo de `state_mismatch`).
       *
       * El auth HTTP vive en …convex.site y la app en localhost / Vercel, así
       * que el POST que inicia el flujo social es cross-site. Better Auth
       * guarda el `state` en DOS sitios —la tabla `verification` y una cookie
       * firmada— y al volver de Google compara ambos. Esa cookie se emite en
       * un contexto de tercero: los navegadores que bloquean cookies de
       * terceros (Edge y Chrome por defecto hoy) no la guardan, y al volver
       * el chequeo falla con `state_security_mismatch`, que se le muestra al
       * usuario como `state_mismatch`.
       *
       * `skipStateCookieCheck` desactiva SOLO esa segunda comprobación. El
       * `state` se sigue verificando contra la base: es un nonce de un solo
       * uso con 10 minutos de vida, y Google usa además PKCE. Es lo mismo que
       * hace el plugin `crossDomain` de @convex-dev/better-auth; lo ponemos
       * aquí en vez de montar el plugin entero porque ese además cambia el
       * manejo de sesión y obligaría a tocar los clientes de web y móvil.
       *
       * Lo que se pierde: no podemos impedir que un flujo iniciado en un
       * navegador se complete en otro. */
      storeStateStrategy: "database",
      skipStateCookieCheck: true,
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
