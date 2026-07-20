/** Paleta de gráficas — `brand` sigue el color del condominio vía CSS var. */
export const CHART = {
  brand: "hsl(var(--brand))",
  primary: "hsl(var(--primary))",
  emerald: "hsl(160 84% 39%)",
  amber: "hsl(38 92% 50%)",
  red: "hsl(0 72% 51%)",
  sky: "hsl(199 89% 48%)",
  violet: "hsl(258 90% 66%)",
  slate: "hsl(215 16% 65%)",
} as const;

export type ChartColor = keyof typeof CHART;
