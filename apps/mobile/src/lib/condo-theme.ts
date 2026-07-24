import { SoftUI } from "@/lib/soft-ui";

/** Tema visual del condominio activo (glow + accent). */
export type CondoTheme = {
  accent: string;
  glowA: string; // izquierda
  glowB: string; // derecha
  glowC: string; // lavanda / terciario
  tabActiveBg: string;
};

/** Soft UI sky-blue — default de producto. */
const DEFAULT: CondoTheme = {
  accent: SoftUI.blue,
  glowA: SoftUI.blueLight,
  glowB: "#B8E4FF",
  glowC: SoftUI.infoSoft,
  tabActiveBg: "rgba(36,157,242,0.12)",
};

/** Ciudad del Campo → azul cielo Soft UI */
const BLUE: CondoTheme = {
  accent: SoftUI.blueSky,
  glowA: SoftUI.blueLight,
  glowB: "#A8D8FF",
  glowC: SoftUI.infoSoft,
  tabActiveBg: "rgba(67,178,250,0.14)",
};

/** Arboleda → dorado #dfc231 */
const ARBOLEDA: CondoTheme = {
  accent: "#dfc231",
  glowA: "#dfc231",
  glowB: "#E8D26A",
  glowC: "#F5E9A8",
  tabActiveBg: "rgba(223,194,49,0.18)",
};

/**
 * Resuelve tema por nombre (y opcionalmente primaryColor de BD).
 * - Ciudad del Campo* → azul
 * - Arboleda* → dorado #dfc231
 */
export function resolveCondoTheme(
  name: string | null | undefined,
  primaryColor?: string | null,
): CondoTheme {
  const n = (name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (n.includes("campo")) return BLUE;
  if (n.includes("arboleda")) return ARBOLEDA;

  if (primaryColor && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(primaryColor)) {
    return {
      ...DEFAULT,
      accent: primaryColor,
      tabActiveBg: `${primaryColor}1F`,
    };
  }

  return DEFAULT;
}
