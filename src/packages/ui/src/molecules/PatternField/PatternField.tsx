import { forwardRef, useId, useState, type ComponentPropsWithoutRef, type KeyboardEvent } from "react";
import { Icon } from "../../atoms/Icon";
import { TextField } from "../../atoms/TextField";
import styles from "./PatternField.module.css";

export interface PatternFieldProps
  extends Omit<ComponentPropsWithoutRef<"input">, "value" | "onChange" | "size" | "className" | "defaultValue"> {
  /** Visible label: "PATTERN" (inspector) or "Live code" (pattern editor). It names the field. */
  label: string;
  /** The committed pattern (mini-notation or a full `s("…")` call). Re-syncs the text while it isn't being edited. */
  value: string;
  /** Every keystroke (the organism parses and debounces). */
  onChange?: (text: string) => void;
  /** Enter or blur with changed text. */
  onCommit: (text: string) => void;
  mode: "guided" | "pro";
  /** Guided explanation of the current pattern. Hidden in Pro and while there is an error. */
  hint?: string;
  /** Parse error: replaces the hint in `--ph-rec`, sets `aria-invalid`, announced politely. */
  error?: string;
  /** Right of the label, e.g. "Synced both ways — edit the grid or the text" (accent dot before it). */
  syncedNote?: string;
  /** Right-aligned in the label row, e.g. "mini-notation". */
  trailingLabel?: string;
  /** `inspector`: caps legend label. `live`: the pattern editor's "Live code" bar (code icon, title label). */
  variant?: "inspector" | "live";
  /** Inspector label color: `legend` (cream, on skeuomorphic panels) or `muted` (flat panels). Default `legend`. */
  labelTone?: "legend" | "muted";
  /** Applied to the outer wrapper; native props go to the `<input>`. */
  className?: string;
}

/**
 * Edits a track's mini-notation: code TextField with accent border, Guided hint, error line. Keeps a local
 * draft while typing; Enter / blur commit it, Escape reverts to `value`.
 */
export const PatternField = forwardRef<HTMLInputElement, PatternFieldProps>(function PatternField(
  {
    label,
    value,
    onChange,
    onCommit,
    mode,
    hint,
    error,
    syncedNote,
    trailingLabel,
    variant = "inspector",
    labelTone = "legend",
    className,
    onKeyDown,
    onBlur,
    "aria-describedby": describedByProp,
    ...rest
  },
  ref,
) {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const [draft, setDraft] = useState(value);
  const [dirty, setDirty] = useState(false);
  const [syncedValue, setSyncedValue] = useState(value);
  // A new committed value from outside (grid edit, undo) replaces the text unless the user is mid-edit.
  if (value !== syncedValue) {
    setSyncedValue(value);
    if (!dirty) setDraft(value);
  }

  const showHint = mode === "guided" && Boolean(hint) && !error;
  const describedBy = [describedByProp, error ? errorId : undefined, showHint ? hintId : undefined].filter(Boolean).join(" ");

  function change(text: string) {
    setDraft(text);
    setDirty(text !== value);
    onChange?.(text);
  }

  function commit() {
    setDirty(false);
    if (draft !== value) onCommit(draft);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape" && draft !== value) {
      event.preventDefault();
      setDraft(value);
      setDirty(false);
      onChange?.(value);
    }
  }

  const classes = [styles["patternField"], className].filter(Boolean).join(" ");

  return (
    <div className={classes} data-variant={variant} data-label-tone={labelTone}>
      <div className={styles["labelRow"]}>
        {variant === "live" ? <Icon name="code" size={16} className={styles["labelIcon"]} /> : null}
        <span id={labelId} className={styles["label"]}>
          {label}
        </span>
        {syncedNote ? (
          <span className={styles["synced"]}>
            <span className={styles["syncedDot"]} aria-hidden="true" />
            {syncedNote}
          </span>
        ) : null}
        {trailingLabel ? <span className={styles["trailing"]}>{trailingLabel}</span> : null}
      </div>
      <TextField
        {...rest}
        ref={ref}
        variant="code"
        size="lg"
        label={label}
        aria-labelledby={labelId}
        value={draft}
        onChange={change}
        invalid={Boolean(error)}
        aria-describedby={describedBy || undefined}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          onBlur?.(event);
          commit();
        }}
      />
      <div id={errorId} className={styles["error"]} aria-live="polite">
        {error}
      </div>
      {showHint ? (
        <p id={hintId} className={styles["hint"]}>
          {hint}
        </p>
      ) : null}
    </div>
  );
});
