import { useMediaQuery } from "@phyllo/ui";
import type { ReactNode } from "react";
import { useSettings } from "../../../hooks";

/**
 * Stands in for the app's `ThemeProvider` binding in stories and tests of the Settings screens: scopes the
 * theme and accent chosen in settings to a subtree, so choosing "Light" or "Red" restyles the page like the real
 * window does (the real `ThemeProvider` sets the same attributes on `<html>`).
 */
export function ThemeScope({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)", true);
  const { mode, accent } = settings.appearance;
  const theme = mode === "system" ? (systemDark ? "dark" : "light") : mode;
  return (
    <div data-theme={theme} data-accent={accent} style={{ minHeight: "100vh", background: "var(--ph-bg)", color: "var(--ph-text)" }}>
      {children}
    </div>
  );
}
