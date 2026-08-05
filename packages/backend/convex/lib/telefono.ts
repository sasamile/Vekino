/**
 * Normalización de teléfonos a E.164.
 *
 * La tabla `users` guarda `telefono` como texto libre (datos migrados:
 * "3001234567", "300 123 4567", "+57 300..."). WhatsApp/YCloud entrega el
 * remitente en E.164 sin el "+" ("573001234567"). Para poder cruzar ambos
 * mundos, `users.telefonoE164` guarda SIEMPRE el formato canónico "+573001234567"
 * y es lo único que se indexa y se compara.
 *
 * Reglas (pensadas para Colombia, sin romper números internacionales):
 * - 10 dígitos empezando por 3 (celular) o 60 (fijo nuevo) → +57XXXXXXXXXX
 * - 12 dígitos empezando por 57 → +57...
 * - Si el original traía "+", se respeta el país que traiga (8–15 dígitos).
 * - Cualquier otra cosa → null (no adivinamos).
 */
export function normalizarTelefonoE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const teniaMas = raw.trim().startsWith("+");
  const digitos = raw.replace(/\D/g, "");
  if (digitos.length < 8 || digitos.length > 15) return null;

  if (teniaMas) return `+${digitos}`;

  if (digitos.length === 10 && (digitos.startsWith("3") || digitos.startsWith("60"))) {
    return `+57${digitos}`;
  }
  if (digitos.length === 12 && digitos.startsWith("57")) {
    return `+${digitos}`;
  }
  // 8-15 dígitos sin "+" ni pinta de Colombia: asumimos que ya trae país
  // (es el formato en que YCloud entrega `from`).
  if (digitos.length >= 11) return `+${digitos}`;

  return null;
}
