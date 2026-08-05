import { createHmac } from "node:crypto";
import { config } from "./config.ts";

/**
 * Token de acceso a una sala, firmado localmente.
 *
 * El transcriptor corre en la misma máquina que el servidor de medios y ya
 * tiene sus llaves, así que no tiene sentido pedirle el token a Convex: sería
 * un viaje de red extra que además puede fallar justo cuando hay que entrar.
 *
 * Es la misma firma que `convex/lib/livekitJwt.ts`. Está duplicada a
 * propósito: este proceso se despliega aparte, en otra máquina, y no debe
 * arrastrar el paquete del backend entero para treinta líneas de HMAC.
 */

const b64url = (datos: Buffer | string) =>
  (typeof datos === "string" ? Buffer.from(datos) : datos)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** Nombre de la sala. Tiene que coincidir con `nombreSala` del backend. */
export const nombreSala = (asambleaId: string) => `asamblea-${asambleaId}`;

/**
 * Token de solo escucha.
 *
 * `canPublish: false` es deliberado y no una omisión: este participante no
 * tiene nada que emitir y, si algún día un error lo hiciera publicar, el
 * servidor lo rechaza en vez de meter audio fantasma en la asamblea.
 *
 * `hidden: true` lo saca de la rejilla de participantes. No es para
 * esconderlo —el aviso de que se está transcribiendo lo da la sala en
 * pantalla, encendido por la mesa— sino para que no aparezca como un
 * asistente más y confunda el conteo visual.
 */
export function tokenEscucha(asambleaId: string): string {
  const ahora = Math.floor(Date.now() / 1000);
  const carga = {
    iss: config.livekitApiKey,
    sub: "vekino-transcriptor",
    name: "Transcripción",
    nbf: ahora - 10,
    // Más que una asamblea larga: si el token venciera a mitad, el proceso
    // se reconectaría en bucle sin que nadie entienda por qué.
    exp: ahora + 12 * 60 * 60,
    video: {
      room: nombreSala(asambleaId),
      roomJoin: true,
      canSubscribe: true,
      canPublish: false,
      canPublishData: false,
      hidden: true,
    },
  };

  const cabecera = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const cuerpo = b64url(JSON.stringify(carga));
  const firma = b64url(
    createHmac("sha256", config.livekitApiSecret)
      .update(`${cabecera}.${cuerpo}`)
      .digest(),
  );
  return `${cabecera}.${cuerpo}.${firma}`;
}
