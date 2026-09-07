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

export function calcularCosto(
  zona: Tarifa,
  horaInicio: string,
  horaFin: string,
): Costo {
  const deposito = zona.depositoRequerido ?? 0;
  const unidad = zona.unidadTiempo ?? "dia";

  let alquiler = 0;
  let detalle: string | null = null;
  let sinTarifa = false;

  if (unidad === "hora") {
    const horas = horasDeReserva(horaInicio, horaFin);
    const tarifa = zona.precioPorHora ?? 0;
    if (!tarifa) sinTarifa = true;
    alquiler = tarifa * horas;
    if (tarifa && horas) {
      detalle = `${horas} ${horas === 1 ? "hora" : "horas"} × ${pesos(tarifa)}`;
    }
  } else if (unidad === "mes") {
    alquiler = zona.precioPorMes ?? 0;
    if (!alquiler) sinTarifa = true;
    else detalle = `Tarifa mensual`;
  } else {
    /* Por dia: el formulario reserva una sola fecha, asi que es una jornada
     * aunque el residente escoja tres horas. Cobrar por horas un espacio que
     * la administracion tarifa por dia daria un numero que no cuadra con la
     * factura. */
    alquiler = zona.precioPorDia ?? 0;
    if (!alquiler) sinTarifa = true;
    else detalle = `Tarifa por día`;
  }

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
