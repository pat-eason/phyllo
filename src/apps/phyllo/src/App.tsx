import styles from "./App.module.css";
import { AppShell } from "./ui/shell";
import type { AppShellProps } from "./ui/shell";

export type AppProps = AppShellProps;

/** Root component; render under `<PhylloProvider>` and `<AppThemeProvider>`. */
export function App(shellProps: AppProps) {
  return (
    <div className={styles["app"]}>
      <AppShell {...shellProps} />
    </div>
  );
}
