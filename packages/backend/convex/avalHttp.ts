"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import * as https from "node:https";

// ─────────────────────────────────────────────────────────────
// Cliente HTTP (Node) para la Pasarela de Pagos Aval.
//
// Necesario porque el runtime por defecto de Convex (fetch en Rust) no permite
// ajustar la verificación TLS, y el endpoint de QA (qa.psp.ath.com.co) no envía
// la cadena de certificados intermedia → CERTIFICATE_VERIFY_FAILED.
//
// En Node podemos controlar la verificación TLS. Para QA se permite relajarla
// (`insecure`); en PRODUCCIÓN debe ir SIEMPRE con verificación estricta.
// ─────────────────────────────────────────────────────────────

export const request = internalAction({
  args: {
    url: v.string(),
    method: v.string(),
    headers: v.any(),
    body: v.optional(v.string()),
    insecure: v.optional(v.boolean()),
  },
  handler: async (
    _ctx,
    args,
  ): Promise<{ status: number; headers: Record<string, string>; text: string }> => {
    return await new Promise((resolve, reject) => {
      const u = new URL(args.url);
      const req = https.request(
        {
          method: args.method,
          hostname: u.hostname,
          port: u.port ? Number(u.port) : 443,
          path: u.pathname + u.search,
          headers: args.headers as Record<string, string>,
          rejectUnauthorized: !args.insecure,
        },
        (res) => {
          let data = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            const headers: Record<string, string> = {};
            for (const [k, val] of Object.entries(res.headers)) {
              headers[k.toLowerCase()] = Array.isArray(val)
                ? val.join(", ")
                : String(val ?? "");
            }
            resolve({ status: res.statusCode ?? 0, headers, text: data });
          });
        },
      );
      req.on("error", reject);
      if (args.body) req.write(args.body);
      req.end();
    });
  },
});
