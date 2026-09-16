/**
 * El filtrado del reporte de aporte voluntario.
 *
 * Aparte del componente porque decidir que fila se muestra no es asunto de
 * como se pinta, y porque asi se puede probar sin navegador. La lista completa
 * son un par de cientos de filas: se filtra aqui, en el momento, sin volver a
 * consultar.
 */

export type FilaAporte = {
  unidadNumero: string;
  unidadTorre?: string | null;
  residenteNombre: string;
  placas: string[];
  meses: number;
  valorTotal: number;
  enMora: boolean;
  color: string;
};

export type Estado = "todas" | "al_dia" | "en_mora" | "sin_vehiculo";

/**
 * Normaliza para buscar: sin tildes, sin mayusculas, sin separadores.
 *
 * Quien busca "ABC-123" y quien busca "abc123" quieren el mismo carro, y quien
 * escribe "Nuñez" no tiene por que acordarse de la enne.
 */
export function normalizar(t: string): string {
  return (t ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** ¿La fila corresponde a lo buscado? Casa, torre, residente o placa. */
export function coincide(fila: FilaAporte, busqueda: string): boolean {
  const q = normalizar(busqueda);
  if (!q) return true;
  const campos = [
    fila.unidadNumero,
    fila.unidadTorre ?? "",
    fila.residenteNombre,
    ...fila.placas,
  ];
  return campos.some((c) => normalizar(c).includes(q));
}

/** ¿La fila esta en el estado pedido? */
export function esEstado(fila: FilaAporte, estado: Estado): boolean {
  switch (estado) {
    case "al_dia":
      return !fila.enMora;
    case "en_mora":
      return fila.enMora;
    /* Paga el aporte pero no tiene placa registrada: el guarda no la va a
     * encontrar en la ronda, que es justo a quien hay que perseguir. */
    case "sin_vehiculo":
      return fila.placas.length === 0;
    default:
      return true;
  }
}

export function filtrar<T extends FilaAporte>(
  filas: T[],
  busqueda: string,
  estado: Estado,
): T[] {
  return filas.filter((f) => coincide(f, busqueda) && esEstado(f, estado));
}

/** Los totales de lo que se esta viendo, no del universo completo. */
export function resumir(filas: FilaAporte[]) {
  return {
    casas: filas.length,
    valorTotal: filas.reduce((s, f) => s + f.valorTotal, 0),
    enMora: filas.filter((f) => f.enMora).length,
    sinVehiculo: filas.filter((f) => f.placas.length === 0).length,
  };
}

/** Meses del rango, de mas reciente a mas viejo, para el desplegable. */
export function ordenarPeriodos(periodos: string[]): string[] {
  return [...new Set(periodos)].sort((a, b) => b.localeCompare(a));
}
