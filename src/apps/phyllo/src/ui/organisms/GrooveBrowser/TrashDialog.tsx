import { Button } from "@phyllo/ui";
import { Dialog } from "./Dialog";
import styles from "./Dialogs.module.css";
import { useGuardedAction } from "./useGuardedAction";

export interface TrashDialogProps {
  /** Names of the grooves that will go to the Trash. */
  names: string[];
  /** Resolves with an error message, or null once moved. */
  onConfirm: () => Promise<string | null>;
  onClose: () => void;
}

/** Confirms Move to Trash. The files go to the OS Trash, so they can be put back from there. */
export function TrashDialog({ names, onConfirm, onClose }: TrashDialogProps) {
  const action = useGuardedAction();
  const single = names.length === 1;
  const title = single ? `Move ${names[0] ?? "this groove"} to the Trash?` : `Move ${names.length} grooves to the Trash?`;

  async function confirm() {
    const moved = await action.run(onConfirm);
    if (moved) onClose();
  }

  return (
    <Dialog
      title={title}
      description="Files go to the system Trash. You can put them back from there."
      onClose={onClose}
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button className={styles["danger"]} onClick={() => void confirm()} disabled={action.pending}>
            Move to Trash
          </Button>
        </>
      }
    >
      {single ? null : (
        <ul className={styles["nameList"]}>
          {names.map((name, index) => (
            <li key={`${index}-${name}`}>{name}</li>
          ))}
        </ul>
      )}
      {action.error ? (
        <p className={styles["error"]} role="alert">
          {action.error}
        </p>
      ) : null}
    </Dialog>
  );
}
