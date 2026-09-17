/**
 * El cobro del aporte de parqueadero a partir de lo que reporta el guarda.
 *
 * Antes este reporte se armaba leyendo las FACTURAS: mostraba a quien el
 * software contable ya le habia cobrado la contribucion voluntaria. Servia
 * para mirar atras, pero arrancaba con todo el historico del conjunto y no
 * decia nada de lo que hay que cobrar ahora.
 *
 * Ahora se arma al reves: nace vacio y se llena con lo que el guarda registra
 * en la ronda, con foto. Cada reporte es un cargo por pasar a la factura, y
 * se lleva su estado para que no se cobre dos veces ni se olvide ninguno.
 */

export type EstadoCobro = "pendiente" | "facturado" | "descartado";

export type ReporteCobrable = {
  cobroEstado?: string;
  cobroPeriodo?: string;
  cobroMonto?: number;
  vehiculoPlaca?: string;
  vehiculoDescripcion?: string;
  unidades?: { numero: string }[];
  createdAt: number;
  ocurrioEn?: number;
  titulo?: string;
  fotos?: unknown[];
};

/**
 * Como se lee el estado de un reporte.
 *
 * Ausente es "pendiente", no un estado aparte: los reportes anteriores a que
 * esto se llevara siguen siendo plata por cobrar, y tratarlos como
 * desconocidos los sacaria de la lista justo a los mas viejos.
 */
export function estadoDe(r: ReporteCobrable): EstadoCobro {
  return r.cobroEstado === "facturado"
    ? "facturado"
    : r.cobroEstado === "descartado"
      ? "descartado"
      : "pendiente";
}

/** Cuando ocurrio de verdad, que no siempre es cuando se registro. */
export function ocurrioEn(r: ReporteCobrable): number {
  return r.ocurrioEn ?? r.createdAt;
}

/** "2026-10" del periodo SIGUIENTE al de una fecha: donde cae el cargo. */
export function periodoSiguiente(ts: number): string {
  const d = new Date(ts);
  /* El cargo no cabe en la factura del mes en curso —ya se emitio— sino en la
   * proxima. Proponerlo evita que la administracion lo teclee cada vez. */
  const s = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}`;
}

/** Valida un periodo escrito a mano. */
export function periodoValido(p: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test((p ?? "").trim());
}

/** Los totales de una lista de reportes. */
export function totales(reportes: ReporteCobrable[], monto: (r: ReporteCobrable) => number) {
  const por = (e: EstadoCobro) => reportes.filter((r) => estadoDe(r) === e);
  const suma = (rs: ReporteCobrable[]) => rs.reduce((s, r) => s + monto(r), 0);
  const pendientes = por("pendiente");
  const facturados = por("facturado");
  return {
    pendientes: pendientes.length,
    valorPendiente: suma(pendientes),
    facturados: facturados.length,
    valorFacturado: suma(facturados),
    descartados: por("descartado").length,
    /* Casas distintas, no reportes: a una casa con tres carros reportados se
     * le cobra por cada uno, pero para la administracion es una sola gestion. */
    casas: new Set(
      pendientes.flatMap((r) => (r.unidades ?? []).map((u) => u.numero)),
    ).size,
  };
}

/** Filtra por casa, placa o titulo. Sin tildes ni separadores. */
export function coincide(r: ReporteCobrable, busqueda: string): boolean {
  const q = (busqueda ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
  if (!q) return true;
  const campos = [
    r.vehiculoPlaca ?? "",
    r.titulo ?? "",
    ...(r.unidades ?? []).map((u) => u.numero),
  ];
  return campos.some((c) =>
    c
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]/g, "")
      .includes(q),
  );
}
