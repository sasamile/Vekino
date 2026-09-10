/**
 * Reglas de contraseña, compartidas por el backend y la app.
 *
 * El backend es el que manda: la app usa esto solo para dar pistas en vivo
 * mientras la persona escribe. Cualquier validación que viva únicamente en el
 * cliente se puede saltar.
 *
 * Criterio (alineado con NIST 800-63B): pesa mucho más el largo que obligar a
 * poner símbolos raros. Lo que sí se bloquea es lo que de verdad se rompe
 * rápido — claves comunes, secuencias, repeticiones y datos de la persona.
 *
 * ── Las que son solo números ─────────────────────────────────────────────
 * Se aceptan, y es una decisión de negocio tomada a conciencia. La cédula es
 * lo único que un guarda recuerda seguro, y en una empresa de vigilancia con
 * rotación semanal la alternativa real no es una clave mejor: es una clave
 * apuntada en un papel pegado al monitor de la portería.
 *
 * Lo que NO se relaja es nada más. Una clave numérica sigue teniendo que
 * pasar por lo demás, y ahí se caen justamente las malas: 12345678 es una
 * secuencia, 00000000 es repetición, 11111111 y 1234567890 están en la lista
 * de comunes. Lo que pasa es un número de diez dígitos sin forma reconocible.
 *
 * Y pasa marcada: `puntaje` no la sube, así que la barra sigue diciendo
 * "débil". Se puede usar, pero nadie va a creer que es buena.
 */

export const LARGO_MINIMO = 8;
/** A partir de aquí el largo compensa la falta de variedad. */
const LARGO_COMODO = 12;

/** Lo que más aparece en las filtraciones y en teclados de Colombia. */
const COMUNES = [
  "12345678", "123456789", "1234567890", "password", "contrasena",
  "contraseña", "qwerty", "qwertyui", "iloveyou", "admin123", "abc12345",
  "11111111", "00000000", "colombia", "bogota123", "temporal", "cambiame",
  "vekino123", "usuario1", "password1", "password123", "letmein",
];

export type FuerzaPassword = {
  /** Si se puede guardar. */
  ok: boolean;
  /** 0 a 4, para pintar la barra. */
  puntaje: number;
  etiqueta: "muy débil" | "débil" | "aceptable" | "fuerte" | "excelente";
  /** Qué le falta, en lenguaje llano. Vacío si `ok`. */
  problemas: string[];
};

/** Tres o más caracteres iguales seguidos: "aaa", "111". */
function tieneRepeticiones(s: string): boolean {
  return /(.)\1{2,}/.test(s);
}

/** Todo el texto es un mismo carácter repetido: "22222222". */
function esTodoElMismo(s: string): boolean {
  return s.length > 0 && /^(.)\1*$/.test(s);
}

/** Todo el texto es UNA sola cuesta: "23456789", "98765432". */
function esSecuenciaEntera(s: string): boolean {
  if (s.length < 2) return false;
  const paso = s.charCodeAt(1) - s.charCodeAt(0);
  if (paso !== 1 && paso !== -1) return false;
  for (let i = 1; i < s.length; i++) {
    if (s.charCodeAt(i) - s.charCodeAt(i - 1) !== paso) return false;
  }
  return true;
}

/** Cuatro o más en secuencia: "1234", "abcd", "4321". */
function tieneSecuencia(s: string): boolean {
  const b = s.toLowerCase();
  for (let i = 0; i + 3 < b.length; i++) {
    const c = [0, 1, 2, 3].map((k) => b.charCodeAt(i + k));
    const sube = c.every((v, k) => k === 0 || v === c[k - 1]! + 1);
    const baja = c.every((v, k) => k === 0 || v === c[k - 1]! - 1);
    if (sube || baja) return true;
  }
  return false;
}

