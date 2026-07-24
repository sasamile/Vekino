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
  /** Accent de marca Vekino (naranja). Azul = tema de condominio. */
  purple: SoftUI.brand,
  pink: SoftUI.brandSoft,
  lavender: SoftUI.brandLight,
  sky: SoftUI.brandSoft,
  dotInactive: SoftUI.divider,
  dotActive: SoftUI.brand,
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
