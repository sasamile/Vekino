/**
 * Tokens estilo shadcn — zinc + un accent de marca.
 * Separación por borde, sin sombras.
 */
export const C = {
  bg: "#ffffff",
  bgSubtle: "#f4f4f5", // zinc-100
  card: "#ffffff",
  cardAlt: "#fafafa", // zinc-50

  text: "#09090b", // zinc-950
  textSoft: "#3f3f46", // zinc-700
  textMuted: "#71717a", // zinc-500

  border: "#e4e4e7", // zinc-200
  borderSoft: "#f4f4f5", // zinc-100
  shadow: "#09090b",

  brand: "#f26a3a",
  brandDark: "#e05520",
  brandSoft: "#fff7ed",
  brandSoftBorder: "#ffedd5",
  navy: "#042046",

  success: "#16a34a",
  successSoft: "#f0fdf4",
  warning: "#ca8a04",
  warningSoft: "#fefce8",
  danger: "#dc2626",
  dangerSoft: "#fef2f2",
  info: "#2563eb",
  infoSoft: "#eff6ff",
} as const;

/** shadcn: sin sombra en superficies estáticas */
export const cardShadow = {
  shadowColor: "transparent",
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0,
  shadowRadius: 0,
  elevation: 0,
} as const;

export const cardShadowSoft = cardShadow;

export const cardShadowLg = cardShadow;
