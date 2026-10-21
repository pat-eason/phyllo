import styles from "./App.module.css";
import { AppShell, SettingsWindow } from "./ui/shell";
import type { AppShellProps } from "./ui/shell";

export interface AppProps extends AppShellProps {
  /**
   * This window shows only Settings: the desktop Settings window (label ≠ `main`) or the browser's `#/settings`
   * popup. Decided once at launch (main.tsx). Default false.
   */
  settingsOnly?: boolean;
}

/** Root component; render under `<PhylloProvider>` and `<AppThemeProvider>`. */
export function App({ settingsOnly = false, ...shellProps }: AppProps) {
  return <div className={styles["app"]}>{settingsOnly ? <SettingsWindow /> : <AppShell {...shellProps} />}</div>;
}
