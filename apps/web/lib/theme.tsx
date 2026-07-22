"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "vekino.theme";

function getSystemDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const dark = theme === "dark" || (theme === "system" && getSystemDark());
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

type ThemeCtx = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolved: "light" | "dark";
};

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (stored === "light" || stored === "dark" || stored === "system") {
        setThemeState(stored);
        applyTheme(stored);
        setResolved(
          stored === "system" ? (getSystemDark() ? "dark" : "light") : stored,
        );
        return;
      }
    } catch {
      /* ignore */
    }
    applyTheme("system");
    setResolved(getSystemDark() ? "dark" : "light");
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    function onChange() {
      if (theme !== "system") return;
      applyTheme("system");
      setResolved(getSystemDark() ? "dark" : "light");
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
    applyTheme(t);
    setResolved(t === "system" ? (getSystemDark() ? "dark" : "light") : t);
  }, []);

  return (
    <Ctx.Provider value={{ theme, setTheme, resolved }}>{children}</Ctx.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
