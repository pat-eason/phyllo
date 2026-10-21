import { Button, Kbd } from "@phyllo/ui";
import { useEffect, useRef, useState } from "react";
import { useProjectFile } from "../../hooks";
import type { SnapshotInfo } from "../../native/types";
import styles from "./dialogs.module.css";
import { formatSnapshotTime } from "./format";
import { Modal } from "./Modal";
import { SHORTCUTS } from "./shortcuts";

export type UnsavedChoice = "save" | "discard" | "cancel";

export interface UnsavedChangesDialogProps {
  projectName: string;
  /** Save is running (the dialog stays open until it finishes). */
  saving?: boolean;
  onChoose(choice: UnsavedChoice): void;
}

/** "Save changes to <name>?" before New / Open / Import replaces a project with unsaved changes. */
export function UnsavedChangesDialog({ projectName, saving = false, onChoose }: UnsavedChangesDialogProps) {
  return (
    <Modal
      role="alertdialog"
      title={`Save changes to “${projectName}”?`}
      description="Your changes will be lost if you don't save them."
      onClose={() => onChoose("cancel")}
      initialFocus="[data-autofocus]"
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={() => onChoose("discard")} disabled={saving}>
            Don't save
          </Button>
          <Button onClick={() => onChoose("cancel")} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" data-autofocus="" loading={saving} onClick={() => onChoose("save")}>
            Save
          </Button>
        </>
      }
    />
  );
}

export interface VersionHistoryDialogProps {
  onClose(): void;
  /** A snapshot was restored (undoable with ⌘Z). */
  onRestored?(snapshot: SnapshotInfo): void;
  /** Autosave and version history are off in Settings › System. */
  historyOff?: boolean;
}

type HistoryState = { status: "loading" } | { status: "ready"; snapshots: SnapshotInfo[] } | { status: "error"; message: string };

/** File › Version History…: snapshots of the open project, newest first; Restore is one undoable change. */
export function VersionHistoryDialog({ onClose, onRestored, historyOff = false }: VersionHistoryDialogProps) {
  const { projectName, listHistory, restoreSnapshot } = useProjectFile();
  const [state, setState] = useState<HistoryState>({ status: "loading" });
  const [restoring, setRestoring] = useState<string | null>(null);
  const restoringRef = useRef(false);

  useEffect(() => {
    let live = true;
    listHistory()
      .then((snapshots) => {
        if (live) setState({ status: "ready", snapshots: [...snapshots].sort((a, b) => b.id.localeCompare(a.id)) });
      })
      .catch((error: unknown) => {
        if (live) setState({ status: "error", message: String(error) });
      });
    return () => {
      live = false;
    };
  }, [listHistory]);

  async function restore(snapshot: SnapshotInfo) {
    if (restoringRef.current) return;
    restoringRef.current = true;
    setRestoring(snapshot.id);
    try {
      const result = await restoreSnapshot(snapshot.id);
      if (result.ok) {
        onRestored?.(snapshot);
        onClose();
      } else {
        setState({ status: "error", message: result.error });
      }
    } finally {
      restoringRef.current = false;
      setRestoring(null);
    }
  }

  return (
    <Modal
      title="Version history"
      description={`Snapshots of “${projectName}”, taken each time it is saved. Restoring one is a change you can undo.`}
      onClose={onClose}
      width={520}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {state.status === "loading" ? <p className={styles["note"]}>Loading versions…</p> : null}
      {state.status === "error" ? (
        <p className={styles["error"]} role="alert">
          {state.message}
        </p>
      ) : null}
      {state.status === "ready" && state.snapshots.length === 0 ? (
        <p className={styles["note"]}>
          {historyOff
            ? "Version history is off. Turn on “Autosave and version history” in Settings › System."
            : "No versions yet. Phyllo keeps one each time the groove is saved."}
        </p>
      ) : null}
      {state.status === "ready" && state.snapshots.length > 0 ? (
        <ul className={styles["versions"]} aria-label="Versions">
          {state.snapshots.map((snapshot, index) => (
            <li key={snapshot.id} className={styles["version"]}>
              <span className={styles["versionTime"]}>
                <time dateTime={snapshot.takenAt}>{formatSnapshotTime(snapshot.takenAt)}</time>
                {index === 0 ? <span className={styles["latest"]}>Latest</span> : null}
              </span>
              <Button
                size="sm"
                loading={restoring === snapshot.id}
                aria-label={`Restore version from ${formatSnapshotTime(snapshot.takenAt)}`}
                onClick={() => void restore(snapshot)}
              >
                Restore
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </Modal>
  );
}

export interface ShortcutsDialogProps {
  onClose(): void;
}

/** Help › Keyboard Shortcuts: the shortcut table itself, so the list can't drift from what the keys do. */
export function ShortcutsDialog({ onClose }: ShortcutsDialogProps) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} width={520} footer={<Button onClick={onClose}>Close</Button>}>
      <dl className={styles["shortcuts"]}>
        {SHORTCUTS.map((shortcut) => (
          <div key={`${shortcut.action}:${shortcut.keys.join("")}`} className={styles["shortcut"]}>
            <dt>{shortcut.label}</dt>
            <dd>
              <Kbd keys={[...shortcut.keys]} />
            </dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
