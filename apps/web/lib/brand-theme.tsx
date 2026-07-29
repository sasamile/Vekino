"use client";

import {
  createContext,
  useContext,
  type CSSProperties,
  type ReactNode,
} from "react";

/**
 * Tokens de marca del condominio actual.
 * Los portales (Modal, etc.) viven en `document.body` y no heredan el
 * `style` del shell; este contexto los reinyecta.
 */
const BrandThemeContext = createContext<CSSProperties | undefined>(undefined);

export function BrandThemeProvider({
  style,
  children,
}: {
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <BrandThemeContext.Provider value={style}>
      {children}
    </BrandThemeContext.Provider>
  );
}

export function useBrandThemeStyle(): CSSProperties | undefined {
  return useContext(BrandThemeContext);
}
