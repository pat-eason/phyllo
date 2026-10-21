import type { GrooveSummary } from "@phyllo/model";
import { EmptyState } from "@phyllo/ui";
import { useId } from "react";
import { abbreviateHome, formatWhen, lastTouchedMs } from "./recent";
import styles from "./StarterPicker.module.css";

export interface RecentProjectsProps {
  /** Already sorted newest first and capped. */
  grooves: readonly GrooveSummary[];
  nowMs: number;
  /** Message from the last failed open. */
  error: string | null;
  onOpen: (groove: GrooveSummary) => void;
}

/** Recent projects from the library: name, `~` path, when. Clicking one opens it. */
export function RecentProjects({ grooves, nowMs, error, onOpen }: RecentProjectsProps) {
  const labelId = useId();
  return (
    <div className={styles["block"]}>
      <span id={labelId} className={styles["label"]}>
        Recent projects
      </span>
      {grooves.length === 0 ? (
        <EmptyState compact title="No projects yet" body="Pick a seed below and your first groove lands in ~/Music/Phyllo." />
      ) : (
        <ul aria-labelledby={labelId} className={styles["recentList"]}>
          {grooves.map((groove) => (
            <li key={groove.path}>
              <button type="button" className={styles["recent"]} onClick={() => onOpen(groove)}>
                <span
                  aria-hidden="true"
                  className={styles["swatch"]}
                  style={{ background: groove.preview[0]?.color ?? "var(--ph-track-4)" }}
                />
                <span className={styles["recentText"]}>
                  <span className={styles["recentName"]}>{groove.name}</span>
                  <span className={styles["recentPath"]}>{abbreviateHome(groove.path)}</span>
                </span>
                <span className={styles["when"]}>{formatWhen(lastTouchedMs(groove), nowMs)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error !== null ? (
        <p role="alert" className={styles["error"]}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
