import { rango } from "./horarios.ts";

/**
 * Cuanto cuesta una reserva.
 *
 * El residente llenaba dia, fecha y hora sin ver un peso por ningun lado, y
 * se enteraba del valor cuando la administracion se lo cobraba. Aqui se
 * calcula lo mismo que va a cobrarse, para poder ensenarselo ANTES de que
 * confirme.
 *
 * El deposito NO es parte del precio: es una garantia que se devuelve si el
 * espacio se entrega bien. Van separados a proposito, porque sumarlos en una
 * sola cifra hace que la reserva parezca el doble de cara.
 */

export type Tarifa = {
  unidadTiempo?: "hora" | "dia" | "mes";
  precioPorHora?: number;
  precioPorDia?: number;
  precioPorMes?: number;
  depositoRequerido?: number;
};

export type Costo = {
  /** Lo que se cobra por usar el espacio. */
  alquiler: number;
  /** Garantia reembolsable. Se pide, no se cobra. */
  deposito: number;
  /** Lo que hay que tener disponible el dia de la reserva. */
  totalAPagar: number;
  /** "3 horas × $20.000" — para que el residente vea de donde sale. */
  detalle: string | null;
  /** Cuando la zona no tiene tarifa configurada no se inventa un cero. */
  sinTarifa: boolean;
};

/** Horas de la reserva, redondeadas hacia arriba: la fraccion se cobra entera. */
export function horasDeReserva(horaInicio: string, horaFin: string): number {
  const r = rango(horaInicio, horaFin);
  if (!r) return 0;
  return Math.ceil((r.fin - r.inicio) / 60);
}

const pesos = (n: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);

/**
 * El precio que corresponde a la modalidad, o el que sí esté puesto si esa
 * casilla quedó vacía.
 *
 * El formulario deja llenar hora, día o mes por separado. Quien configura
 * "por día" a veces solo escribe el precio por hora —o al revés— y la reserva
 * salía en cero aunque la zona sí tenía tarifa. El fallback usa el otro
 * monto; no inventa uno.
 */
function alquilerDe(
  zona: Tarifa,
  unidad: "hora" | "dia" | "mes",
  horaInicio: string,
  horaFin: string,
): { alquiler: number; detalle: string | null; sinTarifa: boolean } {
  const horas = horasDeReserva(horaInicio, horaFin);
  const porHora = zona.precioPorHora ?? 0;
  const porDia = zona.precioPorDia ?? 0;
  const porMes = zona.precioPorMes ?? 0;

  const comoHoras = () =>
    porHora && horas
      ? {
          alquiler: porHora * horas,
          detalle: `${horas} ${horas === 1 ? "hora" : "horas"} × ${pesos(porHora)}`,
        }
      : null;
  const comoDia = () =>
    porDia ? { alquiler: porDia, detalle: "Tarifa por día" } : null;
  const comoMes = () =>
    porMes ? { alquiler: porMes, detalle: "Tarifa mensual" } : null;

  const preferido =
    unidad === "hora" ? comoHoras() : unidad === "mes" ? comoMes() : comoDia();
  const usado = preferido ?? comoDia() ?? comoHoras() ?? comoMes();
  if (!usado) return { alquiler: 0, detalle: null, sinTarifa: true };
  return { ...usado, sinTarifa: false };
}

export function calcularCosto(
  zona: Tarifa,
  horaInicio: string,
  horaFin: string,
): Costo {
  const deposito = zona.depositoRequerido ?? 0;
  const unidad = zona.unidadTiempo ?? "dia";
  const { alquiler, detalle, sinTarifa } = alquilerDe(
    zona,
    unidad,
    horaInicio,
    horaFin,
  );

  return {
    alquiler,
    deposito,
    totalAPagar: alquiler + deposito,
    detalle,
    sinTarifa,
  };
}

/** El texto de una cifra en pesos, para la interfaz. */
export function enPesos(n: number): string {
  return pesos(n);
}
