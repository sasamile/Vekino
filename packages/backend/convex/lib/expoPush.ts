/**
 * Lo que se puede razonar sin red ni base de datos del envío a Expo.
 *
 * Vive aparte de `push.ts` para poder probarlo: ese archivo importa los
 * módulos generados de Convex y no se puede cargar suelto. Aquí no hay
 * dependencias, así que se ejecuta con `node` y sin gastar cuota.
 */

/** Tope de mensajes por petición que impone Expo. */
export const LOTE_EXPO = 100;

export type RespuestaExpo = {
  data?: { status: string; message?: string; details?: { error?: string } }[];
  errors?: { message?: string }[];
};

/**
 * Lee la respuesta de Expo: qué salió y qué token murió.
 *
 * Expo devuelve los resultados en el MISMO orden en que se mandaron los
 * mensajes, y NO repite el token en cada uno: la correspondencia es por
 * posición. Si esa cuenta se corre, se apaga el teléfono de otra persona y
 * nadie se entera — el error aparece semanas después, cuando alguien dice
 * que dejaron de llegarle avisos.
 */
export function interpretarRespuesta(
  tokensEnviados: string[],
  cuerpo: RespuestaExpo,
): { enviados: number; muertos: string[]; problemas: string[] } {
  const muertos: string[] = [];
  const problemas: string[] = [];
  let enviados = 0;

  (cuerpo.data ?? []).forEach((r, i) => {
    /* Si Expo devolviera más resultados que mensajes, ese índice no
     * corresponde a nada nuestro: se ignora en vez de apagar a ciegas. */
    const token = tokensEnviados[i];
    if (token === undefined) return;

    if (r.status === "ok") {
      enviados++;
      return;
    }
    const motivo = r.details?.error;
    /* Solo `DeviceNotRegistered` mata el token. Los demás errores son
     * nuestros —un mensaje muy grande, un formato malo— y apagar el teléfono
     * de alguien por un error propio lo dejaría sin avisos para siempre. */
    if (motivo === "DeviceNotRegistered") muertos.push(token);
    else problemas.push(`${motivo ?? "error"}: ${r.message ?? ""}`);
  });

  return { enviados, muertos, problemas };
}
