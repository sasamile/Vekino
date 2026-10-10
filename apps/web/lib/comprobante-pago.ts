import {
  MAX_COMPROBANTE_BYTES,
  TIPOS_COMPROBANTE,
  type TipoComprobante,
} from "@vekino/backend/comprobantes";

/**
 * Reglas de FORMULARIO del comprobante de pago que el residente envía desde
 * la web (Hallazgo 1, docs/audits/FALTANTES-WEB-FACTURACION.md).
 *
 * Son solo una ayuda: avisan antes de mandar 10 MB que el backend rechazaría.
 * Decide `soportesPago.enviarMio`: las reglas de negocio (factura vigente, uno
 * pendiente por factura, vínculo con la unidad, monto y fecha) y el archivo,
 * cuyo tipo mira por su contenido. La pantalla muestra su mensaje tal cual.
 *
 * El límite (10 MB) y los tipos (JPG, PNG, WebP, PDF) son los del backend
 * (`@vekino/backend/comprobantes`): no se escriben dos veces.
 */

/** Algunos navegadores entregan el archivo sin tipo: se deduce de la extensión. */
const POR_EXTENSION: Record<string, TipoComprobante> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

export const ACCEPT_COMPROBANTE =
  "image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf";

export const MENSAJE_ARCHIVO_VACIO =
  "El archivo está vacío. Elige otra foto o el PDF del comprobante.";
export const MENSAJE_FORMATO_NO_PERMITIDO =
  "Formato no permitido. Envía una foto JPG, PNG o WebP, o un PDF.";
export const MENSAJE_FORMATO_HEIC =
  "Las fotos HEIC no se pueden revisar en la web. Usa «Tomar foto» o envía una captura de pantalla (JPG o PNG).";

export function mensajeArchivoGrande(bytes: number): string {
  /* Hacia arriba: un archivo de 10 MB y un byte no puede decir "10,0 MB". */
  const mb = (Math.ceil((bytes / (1024 * 1024)) * 10) / 10).toFixed(1).replace(".", ",");
  return `El archivo pesa ${mb} MB y el máximo es 10 MB. Envía una foto más liviana o una captura de pantalla.`;
}

/**
 * Por qué el archivo elegido no se puede enviar, o `null`. Mira el tipo que
 * declara el navegador (o la extensión): el contenido lo revisa el backend.
 */
export function problemaDeArchivo(archivo: {
  name: string;
  type: string;
  size: number;
}): string | null {
  if (!(archivo.size > 0)) return MENSAJE_ARCHIVO_VACIO;
  const extension = archivo.name.includes(".")
    ? archivo.name.split(".").pop()!.toLowerCase()
    : "";
  const declarado = archivo.type.trim().toLowerCase();
  const tipo =
    declarado && declarado !== "application/octet-stream"
      ? declarado
      : (POR_EXTENSION[extension] ?? "");
  if (!TIPOS_COMPROBANTE.includes(tipo as TipoComprobante)) {
    const heic = /hei[cf]/.test(tipo) || extension === "heic" || extension === "heif";
    return heic ? MENSAJE_FORMATO_HEIC : MENSAJE_FORMATO_NO_PERMITIDO;
  }
  if (archivo.size > MAX_COMPROBANTE_BYTES) return mensajeArchivoGrande(archivo.size);
  return null;
}

/**
 * El monto escrito, en pesos.
 *
 * Formato colombiano: puntos de miles ("380.000") y coma decimal. Acepta
 * también "380000", "$ 380.000" y "380,000". Los centavos en cero se ignoran
 * ("380.000,00"); con centavos de verdad, o separadores que no forman grupos
 * de tres, pide corregir en vez de adivinar.
 *
 * El móvil quita todo lo que no es dígito: "380.000,00" le da 38.000.000.
 */
export function leerMontoCOP(
  texto: string,
): { ok: true; monto: number } | { ok: false; error: string } {
  const limpio = texto.replace(/[\s $]/g, "").replace(/^COP/i, "");
  if (!limpio) return { ok: false, error: "Escribe cuánto pagaste." };

  let entero = limpio;
  const decimales = limpio.match(/^(.*),(\d{1,2})$/);
  if (decimales) {
    if (Number(decimales[2]) !== 0) {
      return { ok: false, error: "Escribe el monto en pesos, sin centavos." };
    }
    entero = decimales[1]!;
  }
  if (!/^\d+$/.test(entero) && !/^\d{1,3}(\.\d{3})+$/.test(entero) && !/^\d{1,3}(,\d{3})+$/.test(entero)) {
    return {
      ok: false,
      error: "Revisa el monto: escribe solo números, con puntos de miles si quieres (por ejemplo 380.000).",
    };
  }
  const monto = Number(entero.replace(/[.,]/g, ""));
  if (!Number.isSafeInteger(monto) || monto <= 0) {
    return { ok: false, error: "El monto pagado debe ser mayor que cero." };
  }
  return { ok: true, monto };
}

/** "380.000": como se escribe un monto en Colombia, para sugerirlo en el campo. */
export function montoConPuntos(monto: number): string {
  return Math.round(monto)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Colombia está en UTC−5 todo el año (no tiene horario de verano). */
const UTC_MENOS_5 = 5 * 60 * 60 * 1000;

/**
 * El día de hoy en Colombia ("AAAA-MM-DD"), sin importar la zona horaria del
 * navegador. A las 23:00 de Bogotá ya es el día siguiente en UTC: con la
 * fecha UTC, el selector ofrecería "mañana".
 */
export function hoyEnBogota(ahora = Date.now()): string {
  return new Date(ahora - UTC_MENOS_5).toISOString().slice(0, 10);
}

/**
 * El instante que recibe `crearMio` para el día elegido: el mediodía de ese
 * día en Colombia, como lo manda el móvil. Así el día no cambia en ninguna
 * zona horaria.
 */
export function fechaPagoDesde(fecha: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  const instante = Date.parse(`${fecha}T12:00:00-05:00`);
  if (!Number.isFinite(instante)) return null;
  /* "2026-02-31" no existe: `Date.parse` lo corre al 3 de marzo. */
  if (hoyEnBogota(instante) !== fecha) return null;
  return instante;
}

/** El día elegido convertido para `crearMio`, o por qué no sirve. */
export function leerFechaPago(
  fecha: string,
  ahora = Date.now(),
): { ok: true; fechaPago: number } | { ok: false; error: string } {
  if (!fecha.trim()) return { ok: false, error: "Elige el día en que pagaste." };
  const fechaPago = fechaPagoDesde(fecha.trim());
  if (fechaPago === null) return { ok: false, error: "Esa fecha no existe. Elige el día en que pagaste." };
  if (fecha.trim() > hoyEnBogota(ahora)) {
    return { ok: false, error: "La fecha del pago no puede ser posterior a hoy." };
  }
  return { ok: true, fechaPago };
}
