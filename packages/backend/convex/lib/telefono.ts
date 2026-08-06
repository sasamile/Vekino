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
/**
 * ¿Este E.164 puede recibir WhatsApp de verdad?
 *
 * La base trae rellenos de la migración ("1111111", "3111111111") y fijos.
 * Mandarles plantillas cuesta plata y ensucia la calidad del número WABA,
 * que Meta castiga bajando el límite de envío.
 */
export function esCelularWhatsApp(e164: string | null | undefined): boolean {
  if (!e164 || !e164.startsWith("+")) return false;
  const digitos = e164.slice(1);
  if (digitos.length < 10 || digitos.length > 15) return false;

  if (digitos.startsWith("57")) {
    // En Colombia WhatsApp solo vive en celulares (3XX); los fijos (60X) no.
    const nacional = digitos.slice(2);
    if (nacional.length !== 10 || !nacional.startsWith("3")) return false;
    return pareceTelefonoReal(nacional);
  }
  return pareceTelefonoReal(digitos);
}

/** Descarta rellenos: dígitos repetidos y escaleras (1234567890). */
function pareceTelefonoReal(n: string): boolean {
  if (new Set(n).size <= 2) return false;

  let ascendente = true;
  let descendente = true;
  for (let i = 1; i < n.length; i++) {
    const paso = n.charCodeAt(i) - n.charCodeAt(i - 1);
    if (paso !== 1) ascendente = false;
    if (paso !== -1) descendente = false;
  }
  return !ascendente && !descendente;
}

export function normalizarTelefonoE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const teniaMas = raw.trim().startsWith("+");
  const digitos = raw.replace(/\D/g, "");
  if (digitos.length < 8 || digitos.length > 15) return null;
  // Ningún E.164 empieza por 0 tras el "+": un "0414..." venezolano o un
  // trunk-0 europeo normalizado a "+0..." jamás matchearía a YCloud y todo
  // envío fallaría. Mejor null que un canónico inválido.
  if (digitos.startsWith("0")) return null;

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
