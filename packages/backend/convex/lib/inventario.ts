/**
 * Las cuentas del inventario: normalización, diferencias y validación de una
 * carga masiva.
 *
 * Aparte del resto del módulo porque no tocan la base, igual que
 * `lib/vigilancia.ts` y `lib/ronda.ts`. Que una fila del Excel sea válida,
 * que dos seriales sean el mismo o qué cambió al editar son decisiones que
 * conviene poder probar sin levantar nada — y que además tienen que dar el
 * mismo resultado en el servidor y en la previsualización de la pantalla.
 */

// ─────────────────────────────────────────────────────────────
// Normalización
// ─────────────────────────────────────────────────────────────

/**
 * El serial tal como se guarda y se compara.
 *
 * Mayúsculas y sin espacios sobrantes porque el mismo aparato tecleado dos
 * veces —"vk-1042" y "VK 1042"— es exactamente el duplicado que la regla de
 * unicidad existe para atrapar, y comparando en crudo se cuela. Que se guarde
 * ya normalizado (y no solo se compare así) es lo que permite usar el índice
 * `by_compania_serial` para buscarlo: un índice no puede aplicar una función.
 *
 * `null` cuando no hay serial. No es lo mismo que la cadena vacía: un
 * elemento sin serial no colisiona con ningún otro, mientras que dos cadenas
 * vacías sí serían iguales entre sí.
 */
export function normalizarSerial(bruto: string | null | undefined): string | null {
  if (bruto == null) return null;
  const limpio = bruto.trim().replace(/\s+/g, " ").toUpperCase();
  return limpio.length > 0 ? limpio : null;
}

/** Texto de formulario: recortado, o `undefined` si no quedó nada. */
export function normalizarTexto(
  bruto: string | null | undefined,
): string | undefined {
  const limpio = bruto?.trim();
  return limpio && limpio.length > 0 ? limpio : undefined;
}

export const MAX_NOMBRE = 120;
export const MAX_SERIAL = 60;
export const MAX_DESCRIPCION = 1000;

/**
 * Tope de una observación de entrega o devolución.
 *
 * Corto a propósito: la observación se guarda en la fila de custodia Y se
 * concatena en el texto de la novedad, así que cada operación deja dos copias.
 * Sin tope, cien entregas con observaciones largas bastan para que la ficha
 * del elemento —que lee su historial entero— deje de caber en una respuesta y
 * no vuelva a cargar nunca, sin forma de arreglarlo desde la pantalla.
 */
export const MAX_OBSERVACION = 500;

/**
 * Tope de la referencia de la foto.
 *
 * Es una URL de S3, no un sitio donde meter datos. Sin tope, un solo elemento
 * con una `data:` de novecientos kilobytes cabe en el documento pero hace que
 * el LISTADO entero de la compañía deje de caber en una respuesta — y el
 * listado es justamente la pantalla desde la que habría que arreglarlo.
 */
export const MAX_FOTO_URL = 2048;

/** Una referencia de foto utilizable. La misma regla que aplica la carga masiva. */
export function esUrlDeFoto(valor: string): boolean {
  return /^https?:\/\//i.test(valor) && valor.length <= MAX_FOTO_URL;
}

/**
 * Cuántas filas admite una sola carga.
 *
 * Una importación es UNA mutación, y una mutación de Convex es una
 * transacción con un tope de escrituras. Cada fila escribe dos documentos —el
 * elemento y su novedad de alta—, así que el límite real está bastante más
 * arriba; 500 deja margen de sobra y, sobre todo, hace que el fallo llegue
 * como un mensaje que se entiende ("son demasiadas, pártelo en dos") en vez
 * de como un error del runtime a mitad de la carga.
 */
export const MAX_FILAS_IMPORTACION = 500;

// ─────────────────────────────────────────────────────────────
// La plantilla de Excel
// ─────────────────────────────────────────────────────────────

