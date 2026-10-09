/**
 * Dónde se actualiza la app (Fase 4: versión mínima).
 *
 * Vekino no tiene actualizaciones por aire (`expo-updates` no está
 * instalado): una versión vieja solo se reemplaza desde la tienda. Si el
 * backend dice que esta versión ya no sirve (`appMovil.versionMinima`), la
 * app manda a la tienda que le corresponde.
 *
 * Sin dependencias de React Native: se prueba con `node`.
 */

/** App Store (ascAppId de `eas.json`) y Google Play (paquete de `app.json`). */
export const URL_TIENDA = {
  ios: "https://apps.apple.com/app/id6792953375",
  android: "https://play.google.com/store/apps/details?id=com.vekino.app",
} as const;

export function urlTienda(plataforma: string): string | null {
  return plataforma === "ios" ? URL_TIENDA.ios : plataforma === "android" ? URL_TIENDA.android : null;
}

/** Lo que responde el backend; sin respuesta todavía, no se bloquea. */
export function bloqueaPorVersion(
  respuesta: { debeActualizar: boolean } | null | undefined,
): boolean {
  return respuesta?.debeActualizar === true;
}
