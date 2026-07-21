/** Traduce mensajes típicos de Better Auth / validación a español. */
export function authErrorEs(raw: string | null | undefined, fallback: string): string {
  if (!raw?.trim()) return fallback;
  const msg = raw.trim();
  const lower = msg.toLowerCase();

  if (lower.includes("invalid email") || lower.includes("email is invalid")) {
    return "El correo no es válido. Revisa el formato.";
  }
  if (
    lower.includes("invalid password") ||
    lower.includes("incorrect password") ||
    lower.includes("wrong password")
  ) {
    return "Contraseña incorrecta.";
  }
  if (
    lower.includes("invalid credentials") ||
    lower.includes("invalid email or password") ||
    lower.includes("user not found") ||
    lower.includes("invalid email or password")
  ) {
    return "Correo o contraseña incorrectos.";
  }
  if (lower.includes("user already exists") || lower.includes("already registered")) {
    return "Ese correo ya está registrado.";
  }
  if (lower.includes("too many") || lower.includes("rate limit")) {
    return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
  }
  if (lower.includes("network") || lower.includes("fetch failed")) {
    return "Sin conexión. Revisa tu internet e inténtalo de nuevo.";
  }
  if (lower.includes("unauthorized") || lower.includes("not authenticated")) {
    return "Sesión no válida. Vuelve a iniciar sesión.";
  }
  if (lower.includes("token") && (lower.includes("invalid") || lower.includes("expired"))) {
    return "El enlace expiró o no es válido. Solicita uno nuevo.";
  }

  // Si ya viene en español (tiene tildes o palabras comunes), déjalo
  if (/[áéíóúñ¿¡]/i.test(msg) || /\b(correo|contraseña|error|intenta)\b/i.test(msg)) {
    return msg;
  }

  return fallback;
}
