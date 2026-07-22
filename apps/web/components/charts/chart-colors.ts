/**
 * Paleta de gráficas
 * — brand = positivo / recaudo
 * — debt / pending = acento lima #B1D459 (cartera secundaria)
 * — danger = solo riesgo crítico (rojo semántico)
 */
export const CHART = {
  brand: "hsl(var(--brand))",
  brandSoft: "hsl(var(--brand) / 0.45)",
  primary: "hsl(var(--primary))",
  accent: "#B1D459",
  accentSoft: "#c9e07a",
  accentMuted: "#d4e8a0",
  debt: "#B1D459",
  debtSoft: "#c9e07a",
  pending: "#c9e07a",
  success: "hsl(var(--brand))",
  muted: "hsl(var(--muted-foreground) / 0.35)",
  mutedStrong: "#c9e07a",
  danger: "hsl(0 68% 52%)",
  // aliases legacy
  emerald: "hsl(var(--brand))",
  amber: "#B1D459",
  red: "hsl(0 68% 52%)",
  sky: "hsl(var(--brand))",
  violet: "hsl(var(--muted-foreground) / 0.5)",
  slate: "hsl(var(--muted-foreground) / 0.4)",
} as const;

export type ChartColor = keyof typeof CHART;