/**
 * Las columnas de la plantilla, en orden.
 *
 * `clave` es el campo del dominio; `encabezado` lo que ve quien abre el
 * archivo. Una sola lista para las dos cosas: si la plantilla y el lector se
 * declararan por separado, el día que se añada una columna se actualizaría
 * uno de los dos.
 */
export const COLUMNAS_PLANTILLA = [
  {
    clave: "nombre",
    encabezado: "Nombre",
    requerida: true,
    ejemplo: "Radio Motorola DEP450",
  },
  {
    clave: "serial",
    encabezado: "Serial",
    requerida: false,
    ejemplo: "VK-1042",
  },
  {
    clave: "descripcion",
    encabezado: "Descripcion",
    requerida: false,
    ejemplo: "Radio de dos vias, bateria de repuesto incluida",
  },
  {
    clave: "fotoUrl",
    encabezado: "Foto (URL)",
    requerida: false,
    ejemplo: "",
  },
] as const;

export type ClaveColumna = (typeof COLUMNAS_PLANTILLA)[number]["clave"];

/**
 * Encabezado tal como se compara: sin acentos, sin signos y en minúsculas.
 *
 * Quien rellena la plantilla la abre en Excel, y Excel hace cosas: autocorrige
 * "Descripcion" a "Descripción", deja un espacio al final al copiar y pegar,
 * o alguien escribe "SERIAL". Rechazar el archivo por eso convierte una carga
 * de doscientos elementos en un problema de tildes.
 */
