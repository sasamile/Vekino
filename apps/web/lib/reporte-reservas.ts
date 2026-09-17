/**
 * El reporte de reservas en una sola representación, para CSV y para Excel.
 *
 * Las dos descargas salen de aquí para que no puedan divergir: mismas
 * reservas (ya filtradas por fecha y estado en `reservas.reporte`), mismas
 * columnas, mismo orden y mismos textos. Lo único que el Excel añade es el
 * bloque de resumen, y sus cifras NO se recalculan: son las
 * del `resumen` que devuelve `reservas.reporte`, las mismas que enseña el
 * modal. Una segunda suma aquí sería una segunda regla de negocio que tarde o
 * temprano no cuadra con la primera.
 */
import type { Doc } from "@vekino/backend/dataModel";
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
  /** Suma de los incidentes valorados de ESTA reserva. 0 si no tuvo. */
  valorIncidentes: number;
  /**
   * Qué pasó en esos incidentes, ya unido por `descripcionDeIncidentes`.
   * Están TODOS (también pendientes y descartados), así que puede traer texto
   * con `valorIncidentes` en 0. Vacío si la reserva no tuvo ninguno.
   */
  descripcionIncidentes: string;
};

/** Los totales de `reservas.reporte` que van al resumen del Excel. */
export type ResumenReporteReservas = {
  total: number;
  alquilerEsperado: number;
  alquilerRecibido: number;
  valorIncidentes: number;
};

/**
 * Nombre único de la métrica de incidentes: columna, resumen del Excel y
 * modal. "Valor" y no "ingresos" ni "recaudado": es lo que la administración
 * valoró, y cuando supera el depósito solo se descuenta hasta el depósito.
 */
export const ETIQUETA_VALOR_INCIDENTES = "Valor de incidentes";

/**
 * Nombre de la columna con el texto de los incidentes.
 *
 * En singular y con tilde, tal como se pidió, aunque el resto de encabezados
 * vayan sin tildes por el CSV de siempre: es una columna nueva, no hay macro
 * ni fórmula que la lea todavía.
 */
export const ETIQUETA_DESCRIPCION_INCIDENTE = "Descripción del incidente";

/** Los estados de una reserva, tal como los define `schema.ts`. */
export type EstadoReserva = Doc<"reservas">["estado"];

/**
 * Etiqueta de cada estado, en el orden del esquema.
 *
 * El tipo obliga a que estén exactamente los del esquema: si se añade uno
 * allá y no aquí, esto deja de compilar en lugar de desaparecer del filtro.
 */
export const ETIQUETA_ESTADO_RESERVA: Record<EstadoReserva, string> = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
};

/* "Devuelto parcial" viene de los incidentes: el depósito descontó una parte.
   Su razón va en la misma columna "Retencion", sin añadir columnas al CSV. */
export const ESTADO_DEPOSITO: Record<string, string> = {
  registrado: "Sin devolver",
  devuelto: "Devuelto",
  no_devuelto: "Retenido",
  devuelto_parcial: "Devuelto parcial",
};

/**
 * Las columnas, en el orden del CSV de siempre.
 *
 * Los encabezados se dejan sin tilde porque así los tiene el CSV que ya se
 * descarga, y alguien puede estar leyéndolo con una macro o una fórmula; las
 * columnas nuevas no cargan con esa regla (ver `ETIQUETA_DESCRIPCION_INCIDENTE`).
 * `Observaciones` va al final para no correr ninguna columna existente.
 */
