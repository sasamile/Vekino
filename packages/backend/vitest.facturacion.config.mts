import base from "./vitest.config.mts";

/**
 * Red de seguridad de facturación (Fase 0 de la auditoría).
 *
 * Nació aparte de `vitest run` a propósito: buena parte de estas pruebas
 * describían el comportamiento ESPERADO y fallaban contra el código, porque
 * reproducían defectos que se corrigieron en las fases 1 a 4
 * (docs/audits/FASE-0-FACTURACION.md). Mezclarlas con la suite de siempre la
 * habría dejado roja para todo el equipo mientras tanto.
 *
 * Fase 4: la red quedó entera en verde y sus cinco archivos se renombraron a
 * `*.test.ts` sin cambiar el contenido (la convención de la Fase 0), así que
 * ahora corren TAMBIÉN en la suite normal. Este script sigue corriendo
 * exactamente esos cinco —las 55 pruebas de la red en el backend—, no la
 * carpeta entera, para que `bun run test:facturacion` siga diciendo cuántas de
 * las 91 pasan. Las otras 36 son de la web: `cd apps/web && bun run
 * test:facturacion` (carpeta `pruebas/facturacion`: `parserFacturas` y
 * `resumenResidente`).
 *
 * Mismo entorno que la suite base (edge-runtime, tiempos); solo cambia qué
 * archivos entran.
 */
export const RED_DE_LA_FASE_0 = [
  "pruebas/facturacion/estados.test.ts",
  "pruebas/facturacion/importacion.test.ts",
  "pruebas/facturacion/pagos.test.ts",
  "pruebas/facturacion/parqueadero.test.ts",
  "pruebas/facturacion/residente.test.ts",
];

export default {
  ...base,
  test: {
    ...base.test,
    include: RED_DE_LA_FASE_0,
  },
};
