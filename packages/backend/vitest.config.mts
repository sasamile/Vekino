import { defineConfig } from "vitest/config";

/**
 * Pruebas de autorización con `convex-test`.
 *
 * Aparte de las de `node:test` a propósito: aquellas prueban funciones puras
 * de `convex/lib` y corren en Node sin nada montado; éstas necesitan el
 * runtime de Convex simulado —base, índices, identidad— para poder llamar a
 * las queries y mutaciones de verdad, que es donde vive la autorización.
 *
 * Patrones distintos para que cada corredor coja solo lo suyo:
 *   node:test → pruebas/*.prueba.ts
 *   vitest    → pruebas/*.test.ts
 */
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["pruebas/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
