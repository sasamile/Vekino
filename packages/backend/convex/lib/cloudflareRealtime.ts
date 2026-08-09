/**
 * Cliente HTTP de Cloudflare Realtime (SFU).
 *
 * Cloudflare no vende una "sala": vende un repetidor de medios. No hay SDK de
 * servidor, no hay concepto de participante, no hay lista de quién está
 * dentro. Solo sesiones y pistas, por HTTP. Todo lo demás —quién es cada
 * quien, quién puede hablar, quién levantó la mano— lo pone Convex, que ya lo
 * sabe.
 *
 * Por qué el navegador no habla directo con Cloudflare: el secreto de la
 * aplicación autoriza CUALQUIER operación sobre CUALQUIER sesión. Si viajara
 * al cliente, cualquiera podría cerrarle la pista a la mesa en plena
 * votación. Estas funciones corren solo en el backend.
 *
 * Env (bunx convex env set):
 * - CLOUDFLARE_REALTIME_APP_ID
 * - CLOUDFLARE_REALTIME_APP_SECRET
 */

const BASE = "https://rtc.live.cloudflare.com/v1";

export type ConfigRealtime = { appId: string; secret: string };

/**
 * Devuelve null si no está configurado, igual que `configMedios` de LiveKit.
 * No lanza: sin SFU la sala tiene que poder seguir por el camino viejo.
 */
export function configRealtime(): ConfigRealtime | null {
  const appId = process.env.CLOUDFLARE_REALTIME_APP_ID;
  const secret = process.env.CLOUDFLARE_REALTIME_APP_SECRET;
  if (!appId || !secret) return null;
  return { appId, secret };
}

export type DescripcionSesion = { type: "offer" | "answer"; sdp: string };

/** Una pista tal como la nombra Cloudflare. */
export type PistaLocal = {
  location: "local";
  mid: string;
  trackName: string;
};

export type PistaRemota = {
  location: "remote";
  sessionId: string;
  trackName: string;
};

async function pedir(
  cfg: ConfigRealtime,
  ruta: string,
  init: { method: string; body?: unknown },
): Promise<any> {
  const res = await fetch(`${BASE}/apps/${cfg.appId}${ruta}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${cfg.secret}`,
      "Content-Type": "application/json",
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || json?.errorCode) {
    /* El mensaje de Cloudflare es el único dato útil cuando esto falla en
     * plena asamblea; se propaga tal cual en vez de un "error de red". */
    throw new Error(
      `Cloudflare Realtime ${res.status}: ${
        json?.errorDescription ?? json?.errorCode ?? "error desconocido"
      }`,
    );
  }
  return json;
}

/**
 * Abre una sesión a partir de la oferta del navegador.
 *
 * La sesión es la conexión de UNA persona con el SFU. No es la sala: la sala
 * es el conjunto de sesiones que Convex agrupa bajo una misma asamblea.
 */
export async function crearSesion(
  cfg: ConfigRealtime,
  oferta: DescripcionSesion,
): Promise<{ sessionId: string; respuesta: DescripcionSesion }> {
  const json = await pedir(cfg, "/sessions/new", {
    method: "POST",
    body: { sessionDescription: oferta },
  });
  return {
    sessionId: String(json.sessionId),
    respuesta: json.sessionDescription as DescripcionSesion,
  };
}

/**
 * Publica pistas propias (micrófono, pantalla).
 *
 * El navegador manda su oferta con las pistas ya añadidas al
 * `RTCPeerConnection`; Cloudflare responde con la respuesta que hay que
 * aplicar. Los `trackName` que devuelve son los que los demás usarán para
 * suscribirse, y son lo que se guarda en Convex.
 */
export async function publicarPistas(
  cfg: ConfigRealtime,
  sessionId: string,
  oferta: DescripcionSesion,
  pistas: PistaLocal[],
): Promise<{ respuesta: DescripcionSesion; pistas: any[] }> {
  const json = await pedir(cfg, `/sessions/${sessionId}/tracks/new`, {
    method: "POST",
    body: { sessionDescription: oferta, tracks: pistas },
  });
  return {
    respuesta: json.sessionDescription as DescripcionSesion,
    pistas: json.tracks ?? [],
  };
}

/**
 * Se suscribe a pistas de OTRAS sesiones.
 *
 * Aquí la negociación va al revés: Cloudflare devuelve una OFERTA que el
 * navegador tiene que responder con `renegociar`. Es el paso que más se
 * repite en una asamblea —cada vez que alguien de la mesa abre el micrófono,
 * los 173 se suscriben— y por eso conviene pedir varias pistas de una vez en
 * lugar de una llamada por pista.
 */
export async function suscribirPistas(
  cfg: ConfigRealtime,
  sessionId: string,
  pistas: PistaRemota[],
): Promise<{ oferta: DescripcionSesion | null; pistas: any[] }> {
  const json = await pedir(cfg, `/sessions/${sessionId}/tracks/new`, {
    method: "POST",
    body: { tracks: pistas },
  });
  return {
    oferta: (json.sessionDescription as DescripcionSesion) ?? null,
    pistas: json.tracks ?? [],
  };
}

/** Cierra el ciclo de `suscribirPistas` aplicando la respuesta del navegador. */
export async function renegociar(
  cfg: ConfigRealtime,
  sessionId: string,
  respuesta: DescripcionSesion,
): Promise<void> {
  await pedir(cfg, `/sessions/${sessionId}/renegotiate`, {
    method: "PUT",
    body: { sessionDescription: respuesta },
  });
}

/** Deja de publicar o de recibir unas pistas. */
export async function cerrarPistas(
  cfg: ConfigRealtime,
  sessionId: string,
  nombres: string[],
  oferta?: DescripcionSesion,
): Promise<{ respuesta: DescripcionSesion | null }> {
  const json = await pedir(cfg, `/sessions/${sessionId}/tracks/close`, {
    method: "PUT",
    body: {
      tracks: nombres.map((trackName) => ({ mid: trackName, trackName })),
      force: !oferta,
      ...(oferta ? { sessionDescription: oferta } : {}),
    },
  });
  return { respuesta: (json.sessionDescription as DescripcionSesion) ?? null };
}
