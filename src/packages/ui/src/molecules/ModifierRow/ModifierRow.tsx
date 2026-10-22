import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Icon } from "../../atoms/Icon";
import { IconButton } from "../../atoms/IconButton";
import { Switch } from "../../atoms/Switch";
import { TextField } from "../../atoms/TextField";
import { tokenizeCode } from "./codeTokens";
import styles from "./ModifierRow.module.css";

export interface ModifierRowProps extends Omit<ComponentPropsWithoutRef<"div">, "children" | "role"> {
  /** Chained call(s), e.g. `.sometimes(x => x.ply(2))`. */
  code: string;
  /** Plain description, e.g. "Doubles ~50% of notes". */
  description: string;
  /** Off keeps the modifier in the model but drops it from the generated code (code shown at 60%). */
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  /**
   * Reorder by `delta` rows (−1 up, +1 down): ⌥↑ / ⌥↓ (or plain ↑ / ↓ on the handle), or dragging the handle
   * vertically by a row height.
   */
  onMove?: (delta: number) => void;
  onRemove: () => void;
  /** Inline edit: double-click the code or press Enter on it; Enter commits, Esc cancels. Omit for read-only code. */
  onEdit?: (code: string) => void;
  /**
   * Opens the inline code editor from outside (a context menu's "Edit code"): each time this changes to a positive
   * number the editor opens, like a double-click. The value it has on mount is ignored; 0 never opens it.
   */
  editRequest?: number;
  /** The code doesn't parse: `--ph-rec` border and the message under the row. */
  error?: string;
  /** Extra props for the handle from an external DnD library. Its own `onPointerDown` can `preventDefault()` to opt out. */
  dragHandleProps?: HTMLAttributes<HTMLElement>;
  /** Handle name. Default "Reorder <code>". */
  reorderLabel?: string;
  /** Remove button name. Default "Remove <code>". */
  removeLabel?: string;
  /** Switch name. Default "Enable <code>". */
  enableLabel?: string;
}

/**
 * One entry of a track's modifier chain (Pro inspector): handle · tinted code + description · switch. The remove button
 * floats over the right end of the code column, shown on row hover or when focus is inside the row (it stays in the tab
 * order), so the code keeps the Kit's full width.
 */
