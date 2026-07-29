import { SoftUI } from "@/lib/soft-ui";

/** Tema visual del condominio activo (accent + glows de fondo). */
export type CondoTheme = {
  accent: string;
  glowA: string;
  glowB: string;
  glowC: string;
  tabActiveBg: string;
  /** Fondo suave para tiles/iconos (accent diluido). */
  accentSoft: string;
};

/** Soft UI sky-blue — default de producto si el condo no tiene color. */
const DEFAULT: CondoTheme = {
  accent: SoftUI.blue,
  glowA: SoftUI.blueLight,
  glowB: "#B8E4FF",
  glowC: SoftUI.infoSoft,
  tabActiveBg: "rgba(36,157,242,0.12)",
  accentSoft: SoftUI.infoSoft,
};

function normalizeHex(raw?: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (/^#([0-9a-f]{6})$/i.test(t)) return t.toLowerCase();
  if (/^#([0-9a-f]{3})$/i.test(t)) {
    const h = t.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
  }
  return null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Mezcla el color con blanco (0 = original, 1 = blanco). */
function mixWhite(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const a = Math.max(0, Math.min(1, amount));
  return rgbToHex(
    r + (255 - r) * a,
    g + (255 - g) * a,
    b + (255 - b) * a,
  );
}

function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Construye el tema a partir del color de marca del condominio. */
export function themeFromPrimary(primaryColor: string): CondoTheme {
  const accent = normalizeHex(primaryColor) ?? SoftUI.blue;
  return {
    accent,
    glowA: mixWhite(accent, 0.35),
    glowB: mixWhite(accent, 0.55),
    glowC: mixWhite(accent, 0.72),
    tabActiveBg: rgba(accent, 0.14),
    accentSoft: mixWhite(accent, 0.88),
  };
}

/**
 * Resuelve el tema del condominio activo.
 * Prioridad: `primaryColor` de BD → fallback Soft UI default.
 * (Ya no se hardcodea por nombre: cada condo usa el color configurado.)
 */
export function resolveCondoTheme(
  _name?: string | null,
  primaryColor?: string | null,
): CondoTheme {
  const hex = normalizeHex(primaryColor);
  if (hex) return themeFromPrimary(hex);
  return DEFAULT;
}
