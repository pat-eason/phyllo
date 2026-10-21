import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
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
 *
 * Whenever the theme or accent changes (not on first mount) it also sets `data-theme-switching` on `<html>` for two
 * animation frames; `base.css` turns every transition off while it is present, so all controls re-colour in the same
 * frame instead of lagging behind the tokens by 90 to 160 ms.
 */
export function ThemeProvider({ mode, accent, children }: ThemeProviderProps) {
  // Dark is the default theme, so it is also the fallback when matchMedia is unavailable.
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)", true);
  const theme: ResolvedTheme = mode === "system" ? (systemDark ? "dark" : "light") : mode;

  const applied = useRef(false);
  const frames = useRef<number[]>([]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const changed = applied.current && (root.dataset.theme !== theme || root.dataset.accent !== accent);
    applied.current = true;
    if (changed) root.dataset.themeSwitching = "";
    root.dataset.theme = theme;
    root.dataset.accent = accent;
  }, [theme, accent]);

  // The attribute must stay through the frame that paints the new tokens and the one after it.
  useEffect(() => {
    const root = document.documentElement;
    if (!("themeSwitching" in root.dataset)) return undefined;
    frames.current.forEach((id) => cancelAnimationFrame(id));
    const first = requestAnimationFrame(() => {
      const second = requestAnimationFrame(() => {
        delete root.dataset.themeSwitching;
        frames.current = [];
      });
      frames.current = [second];
    });
    frames.current = [first];
    return () => frames.current.forEach((id) => cancelAnimationFrame(id));
  }, [theme, accent]);

  // Unmounting mid-switch must not leave transitions disabled for the rest of the document.
  useEffect(
    () => () => {
      delete document.documentElement.dataset.themeSwitching;
    },
    [],
  );

  const value = useMemo<ThemeContextValue>(() => ({ mode, theme, accent }), [mode, theme, accent]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
