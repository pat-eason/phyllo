import { Button } from "@phyllo/ui";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { UseProject } from "../../../hooks";
import styles from "./CodeDrawer.module.css";

type ApplyResult = ReturnType<UseProject["applyCode"]>;

export interface EditCodePanelProps {
  /** Whole-song code to start from. */
  initialCode: string;
  /** `useProject().applyCode`: undoable `code/replace`; errors leave the model untouched. */
  onApply(code: string): ApplyResult;
  /** Leave edit mode (after a successful apply, or Cancel / Escape). */
  onClose(): void;
}

interface ApplyError {
  message: string;
  line?: number;
  column?: number;
}

function describe(error: ApplyError): string {
  if (error.line === undefined) return error.message;
  return error.column === undefined
    ? `Line ${error.line}: ${error.message}`
    : `Line ${error.line}, column ${error.column}: ${error.message}`;
}

/**
 * Pro "Edit code": always the whole song as text (section-scope code would drop the tracks outside the section
 * from `code/replace`), so the drawer switches to the song scope while editing. Apply (or ⌘↩) runs it through
 * the parser; unknown code becomes Code tracks (SPEC §4.2). A parse error shows its line/column and keeps the draft and the model as they were.
 */
export function EditCodePanel({ initialCode, onApply, onClose }: EditCodePanelProps) {
  const id = useId();
  const [draft, setDraft] = useState(initialCode);
  const [error, setError] = useState<ApplyError | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const apply = () => {
    const result = onApply(draft);
    if (result.ok) {
      onClose();
      return;
    }
    setError({ message: result.error, line: result.line, column: result.column });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      apply();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <div className={styles["editPanel"]}>
      <textarea
        ref={textareaRef}
        className={styles["editor"]}
        aria-label="Strudel code for the whole song"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error ${id}-hint` : `${id}-hint`}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      {error ? (
        <span id={`${id}-error`} role="alert" className={styles["editError"]}>
          {describe(error)}
        </span>
      ) : null}
      <div className={styles["editFooter"]}>
        <span id={`${id}-hint`} className={styles["editHint"]}>
          <strong>Editing the whole song.</strong> Apply replaces its tracks with this code; code Phyllo can&apos;t map
          becomes a Code track. ⌘↩ applies, ⌘Z undoes.
        </span>
        <div className={styles["editActions"]}>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" onClick={apply}>
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
