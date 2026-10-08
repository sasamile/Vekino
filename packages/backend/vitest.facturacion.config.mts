import base from "./vitest.config.mts";

/**
 * Red de seguridad de facturación (Fase 0 de la auditoría).
 *
 * Corre aparte de `vitest run` a propósito: buena parte de estas pruebas
 * describen el comportamiento ESPERADO y hoy fallan contra el código, porque
 * reproducen defectos que se corrigen en las fases 1, 2 y 3
 * (docs/audits/FASE-0-FACTURACION.md). Mezclarlas con la suite de siempre la
 * dejaría roja para todo el equipo hasta entonces.
 *
 * Mismo entorno que la suite base (edge-runtime, tiempos); solo cambia qué
 * archivos entran. El sufijo `.regresion.ts` no coincide con el `*.test.ts`
 * de la base, así que `vitest run` sigue sin verlas. Cuando un grupo pase
 * entero, se mueve a `*.test.ts` y queda en la suite normal.
 */
export default {
  ...base,
  test: {
    ...base.test,
    include: ["pruebas/facturacion/**/*.regresion.ts"],
  },
};
