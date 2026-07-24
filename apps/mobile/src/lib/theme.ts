import { SoftUI, softShadow } from "@/lib/soft-ui";

/**
 * Tokens de producto — Soft UI sky-blue.
 * Alias `C` para pantallas legacy; preferir SoftUI en código nuevo.
 */
export const C = {
  bg: SoftUI.bg,
  bgSubtle: SoftUI.bgSecondary,
  card: SoftUI.card,
  cardAlt: SoftUI.field,

  text: SoftUI.text,
  textSoft: SoftUI.textSecondary,
  textMuted: SoftUI.textSecondary,

  border: SoftUI.divider,
  borderSoft: SoftUI.bgSecondary,
  shadow: "rgba(20, 30, 45, 1)",

  brand: SoftUI.blue,
  brandDark: SoftUI.gradientStart,
  brandSoft: SoftUI.infoSoft,
  brandSoftBorder: SoftUI.blueLight,
  navy: SoftUI.deep,

  success: SoftUI.success,
  successSoft: SoftUI.successSoft,
  warning: SoftUI.warning,
  warningSoft: SoftUI.warningSoft,
  danger: SoftUI.danger,
  dangerSoft: SoftUI.dangerSoft,
  info: SoftUI.blue,
  infoSoft: SoftUI.infoSoft,
} as const;

/** Soft UI: sombra discreta en tarjetas. */
export const cardShadow = softShadow;

export const cardShadowSoft = softShadow;

export const cardShadowLg = {
  shadowColor: "rgba(20, 30, 45, 1)",
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.1,
  shadowRadius: 28,
  elevation: 6,
} as const;
