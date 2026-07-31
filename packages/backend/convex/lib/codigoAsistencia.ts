/**
 * Código rotativo de asistencia para asambleas virtuales.
 *
 * El problema: en una asamblea virtual cualquiera puede tocar "registrar
 * asistencia" desde su casa sin haberse conectado a la reunión, y el quórum
 * queda inflado. La solución es que la asistencia exija un código que solo se
 * ve en la pantalla compartida.
 *
 * Por qué ROTA: un código fijo se reenvía por WhatsApp a alguien que no está
 * en la reunión y volvemos al mismo problema. Rotando cada 60 s, para cuando
 * el otro lo escribe ya venció. Es la misma idea de los códigos de doble
 * factor.
 *
 * Cómo funciona: la asamblea guarda una SEMILLA secreta que nunca sale del
 * servidor salvo hacia el administrador (que es quien la proyecta). El código
 * de cada minuto se deriva de `semilla + ventana`. Así:
 *   - No hay que escribir en la base de datos cada minuto.
 *   - El panel del admin puede calcular el código siguiente sin pedirlo,
 *     porque tiene la semilla.
 *   - El servidor valida recalculando, sin guardar nada.
 *
 * Este archivo es CÓDIGO COMPARTIDO: lo importan tanto las funciones de
 * Convex como el panel web. El algoritmo tiene que ser idéntico en los dos
 * lados o los códigos no coincidirían.
 */

/** Duración de cada ventana, en milisegundos. */
export const VENTANA_MS = 60_000;

/** Longitud del código que ve el usuario. */
export const LARGO_CODIGO = 6;

/* Sin I, O, 0 ni 1: se confunden al leerlos de una pantalla compartida, que
 * es exactamente como se va a usar esto. */
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Hash determinista (FNV-1a de 32 bits).
 *
 * No es criptográfico y no hace falta que lo sea: la semilla nunca se expone
 * a los residentes, así que no tienen desde dónde derivar códigos futuros.
 * Lo que sí necesitamos es que sea idéntico en servidor y cliente, y esto lo
 * garantiza sin depender de `crypto.subtle` (que no está disponible en las
 * mutaciones de Convex).
 */
function hash32(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    // Multiplicación por el primo FNV, en 32 bits sin desbordar.
    h = Math.imul(h, 0x01000193) >>> 0;
  }

  /* Mezcla final (fmix32 de MurmurHash3). NO es opcional.
   *
   * Los bits BAJOS de FNV dependen únicamente de los bits bajos de la
   * entrada: la última operación es una multiplicación, y en el producto el
   * bit n solo se ve afectado por los bits ≤ n de los factores. Como el
   * carácter del código se elegía con `h % 32` —o sea, los 5 bits más
   * bajos—, semillas distintas producían el mismo código con muchísima
   * frecuencia. Medido: 8 semillas daban solo 6 códigos distintos.
   *
   * fmix32 difunde los bits altos hacia los bajos y deja el hash utilizable
   * en cualquier posición. */
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** Índice de la ventana de 60 s a la que pertenece un instante. */
export function ventanaDe(momentoMs: number): number {
  return Math.floor(momentoMs / VENTANA_MS);
}

/** Milisegundos que le quedan a la ventana actual. */
export function msRestantes(momentoMs: number): number {
  return VENTANA_MS - (momentoMs % VENTANA_MS);
}

/** Código correspondiente a una ventana concreta. */
export function codigoDeVentana(semilla: string, ventana: number): string {
  let out = "";
  // Cada carácter sale de un hash distinto para que dos ventanas seguidas no
  // produzcan códigos parecidos.
  for (let i = 0; i < LARGO_CODIGO; i++) {
    const h = hash32(`${semilla}|${ventana}|${i}`);
    out += ALFABETO[h % ALFABETO.length];
  }
  return out;
}

/** Código vigente en este momento. */
export function codigoActual(semilla: string, momentoMs: number): string {
  return codigoDeVentana(semilla, ventanaDe(momentoMs));
}

/**
 * ¿El código que escribió el residente es válido ahora?
 *
 * Acepta también la ventana ANTERIOR: alguien que empieza a escribir a los
 * 58 segundos no debería fallar por dos segundos. El margen real es de entre
 * 60 y 120 s, que sigue siendo demasiado corto para reenviarlo y que sirva.
 */
export function codigoEsValido(
  semilla: string,
  codigo: string,
  momentoMs: number,
): boolean {
  const limpio = codigo.trim().toUpperCase();
  if (limpio.length !== LARGO_CODIGO) return false;
  const v = ventanaDe(momentoMs);
  return limpio === codigoDeVentana(semilla, v) ||
    limpio === codigoDeVentana(semilla, v - 1);
}

/**
 * Semilla nueva. Se llama una sola vez por asamblea, desde una mutación
 * (donde `Math.random` de Convex ya es seguro para este uso).
 */
export function nuevaSemilla(): string {
  let s = "";
  for (let i = 0; i < 32; i++) {
    s += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  }
  return s;
}
