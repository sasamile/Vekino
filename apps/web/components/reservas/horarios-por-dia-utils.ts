/** Estado por día: 0=Domingo … 6=Sábado */
export type DiaHorarioEstado = {
  activo: boolean;
  horaInicio: string;
  horaFin: string;
};

export type HorarioDisponibilidad = {
  dia: number;
  horaInicio: string;
  horaFin: string;
};

export const DIAS_SEMANA = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
] as const;

export function createEmptyPorDiaState(): Record<number, DiaHorarioEstado> {
  const s: Record<number, DiaHorarioEstado> = {};
  for (let d = 0; d <= 6; d++) {
    s[d] = { activo: false, horaInicio: "09:00", horaFin: "22:00" };
  }
  return s;
}

/** Lun–Vie 09:00–22:00 por defecto. */
export function defaultPorDiaLaboral(): Record<number, DiaHorarioEstado> {
  const s = createEmptyPorDiaState();
  for (const d of [1, 2, 3, 4, 5]) {
    s[d] = { activo: true, horaInicio: "09:00", horaFin: "22:00" };
  }
  return s;
}

export function porDiaStateToHorarios(
  porDia: Record<number, DiaHorarioEstado>,
): HorarioDisponibilidad[] {
  return Object.entries(porDia)
    .filter(([, v]) => v.activo)
    .map(([dia, v]) => ({
      dia: Number(dia),
      horaInicio: v.horaInicio,
      horaFin: v.horaFin,
    }))
    .sort((a, b) => a.dia - b.dia);
}

/**
 * El camino de vuelta: de lo guardado al estado del formulario.
 *
 * Hace falta para poder EDITAR una zona. Sin esto, abrir el formulario de una
 * zona existente proponia lunes-viernes 09:00-22:00 y borraba el horario real
 * en cuanto alguien entraba solo a corregirle el precio.
 */
export function horariosToPorDiaState(
  horarios: HorarioDisponibilidad[],
): Record<number, DiaHorarioEstado> {
  const s = createEmptyPorDiaState();
  for (const h of horarios) {
    if (h.dia < 0 || h.dia > 6) continue;
    s[h.dia] = { activo: true, horaInicio: h.horaInicio, horaFin: h.horaFin };
  }
  return s;
}
