/**
 * El cobro del aporte de parqueadero a partir de lo que reporta el guarda.
 *
 * Antes este reporte se armaba leyendo las FACTURAS: mostraba a quien el
 * software contable ya le habia cobrado la contribucion voluntaria. Servia
 * para mirar atras, pero arrancaba con todo el historico del conjunto y no
 * decia nada de lo que hay que cobrar ahora.
 *
 * Ahora se arma al reves: nace vacio y se llena con lo que el guarda registra
 * en la ronda, con foto. Desde la Fase 4 el cargo no es cada reporte sino el
 * COBRO del mes (casa, vehiculo, mes; ver mas abajo), con un solo estado, para
 * que no se cobre dos veces ni se olvide ninguno.
 */

import { normalizarPlaca } from "./placa.ts";

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

/** Colombia no tiene horario de verano: siempre UTC−5. */
const DESFASE_COLOMBIA_MS = 5 * 60 * 60 * 1000;

/**
 * "2026-09": el mes de un instante, en hora de Colombia.
 *
 * El servidor corre en UTC: un carro visto el 30 de septiembre a las 10 p. m.
 * ya es 1.º de octubre en UTC, y con la hora del servidor caeria en el cobro
 * de octubre.
 */
export function periodoEnColombia(ts: number): string {
  const d = new Date(ts - DESFASE_COLOMBIA_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "2026-10" del periodo SIGUIENTE al de una fecha: donde cae el cargo. */
export function periodoSiguiente(ts: number): string {
  const d = new Date(ts - DESFASE_COLOMBIA_MS);
  /* El cargo no cabe en la factura del mes en curso —ya se emitio— sino en la
   * proxima. Proponerlo evita que la administracion lo teclee cada vez. */
  const s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return `${s.getUTCFullYear()}-${String(s.getUTCMonth() + 1).padStart(2, "0")}`;
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

// ─────────────────────────────────────────────────────────────
// El cobro: (casa, vehiculo, mes) — Fase 4, F-08
//
// Cada reporte del guarda era un cargo. Tres rondas que veian el mismo carro
// en septiembre eran tres cobros de la tarifa MENSUAL, y el mismo cargo tenia
// dos estados: `gestion` (Vigilancia) y `cobroEstado` (Cobros de
// parqueadero). Ahora el cargo es un cobro con identidad propia —la casa que
// responde por el vehiculo, la placa y el mes en que se parqueo, en hora de
// Colombia— que agrupa todos sus reportes y tiene un solo estado.
// ─────────────────────────────────────────────────────────────

/** El mes del cobro de un reporte: cuando OCURRIO, en hora de Colombia. */
export function periodoDeReporte(r: ReporteCobrable): string {
  return periodoEnColombia(ocurrioEn(r));
}

/** La placa comparable: sin espacios, guiones ni puntos, en mayusculas. */
export function placaNormalizada(placa: string | undefined | null): string {
  return normalizarPlaca(placa);
}

export type CasaReporte = { unidadId: string; numero: string };

/**
 * A que casa se le cobra un reporte que todavia no tiene su cobro enlazado.
 *
 * El cobro es de la casa que responde por el vehiculo, no de todas las que
 * nombra el reporte: el guarda puede senalar ademas la casa frente a la que
 * estaba parqueado, y esa es contexto, no deudora. Los reportes nuevos guardan
 * la casa al crearse (en su cobro). Para los viejos:
 *
 * 1. la casa del vehiculo, si esta entre las del reporte;
 * 2. si el reporte nombra una sola casa, esa;
 * 3. si no, ninguna: el cobro queda "sin casa" y la administracion decide.
 *    No se adivina entre varias.
 */
export function casaDelCobro(
  unidades: readonly CasaReporte[] | undefined,
  unidadDelVehiculo?: string | null,
): CasaReporte | null {
  const casas = unidades ?? [];
  const delVehiculo = unidadDelVehiculo
    ? casas.find((c) => c.unidadId === unidadDelVehiculo)
    : undefined;
  if (delVehiculo) return delVehiculo;
  return casas.length === 1 ? casas[0]! : null;
}

/** La identidad del cobro. Dos reportes con la misma clave son el mismo cobro. */
export function claveCobro(c: {
  unidadId?: string | null;
  placa: string | undefined;
  periodo: string;
}): string {
  return `${c.unidadId ?? "sin-casa"}|${placaNormalizada(c.placa)}|${c.periodo}`;
}

/** Lo que dicen los campos viejos de UN reporte sobre su cobro. */
type EstadoViejo = {
  cobroEstado?: string;
  gestion?: string;
  cobroPeriodo?: string;
  cobroMonto?: number;
  cobroNota?: string;
  gestionNota?: string;
};

function estadoViejoDe(r: EstadoViejo): EstadoCobro {
  if (r.cobroEstado === "facturado" || r.gestion === "cobrada") return "facturado";
  if (r.cobroEstado === "descartado" || r.gestion === "descartada") return "descartado";
  return "pendiente";
}

/**
 * El estado de un cobro armado con reportes viejos, que llevaban DOS estados
 * cada uno.
 *
 * - "Cobrada" en Vigilancia o "facturado" en Cobros de parqueadero son el
 *   mismo hecho: el cargo se le paso a la casa.
 * - Si un solo reporte del mes ya se facturo, el cobro del mes esta facturado:
 *   volver a cobrarlo por los otros reportes es justo el doble cobro de F-08.
 * - Descartado solo si todos lo estan: un reporte descartado (por ejemplo, la
 *   placa mal leida) no borra los demas del mes.
 *
 * `mezclado` avisa que los reportes no estaban de acuerdo, para revisarlo.
 */
export function estadoDeReportesViejos(reportes: readonly EstadoViejo[]): {
  estado: EstadoCobro;
  periodoFactura?: string;
  monto?: number;
  nota?: string;
  mezclado: boolean;
} {
  const estados = reportes.map(estadoViejoDe);
  const mezclado = new Set(estados).size > 1;
  const facturado = reportes.find((r) => estadoViejoDe(r) === "facturado");
  if (facturado) {
    return {
      estado: "facturado",
      periodoFactura: facturado.cobroPeriodo,
      monto: facturado.cobroMonto,
      mezclado,
    };
  }
  if (estados.length > 0 && estados.every((e) => e === "descartado")) {
    const r = reportes[0]!;
    return { estado: "descartado", nota: r.cobroNota ?? r.gestionNota, mezclado };
  }
  return { estado: "pendiente", mezclado };
}

export type AccionCobro = "facturar" | "descartar" | "devolver";

/**
 * Las transiciones permitidas. Cualquier otra se rechaza con un mensaje
 * estable que la pantalla muestra tal cual.
 *
 * - Un cobro facturado no se vuelve a facturar (#42), ni en otro periodo: si
 *   quedo en la cuenta de cobro equivocada, primero se devuelve a pendiente
 *   —y eso queda en su historia—.
 * - Descartar es solo para lo pendiente: un cobro ya facturado esta en una
 *   cuenta de cobro, y sacarlo de ahi es devolverlo primero.
 */
export const TRANSICIONES_COBRO: Record<
  AccionCobro,
  { desde: readonly EstadoCobro[]; hacia: EstadoCobro }
> = {
  facturar: { desde: ["pendiente"], hacia: "facturado" },
  descartar: { desde: ["pendiente"], hacia: "descartado" },
  devolver: { desde: ["facturado", "descartado"], hacia: "pendiente" },
};

export function transicionCobro(
  estado: EstadoCobro,
  accion: AccionCobro,
  periodoFactura?: string | null,
): { ok: true; hacia: EstadoCobro } | { ok: false; mensaje: string } {
  const t = TRANSICIONES_COBRO[accion];
  if (t.desde.includes(estado)) return { ok: true, hacia: t.hacia };
  const enPeriodo = periodoFactura ? ` en ${periodoFactura}` : "";
  if (estado === "facturado") {
    return {
      ok: false,
      mensaje:
        accion === "facturar"
          ? `Este cobro ya se facturó${enPeriodo}. Si quedó en la cuenta de cobro equivocada, primero devuélvelo a pendiente.`
          : `Este cobro ya se facturó${enPeriodo}. Para no cobrarlo, primero devuélvelo a pendiente.`,
    };
  }
  if (estado === "descartado") {
    return {
      ok: false,
      mensaje:
        accion === "facturar"
          ? "Este cobro está descartado. Para facturarlo, primero devuélvelo a pendiente."
          : "Este cobro ya está descartado.",
    };
  }
  return { ok: false, mensaje: "Este cobro ya está pendiente." };
}

export type CobroGuardado = {
  _id: string;
  clave: string;
  unidadId?: string;
  unidadNumero?: string;
  placa: string;
  tipoVehiculo?: string;
  periodo: string;
  estado: EstadoCobro;
  periodoFactura?: string;
  monto?: number;
  nota?: string;
  actualizadoPorNombre?: string;
};

export type ReporteDeCobro = ReporteCobrable &
  EstadoViejo & {
    _id: string;
    _creationTime?: number;
    cargoId?: string;
    vehiculoId?: string;
    unidades?: CasaReporte[];
  };

export type GrupoCobro<R extends ReporteDeCobro> = {
  clave: string;
  /** El cobro guardado; ausente si sus reportes son viejos y nadie lo ha gestionado. */
  cobro: CobroGuardado | null;
  casa: CasaReporte | null;
  placa: string;
  periodo: string;
  reportes: R[];
  estado: EstadoCobro;
  periodoFactura?: string;
  monto?: number;
  nota?: string;
  /** Reportes viejos que no estaban de acuerdo en su estado. */
  mezclado: boolean;
};

/**
 * Agrupa los reportes de vehiculos en cobros.
 *
 * Un reporte enlazado va con su cobro. Uno viejo va con la clave que le toca;
 * si ya existe un cobro guardado con esa clave (por ejemplo, porque un
 * reporte nuevo del mismo carro y mes lo creo), se une a el. El estado es el
 * del cobro guardado; si no hay, el de sus reportes viejos.
 */
export function agruparEnCobros<R extends ReporteDeCobro>(
  reportes: readonly R[],
  cobros: readonly CobroGuardado[],
  unidadDelVehiculo: (r: R) => string | null | undefined,
): GrupoCobro<R>[] {
  const porId = new Map(cobros.map((c) => [c._id, c]));
  const porClave = new Map(cobros.map((c) => [c.clave, c]));
  const grupos = new Map<string, GrupoCobro<R>>();

  for (const r of reportes) {
    if (!r.vehiculoPlaca) continue;
    const enlazado = r.cargoId ? porId.get(r.cargoId) : undefined;
    let clave: string;
    let casa: CasaReporte | null;
    let periodo: string;
    if (enlazado) {
      clave = enlazado.clave;
      periodo = enlazado.periodo;
      casa = enlazado.unidadId
        ? { unidadId: enlazado.unidadId, numero: enlazado.unidadNumero ?? "" }
        : null;
    } else {
      casa = casaDelCobro(r.unidades, unidadDelVehiculo(r));
      periodo = periodoDeReporte(r);
      clave = claveCobro({ unidadId: casa?.unidadId, placa: r.vehiculoPlaca, periodo });
    }
    let g = grupos.get(clave);
    if (!g) {
      const cobro = enlazado ?? porClave.get(clave) ?? null;
      g = {
        clave,
        cobro,
        casa,
        placa: cobro?.placa ?? r.vehiculoPlaca,
        periodo,
        reportes: [],
        estado: "pendiente",
        mezclado: false,
      };
      grupos.set(clave, g);
    }
    g.reportes.push(r);
  }

  for (const g of grupos.values()) {
    g.reportes.sort(
      (a, b) => (a._creationTime ?? a.createdAt) - (b._creationTime ?? b.createdAt),
    );
    if (g.cobro) {
      g.estado = g.cobro.estado;
      g.periodoFactura = g.cobro.periodoFactura;
      g.monto = g.cobro.monto;
      g.nota = g.cobro.nota;
    } else {
      const viejo = estadoDeReportesViejos(g.reportes);
      g.estado = viejo.estado;
      g.periodoFactura = viejo.periodoFactura;
      g.monto = viejo.monto;
      g.nota = viejo.nota;
      g.mezclado = viejo.mezclado;
    }
  }
  return [...grupos.values()];
}

/** Como se ve el estado del cobro en Vigilancia, que habla de "gestion". */
export function gestionDeCobro(estado: EstadoCobro): "pendiente" | "cobrada" | "descartada" {
  return estado === "facturado" ? "cobrada" : estado === "descartado" ? "descartada" : "pendiente";
}
