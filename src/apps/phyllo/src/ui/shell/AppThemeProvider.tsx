import { ThemeProvider } from "@phyllo/ui";
import type { ReactNode } from "react";
import { useStore } from "zustand";
import { useAppStores } from "../../state/context";

export interface AppThemeProviderProps {
  children: ReactNode;
}

/** `ThemeProvider` bound live to `settings.appearance` (SPEC §6.6: theme and accent apply instantly, every window). */
export function AppThemeProvider({ children }: AppThemeProviderProps) {
  const { settings } = useAppStores();
  const mode = useStore(settings, (s) => s.settings.appearance.mode);
  const accent = useStore(settings, (s) => s.settings.appearance.accent);
  return (
    <ThemeProvider mode={mode} accent={accent}>
      {children}
    </ThemeProvider>
  );
}
