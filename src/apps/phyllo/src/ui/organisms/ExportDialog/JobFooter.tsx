import { Button, Icon } from "@phyllo/ui";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { UseExport } from "../../../hooks";
import styles from "./ExportDialog.module.css";

export interface JobFooterProps {
  job: Pick<UseExport, "state" | "progress" | "result" | "error">;
  /** The info note under the form (idle only). */
  info: ReactNode;
  /** Why Export is disabled. */
  problem: string | null;
  exportLabel: string;
  /** What runs: "Rendering the song", "Rendering stems". */
  workLabel: string;
  onExport(): void;
  onClose(): void;
  onCancelJob(): void;
  onReveal(path: string): void;
  onAgain(): void;
}

const PROBLEM_ID = "export-problem";

/** Info note + actions, or the job's progress / result / error in their place. */
export function JobFooter({ job, info, problem, exportLabel, workLabel, onExport, onClose, onCancelJob, onReveal, onAgain }: JobFooterProps) {
  const busy = job.state === "rendering" || job.state === "encoding";
  const phase = busy ? "busy" : job.state;
  // The Export button unmounts when a job starts / ends: keep focus inside the dialog.
  const focusRef = useRef<HTMLButtonElement>(null);
  const shownPhase = useRef(phase);
  useEffect(() => {
    if (shownPhase.current === phase) return;
    shownPhase.current = phase;
    focusRef.current?.focus();
  }, [phase]);

  if (busy) {
    const percent = Math.round(job.progress * 100);
    const text = job.state === "rendering" ? `${workLabel}…` : "Writing the file…";
    return (
      <div className={styles["footer"]}>
        <div className={styles["progress"]}>
          <div className={styles["progressText"]}>
            <span>{text}</span>
            <span className={styles["percent"]}>{percent}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Export progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={`${text} ${percent}%`}
            className={styles["bar"]}
          >
            <span className={styles["barFill"]} style={{ width: `${percent}%` }} />
          </div>
          <p className={styles["hint"]}>You can close this and keep working; Phyllo tells you when the file is ready.</p>
        </div>
        <div className={styles["actions"]}>
          <Button variant="secondary" size="lg" onClick={onClose}>
            Keep working
          </Button>
          <Button ref={focusRef} variant="secondary" size="lg" onClick={onCancelJob}>
            Cancel export
          </Button>
        </div>
      </div>
    );
  }

  if (job.state === "done" && job.result) {
    const { result } = job;
    return (
      <div className={styles["footer"]}>
        <div className={styles["done"]} role="status">
          <Icon name="check" size={18} className={styles["doneIcon"]} />
          <div className={styles["doneText"]}>
            <span className={styles["doneTitle"]}>{result.title}</span>
            <span className={styles["muted"]}>{result.detail}</span>
            {result.realtime ? <span className={styles["muted"]}>Recorded in real time (offline rendering was unavailable).</span> : null}
          </div>
        </div>
        <div className={styles["actions"]}>
          <Button variant="secondary" size="lg" onClick={onAgain}>
            Export again
          </Button>
          {result.path ? (
            <Button variant="secondary" size="lg" iconStart="folder" onClick={() => onReveal(result.path ?? "")}>
              Reveal
            </Button>
          ) : null}
          <Button ref={focusRef} variant="primary" size="lg" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles["footer"]}>
      {job.state === "error" ? (
        <div className={styles["error"]} role="alert">
          <span className={styles["errorTitle"]}>The export didn’t finish</span>
          <span>{job.error}</span>
        </div>
      ) : (
        info
      )}
      {problem ? (
        <p id={PROBLEM_ID} className={styles["problem"]}>
          {problem}
        </p>
      ) : null}
      <div className={styles["actions"]}>
        <Button variant="secondary" size="lg" onClick={onClose}>
          Cancel
        </Button>
        <Button
          ref={focusRef}
          variant="primary"
          size="lg"
          iconStart="export"
          disabled={problem !== null}
          aria-describedby={problem ? PROBLEM_ID : undefined}
          onClick={onExport}
        >
          {job.state === "error" ? "Try again" : exportLabel}
        </Button>
      </div>
    </div>
  );
}
