import { createContext, useContext, useLayoutEffect, useMemo, type ReactNode } from "react";
import { useMediaQuery } from "./useMediaQuery";

export type ThemeMode = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";
export type Accent = "green" | "red" | "blue" | "purple" | "orange" | "teal";

export const ACCENTS: readonly Accent[] = ["green", "red", "blue", "purple", "orange", "teal"];

export interface ThemeContextValue {
  /** The user's setting (may be `system`). */
  mode: ThemeMode;
  /** What is actually applied: `system` resolved against the OS preference. */
  theme: ResolvedTheme;
  accent: Accent;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  mode: ThemeMode;
  accent: Accent;
  children: ReactNode;
}

/**
 * Sets `data-theme` / `data-accent` on `<html>` (see tokens.css) and exposes the
 * resolved values through `useTheme()`. In `system` mode it follows OS changes live.
 */
export function ThemeProvider({ mode, accent, children }: ThemeProviderProps) {
  // Dark is the default theme, so it is also the fallback when matchMedia is unavailable.
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)", true);
  const theme: ResolvedTheme = mode === "system" ? (systemDark ? "dark" : "light") : mode;

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.accent = accent;
  }, [theme, accent]);

  const value = useMemo<ThemeContextValue>(() => ({ mode, theme, accent }), [mode, theme, accent]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
