/**
 * Placas: una sola forma de escribirlas.
 *
 * La misma placa entra al sistema de cinco maneras —"abc123", "ABC-123",
 * "abc 123"— segun quien teclee y desde donde. Si no se normalizan, el mismo
 * carro se registra dos veces y el segundo registro no hereda ni la casa ni
 * el aporte voluntario del primero.
 */

/** "abc-123" → "ABC123". Solo letras y digitos, en mayuscula. */
export function normalizarPlaca(placa: string | null | undefined): string {
  return (placa ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** ¿Puede ser una placa? Corto para no rechazar formatos raros de moto. */
export function placaValida(placa: string | null | undefined): boolean {
  const p = normalizarPlaca(placa);
  return p.length >= 5 && p.length <= 8 && /[A-Z]/.test(p) && /[0-9]/.test(p);
}
