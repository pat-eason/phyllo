import { ThemeProvider } from "@phyllo/ui";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useStore } from "zustand";
import { useAppStores } from "../../state/context";

export interface AppThemeProviderProps {
  children: ReactNode;
}

/**
 * `ThemeProvider` bound live to `settings.appearance` (SPEC §6.6: theme and accent apply instantly, every window); the
 * native window theme follows, so native context menus match.
 */
export function AppThemeProvider({ children }: AppThemeProviderProps) {
  const { settings, native } = useAppStores();
  const mode = useStore(settings, (s) => s.settings.appearance.mode);
  const accent = useStore(settings, (s) => s.settings.appearance.accent);

  // OS-drawn context menus follow the window's appearance, not the page's tokens.
  useEffect(() => {
    native.windowSetTheme(mode === "system" ? null : mode).catch((error: unknown) => {
      console.warn("[phyllo] could not match the window theme", error);
    });
  }, [native, mode]);
  return (
    <ThemeProvider mode={mode} accent={accent}>
      {children}
    </ThemeProvider>
  );
}
