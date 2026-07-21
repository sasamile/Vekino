/** Tokens UI auth — spec pastel minimal (referencia 390×844). */
export const AuthUI = {
  bg: "#FCFBFD",
  text: "#0E0E0F",
  textBody: "#111113",
  textSecondary: "#67666B",
  textMuted: "#747277",
  placeholder: "#77767A",
  border: "#D8D6DC",
  purple: "#7819F1",
  pink: "#F8E7EF",
  lavender: "#ECE8FF",
  sky: "#EDF4FF",
  dotInactive: "#C9C7CC",
  dotActive: "#111111",
  white: "#FFFFFF",

  padH: 31,
  radiusField: 12,
  radiusBtn: 11,
  fieldH: 54,
  btnH: 57,

  font: {
    regular: "Poppins_400Regular",
    medium: "Poppins_500Medium",
    semibold: "Poppins_600SemiBold",
    bold: "Poppins_700Bold",
    extrabold: "Poppins_800ExtraBold",
  },
} as const;

export const ONBOARDING_KEY = "vekino_onboarding_done";

/**
 * TEMP: solo splash/onboarding (sin login).
 * Cuando termines de pulirlo, pon esto en `false`.
 */
export const SPLASH_ONLY = false;
