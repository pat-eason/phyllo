import type { ReactNode } from "react";
import styles from "./ThemePair.module.css";

export interface ThemePairProps {
  /** Rendered once per theme. */
  children: ReactNode;
  /** Gap between the two themed halves, in px. Default 0 (they butt up like the Kit's side-by-side panels). */
  gap?: number;
  /** Padding inside each half, in px. Default 24. */
  padding?: number;
}

/**
 * Story helper for `Themes` stories: renders `children` twice side by side, once inside
 * `data-theme="dark"` and once inside `data-theme="light"`. Tokens are attribute-scoped, so each
 * half re-themes independently of the toolbar's theme. Accent still follows the toolbar.
 */
export function ThemePair({ children, gap = 0, padding = 24 }: ThemePairProps) {
  return (
    <div className={styles["pair"]} style={{ gap }}>
      {(["dark", "light"] as const).map((theme) => (
        <div key={theme} data-theme={theme} className={styles["half"]} style={{ padding }}>
          <span className={styles["caption"]}>data-theme="{theme}"</span>
          {children}
        </div>
      ))}
    </div>
  );
}
