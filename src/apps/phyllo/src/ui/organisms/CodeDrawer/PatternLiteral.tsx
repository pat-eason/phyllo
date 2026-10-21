import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import styles from "./CodeDrawer.module.css";

export interface PatternLiteralProps {
  /** The literal as shown, quotes included: `"bd*4"`. */
  text: string;
  trackName: string;
  editing: boolean;
  draft: string;
  /** Id of the error row while the draft doesn't parse. */
  errorId?: string;
  invalid: boolean;
  onStart(): void;
  onDraft(text: string): void;
  onCommit(): void;
  onCancel(): void;
}

/**
 * A track's source pattern inside the code: reads as code (a `role=button` span so it stays selectable and copies
 * as plain text), turns into an inline input on click / Enter / Space. Enter commits, Escape reverts, blur commits
 * a valid change and otherwise reverts.
 */
export function PatternLiteral({
  text,
  trackName,
  editing,
  draft,
  errorId,
  invalid,
  onStart,
  onDraft,
  onCommit,
  onCancel,
}: PatternLiteralProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const finished = useRef(false);

  useEffect(() => {
    if (!editing) return;
    finished.current = false;
    const input = inputRef.current;
    input?.focus();
    input?.select();
  }, [editing]);

  if (!editing) {
    const start = (event: KeyboardEvent<HTMLSpanElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      onStart();
    };
    return (
      <span
        role="button"
        tabIndex={0}
        className={styles["literal"]}
        aria-label={`Edit pattern for ${trackName}: ${text}`}
        title="Edit this pattern"
        onClick={onStart}
        onKeyDown={start}
      >
        {text}
      </span>
    );
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (invalid) return;
      finished.current = true;
      onCommit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      finished.current = true;
      onCancel();
    }
  };

  return (
    <span className={styles["literalEditing"]}>
      <span className={styles["string"]}>&quot;</span>
      <input
        ref={inputRef}
        type="text"
        className={styles["literalInput"]}
        aria-label={`Pattern for ${trackName}`}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        spellCheck={false}
        autoComplete="off"
        value={draft}
        style={{ width: `${Math.max(draft.length, 1) + 1}ch` }}
        onChange={(event) => onDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (finished.current) return;
          finished.current = true;
          if (invalid) onCancel();
          else onCommit();
        }}
      />
      <span className={styles["string"]}>&quot;</span>
    </span>
  );
}
