/**
 * Cliente HTTP de YCloud (WhatsApp Business API).
 *
 * Se usa SOLO desde actions/internalActions (las mutations de Convex no pueden
 * hacer fetch). TLS de YCloud es sano: fetch normal, sin el wrapper node:https
 * que necesita Aval.
 *
 * Env (bunx convex env set):
 * - YCLOUD_API_KEY          header X-API-Key
 * - YCLOUD_PHONE_NUMBER_ID  número WABA emisor (campo `from`, ej "+57...")
 * - YCLOUD_WABA_ID          id de la cuenta WhatsApp Business (plantillas)
 */

const BASE = "https://api.ycloud.com/v2";

export type YCloudSendResponse = {
  id: string;
  status?: string;
  [k: string]: unknown;
};

function apiKey(): string {
  const key = process.env.YCLOUD_API_KEY ?? "";
  if (!key) throw new Error("YCLOUD_API_KEY no está configurada en Convex.");
  return key;
}

export function ycloudFrom(): string {
  const from = process.env.YCLOUD_PHONE_NUMBER_ID ?? "";
  if (!from) throw new Error("YCLOUD_PHONE_NUMBER_ID no está configurada en Convex.");
  return from;
}

export async function ycloudRequest(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "X-API-Key": apiKey(),
      "Content-Type": "application/json",
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* respuestas sin cuerpo (DELETE) */
  }
  return { status: res.status, json };
}

/**
 * Envía un mensaje de WhatsApp (sendDirectly = síncrono, sin cola).
 * `payload` va sin `from`: se inyecta aquí.
 */
export async function enviarMensaje(
  payload: Record<string, unknown> & { to: string },
): Promise<YCloudSendResponse> {
  /* Dos destinatarios posibles y NO son intercambiables:
   *  - `to`        → teléfono en E.164 ("+573181833248")
   *  - `recipient` → BSUID de Meta ("CO.1151171038077362"), que es lo único
   *                  que llega cuando la persona activó su @usuario y ya no
   *                  comparte el número.
   * Poner un BSUID en `to` responde "Invalid E.164 phone number" y un
   * teléfono en `recipient` responde "Invalid BSUID format". Aquí se elige
   * solo, mirando la forma del destino, para que quien llama no se entere. */
  const { to, ...resto } = payload;
  const esBsuid = /^[A-Z]{2}\.(ENT\.)?[A-Za-z0-9]+$/.test(to);
  const destino = esBsuid ? { recipient: to } : { to };

  const { status, json } = await ycloudRequest("/whatsapp/messages/sendDirectly", {
    method: "POST",
    body: { from: ycloudFrom(), ...destino, ...resto },
  });
  if (status >= 300) {
    throw new Error(
      `YCloud ${status}: ${json?.message ?? json?.error?.message ?? "error al enviar"}`,
    );
  }
  return json as YCloudSendResponse;
}

// ─── Constructores de payload ────────────────────────────────

export function msgTexto(to: string, body: string) {
  return { to, type: "text", text: { body: body.slice(0, 4096) } };
}

export function msgDocumento(
  to: string,
  link: string,
  opts: { filename?: string; caption?: string } = {},
) {
  return { to, type: "document", document: { link, ...opts } };
}

/** Hasta 3 botones; title máx 20 chars (límite de WhatsApp). */
export function msgBotones(
  to: string,
  body: string,
  botones: Array<{ id: string; title: string }>,
) {
  return {
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body.slice(0, 1024) },
      action: {
        buttons: botones.slice(0, 3).map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  };
}

/** Lista desplegable: hasta 10 filas; title máx 24 chars, description 72. */
export function msgLista(
  to: string,
  body: string,
  boton: string,
  filas: Array<{ id: string; title: string; description?: string }>,
) {
  return {
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: body.slice(0, 1024) },
      action: {
        button: boton.slice(0, 20),
        sections: [
          {
            rows: filas.slice(0, 10).map((f) => ({
              id: f.id,
              title: f.title.slice(0, 24),
              ...(f.description ? { description: f.description.slice(0, 72) } : {}),
            })),
          },
        ],
      },
    },
  };
}

