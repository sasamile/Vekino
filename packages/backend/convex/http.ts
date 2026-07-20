import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

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