export const ModifierRow = forwardRef<HTMLDivElement, ModifierRowProps>(function ModifierRow(
  {
    code,
    description,
    enabled,
    onEnabledChange,
    onMove,
    onRemove,
    onEdit,
    editRequest = 0,
    error,
    dragHandleProps,
    reorderLabel,
    removeLabel,
    enableLabel,
    className,
    ...rest
  },
  ref,
) {
  const errorId = useId();
  const rowRef = useRef<HTMLDivElement | null>(null);
  const codeButton = useRef<HTMLButtonElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const focusAfterEdit = useRef(false);
  /** Enter/Esc unmount the input, which fires one more blur; this keeps the edit from finishing twice. */
  const editClosed = useRef(true);
  const stopDrag = useRef<(() => void) | null>(null);
  const editing = draft !== null;

  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    } else if (focusAfterEdit.current) {
      focusAfterEdit.current = false;
      codeButton.current?.focus();
    }
  }, [editing]);

  useEffect(() => () => stopDrag.current?.(), []);

  const seenRequest = useRef(editRequest);
  const beginEdit = useRef(startEdit);
  beginEdit.current = startEdit;
  useEffect(() => {
    if (editRequest === seenRequest.current) return;
    seenRequest.current = editRequest;
    if (editRequest > 0) beginEdit.current();
  }, [editRequest]);

  function startEdit() {
    if (!onEdit) return;
    editClosed.current = false;
    setDraft(code);
  }

  function finishEdit(commit: boolean, refocus: boolean) {
    if (draft === null || editClosed.current) return;
    editClosed.current = true;
    focusAfterEdit.current = refocus;
    setDraft(null);
    const next = draft.trim();
    if (commit && next !== "" && next !== code) onEdit?.(next);
  }

  /** ⌥↑/⌥↓ moves, Delete removes: shared by the handle and the code button. */
  function rowKeys(event: KeyboardEvent<HTMLElement>, plainArrows: boolean) {
    const arrows = event.altKey || plainArrows;
    if (onMove && arrows && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      onMove(event.key === "ArrowUp" ? -1 : 1);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onRemove();
    }
  }

  function startPointerReorder(event: ReactPointerEvent<HTMLElement>) {
    if (!onMove || event.button !== 0) return;
    event.preventDefault();
    const row = rowRef.current;
    const step = Math.max(24, row?.offsetHeight ?? 52);
    let originY = event.clientY;
    const move = (e: PointerEvent) => {
      const rows = Math.trunc((e.clientY - originY) / step);
      if (rows !== 0) {
        originY += rows * step;
        onMove(rows);
      }
    };
    // Window listeners, not pointer capture: the parent re-inserts this row in the DOM on every move,
    // which would drop a capture.
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      stopDrag.current = null;
      setDragging(false);
    };
    stopDrag.current?.();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    stopDrag.current = end;
    setDragging(true);
  }

  const classes = [styles["row"], className].filter(Boolean).join(" ");
  const tokens = tokenizeCode(code);
  const tinted = tokens.map((t, i) =>
    t.kind === "plain" ? (
      t.text
    ) : (
      <span key={i} className={styles[t.kind]}>
        {t.text}
      </span>
    ),
  );

  return (
    <div
      ref={(el) => {
        rowRef.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      role="listitem"
      className={classes}
      data-enabled={enabled ? "" : undefined}
      data-invalid={error ? "" : undefined}
      data-dragging={dragging ? "" : undefined}
      {...rest}
    >
      <div className={styles["main"]}>
        <button
          type="button"
          className={styles["handle"]}
          aria-label={reorderLabel ?? `Reorder ${code}`}
          {...dragHandleProps}
          onPointerDown={(e) => {
            dragHandleProps?.onPointerDown?.(e);
            if (!e.defaultPrevented) startPointerReorder(e);
          }}
          onKeyDown={(e) => {
            dragHandleProps?.onKeyDown?.(e);
            if (!e.defaultPrevented) rowKeys(e, true);
          }}
        >
          <Icon name="drag" size={12} />
        </button>

        <div className={styles["body"]}>
          {editing ? (
            <TextField
              ref={input}
              variant="code"
              label={`Edit ${code}`}
              value={draft}
              onChange={setDraft}
              invalid={Boolean(error)}
              className={styles["editor"]}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  finishEdit(true, true);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  finishEdit(false, true);
                }
              }}
              onBlur={() => finishEdit(true, false)}
            />
          ) : (
            <button
              ref={codeButton}
              type="button"
              className={styles["code"]}
              title={code}
              aria-label={onEdit ? `Edit ${code}` : code}
              aria-describedby={error ? errorId : undefined}
              onDoubleClick={startEdit}
              onClick={(e) => {
                // Keyboard activation (Enter / Space) reports detail 0; pointer clicks wait for the double-click.
                if (e.detail === 0) startEdit();
              }}
              onKeyDown={(e) => rowKeys(e, false)}
            >
              {tinted}
            </button>
          )}
          <span className={styles["description"]}>{description}</span>
          {editing ? null : (
            <span className={styles["removeWrap"]}>
              <IconButton
                icon="close"
                size={26}
                variant="plain"
                label={removeLabel ?? `Remove ${code}`}
                className={styles["remove"]}
                onClick={onRemove}
              />
            </span>
          )}
        </div>

        <Switch size="sm" checked={enabled} onChange={onEnabledChange} label={enableLabel ?? `Enable ${code}`} />
      </div>
      {error ? (
        <p id={errorId} className={styles["error"]}>
          {error}
        </p>
      ) : null}
    </div>
  );
});
