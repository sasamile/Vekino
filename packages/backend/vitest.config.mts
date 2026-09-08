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
    /* Los 5s de vitest se quedaron cortos.
     *
     * Cada fichero monta el runtime de Convex entero —el `import.meta.glob`
     * de arriba trae todas las funciones— y los ficheros arrancan a la vez,
     * asi que el arranque en frio se pisa entre workers: la primera prueba de
     * un fichero puede pasar varios segundos esperando turno antes de correr.
     * Lo que tarda es montar, no la prueba (ninguna pasa de segundo y medio).
     * Con 5s, anadir un fichero mas tumbaba la primera prueba de otro. */
    testTimeout: 30_000,
    server: { deps: { inline: ["convex-test"] } },
  },
});
