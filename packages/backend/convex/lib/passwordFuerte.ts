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

  if (p.length < LARGO_MINIMO) {
    problemas.push(`Debe tener al menos ${LARGO_MINIMO} caracteres.`);
  }
  if (COMUNES.some((c) => bajo === c || bajo.includes(c))) {
    problemas.push("Es una contraseña demasiado conocida, elige otra.");
  }
  if (tieneSecuencia(p)) {
    problemas.push("Evita secuencias como 1234 o abcd.");
  }
  if (tieneRepeticiones(p)) {
    problemas.push("Evita repetir el mismo carácter tres veces seguidas.");
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
  if (p.length >= LARGO_MINIMO && clases < clasesMinimas) {
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

  const etiquetas = ["muy débil", "débil", "aceptable", "fuerte", "excelente"] as const;

  return {
    ok: problemas.length === 0,
    puntaje,
    etiqueta: etiquetas[puntaje] ?? "muy débil",
    problemas,
  };
}
