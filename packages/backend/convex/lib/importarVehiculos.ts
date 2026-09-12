/**
 * Cómo se lee un Excel de vehículos.
 *
 * La administración ya tiene el parqueadero en una hoja. Lo que faltaba era
 * volver a subirla y que Vekino ACTUALIZARA por placa — no que pidiera
 * editar carro por carro. La placa es la llave: si cambia la casa, la marca
 * o el color, es el mismo carro en otra fila.
 */

export type FilaVehiculoExcel = {
  placa: string;
  unidad: string;
  torre?: string;
  tipo?: string;
  marca?: string;
  color?: string;
  observaciones?: string;
};

export type UnidadMin = {
  _id: string;
  numero: string;
  torre?: string | null;
};

export type ResolucionUnidad =
  | { ok: true; unidadId: string }
  | { ok: false; motivo: "sin_unidad" | "ambigua" };

const ALIAS: Record<keyof FilaVehiculoExcel, string[]> = {
  placa: ["placa", "placas", "placa vehiculo", "placa vehículo"],
  unidad: [
    "unidad",
    "casa",
    "apto",
    "apartamento",
    "inmueble",
    "nro",
    "numero",
    "número",
    "apart",
  ],
  torre: ["torre", "bloque", "interior"],
  tipo: ["tipo", "clase", "vehiculo", "vehículo", "clase vehiculo"],
  marca: ["marca", "linea", "línea", "modelo"],
  color: ["color"],
  observaciones: ["observaciones", "obs", "notas", "comentario", "comentarios"],
};

const ROMANOS: Record<string, string> = {
  I: "1", II: "2", III: "3", IV: "4", V: "5",
  VI: "6", VII: "7", VIII: "8", IX: "9", X: "10",
};

function compactar(s: string): string {
  return s
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/UNIDAD/g, "")
    .replace(/APARTAMENTO/g, "")
    .replace(/APTO/g, "")
    .replace(/CASA/g, "")
    .replace(/TORRE/g, "")
    .replace(/BLOQUE/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

/** "T II", "Torre 2", "2" → las mismas claves para cruzar Excel y conjunto. */
function clavesTorre(torre: string): string[] {
  const c = compactar(torre);
  if (!c) return [];
  const keys = [c];
  const digitos = c.replace(/[^0-9]/g, "");
  if (digitos) keys.push(digitos);
  const sinT = c.replace(/^T/, "");
  if (ROMANOS[sinT]) keys.push(ROMANOS[sinT]);
  if (ROMANOS[c]) keys.push(ROMANOS[c]);
  return keys;
}

function encabezadoClave(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Mapa columna del Excel → campo. Tolera "Nro. unidad", "PLACA ", etc. */
export function mapaColumnas(
  encabezados: string[],
): Partial<Record<keyof FilaVehiculoExcel, number>> {
  const out: Partial<Record<keyof FilaVehiculoExcel, number>> = {};
  encabezados.forEach((h, i) => {
    const k = encabezadoClave(h);
    if (!k) return;
    (Object.keys(ALIAS) as (keyof FilaVehiculoExcel)[]).forEach((campo) => {
      if (out[campo] != null) return;
      if (ALIAS[campo].some((a) => k === a || k.startsWith(a + " ") || k.endsWith(" " + a))) {
        out[campo] = i;
      }
    });
  });
  return out;
}

export function filasDesdeHoja(
  encabezados: string[],
  filas: string[][],
): FilaVehiculoExcel[] {
  const cols = mapaColumnas(encabezados);
  const placaIdx = cols.placa;
  const unidadIdx = cols.unidad;
  if (placaIdx == null || unidadIdx == null) {
    throw new Error(
      "El archivo necesita una columna de placa y otra de unidad (casa/apto).",
    );
  }
  const out: FilaVehiculoExcel[] = [];
  for (const fila of filas) {
    const placa = (fila[placaIdx] ?? "").trim();
    const unidad = (fila[unidadIdx] ?? "").trim();
    if (!placa && !unidad) continue;
    const celda = (campo: keyof FilaVehiculoExcel) => {
      const i = cols[campo];
      if (i == null) return undefined;
      const v = (fila[i] ?? "").trim();
      return v || undefined;
    };
    out.push({
      placa,
      unidad,
      torre: celda("torre"),
      tipo: celda("tipo"),
      marca: celda("marca"),
      color: celda("color"),
      observaciones: celda("observaciones"),
    });
  }
  return out;
}

export function mapearTipo(
  tipo: string | undefined,
  placa: string,
): "carro" | "moto" | "bicicleta" | "otro" {
  const s = (tipo ?? "").trim().toUpperCase();
  if (s.includes("BICI")) return "bicicleta";
  if (s.includes("MOTO")) return "moto";
  if (
    s.includes("CARRO") ||
    s.includes("AUTO") ||
    s.includes("CAMION") ||
    s.includes("CAMIONETA") ||
    s === "VAN"
  ) {
    return "carro";
  }
  if (s.includes("OTRO") || s.includes("OTRA")) return "otro";
  const last = (placa ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-1);
  if (/[A-Z]/.test(last)) return "moto";
  return "carro";
}

function clavesDeUnidad(u: UnidadMin): string[] {
  const n = compactar(u.numero);
  const keys = n ? [n] : [];
  if (u.torre && n) {
    for (const t of clavesTorre(u.torre)) keys.push(t + n);
  }
  return keys;
}

function clavesDeFila(unidad: string, torre?: string): string[] {
  const n = compactar(unidad);
  if (!n) return [];
  /* Con torre, el número suelto ya no cuenta: dos 101 dejarían la fila
   * ambigua aunque el Excel sí dijera cuál. */
  if (torre) return clavesTorre(torre).map((t) => t + n);
  return [n];
}

/**
 * Una unidad del conjunto para el texto del Excel.
 *
 * Si hay dos casas "101", sin torre el resultado es ambiguo a propósito:
 * adivinar la torre es cobrarle el carro al vecino.
 */
export function resolverUnidad(
  unidades: UnidadMin[],
  unidad: string,
  torre?: string,
): ResolucionUnidad {
  const indice = new Map<string, string[]>();
  const push = (clave: string, id: string) => {
    const arr = indice.get(clave) ?? [];
    if (!arr.includes(id)) arr.push(id);
    indice.set(clave, arr);
  };
  for (const u of unidades) {
    for (const k of clavesDeUnidad(u)) push(k, u._id);
  }

  const ids = new Set<string>();
  for (const k of clavesDeFila(unidad, torre)) {
    for (const id of indice.get(k) ?? []) ids.add(id);
  }
  if (ids.size === 1) return { ok: true, unidadId: [...ids][0]! };
  if (ids.size === 0) return { ok: false, motivo: "sin_unidad" };
  return { ok: false, motivo: "ambigua" };
}
