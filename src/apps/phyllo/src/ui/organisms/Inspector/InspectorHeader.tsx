import type { Track } from "@phyllo/model";
import { Button, TextField } from "@phyllo/ui";
import { useLayoutEffect, useRef, useState } from "react";
import { useContextMenuTrigger } from "../../../hooks";
import { useTrackMenu } from "../../contextMenu";
import { friendlyDescription } from "./inspectorModel";
import styles from "./Inspector.module.css";

export interface InspectorHeaderProps {
  track: Track;
  onRename: (name: string) => void;
  /** Absent → no "Edit pattern" button. */
  onEditPattern?: () => void;
}

/** Color tile, name (double-click / Enter to rename), friendly sound, "Edit pattern". */
export function InspectorHeader({ track, onRename, onEditPattern }: InspectorHeaderProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const nameButton = useRef<HTMLButtonElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const refocus = useRef(false);
  const editing = draft !== null;
  const buildTrackMenu = useTrackMenu();
  // While the name field is open it keeps the browser's own text menu.
  const menu = useContextMenuTrigger(() => (editing ? null : buildTrackMenu(track.id, { rename: () => setDraft(track.name) })));

  useLayoutEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    } else if (refocus.current) {
      refocus.current = false;
      nameButton.current?.focus();
    }
  }, [editing]);

  function finish(commit: boolean, focusName: boolean) {
    if (draft === null) return;
    const next = draft.trim();
    refocus.current = focusName;
    setDraft(null);
    if (commit && next !== "" && next !== track.name) onRename(next);
  }

  return (
    <header className={styles["header"]} {...menu}>
      <span className={styles["tile"]} style={{ background: track.color }} aria-hidden="true" />
      <div className={styles["titles"]}>
        {editing ? (
          <TextField
            ref={input}
            label={`Rename ${track.name}`}
            value={draft}
            onChange={setDraft}
            className={styles["renameField"]}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                finish(true, true);
              } else if (event.key === "Escape") {
                event.preventDefault();
                finish(false, true);
              }
            }}
            onBlur={() => finish(true, false)}
          />
        ) : (
          <h2 className={styles["name"]}>
            <button
              ref={nameButton}
              type="button"
              className={styles["nameButton"]}
              title="Double-click to rename"
              aria-label={`${track.name}, rename track`}
              onDoubleClick={() => setDraft(track.name)}
              onClick={(event) => {
                // Keyboard activation (Enter / Space) reports detail 0; pointer clicks wait for the double-click.
                if (event.detail === 0) setDraft(track.name);
              }}
              onKeyDown={(event) => {
                if (event.key === "F2") {
                  event.preventDefault();
                  setDraft(track.name);
                }
              }}
            >
              {track.name}
            </button>
          </h2>
        )}
        <span className={styles["friendly"]}>{friendlyDescription(track)}</span>
      </div>
      {onEditPattern ? (
        <Button size="sm" variant="secondary" onClick={onEditPattern} disabled={track.kind === "code"}>
          Edit pattern
        </Button>
      ) : null}
    </header>
  );
}