export const COLUMNAS_REPORTE_RESERVAS: readonly ColumnaReporte[] = [
  { encabezado: "Fecha", tipo: "fecha" },
  { encabezado: "Inicio", tipo: "hora" },
  { encabezado: "Fin", tipo: "hora" },
  { encabezado: "Zona" },
  { encabezado: "Casa", alinear: "centro" },
  { encabezado: "Solicitante" },
  { encabezado: "Estado", alinear: "centro" },
  { encabezado: "Valor reserva", tipo: "moneda" },
  { encabezado: "Alquiler cobrado", tipo: "moneda" },
  { encabezado: "Deposito esperado", tipo: "moneda" },
  { encabezado: "Deposito recibido", tipo: "moneda" },
  { encabezado: "Estado deposito" },
  { encabezado: "Retencion" },
  { encabezado: "Observaciones" },
  /* Al final, igual que Observaciones: ninguna columna existente se corre. */
  { encabezado: ETIQUETA_VALOR_INCIDENTES, tipo: "moneda" },
  { encabezado: ETIQUETA_DESCRIPCION_INCIDENTE },
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
    /* Cero y no vacío: "no tuvo incidentes" es un dato, no una celda en blanco. */
    f.valorIncidentes ?? 0,
    /* Aquí sí en blanco, como Observaciones: no hay nada que contar. */
    f.descripcionIncidentes || null,
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
 * - Número de reservas → `total`: las filas del reporte, o sea las del rango
 *   y del estado filtrado (todas si no se filtró).
 * - Alquiler pactado estimado → `alquilerEsperado`: el "Alquiler pactado" del
 *   modal. Excluye canceladas y rechazadas, y usa la tarifa actual de la zona
 *   cuando la reserva no guardó su valor.
 * - Valor de incidentes → `valorIncidentes`: la suma de la columna del mismo
 *   nombre. Tampoco entra en Total ingresos: es lo valorado, y del depósito
 *   solo se descuenta hasta su monto.
 * - Total ingresos → `alquilerRecibido`: lo cobrado de alquiler. El depósito
 *   no entra: es una garantía que se devuelve (ver `costoReserva.ts`), y
 *   sumarlo inflaría el ingreso con plata que no es del conjunto.
 */
export function indicadoresResumenReservas(r: ResumenReporteReservas): IndicadorReporte[] {
  return [
    { etiqueta: "Número de reservas", valor: r.total, tipo: "entero" },
    { etiqueta: "Alquiler pactado estimado", valor: r.alquilerEsperado, tipo: "moneda" },
    { etiqueta: ETIQUETA_VALOR_INCIDENTES, valor: r.valorIncidentes, tipo: "moneda" },
    { etiqueta: "Total ingresos", valor: r.alquilerRecibido, tipo: "moneda", destacado: true },
  ];
}

/** Con un estado filtrado se añade al nombre; sin él queda el nombre de siempre. */
export function nombreArchivoReporteReservas(
  desde: string,
  hasta: string,
  extension: "csv" | "xlsx",
  estado?: EstadoReserva | null,
) {
  const sufijo = estado ? `_${estado}` : "";
  return `Reservas_${desde}_a_${hasta}${sufijo}.${extension}`;
}

export function opcionesXlsxReporteReservas(args: {
  filas: readonly FilaReporteReserva[];
  resumen: ResumenReporteReservas;
  desde: string;
  hasta: string;
  /** El estado por el que se filtró en el modal. Sin él, todas. */
  estado?: EstadoReserva | null;
}): OpcionesXlsxReporte {
  const estado = args.estado ? ETIQUETA_ESTADO_RESERVA[args.estado] : "Todos";
  return {
    nombreArchivo: nombreArchivoReporteReservas(args.desde, args.hasta, "xlsx", args.estado),
    hoja: "Reservas",
    resumen: {
      titulo: "Resumen de reservas",
      subtitulo: `Del ${args.desde} al ${args.hasta}  ·  Estado: ${estado}`,
      indicadores: indicadoresResumenReservas(args.resumen),
      notas: [
        "Alquiler pactado y total ingresos no cuentan reservas canceladas ni rechazadas.",
        "Total ingresos es el alquiler cobrado registrado; el depósito es una garantía reembolsable y no se suma.",
        "Valor de incidentes suma los incidentes valorados de las reservas del reporte; no es un ingreso: del depósito solo se descuenta hasta su monto.",
        "Descripción del incidente trae todos los incidentes de la reserva, incluidos los pendientes de valorar y los descartados, que no suman al valor.",
      ],
    },
    tabla: {
      titulo: "Reporte de reservas",
      nombreTabla: "TablaReservas",
      columnas: COLUMNAS_REPORTE_RESERVAS,
      filas: filasReporteReservas(args.filas),
    },
  };
}
