import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

/* `cors: true` es obligatorio desde que la web llama a estas rutas DIRECTO
 * desde el navegador (ver `lib/auth-client.ts`). Antes todo pasaba por el
 * proxy de Next —servidor a servidor, sin CORS— y por eso nunca hizo falta.
 *
 * Sin esto el navegador ni siquiera llega a la petición: el preflight
 * `OPTIONS` responde 404 porque no hay ruta registrada para ese método, y la
 * promesa revienta con un `TypeError: Failed to fetch` que no dice nada.
 *
 * Los valores por defecto ya traen lo que necesita el flujo cross-domain:
 * los orígenes salen de `trustedOrigins` (auth.ts + AUTH_TRUSTED_ORIGINS),
 * `Better-Auth-Cookie` va en las cabeceras permitidas y
 * `Set-Better-Auth-Cookie` en las expuestas — esta última es la que el
 * cliente tiene que poder LEER para guardar la sesión. */
authComponent.registerRoutes(http, createAuth, { cors: true });

// ─────────────────────────────────────────────────────────────
// Retorno de la Pasarela de Pagos Aval
//
// Aval redirige al usuario a la PortalURL que enviamos en Trn, concatenando
// ?pmtId=<PmtAuthId>. Aquí disparamos una consulta inmediata del estado
// (BasicData) y redirigimos al comprobante en la app web.
// ─────────────────────────────────────────────────────────────
http.route({
  path: "/aval/retorno",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const pmtId =
      url.searchParams.get("pmtId") ??
      url.searchParams.get("PmtId") ??
      url.searchParams.get("pmtid") ??
      "";

    const webBase = process.env.WEB_APP_URL ?? "http://localhost:3000";

    if (!pmtId) {
      return Response.redirect(`${webBase}/pago/retorno`, 302);
    }

    let condominioId: string | null = null;
    try {
      const res = await ctx.runAction(internal.pagos.consultarEstadoPorPmt, {
        pmtId,
      });
      condominioId = res?.condominioId ?? null;
    } catch {
      // No bloquear el retorno del usuario si la consulta falla; la UI reintenta.
    }

    const dest = condominioId
      ? `${webBase}/mi/${condominioId}/pago/retorno?pmtId=${encodeURIComponent(pmtId)}`
      : `${webBase}/pago/retorno?pmtId=${encodeURIComponent(pmtId)}`;

    return Response.redirect(dest, 302);
  }),
});

export default http;
