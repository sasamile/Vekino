/**
 * Version minima de la app movil (Fase 4).
 *
 * Las versiones viejas instaladas siguen con la logica que tenian: sumaban
 * facturas `pendiente`, mostraban "Pagar" en facturas historicas, no conocen
 * "en revision", "pago en verificacion" ni "sin verificar"... El backend ya
 * rechaza lo peligroso (`pagos.armarDatosTrn`), pero lo que pintan no lo
 * puede corregir. La app no tiene actualizaciones por aire (`expo-updates` no
 * esta instalado): la unica salida es pedir que actualicen desde la tienda.
 *
 * La app informa su version y esta regla dice si debe actualizar. La minima
 * se configura en el deployment (`MOVIL_VERSION_MINIMA`, o por plataforma
 * `MOVIL_VERSION_MINIMA_IOS` / `MOVIL_VERSION_MINIMA_ANDROID`). Sin
 * configuracion no bloquea a nadie, y una version que no se puede leer
 * tampoco: no se bloquea lo que no se puede juzgar.
 *
 * Sin dependencias: se prueba con `node`.
 */

/** "1.2.3" → [1, 2, 3]. `null` si no tiene forma de version. */
export function leerVersion(version: string | null | undefined): number[] | null {
  const t = (version ?? "").trim();
  if (!/^\d+(\.\d+){0,3}$/.test(t)) return null;
  return t.split(".").map(Number);
}

/** <0 si `a` es anterior a `b`, 0 si son iguales, >0 si es posterior. */
export function compararVersiones(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export const MENSAJE_ACTUALIZAR =
  "Hay una versión nueva de Vekino. Actualízala desde la tienda para seguir usando la app: la que tienes ya no muestra bien tus facturas y pagos.";

export function decidirVersion(
  env: Record<string, string | undefined>,
  version: string | null,
  plataforma: string | null,
): { debeActualizar: boolean; versionMinima: string | null; mensaje: string | null } {
  const sufijo = (plataforma ?? "").trim().toUpperCase();
  const configurada =
    (sufijo ? env[`MOVIL_VERSION_MINIMA_${sufijo}`] : undefined)?.trim() ||
    env.MOVIL_VERSION_MINIMA?.trim() ||
    null;
  const minima = leerVersion(configurada);
  if (!configurada || !minima) return { debeActualizar: false, versionMinima: null, mensaje: null };
  const actual = leerVersion(version);
  if (!actual) return { debeActualizar: false, versionMinima: configurada, mensaje: null };
  const debeActualizar = compararVersiones(actual, minima) < 0;
  return {
    debeActualizar,
    versionMinima: configurada,
    mensaje: debeActualizar ? MENSAJE_ACTUALIZAR : null,
  };
}