export function normalizarEncabezado(bruto: string): string {
  return bruto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Empareja los encabezados del archivo con las columnas conocidas.
 *
 * Devuelve el índice de columna de cada clave, o `null` si esa columna no
 * viene. Se ignoran las columnas de más: una compañía que añada una suya al
 * final no debería ver fallar la carga.
 */
export function mapearColumnas(
  encabezados: readonly string[],
): Record<ClaveColumna, number | null> {
  const porNombre = new Map<string, number>();
  encabezados.forEach((h, i) => {
    const k = normalizarEncabezado(String(h ?? ""));
    /* El primero gana: con la columna duplicada, la de la izquierda es la que
     * el usuario ve como "la buena". */
    if (k && !porNombre.has(k)) porNombre.set(k, i);
  });

  const salida = {} as Record<ClaveColumna, number | null>;
  for (const col of COLUMNAS_PLANTILLA) {
    salida[col.clave] = porNombre.get(normalizarEncabezado(col.encabezado)) ?? null;
  }
  /* Alias tolerantes para lo que la gente escribe de verdad. */
  if (salida.fotoUrl == null) {
    salida.fotoUrl = porNombre.get("foto") ?? porNombre.get("url") ?? null;
  }
  if (salida.descripcion == null) {
    salida.descripcion = porNombre.get("detalle") ?? null;
  }
  return salida;
}

// ─────────────────────────────────────────────────────────────
// Validación de filas
// ─────────────────────────────────────────────────────────────

export const MOTIVOS = {
  FALTA_NOMBRE: "El nombre es obligatorio.",
  NOMBRE_MUY_LARGO: `El nombre supera ${MAX_NOMBRE} caracteres.`,
  SERIAL_MUY_LARGO: `El serial supera ${MAX_SERIAL} caracteres.`,
  DESCRIPCION_MUY_LARGA: `La descripción supera ${MAX_DESCRIPCION} caracteres.`,
  SERIAL_DUPLICADO_EN_ARCHIVO:
    "Ese serial aparece más de una vez en este archivo.",
  SERIAL_YA_EXISTE:
    "Ya hay un elemento activo con ese serial en el inventario.",
  FOTO_URL_INVALIDA:
    "La foto debe ser una URL que empiece por http:// o https:// y no superar 2048 caracteres.",
} as const;

export type CodigoMotivo = keyof typeof MOTIVOS;

export type Motivo = {
  codigo: CodigoMotivo;
  mensaje: string;
  /** Encabezado de la columna que lo causa, para poder señalarla. */
  columna?: string;
};

/** Una fila del archivo, ya extraída pero sin validar ni normalizar. */
export type FilaCruda = {
  nombre?: string;
  serial?: string;
  descripcion?: string;
  fotoUrl?: string;
};

/** Lo que se inserta si la fila pasa. Ya normalizado. */
export type ItemImportable = {
  nombre: string;
  serial?: string;
  descripcion?: string;
  fotoUrl?: string;
};

export type FilaValidada =
  /** Se salta sin ruido: no es un error, es el final del archivo. */
  | { fila: number; estado: "vacia" }
  | { fila: number; estado: "valida"; item: ItemImportable }
  | {
      fila: number;
      estado: "invalida";
      motivos: Motivo[];
      /** Se devuelve para poder pintar la fila que falló, no solo su número. */
      datos: FilaCruda;
    };

export type InformeImportacion = {
  filas: FilaValidada[];
  total: number;
  validas: number;
  invalidas: number;
  vacias: number;
};

function esFilaVacia(f: FilaCruda): boolean {
  return (
    !normalizarTexto(f.nombre) &&
    !normalizarTexto(f.serial) &&
    !normalizarTexto(f.descripcion) &&
    !normalizarTexto(f.fotoUrl)
  );
}

/**
 * Valida el archivo entero de una vez y explica CADA fila que falla.
 *
 * De una vez y no fila a fila porque hay un motivo que solo existe mirando el
 * conjunto: dos filas del mismo archivo con el mismo serial. Ninguna de las
 * dos está mal por separado, y validándolas por separado la carga entraría
 * creando justo el duplicado que la regla prohíbe.
 *
 * `serialesExistentes` son los seriales YA normalizados de los elementos no
 * archivados de la compañía. Se recibe hecho en vez de consultarse aquí para
 * que esta función siga sin tocar la base — y para que la previsualización y
 * la escritura definitiva usen exactamente el mismo código.
 *
 * Nunca lanza. Un archivo con cien filas malas devuelve cien explicaciones,
 * que es de lo que se trata: "error al importar" no le sirve a nadie.
 */
export function validarImportacion(
  crudas: readonly FilaCruda[],
  serialesExistentes: ReadonlySet<string>,
): InformeImportacion {
  /* Primera pasada: cuántas veces sale cada serial en el propio archivo. Hay
   * que contarlas ANTES de juzgar ninguna fila, porque el duplicado marca a
   * las dos y no solo a la segunda: si solo se marcara la segunda, quien
   * corrige el archivo no ve que el conflicto era con la fila 12. */
  const vecesEnArchivo = new Map<string, number>();
  for (const f of crudas) {
    if (esFilaVacia(f)) continue;
    const s = normalizarSerial(f.serial);
    if (s) vecesEnArchivo.set(s, (vecesEnArchivo.get(s) ?? 0) + 1);
  }

  const filas: FilaValidada[] = [];
  let validas = 0;
  let invalidas = 0;
  let vacias = 0;

  crudas.forEach((cruda, i) => {
    /* +2: la fila 1 del Excel son los encabezados y el humano cuenta desde 1.
     * El número tiene que coincidir con el que se ve en la hoja o la lista de
     * errores no sirve para corregirla. */
    const fila = i + 2;

    if (esFilaVacia(cruda)) {
      vacias += 1;
      filas.push({ fila, estado: "vacia" });
      return;
    }

    const motivos: Motivo[] = [];
    const anotar = (codigo: CodigoMotivo, columna?: string) =>
      motivos.push({ codigo, mensaje: MOTIVOS[codigo], columna });

    const nombre = normalizarTexto(cruda.nombre);
    if (!nombre) anotar("FALTA_NOMBRE", "Nombre");
    else if (nombre.length > MAX_NOMBRE) anotar("NOMBRE_MUY_LARGO", "Nombre");

    const serial = normalizarSerial(cruda.serial);
    if (serial) {
      if (serial.length > MAX_SERIAL) anotar("SERIAL_MUY_LARGO", "Serial");
      if ((vecesEnArchivo.get(serial) ?? 0) > 1) {
        anotar("SERIAL_DUPLICADO_EN_ARCHIVO", "Serial");
      }
      if (serialesExistentes.has(serial)) anotar("SERIAL_YA_EXISTE", "Serial");
    }

    const descripcion = normalizarTexto(cruda.descripcion);
    if (descripcion && descripcion.length > MAX_DESCRIPCION) {
      anotar("DESCRIPCION_MUY_LARGA", "Descripcion");
    }

    const fotoUrl = normalizarTexto(cruda.fotoUrl);
    /* La MISMA función que usan `crear` y `editar`: el campo tenía dos reglas
     * distintas según por dónde entrara, y la del formulario era ninguna. */
    if (fotoUrl && !esUrlDeFoto(fotoUrl)) {
      anotar("FOTO_URL_INVALIDA", "Foto (URL)");
    }

    if (motivos.length > 0) {
      invalidas += 1;
      filas.push({ fila, estado: "invalida", motivos, datos: cruda });
      return;
    }

    validas += 1;
    filas.push({
      fila,
      estado: "valida",
      item: {
        nombre: nombre!,
        ...(serial ? { serial } : {}),
        ...(descripcion ? { descripcion } : {}),
        ...(fotoUrl ? { fotoUrl } : {}),
      },
    });
  });

  return {
    filas,
    total: crudas.length,
    validas,
    invalidas,
    vacias,
  };
}

// ─────────────────────────────────────────────────────────────
// Diferencias, para el historial
// ─────────────────────────────────────────────────────────────

export type Cambio = {
  campo: string;
  antes?: string;
  despues?: string;
};

/** Cómo se llama cada campo en la línea de tiempo. */
const ETIQUETA_CAMPO: Record<string, string> = {
  nombre: "Nombre",
  serial: "Serial",
  descripcion: "Descripción",
  fotoUrl: "Foto",
  estado: "Estado",
};

/**
 * Qué cambió entre dos versiones de un elemento.
 *
 * Solo los campos que de verdad cambiaron: registrar los cinco en cada
 * edición llena el historial de ruido y esconde el único dato por el que
 * alguien lo abre —"a este radio le cambiaron el serial el martes"—.
 *
 * La foto se resume en vez de guardar la URL entera: en la línea de tiempo
 * una URL firmada de S3 de doscientos caracteres no comunica nada, y el
 * cambio relevante es que había foto y ahora hay otra.
 */
export function calcularCambios(
  antes: Record<string, unknown>,
  despues: Record<string, unknown>,
): Cambio[] {
  const cambios: Cambio[] = [];
  for (const campo of Object.keys(ETIQUETA_CAMPO)) {
    if (!(campo in despues)) continue;
    const a = antes[campo];
    const d = despues[campo];
    const av = a == null || a === "" ? undefined : String(a);
    const dv = d == null || d === "" ? undefined : String(d);
    if (av === dv) continue;
    cambios.push({
      campo: ETIQUETA_CAMPO[campo]!,
      ...(campo === "fotoUrl"
        ? {
            ...(av ? { antes: "(foto anterior)" } : {}),
            ...(dv ? { despues: "(foto nueva)" } : {}),
          }
        : {
            ...(av ? { antes: av } : {}),
            ...(dv ? { despues: dv } : {}),
          }),
    });
  }
  return cambios;
}

/** La frase de la línea de tiempo para una edición. */
export function resumirCambios(cambios: readonly Cambio[]): string {
  if (cambios.length === 0) return "Se guardó el elemento sin cambios.";
  const campos = cambios.map((c) => c.campo.toLowerCase());
  if (campos.length === 1) return `Se actualizó ${campos[0]}.`;
  const ultimo = campos[campos.length - 1];
  return `Se actualizaron ${campos.slice(0, -1).join(", ")} y ${ultimo}.`;
}
