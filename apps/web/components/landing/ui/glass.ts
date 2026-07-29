import type { CSSProperties } from "react";

/**
 * Vidrio (iOS liquid glass) SIN `backdrop-filter`.
 *
 * Por qué: `backdrop-filter` obliga al navegador a recomponer el fondo de
 * cada elemento en cada frame. Con ~15 tarjetas dentro de secciones que se
 * transforman al hacer scroll (más ScrollSmoother, que transforma la página
 * entera), el costo se multiplica y la landing se traba.
 *
 * La ilusión se sostiene igual con tres capas estáticas:
 *  1. Degradado translúcido —no color plano— que simula el grosor del cristal.
 *  2. Cantos `inset` claros arriba y abajo: el filo del vidrio.
 *  3. Sombra proyectada suave, que lo despega del fondo.
 *
 * Funciona porque detrás de las tarjetas siempre hay halos de color ya
 * difuminados: el degradado los tiñe y el ojo lee "vidrio". Si alguna vez se
 * pone una tarjeta sobre un fondo plano, ahí sí hará falta el desenfoque real.
 */
export function glass(tone: "light" | "dark" = "light"): CSSProperties {
  if (tone === "dark") {
    return {
      background:
        "linear-gradient(150deg, rgba(4,32,70,0.94), rgba(2,18,41,0.88))",
      boxShadow:
        "0 1px 0 0 rgba(255,255,255,0.16) inset, 0 20px 46px -24px rgba(4,32,70,0.55)",
    };
  }
  return {
    background:
      "linear-gradient(150deg, rgba(255,255,255,0.88), rgba(255,255,255,0.62))",
    boxShadow:
      "0 1px 0 0 rgba(255,255,255,0.95) inset, 0 -1px 0 0 rgba(255,255,255,0.45) inset, 0 20px 46px -24px rgba(4,32,70,0.3)",
  };
}
