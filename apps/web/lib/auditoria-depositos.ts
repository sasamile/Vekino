/**
 * La auditoría de depósitos: lo que se ve en pantalla y lo que baja en Excel.
 *
 * Hermana de `reporte-reservas.ts` y con el mismo trato: una sola
 * representación para las dos salidas, cifras que NO se recalculan aquí —son
 * las que sella el servidor en `reservas.auditoriaDepositos`— y el filtrado
 * como funciones puras, para poder probarlo sin navegador.
 *
 * Lo que sí es de aquí son los NOMBRES: cómo se llama cada estado, cada rol y
 * cada ventanilla cuando alguien los lee. El estado del depósito reutiliza el
 * mismo mapa que el reporte de reservas (`ESTADO_DEPOSITO`) para que los dos
 * archivos no puedan llamar distinto a la misma cosa.
 *
 * Un depósito sin rol registrado dice "Sin registrar" y no el rol que esa
 * persona tiene hoy: es el único dato del flujo que no se guardaba antes, y
 * completarlo al leer sería inventar el pasado.
 */
import type {
  ColumnaReporte,
  IndicadorReporte,
  OpcionesXlsxReporte,
  ValorReporte,
} from "./excel-reporte.ts";
import { ESTADO_DEPOSITO } from "./reporte-reservas.ts";

/** Los estados que puede tener un depósito, tal como los declara `schema.ts`. */
export type EstadoDeposito =
  | "registrado"
  | "devuelto"
  | "devuelto_parcial"
  | "no_devuelto";

/** Con qué autoridad se actuó. Lo sella el servidor al recibir o devolver. */
export type RolActorDeposito =
  | "administrador"
  | "junta_directiva"
  | "contadora"
  | "guardia"
  | "plataforma";

/** Por qué ventanilla entró la acción. */
export type OrigenDeposito = "porteria" | "administracion";

/** Una fila de `reservas.auditoriaDepositos`. */
export type FilaAuditoriaDeposito = {
  reservaId: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  zonaNombre: string;
  unidadNumero: string;
  solicitanteNombre: string;
  estadoReserva: string;
  /** Lo que se recibió. Nunca cambia. */
  monto: number;
  estado: EstadoDeposito | string;
  fechaRegistro: number;
  recibidoPorNombre: string;
  recibidoPorRol: RolActorDeposito | string | null;
  recibidoOrigen: OrigenDeposito | string | null;
  observacionesIngreso: string | null;
  fechaResolucion: number | null;
  resueltoPorNombre: string | null;
  resueltoPorRol: RolActorDeposito | string | null;
  resueltoOrigen: OrigenDeposito | string | null;
  motivoDevolucion: string | null;
  devuelto: number | null;
  descontado: number | null;
  enCustodia: number;
  saldoPrevisto: number | null;
  cifrasCongeladas: boolean;
  valorIncidentes: number;
  descripcionIncidentes: string;
  incidentes: number;
};

/** Los totales de `reservas.auditoriaDepositos`. */
export type ResumenAuditoriaDepositos = {
  total: number;
  recibido: number;
  enCustodia: number;
  devuelto: number;
  descontado: number;
  valorIncidentes: number;
  conIncidentes: number;
  sinRolRegistrado: number;
};

/**
 * Cómo se lee cada rol.
 *
 * "Guarda" y no "guardia": es como se le llama a la persona en portería, y
 * "Plataforma" es el soporte de Vekino, que no es un cargo del conjunto.
 */
export const ETIQUETA_ROL_ACTOR: Record<RolActorDeposito, string> = {
  administrador: "Administrador del condominio",
  junta_directiva: "Junta directiva",
  contadora: "Contadora",
  guardia: "Guarda",
  plataforma: "Soporte de la plataforma",
};

export const ETIQUETA_ORIGEN: Record<OrigenDeposito, string> = {
  porteria: "Portería",
  administracion: "Administración",
};

/** Lo que se muestra cuando el dato no se guardó. Nunca se rellena a ojo. */
export const SIN_REGISTRAR = "Sin registrar";

export function etiquetaRol(rol: string | null | undefined): string {
  if (!rol) return SIN_REGISTRAR;
  return ETIQUETA_ROL_ACTOR[rol as RolActorDeposito] ?? rol;
}

export function etiquetaOrigen(origen: string | null | undefined): string {
  if (!origen) return SIN_REGISTRAR;
  return ETIQUETA_ORIGEN[origen as OrigenDeposito] ?? origen;
}

/**
 * Cómo se lee el estado de un depósito.
 *
 * Es también el "tipo de devolución": en este modelo son el mismo dato, y una
 * segunda columna que repitiera el estado con otras palabras solo podría
 * contradecirlo.
 */
export function etiquetaEstado(estado: string): string {
  return ESTADO_DEPOSITO[estado] ?? estado;
}

// ─────────────────────────────────────────────────────────────
// Fechas: el sello es un instante; el reporte, un día y una hora
// ─────────────────────────────────────────────────────────────

