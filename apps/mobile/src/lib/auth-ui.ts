import { SoftUI } from "@/lib/soft-ui";

/** Tokens UI globales — Soft UI sky-blue (referencia 390×844). */
export const AuthUI = {
  bg: SoftUI.bg,
  text: SoftUI.text,
  textBody: SoftUI.text,
  textSecondary: SoftUI.textSecondary,
  textMuted: SoftUI.textSecondary,
  placeholder: SoftUI.textDisabled,
  border: SoftUI.divider,
  /** Accent primario (antes purple). */
  purple: SoftUI.blue,
  pink: SoftUI.infoSoft,
  lavender: SoftUI.blueLight,
  sky: SoftUI.infoSoft,
  dotInactive: SoftUI.divider,
  dotActive: SoftUI.blue,
  white: SoftUI.white,

  padH: SoftUI.padH,
  radiusField: SoftUI.radius.field,
  radiusBtn: SoftUI.radius.button,
  fieldH: SoftUI.fieldH,
  btnH: SoftUI.buttonH,

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
