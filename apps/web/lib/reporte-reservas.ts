/**
 * El reporte de reservas en una sola representación, para CSV y para Excel.
 *
 * Las dos descargas salen de aquí para que no puedan divergir: mismas
 * reservas, mismas columnas, mismo orden y mismos textos. Lo único que el
 * Excel añade es el bloque de resumen, y sus cifras NO se recalculan: son las
 * del `resumen` que devuelve `reservas.reporte`, las mismas que enseña el
 * modal. Una segunda suma aquí sería una segunda regla de negocio que tarde o
 * temprano no cuadra con la primera.
 */
import type {
  ColumnaReporte,
  IndicadorReporte,
  OpcionesXlsxReporte,
  ValorReporte,
} from "./excel-reporte.ts";

/** Lo que el reporte necesita de cada fila de `reservas.reporte`. */
export type FilaReporteReserva = {
  fecha: string;
  horaInicio: string;
  horaFin: string;
  zonaNombre: string;
  unidadNumero: string;
  solicitanteNombre: string;
  estado: string;
  valorReserva: number | null;
  pagoAlquilerMonto: number | null;
  depositoRequerido: number | null;
  depositoRecibido: number | null;
  depositoEstado: string | null;
  depositoRetencion: string | null;
  observaciones: string | null;
};

/** Los totales de `reservas.reporte` que van al resumen del Excel. */
export type ResumenReporteReservas = {
  total: number;
  alquilerEsperado: number;
  alquilerRecibido: number;
  depositoRecibido: number;
};

export const ESTADO_DEPOSITO: Record<string, string> = {
  registrado: "Sin devolver",
  devuelto: "Devuelto",
  no_devuelto: "Retenido",
};

/**
 * Las columnas, en el orden del CSV de siempre.
 *
 * Los encabezados se dejan sin tilde porque así los tiene el CSV que ya se
 * descarga, y alguien puede estar leyéndolo con una macro o una fórmula.
 * `Observaciones` va al final para no correr ninguna columna existente.
 */
export const COLUMNAS_REPORTE_RESERVAS: readonly ColumnaReporte[] = [
  { encabezado: "Fecha", tipo: "fecha" },
  { encabezado: "Inicio", tipo: "hora" },
  { encabezado: "Fin", tipo: "hora" },
  { encabezado: "Zona" },
  { encabezado: "Casa" },
  { encabezado: "Solicitante" },
  { encabezado: "Estado" },
  { encabezado: "Valor reserva", tipo: "moneda" },
  { encabezado: "Alquiler cobrado", tipo: "moneda" },
  { encabezado: "Deposito esperado", tipo: "moneda" },
  { encabezado: "Deposito recibido", tipo: "moneda" },
  { encabezado: "Estado deposito" },
  { encabezado: "Retencion" },
  { encabezado: "Observaciones" },
];

/**
 * "Sin registrar" solo cuando se esperaba un depósito y nadie lo ha anotado;
 * vacío cuando la zona no pide depósito.
 */
function estadoDeposito(f: FilaReporteReserva): string {
  if (f.depositoEstado) return ESTADO_DEPOSITO[f.depositoEstado] ?? f.depositoEstado;
  return f.depositoRequerido ? "Sin registrar" : "";
}

/** Una fila por reserva, alineada con `COLUMNAS_REPORTE_RESERVAS`. */
export function filasReporteReservas(filas: readonly FilaReporteReserva[]): ValorReporte[][] {
  return filas.map((f) => [
    f.fecha,
    f.horaInicio,
    f.horaFin,
    f.zonaNombre,
    f.unidadNumero,
    f.solicitanteNombre,
    f.estado,
    f.valorReserva ?? null,
    f.pagoAlquilerMonto ?? null,
    f.depositoRequerido ?? null,
    f.depositoRecibido ?? null,
    estadoDeposito(f),
    f.depositoRetencion ?? null,
    f.observaciones ?? null,
  ]);
}

/** El CSV, sin BOM (lo pone quien descarga). */
export function csvReporteReservas(filas: readonly FilaReporteReserva[]): string {
  const cabecera = COLUMNAS_REPORTE_RESERVAS.map((c) => c.encabezado);
  /* Se escapa con comillas: los nombres de zona traen comas ("Salón, primer
     piso") y las observaciones pueden traer comillas y saltos de línea; sin
     esto el archivo sale con las columnas corridas. */
  const esc = (v: ValorReporte) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cabecera, ...filasReporteReservas(filas)]
    .map((r) => r.map(esc).join(","))
    .join("\n");
}

/**
 * Los cuatro indicadores del resumen, tomados tal cual del servidor.
 *
 * - Número de reservas → `total`: todas las del rango, en cualquier estado,
 *   que son las filas del reporte.
 * - Alquiler pactado estimado → `alquilerEsperado`: el "Alquiler pactado" del
 *   modal. Excluye canceladas y rechazadas, y usa la tarifa actual de la zona
 *   cuando la reserva no guardó su valor.
 * - Depósito recibido → `depositoRecibido`.
 * - Total ingresos → `alquilerRecibido`: lo cobrado de alquiler. El depósito
 *   no entra: es una garantía que se devuelve (ver `costoReserva.ts`), y
 *   sumarlo inflaría el ingreso con plata que no es del conjunto.
 */
export function indicadoresResumenReservas(r: ResumenReporteReservas): IndicadorReporte[] {
  return [
    { etiqueta: "Número de reservas", valor: r.total, tipo: "entero" },
    { etiqueta: "Alquiler pactado estimado", valor: r.alquilerEsperado, tipo: "moneda" },
    { etiqueta: "Depósito recibido", valor: r.depositoRecibido, tipo: "moneda" },
    { etiqueta: "Total ingresos", valor: r.alquilerRecibido, tipo: "moneda" },
  ];
}

export function nombreArchivoReporteReservas(desde: string, hasta: string, extension: "csv" | "xlsx") {
  return `Reservas_${desde}_a_${hasta}.${extension}`;
}

export function opcionesXlsxReporteReservas(args: {
  filas: readonly FilaReporteReserva[];
  resumen: ResumenReporteReservas;
  desde: string;
  hasta: string;
}): OpcionesXlsxReporte {
  return {
    nombreArchivo: nombreArchivoReporteReservas(args.desde, args.hasta, "xlsx"),
    hoja: "Reservas",
    resumen: {
      titulo: "Resumen de reservas",
      subtitulo: `Del ${args.desde} al ${args.hasta}`,
      indicadores: indicadoresResumenReservas(args.resumen),
      notas: [
        "Alquiler pactado y depósito no cuentan reservas canceladas ni rechazadas.",
        "Total ingresos es el alquiler cobrado registrado; el depósito es una garantía reembolsable y no se suma.",
      ],
    },
    tabla: {
      titulo: "Reporte de reservas",
      columnas: COLUMNAS_REPORTE_RESERVAS,
      filas: filasReporteReservas(args.filas),
    },
  };
}
