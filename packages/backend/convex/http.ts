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

// ─────────────────────────────────────────────────────────────
// Transcriptor de asambleas
//
// El motor de voz vive fuera de Convex (`infra/transcriptor`) porque
// reconocer habla exige mantener un socket abierto por hablante durante
// horas. Estas dos rutas son todo lo que necesita: preguntar a qué salas
// entrar y devolver texto.
//
// Se autentica con un secreto compartido y no con una sesión de usuario:
// es un servicio, no una persona. `TRANSCRIPTOR_SECRET` vive en Convex y en
// la máquina del servidor de medios, en ningún otro lado.
// ─────────────────────────────────────────────────────────────

/**
 * Comparación en tiempo constante.
 *
 * Un `===` sobre secretos se rinde en el primer byte distinto, y ese tiempo
 * es medible: sirve para adivinar el secreto carácter por carácter. Aquí
 * cuesta lo mismo fallar en el primero que en el último.
 */
function secretoValido(recibido: string | null): boolean {
  const esperado = process.env.TRANSCRIPTOR_SECRET ?? "";
  // Sin secreto configurado, la ruta queda cerrada. Nunca abierta.
  if (esperado.length < 16) return false;
  if (!recibido) return false;

  const a = new TextEncoder().encode(recibido);
  const b = new TextEncoder().encode(esperado);
  let dif = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    dif |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return dif === 0;
}

function bearer(request: Request): string | null {
  const cabecera = request.headers.get("Authorization") ?? "";
  const m = cabecera.match(/^Bearer\s+(.+)$/i);
  return m ? m[1]!.trim() : null;
}

/** Salas que el transcriptor debe estar atendiendo ahora mismo. */
http.route({
  path: "/transcriptor/salas",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!secretoValido(bearer(request))) {
      return new Response("No autorizado", { status: 401 });
    }
    const salas = await ctx.runQuery(internal.intervenciones.salasActivas, {});
    return Response.json({ salas });
  }),
});

/**
 * Recibe un segmento transcrito.
 *
 * Responde 200 aunque el segmento se descarte (asamblea cerrada,
 * transcripción apagada, hablante desconocido). El transcriptor no debe
 * reintentar ni caerse porque a alguien se le cayó la sesión a mitad de una
 * frase: eso es ruido esperable, no un fallo.
 */
http.route({
  path: "/transcriptor/intervencion",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!secretoValido(bearer(request))) {
      return new Response("No autorizado", { status: 401 });
    }

    let cuerpo: {
      asambleaId?: string;
      identidad?: string;
      texto?: string;
      inicioEn?: number;
      finEn?: number;
      confianza?: number;
    };
    try {
      cuerpo = await request.json();
    } catch {
      return new Response("JSON inválido", { status: 400 });
    }

    const { asambleaId, identidad, texto, inicioEn, finEn } = cuerpo;
    if (
      typeof asambleaId !== "string" ||
      typeof identidad !== "string" ||
      typeof texto !== "string" ||
      typeof inicioEn !== "number" ||
      typeof finEn !== "number"
    ) {
      return new Response("Faltan campos", { status: 400 });
    }

    const id = await ctx.runMutation(internal.intervenciones.registrarHttp, {
      asambleaId,
      identidad,
      // Un segmento de voz no llega ni cerca de esto; el tope está para que
      // un cliente roto no pueda escribir un documento entero por fila.
      texto: texto.slice(0, 4000),
      inicioEn,
      finEn,
      confianza:
        typeof cuerpo.confianza === "number" ? cuerpo.confianza : undefined,
    });

    return Response.json({ guardado: id != null });
  }),
});

export default http;
