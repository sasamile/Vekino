import { useEffect, useState } from "react";
import { Image } from "react-native";

/**
 * Compuerta del arranque: mantiene el splash el tiempo suficiente para que la
 * animación de marca se vea completa, en vez de aparecer como un parpadeo.
 *
 * El reloj arranca cuando se carga el bundle, NO cuando se monta cada pantalla.
 * Así la espera es una sola aunque el splash pase por varias rutas (index →
 * (app)): lo que ya transcurrió en una cuenta para la siguiente y nunca se
 * suman esperas.
 */

/** Instante en que el JS quedó vivo. */
const ARRANQUE_AT = Date.now();

/**
 * Segundos transcurridos desde el arranque.
 *
 * La animación de marca se apoya en esto y NO en su propio montaje: el splash
 * se monta dos veces al arrancar (ruta raíz y luego dentro de la app), y si
 * cada instancia empezara en cero se vería cortarse y volver a empezar.
 */
export function segundosDesdeArranque(): number {
  return (Date.now() - ARRANQUE_AT) / 1000;
}

/**
 * Cuánto tarda la marca en quedar armada, contado desde el arranque del JS
 * (no desde cada montaje). Cumplido esto —y con los datos cargados— arranca
 * el giro de salida, que suma ~1.1 s más: unos 3 s en total.
 *
 * Si la carga tarda más, la marca se queda respirando y el giro espera.
 */
export const MIN_SPLASH_MS = 1900;

/** Milisegundos que faltan para cumplir el mínimo. */
export function faltaDeSplash(): number {
  return Math.max(0, MIN_SPLASH_MS - (Date.now() - ARRANQUE_AT));
}

/**
 * `true` cuando ya pasó el mínimo. Si la app tarda más en cargar, el splash
 * sigue puesto igual (la animación se repite) y esto no lo acorta.
 */
export function useSplashCumplido(): boolean {
  const [cumplido, setCumplido] = useState(() => faltaDeSplash() === 0);

  useEffect(() => {
    if (cumplido) return;
    const id = setTimeout(() => setCumplido(true), faltaDeSplash());
    return () => clearTimeout(id);
  }, [cumplido]);

  return cumplido;
}

/**
 * Deja las imágenes en caché mientras el splash sigue en pantalla, para que la
 * primera pantalla no aparezca con huecos. Falla en silencio: precargar es una
 * mejora, nunca un motivo para atrasar el arranque.
 */
export function precargarImagenes(urls: (string | null | undefined)[]): void {
  for (const url of urls) {
    const limpia = url?.trim();
    if (!limpia?.startsWith("http")) continue;
    Image.prefetch(limpia).catch(() => {});
  }
}
