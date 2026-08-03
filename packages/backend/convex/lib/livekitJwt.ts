/**
 * Firma de tokens para el servidor de medios.
 *
 * Se arma a mano con Web Crypto en vez de traer el SDK de LiveKit: son
 * treinta líneas, evita una dependencia en el backend y deja explícito qué se
 * está firmando — que es justo lo que uno quiere poder auditar en el punto
 * donde se decide quién puede hablar en una asamblea.
 *
 * Sin dependencias y sin estado: no toca la base de datos ni `ctx`.
 */

const b64url = (datos: Uint8Array | string) => {
  const bytes =
    typeof datos === "string" ? new TextEncoder().encode(datos) : datos;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export async function firmarJwt(
  payload: Record<string, unknown>,
  secreto: string,
): Promise<string> {
  const cabecera = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const cuerpo = b64url(JSON.stringify(payload));
  const sinFirma = `${cabecera}.${cuerpo}`;

  const llave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secreto),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign(
    "HMAC",
    llave,
    new TextEncoder().encode(sinFirma),
  );
  return `${sinFirma}.${b64url(new Uint8Array(firma))}`;
}

export type ConfigMedios = {
  /** Base HTTP del servidor (la del token es `wss://`). */
  http: string;
  apiKey: string;
  apiSecret: string;
};

/**
 * Configuración del servidor de medios, o `null` si no está montado.
 *
 * Devolver `null` es "no hay SFU" —la sala cae a la malla punto a punto—,
 * no un error: una instalación sin servidor debe seguir teniendo video.
 */
export function configMedios(): ConfigMedios | null {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) return null;
  return {
    http: url.replace(/^ws/, "http").replace(/\/+$/, ""),
    apiKey,
    apiSecret,
  };
}

/** Nombre de la sala en el servidor de medios. Una sola fuente de verdad. */
export const nombreSala = (asambleaId: string) => `asamblea-${asambleaId}`;

/** Token de administración de UNA sala, válido por un minuto. */
export async function tokenAdmin(cfg: ConfigMedios, sala: string) {
  const ahora = Math.floor(Date.now() / 1000);
  return firmarJwt(
    {
      iss: cfg.apiKey,
      sub: "vekino-backend",
      nbf: ahora - 10,
      exp: ahora + 60,
      video: { room: sala, roomAdmin: true },
    },
    cfg.apiSecret,
  );
}
