/**
 * Paleta de gráficas — neutra + semántica.
 * El naranja de marca (--brand) solo para CTAs de producto, no para rellenar charts.
 */
export const CHART = {
  brand: "hsl(var(--brand))",
  brandSoft: "hsl(var(--brand) / 0.45)",
  primary: "hsl(var(--foreground) / 0.75)",
  accent: "#0d9488",
  accentSoft: "#5eead4",
  accentMuted: "#99f6e4",
  debt: "#0d9488",
  debtSoft: "#5eead4",
  pending: "#d97706",
  success: "#059669",
  muted: "hsl(var(--muted-foreground) / 0.28)",
  mutedStrong: "hsl(var(--muted-foreground) / 0.55)",
  danger: "hsl(0 68% 52%)",
  // aliases
  emerald: "#059669",
  amber: "#d97706",
  red: "hsl(0 68% 52%)",
  sky: "#0284c7",
  violet: "hsl(var(--muted-foreground) / 0.5)",
  slate: "hsl(var(--muted-foreground) / 0.4)",
} as const;

export type ChartColor = keyof typeof CHART;
