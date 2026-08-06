import type { Id } from "../_generated/dataModel";

/**
 * Cálculo del quórum de una asamblea. ÚNICO.
 *
 * Esto es lo primero que se mira cuando se impugna un acta, así que no puede
 * haber dos maneras de sacarlo: el número que se proyecta en la asamblea, el
 * que ve el apoderado y el que queda en el acta tienen que salir de aquí.
 *
 * Regla (Ley 675, art. 45): cuenta el coeficiente de las unidades presentes,
 * sea por su propietario o por un apoderado DEBIDAMENTE ACREDITADO que esté
 * presente. De ahí las dos partes del cálculo:
 *
 *  1. Unidades con check-in real (fila en `asambleaAsistentes`).
 *  2. Unidades con un poder VALIDADO cuyo representante ya hizo check-in.
 *     Hace falta porque un poder validado después de que el apoderado entró
 *     no genera fila de asistencia: sin este paso, esa unidad quedaría
 *     representada en la sala pero fuera del conteo.
 *
 * Un poder SIN validar no suma: aceptarlo sería contar como representada una
 * unidad cuyo documento la administración todavía no revisó.
 */

export type AsistenteQuorum = {
  unidadId: Id<"unidades">;
  userId: Id<"users">;
  coeficiente?: number;
};

export type PoderQuorum = {
  unidadId: Id<"unidades">;
  coeficiente?: number;
  representanteUserId?: Id<"users">;
  validado: boolean;
};

export type UnidadQuorum = { coeficiente?: number };

export type ResultadoQuorum = {
  /** Porcentaje de coeficiente presente (o de unidades si no hay coeficientes). */
  pct: number;
  presenteCoef: number;
  totalCoef: number;
  unidadesPresentes: number;
  totalUnidades: number;
  /** Poderes validados en la asamblea (presentes o no). */
  poderesValidados: number;
  /** Unidades que entraron al conteo solo por un poder validado. */
  unidadesPorPoder: number;
};

export function calcularQuorum(args: {
  asistentes: AsistenteQuorum[];
  poderes: PoderQuorum[];
  unidades: UnidadQuorum[];
}): ResultadoQuorum {
  const { asistentes, poderes, unidades } = args;

  // unidadId → coeficiente. El Map evita contar dos veces una unidad que
  // esté tanto por check-in propio como por poder.
  const presentes = new Map<string, number>();
  for (const a of asistentes) {
    presentes.set(a.unidadId as string, a.coeficiente ?? 0);
  }

  const usersPresentes = new Set(asistentes.map((a) => a.userId as string));
  const poderesValidados = poderes.filter((p) => p.validado);

  let unidadesPorPoder = 0;
  for (const p of poderesValidados) {
    if (!p.representanteUserId) continue;
    if (!usersPresentes.has(p.representanteUserId as string)) continue;
    const uid = p.unidadId as string;
    if (presentes.has(uid)) continue;
    presentes.set(uid, p.coeficiente ?? 0);
    unidadesPorPoder++;
  }

  const totalCoef = unidades.reduce((s, u) => s + (u.coeficiente ?? 0), 0);
  const presenteCoef = [...presentes.values()].reduce((s, c) => s + c, 0);
  const unidadesPresentes = presentes.size;

  // Con coeficientes reales usa %; si no, proporción de unidades.
  const pct =
    totalCoef > 0
      ? (presenteCoef / totalCoef) * 100
      : unidades.length > 0
        ? (unidadesPresentes / unidades.length) * 100
        : 0;

  return {
    pct: Math.round(pct * 100) / 100,
    presenteCoef: Math.round(presenteCoef * 100) / 100,
    totalCoef: Math.round(totalCoef * 100) / 100,
    unidadesPresentes,
    totalUnidades: unidades.length,
    poderesValidados: poderesValidados.length,
    unidadesPorPoder,
  };
}
