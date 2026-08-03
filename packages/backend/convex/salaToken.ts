import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

/**
 * Token de acceso al servidor de medios.
 *
 * LiveKit no tiene usuarios: confía en un JWT firmado con el secreto del
 * servidor. Ese secreto vive SOLO en Convex (`LIVEKIT_API_SECRET`) y nunca
 * llega al navegador; el cliente pide un token y recibe uno acotado a SU
 * sala, SU identidad y SUS permisos.
 *
 * El JWT se arma a mano con Web Crypto en vez de traer el SDK de LiveKit:
 * son treinta líneas, evita una dependencia en el backend y deja explícito
 * qué se está firmando — que es justo lo que uno quiere poder auditar en el
 * punto donde se decide quién puede hablar en una asamblea.
 */

const b64url = (datos: Uint8Array | string) => {
  const bytes =
    typeof datos === "string" ? new TextEncoder().encode(datos) : datos;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function firmarJwt(
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

/**
 * Entrega el token de la sala al usuario actual.
 *
 * `canPublish` sale del MISMO estado que ya gobierna la sala: la mesa
 * siempre, el residente solo con la palabra concedida. Si se calculara en el
 * cliente, cualquiera se otorgaría el micrófono editando el JavaScript; aquí
 * el permiso viaja firmado y el servidor de medios lo hace cumplir.
 *
 * Dura 6 horas: una asamblea larga no debe cortarse por un token vencido.
 */
export const tokenSala = action({
  args: { asambleaId: v.id("asambleas") },
  handler: async (ctx, args): Promise<{
    url: string;
    token: string;
    sala: string;
    puedePublicar: boolean;
  } | null> => {
    const url = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    // Sin servidor configurado la sala sigue funcionando en P2P: devolver
    // null es "no hay SFU", no un error.
    if (!url || !apiKey || !apiSecret) return null;

    const sala = await ctx.runQuery(api.asambleaSala.miSala, {
      asambleaId: args.asambleaId,
    });
    if (!sala) return null;
    if (!sala.enCurso) return null;

    const puedePublicar = sala.esMesa || sala.tienePalabra === true;

    const ahora = Math.floor(Date.now() / 1000);
    const token = await firmarJwt(
      {
        iss: apiKey,
        sub: sala.identidad,
        name: sala.nombre,
        nbf: ahora - 10, // margen por relojes desincronizados
        exp: ahora + 6 * 60 * 60,
        video: {
          room: `asamblea-${args.asambleaId}`,
          roomJoin: true,
          canSubscribe: true,
          canPublish: puedePublicar,
          canPublishData: true,
        },
      },
      apiSecret,
    );

    return {
      url,
      token,
      sala: `asamblea-${args.asambleaId}`,
      puedePublicar,
    };
  },
});