/** Trozos del correo y del nombre que no deberían estar en la clave. */
function pedazosPersonales(datos?: { email?: string; nombre?: string }): string[] {
  const crudo = [
    datos?.email?.split("@")[0] ?? "",
    ...(datos?.nombre ?? "").split(/\s+/),
  ];
  return crudo
    .map((p) => p.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter((p) => p.length >= 4);
}

export function evaluarPassword(
  password: string,
  datos?: { email?: string; nombre?: string },
): FuerzaPassword {
  const p = password ?? "";
  const bajo = p.toLowerCase();
  const problemas: string[] = [];

  /* La cédula, y cualquier otra clave de solo dígitos. Es la excepción a la
   * variedad y a las dos reglas de patrón; todo lo demás le aplica igual. */
  const soloDigitos = /^[0-9]+$/.test(p);

  if (p.length < LARGO_MINIMO) {
    problemas.push(`Debe tener al menos ${LARGO_MINIMO} caracteres.`);
  }
  if (COMUNES.some((c) => bajo === c || bajo.includes(c))) {
    problemas.push("Es una contraseña demasiado conocida, elige otra.");
  }
  /* Una clave de solo dígitos es, en la práctica, la cédula — y la cédula no
   * se elige: viene dada. Un tramo "3456" dentro de 1013456789, o el "000" de
   * los millones de cédulas que empiezan por 1000, no son patrones que alguien
   * escogió por comodidad, que es lo que estas dos reglas existen para
   * bloquear. Aplicarlas tal cual rechazaba cédulas reales sin ganar nada, y
   * dejaba a la administración sin saber por qué esta cédula sí y aquella no.
   *
   * Lo que sí se sigue rechazando es lo degenerado de verdad: el número que ES
   * una cuesta entera o un mismo dígito repetido. Eso ya no es una cédula, es
   * alguien pasando el dedo por el teclado. */
  if (soloDigitos) {
    if (esSecuenciaEntera(p)) {
      problemas.push("Evita secuencias como 1234 o abcd.");
    }
    if (esTodoElMismo(p)) {
      problemas.push("Evita repetir el mismo carácter tres veces seguidas.");
    }
  } else {
    if (tieneSecuencia(p)) {
      problemas.push("Evita secuencias como 1234 o abcd.");
    }
    if (tieneRepeticiones(p)) {
      problemas.push("Evita repetir el mismo carácter tres veces seguidas.");
    }
  }
  for (const trozo of pedazosPersonales(datos)) {
    if (bajo.includes(trozo)) {
      problemas.push("No uses tu nombre ni tu correo dentro de la contraseña.");
      break;
    }
  }

  // Variedad: minúsculas, mayúsculas, números y símbolos.
  const clases =
    (/[a-z]/.test(p) ? 1 : 0) +
    (/[A-Z]/.test(p) ? 1 : 0) +
    (/[0-9]/.test(p) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(p) ? 1 : 0);

  // Con 12+ caracteres basta con dos clases; por debajo pedimos tres.
  const clasesMinimas = p.length >= LARGO_COMODO ? 2 : 3;
  if (p.length >= LARGO_MINIMO && !soloDigitos && clases < clasesMinimas) {
    problemas.push(
      p.length >= LARGO_COMODO
        ? "Combina al menos letras y números."
        : "Combina mayúsculas, minúsculas y números (o alárgala a 12).",
    );
  }

  let puntaje = 0;
  if (p.length >= LARGO_MINIMO) puntaje++;
  if (p.length >= LARGO_COMODO) puntaje++;
  if (clases >= 3) puntaje++;
  if (p.length >= 16 || (clases === 4 && p.length >= LARGO_COMODO)) puntaje++;
  if (problemas.length > 0) puntaje = Math.min(puntaje, 1);
  /* Se admite, pero no se la presenta como buena: un número es un número por
   * largo que sea, y la barra tiene que decirlo. */
  if (soloDigitos) puntaje = Math.min(puntaje, 1);

  const etiquetas = ["muy débil", "débil", "aceptable", "fuerte", "excelente"] as const;

  return {
    ok: problemas.length === 0,
    puntaje,
    etiqueta: etiquetas[puntaje] ?? "muy débil",
    problemas,
  };
}