/**
 * Plantilla con parámetros de cuerpo y, si la plantilla tiene botón de URL
 * dinámica, el sufijo que lo completa.
 *
 * OJO: los `components` van DENTRO de `template`, no en la raíz del mensaje.
 * Ponerlos arriba hace que Meta no los vea y responda
 * "(#131008) Required parameter is missing".
 */
export function msgPlantillaConBoton(
  to: string,
  nombre: string,
  codigoIdioma: string,
  parametrosBody: string[],
  sufijoUrl?: string,
) {
  const components: Array<Record<string, unknown>> = [];
  if (parametrosBody.length > 0) {
    components.push({
      type: "body",
      parameters: parametrosBody.map((t) => ({ type: "text", text: t })),
    });
  }
  if (sufijoUrl) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: sufijoUrl }],
    });
  }

  return {
    to,
    type: "template",
    template: {
      name: nombre,
      language: { code: codigoIdioma, policy: "deterministic" },
      ...(components.length > 0 ? { components } : {}),
    },
  };
}

/** Plantilla pre-aprobada (obligatoria fuera de la ventana de 24 h). */
export function msgPlantilla(
  to: string,
  nombre: string,
  codigoIdioma: string,
  parametrosBody: string[] = [],
) {
  return {
    to,
    type: "template",
    template: {
      name: nombre,
      language: { code: codigoIdioma, policy: "deterministic" },
      ...(parametrosBody.length > 0
        ? {
            components: [
              {
                type: "body",
                parameters: parametrosBody.map((t) => ({ type: "text", text: t })),
              },
            ],
          }
        : {}),
    },
  };
}

/**
 * Texto legible de un mensaje saliente, para guardarlo en el historial.
 *
 * Sin esto, en el inbox del equipo aparecía el JSON crudo del payload
 * ({"type":"list","body":{"text":...}}), que es ilegible y esconde justo lo
 * que interesa: qué se le dijo a la persona.
 */
export function describirMensaje(payload: Record<string, any>): string {
  const tipo = payload.type ?? "text";

  if (tipo === "text") return payload.text?.body ?? "";

  if (tipo === "interactive") {
    const i = payload.interactive ?? {};
    const cuerpo = i.body?.text ?? "";
    if (i.type === "button") {
      const botones = (i.action?.buttons ?? [])
        .map((b: any) => b.reply?.title)
        .filter(Boolean);
      return botones.length ? `${cuerpo}\n\n[ ${botones.join(" ] [ ")} ]` : cuerpo;
    }
    if (i.type === "list") {
      const filas = (i.action?.sections ?? [])
        .flatMap((s: any) => s.rows ?? [])
        .map((r: any) => `• ${r.title}${r.description ? ` — ${r.description}` : ""}`);
      return filas.length ? `${cuerpo}\n\n${filas.join("\n")}` : cuerpo;
    }
    return cuerpo;
  }

  if (tipo === "template") {
    const t = payload.template ?? {};
    const params = (t.components ?? [])
      .filter((c: any) => c.type === "body")
      .flatMap((c: any) => (c.parameters ?? []).map((p: any) => p.text))
      .filter(Boolean);
    return `📋 Plantilla «${t.name}»${params.length ? `\n${params.map((p: string, i: number) => `{{${i + 1}}} ${p}`).join("\n")}` : ""}`;
  }

  if (tipo === "image") return payload.image?.caption || "📷 Imagen";
  if (tipo === "audio") return "🎤 Nota de voz";
  if (tipo === "video") return payload.video?.caption || "🎥 Video";
  if (tipo === "document") {
    const d = payload.document ?? {};
    return d.caption || `📄 ${d.filename ?? "Documento"}`;
  }

  return `[${tipo}]`;
}