const TZ = "America/Bogota";

/** "2026-09-16" del instante, en hora de Colombia. */
export function fechaBogota(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

/** "14:05" del instante, en hora de Colombia. */
export function horaBogota(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

// ─────────────────────────────────────────────────────────────
// Filtros
// ─────────────────────────────────────────────────────────────

/** Qué fecha tiene que caer en el rango. Lo aplica el servidor. */
export type CriterioFecha = "recepcion" | "devolucion" | "cualquiera";

export const ETIQUETA_CRITERIO_FECHA: Record<CriterioFecha, string> = {
  cualquiera: "Recepción o devolución",
  recepcion: "Fecha de recepción",
  devolucion: "Fecha de devolución",
};

export type FiltroIncidentes = "todos" | "con" | "sin";

export type FiltrosAuditoria = {
  /** Solicitante, casa, zona o responsable. */
  busqueda: string;
  estado: "" | EstadoDeposito;
  incidentes: FiltroIncidentes;
};

export const FILTROS_VACIOS: FiltrosAuditoria = {
  busqueda: "",
  estado: "",
  incidentes: "todos",
};

/**
 * Normaliza para buscar: sin tildes, sin mayúsculas, sin separadores.
 *
 * La misma regla que el reporte de aporte voluntario: quien escribe "Nunez"
 * está buscando a Núñez.
 */
export function normalizar(t: string): string {
  return (t ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * ¿La fila corresponde a lo buscado?
 *
 * Busca también por responsable: "todo lo que recibió Pedro" es media
 * auditoría, y obligar a un filtro aparte para eso sobra.
 */
export function coincide(fila: FilaAuditoriaDeposito, busqueda: string): boolean {
  const q = normalizar(busqueda);
  if (!q) return true;
  return [
    fila.solicitanteNombre,
    fila.unidadNumero,
    fila.zonaNombre,
    fila.recibidoPorNombre,
    fila.resueltoPorNombre ?? "",
  ].some((c) => normalizar(c).includes(q));
}

/** El filtrado completo, en el orden en que llega del servidor. */
export function filtrarAuditoria(
  filas: readonly FilaAuditoriaDeposito[],
  filtros: FiltrosAuditoria,
): FilaAuditoriaDeposito[] {
  return filas.filter((f) => {
    if (filtros.estado && f.estado !== filtros.estado) return false;
    if (filtros.incidentes === "con" && f.incidentes === 0) return false;
    if (filtros.incidentes === "sin" && f.incidentes > 0) return false;
    return coincide(f, filtros.busqueda);
  });
}

/**
 * Los totales de lo que se está viendo.
 *
 * Se recalculan sobre las filas FILTRADAS, y por eso se hace aquí y no se
 * reutiliza el `resumen` del servidor: ese resume el rango entero, y un
 * resumen que no cuadre con la tabla que tiene debajo es peor que ninguno.
 * Las cifras que se suman siguen siendo las del servidor, una por una.
 */
export function resumirAuditoria(
  filas: readonly FilaAuditoriaDeposito[],
): ResumenAuditoriaDepositos {
  return {
    total: filas.length,
    recibido: filas.reduce((s, f) => s + f.monto, 0),
    enCustodia: filas.reduce((s, f) => s + f.enCustodia, 0),
    devuelto: filas.reduce((s, f) => s + (f.devuelto ?? 0), 0),
    descontado: filas.reduce((s, f) => s + (f.descontado ?? 0), 0),
    valorIncidentes: filas.reduce((s, f) => s + f.valorIncidentes, 0),
    conIncidentes: filas.filter((f) => f.incidentes > 0).length,
    sinRolRegistrado: filas.filter(
      (f) => !f.recibidoPorRol || (f.fechaResolucion != null && !f.resueltoPorRol),
    ).length,
  };
}

// ─────────────────────────────────────────────────────────────
// Excel
// ─────────────────────────────────────────────────────────────

/**
 * Las columnas de la auditoría.
 *
 * Fecha y hora van separadas —y no en una sola celda de texto— porque así
 * Excel las ordena y las filtra como lo que son. Las de la devolución quedan
 * vacías mientras el depósito siga en custodia: una fila sin devolver no
 * tiene fecha de devolución, y un cero ahí diría que se devolvió nada.
 *
 * La referencia de la reserva va al final: es el identificador técnico, útil
 * para cruzar con soporte y ruidoso para leer.
 */
export const COLUMNAS_AUDITORIA_DEPOSITOS: readonly ColumnaReporte[] = [
  { encabezado: "Fecha reserva", tipo: "fecha" },
  { encabezado: "Zona" },
  { encabezado: "Casa", alinear: "centro" },
  { encabezado: "Solicitante" },
  { encabezado: "Fecha recepcion", tipo: "fecha" },
  { encabezado: "Hora recepcion", tipo: "hora" },
  { encabezado: "Valor deposito", tipo: "moneda" },
  { encabezado: "Estado" },
  { encabezado: "Fecha devolucion", tipo: "fecha" },
  { encabezado: "Hora devolucion", tipo: "hora" },
  { encabezado: "Valor devuelto", tipo: "moneda" },
  { encabezado: "Valor descontado", tipo: "moneda" },
  { encabezado: "Saldo en custodia", tipo: "moneda" },
  { encabezado: "Valor de incidentes", tipo: "moneda" },
  { encabezado: "Descripción del incidente" },
  { encabezado: "Motivo de la devolucion" },
  { encabezado: "Recibido por" },
  { encabezado: "Rol de quien recibio" },
  { encabezado: "Recibido en" },
  { encabezado: "Devuelto por" },
  { encabezado: "Rol de quien devolvio" },
  { encabezado: "Devuelto en" },
  { encabezado: "Observaciones de recepcion" },
  { encabezado: "Referencia de la reserva" },
];

/** Una fila por depósito, alineada con `COLUMNAS_AUDITORIA_DEPOSITOS`. */
export function filasAuditoriaDepositos(
  filas: readonly FilaAuditoriaDeposito[],
): ValorReporte[][] {
  return filas.map((f) => {
    const resuelto = f.fechaResolucion != null;
    return [
      f.fecha,
      f.zonaNombre,
      f.unidadNumero,
      f.solicitanteNombre,
      fechaBogota(f.fechaRegistro),
      horaBogota(f.fechaRegistro),
      f.monto,
      etiquetaEstado(f.estado),
      resuelto ? fechaBogota(f.fechaResolucion!) : null,
      resuelto ? horaBogota(f.fechaResolucion!) : null,
      f.devuelto,
      f.descontado,
      /* Cero y no vacío: "ya no queda nada en custodia" es un dato. */
      f.enCustodia,
      f.valorIncidentes,
      f.descripcionIncidentes || null,
      f.motivoDevolucion,
      f.recibidoPorNombre,
      etiquetaRol(f.recibidoPorRol),
      etiquetaOrigen(f.recibidoOrigen),
      /* Sin devolución no hay responsable: la celda queda vacía en vez de
         decir "Sin registrar", que significaría que sí la hubo. */
      resuelto ? f.resueltoPorNombre : null,
      resuelto ? etiquetaRol(f.resueltoPorRol) : null,
      resuelto ? etiquetaOrigen(f.resueltoOrigen) : null,
      f.observacionesIngreso,
      f.reservaId,
    ];
  });
}

/** Los indicadores del resumen del Excel: los de la tabla que se está viendo. */
export function indicadoresAuditoriaDepositos(
  r: ResumenAuditoriaDepositos,
): IndicadorReporte[] {
  return [
    { etiqueta: "Depósitos", valor: r.total, tipo: "entero" },
    { etiqueta: "Valor recibido", valor: r.recibido, tipo: "moneda" },
    { etiqueta: "En custodia", valor: r.enCustodia, tipo: "moneda" },
    { etiqueta: "Descontado por incidentes", valor: r.descontado, tipo: "moneda" },
    { etiqueta: "Devuelto", valor: r.devuelto, tipo: "moneda", destacado: true },
  ];
}

export function nombreArchivoAuditoriaDepositos(desde: string, hasta: string) {
  return `Auditoria_depositos_${desde}_a_${hasta}.xlsx`;
}

export function opcionesXlsxAuditoriaDepositos(args: {
  filas: readonly FilaAuditoriaDeposito[];
  desde: string;
  hasta: string;
  criterio: CriterioFecha;
}): OpcionesXlsxReporte {
  const resumen = resumirAuditoria(args.filas);
  return {
    nombreArchivo: nombreArchivoAuditoriaDepositos(args.desde, args.hasta),
    hoja: "Depositos",
    resumen: {
      titulo: "Auditoría de depósitos",
      subtitulo: `Del ${args.desde} al ${args.hasta}  ·  ${ETIQUETA_CRITERIO_FECHA[args.criterio]}`,
      indicadores: indicadoresAuditoriaDepositos(resumen),
      notas: [
        "El depósito es una garantía: lo recibido no es un ingreso del conjunto y lo devuelto no es un gasto.",
        "Descontado sale de los incidentes valorados y nunca supera el depósito; el excedente se informa en la reserva y no se cobra aquí.",
        "Valor de incidentes es lo que la administración valoró, con pendientes y descartados fuera; la descripción los lista todos.",
        resumen.sinRolRegistrado > 0
          ? `${resumen.sinRolRegistrado} depósito(s) dicen "Sin registrar" en el rol: son anteriores a que el rol se guardara y no se completa con el de hoy.`
          : "El rol de cada responsable es el que tenía al actuar, sellado en ese momento.",
      ],
    },
    tabla: {
      titulo: "Depósitos de reservas",
      nombreTabla: "TablaDepositos",
      columnas: COLUMNAS_AUDITORIA_DEPOSITOS,
      filas: filasAuditoriaDepositos(args.filas),
    },
  };
}
