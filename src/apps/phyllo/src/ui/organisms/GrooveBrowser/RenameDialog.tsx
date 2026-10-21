import { Button, TextField } from "@phyllo/ui";
import { useState } from "react";
import type { KeyboardEvent } from "react";
import { Dialog } from "./Dialog";
import styles from "./Dialogs.module.css";
import { useGuardedAction } from "./useGuardedAction";

export interface RenameDialogProps {
  name: string;
  /** Resolves with an error message, or null once renamed. */
  onRename: (name: string) => Promise<string | null>;
  onClose: () => void;
}

/** Renames the groove inside its file (the file name stays, DECISIONS D104). */
export function RenameDialog({ name, onRename, onClose }: RenameDialogProps) {
  const [draft, setDraft] = useState(name);
  const action = useGuardedAction();
  const trimmed = draft.trim();
  const canSave = trimmed !== "" && trimmed !== name;

  async function save() {
    if (!canSave) return;
    const saved = await action.run(() => onRename(trimmed));
    if (saved) onClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void save();
    }
  }

  return (
    <Dialog
      title="Rename groove"
      description="The name is saved inside the file; the file name on disk stays the same."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={!canSave || action.pending}>
            Rename
          </Button>
        </>
      }
    >
      <TextField label="Name" labelPosition="top" value={draft} onChange={setDraft} onKeyDown={handleKeyDown} />
      {action.error ? (
        <p className={styles["error"]} role="alert">
          {action.error}
        </p>
      ) : null}
    </Dialog>
  );
}
