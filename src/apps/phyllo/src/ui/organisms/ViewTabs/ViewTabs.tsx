import type { ButtonHTMLAttributes } from "react";
import styles from "./ViewTabs.module.css";

export type ViewName = "library" | "arrange" | "pattern" | "mixer";

const LABELS: Record<ViewName, string> = {
  library: "Library",
  arrange: "Arrange",
  pattern: "Pattern",
  mixer: "Mixer",
};

export interface ViewTabsProps {
  /** The view on screen; its tab is marked `aria-current="page"`. */
  current: ViewName;
  onNavigate(view: ViewName): void;
  /** Put the Library tab first (Library screen header). Default false. */
  withLibrary?: boolean;
  /** Handlers spread on every tab button (a context menu: the screen builds it, so the tabs stay provider-free). */
  tabHandlers?: Pick<ButtonHTMLAttributes<HTMLButtonElement>, "onContextMenu" | "onKeyDown">;
  className?: string;
}

/**
 * Arrange | Pattern | Mixer (+ Library) view switch used in the compact AppHeader and the Arrange ViewToolbar.
 * Plain text buttons in a `<nav>`; the current view is raised. Each button switches the screen rather than a
 * tabpanel, so the current one is `aria-current="page"` instead of the `tab` role.
 */
export function ViewTabs({ current, onNavigate, withLibrary = false, tabHandlers, className }: ViewTabsProps) {
  const views: ViewName[] = withLibrary ? ["library", "arrange", "pattern", "mixer"] : ["arrange", "pattern", "mixer"];
  return (
    <nav aria-label="Views" className={className ? `${styles["tabs"]} ${className}` : styles["tabs"]}>
      {views.map((view) => (
        <button
          key={view}
          type="button"
          className={styles["tab"]}
          aria-current={view === current ? "page" : undefined}
          {...tabHandlers}
          onClick={() => {
            if (view !== current) onNavigate(view);
          }}
        >
          {LABELS[view]}
        </button>
      ))}
    </nav>
  );
}
