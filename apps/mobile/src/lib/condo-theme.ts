import { AuthUI } from "@/lib/auth-ui";

/** Tema visual del condominio activo (glow + accent). */
export type CondoTheme = {
  accent: string;
  glowA: string; // izquierda
  glowB: string; // derecha
  glowC: string; // lavanda / terciario
  tabActiveBg: string;
};

const DEFAULT: CondoTheme = {
  accent: AuthUI.purple,
  glowA: "#F4C4E0",
  glowB: "#A8D4F5",
  glowC: "#DDD4FA",
  tabActiveBg: "rgba(14,14,15,0.06)",
};

/** Ciudad del Campo → azul */
const BLUE: CondoTheme = {
  accent: "#2563EB",
  glowA: "#BFDBFE",
  glowB: "#93C5FD",
  glowC: "#DBEAFE",
  tabActiveBg: "rgba(37,99,235,0.12)",
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
  const n = (name ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

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
