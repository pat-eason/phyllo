import type { GrooveSummary } from "@phyllo/model";
import { EmptyState } from "@phyllo/ui";
import { useId } from "react";
import { useContextMenuTrigger } from "../../../hooks";
import { abbreviateHome, formatWhen, lastTouchedMs } from "./recent";
import { recentMenuEntries } from "./recentMenu";
import styles from "./StarterPicker.module.css";

export interface RecentProjectsProps {
  /** Already sorted newest first and capped. */
  grooves: readonly GrooveSummary[];
  nowMs: number;
  /** Message from the last failed open. */
  error: string | null;
  onOpen: (groove: GrooveSummary) => void;
  /** "Show in Finder" in a project's right-click menu. */
  onReveal: (groove: GrooveSummary) => void;
}

/** Recent projects from the library: name, `~` path, when. Clicking one opens it; right-click for more. */
export function RecentProjects({ grooves, nowMs, error, onOpen, onReveal }: RecentProjectsProps) {
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
              <RecentRow groove={groove} nowMs={nowMs} onOpen={onOpen} onReveal={onReveal} />
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

interface RecentRowProps {
  groove: GrooveSummary;
  nowMs: number;
  onOpen: (groove: GrooveSummary) => void;
  onReveal: (groove: GrooveSummary) => void;
}

function RecentRow({ groove, nowMs, onOpen, onReveal }: RecentRowProps) {
  const trigger = useContextMenuTrigger(() => ({
    label: `Project ${groove.name}`,
    entries: recentMenuEntries(groove, { open: onOpen, reveal: onReveal }),
  }));
  return (
    <button type="button" className={styles["recent"]} onClick={() => onOpen(groove)} {...trigger}>
      <span aria-hidden="true" className={styles["swatch"]} style={{ background: groove.preview[0]?.color ?? "var(--ph-track-4)" }} />
      <span className={styles["recentText"]}>
        <span className={styles["recentName"]}>{groove.name}</span>
        <span className={styles["recentPath"]}>{abbreviateHome(groove.path)}</span>
      </span>
      <span className={styles["when"]}>{formatWhen(lastTouchedMs(groove), nowMs)}</span>
    </button>
  );
}
