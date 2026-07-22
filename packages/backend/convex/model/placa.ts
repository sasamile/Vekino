/**
 * Inferencia de tipo por formato de placa (Colombia).
 * - Carro: termina en 3 dígitos (ej. BCS670, ABC-123)
 * - Moto: termina en letra (ej. ABC12D, 12B)
 */
export function normalizePlaca(placa: string): string {
  return placa.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function inferTipoFromPlaca(
  placa: string,
): "carro" | "moto" | null {
  const clean = normalizePlaca(placa);
  if (clean.length < 2) return null;

  const last = clean[clean.length - 1]!;
  if (/[A-Z]/.test(last)) return "moto";
  if (/\d{3}$/.test(clean)) return "carro";
  if (/\d$/.test(last)) return "carro";
  return null;
}

/** Resuelve tipo: placa manda salvo bicicleta/otro explícitos. */
export function resolveTipoVehiculo(
  placa: string,
  tipoExplicit?: string | null,
): "carro" | "moto" | "bicicleta" | "otro" {
  if (tipoExplicit === "bicicleta" || tipoExplicit === "otro") {
    return tipoExplicit;
  }
  return inferTipoFromPlaca(placa) ?? (tipoExplicit as "carro" | "moto" | undefined) ?? "carro";
}
