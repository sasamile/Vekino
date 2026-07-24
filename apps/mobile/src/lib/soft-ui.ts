/**
 * Soft UI — design system Vekino Mobile
 * Estética iOS contemporánea: azul cielo, tarjetas redondeadas, sombras suaves.
 */

export const SoftUI = {
  // Primarios
  blue: "#249DF2",
  blueSky: "#43B2FA",
  blueLight: "#8FD6FF",
  gradientStart: "#2397F2",
  gradientEnd: "#4AB7FA",
  petrol: "#07576A",
  deep: "#083F52",

  // Neutrales
  bg: "#F5F6F8",
  card: "#FFFFFF",
  bgSecondary: "#F0F1F4",
  field: "#F7F8FA",
  divider: "#E7E8EC",
  text: "#111216",
  textSecondary: "#6D7178",
  textDisabled: "#A7ABB2",
  white: "#FFFFFF",

  // Estados
  danger: "#FF4D4F",
  dangerSoft: "#FFF1F0",
  success: "#25B981",
  successSoft: "#ECFDF5",
  warning: "#F5B942",
  warningSoft: "#FFFBEB",
  infoSoft: "#E8F6FF",

  // Layout
  padH: 20,
  space: {
    xs: 4,
    sm: 8,
    md: 12,
    base: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
    section: 40,
  },

  // Radios
  radius: {
    card: 26,
    cardSm: 22,
    field: 20,
    button: 22,
    chip: 999,
    tabBar: 30,
    icon: 16,
  },

  // Tipografía (Poppins ≈ Manrope / Sofia)
  type: {
    hero: { size: 26, line: 32, weight: "700" as const },
    section: { size: 21, line: 27, weight: "600" as const },
    cardTitle: { size: 18, line: 24, weight: "600" as const },
    body: { size: 15, line: 22, weight: "400" as const },
    caption: { size: 13, line: 18, weight: "400" as const },
    chip: { size: 12, line: 16, weight: "600" as const },
  },

  // Controles
  buttonH: 52,
  fieldH: 54,
  avatar: 46,
  iconBtn: 48,
  touch: 44,
} as const;

/** Sombra suave de tarjetas (Soft UI). */
export const softShadow = {
  shadowColor: "rgba(20, 30, 45, 1)",
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.08,
  shadowRadius: 24,
  elevation: 4,
} as const;

/** Sombra de elementos flotantes (tab bar, FABs). */
export const floatShadow = {
  shadowColor: "rgba(20, 30, 45, 1)",
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.12,
  shadowRadius: 18,
  elevation: 8,
} as const;

export const softCardStyle = {
  backgroundColor: SoftUI.card,
  borderRadius: SoftUI.radius.card,
  borderWidth: 0,
  ...softShadow,
} as const;
