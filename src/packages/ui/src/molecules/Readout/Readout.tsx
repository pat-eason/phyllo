import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
} from "react";
import styles from "./Readout.module.css";

/** Per-frame text feed: call `write(text)` as often as you like, the cell updates its DOM node directly. */
export type ReadoutSubscribe = (write: (text: string) => void) => () => void;

export interface ReadoutCell {
  /** `position`, `bpm`, `key`, `cycle` or any custom id. */
  id: "position" | "bpm" | "key" | "cycle" | (string & {});
  /** Displayed value: "13.2.1", "120", "C minor", "12.25". */
  value: string;
  /** Small caps line under the value: "BAR · BEAT · 16TH", "BPM · TAP" | "BPM · setcpm(30)", "KEY · 4/4", "CYCLE". */
  caption: string;
  /** JetBrains Mono for numbers (not for "C minor"). */
  mono?: boolean;
  /** Makes the cell a button (BPM → tap, Key → key menu). */
  onActivate?: () => void;
  /**
   * Makes the value editable in place: a click swaps it for a numeric input; Enter or blur commits the
   * typed text, Escape cancels. Also makes the cell a button.
   */
  onEdit?: (value: string) => void;
  /**
   * Makes the caption its own button (BPM · TAP: tap tempo) next to the value. The value stays a separate button when
   * `onActivate` / `onEdit` are set, so the two actions don't nest.
   */
  onCaptionClick?: () => void;
  /** Accessible name of the caption button. Defaults to the caption text. */
  captionLabel?: string;
  /** Wheel or Arrow Up/Down on an interactive cell nudges the value by one step. */
  onNudge?: (delta: 1 | -1) => void;
  /** Accessible name for an interactive cell, e.g. "Tempo 120 BPM, edit". Defaults to value + caption. */
  label?: string;
  /** Fixed minimum width in px so a changing value doesn't jitter its neighbours (position: 112). */
  minWidth?: number;
  /** 15 px value instead of 18. Defaults to true for the `key` and `cycle` cells. */
  compact?: boolean;
  /**
   * Live feed for values that change every animation frame (position, cycle). The cell writes each text
   * straight to its DOM node and never re-renders; `value` is only the initial text. Return an unsubscribe.
   */
  subscribe?: ReadoutSubscribe;
}

export interface ReadoutProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  cells: readonly ReadoutCell[];
}

/**
 * Recessed display window for the title bar: position, tempo, key and cycle.
 *
 * Performance: position and cycle change every frame while playing. Give those cells a `subscribe`
 * function (e.g. from a transport clock) and the organism never re-renders the header; each cell sets
 * `textContent` on its own span. Static cells just take `value`.
 */
export const Readout = forwardRef<HTMLDivElement, ReadoutProps>(function Readout({ cells, className, ...rest }, ref) {
  const classes = className ? `${styles["readout"]} ${className}` : styles["readout"];
  return (
    <div ref={ref} role="group" aria-label="Transport readout" className={classes} {...rest}>
      {cells.map((cell) => (
        <Cell key={cell.id} cell={cell} />
      ))}
    </div>
  );
});

function Cell({ cell }: { cell: ReadoutCell }) {
  const { id, value, caption, mono = false, onActivate, onEdit, onNudge, onCaptionClick, captionLabel, label, minWidth, subscribe } = cell;
  const compact = cell.compact ?? (id === "key" || id === "cycle");
  const interactive = Boolean(onActivate ?? onEdit);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const valueRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const nudgeRef = useRef(onNudge);
  const editInput = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    nudgeRef.current = onNudge;
  });

  // Subscribed cells own their text node: React renders it empty and we write it.
  useLayoutEffect(() => {
    if (subscribe && valueRef.current) valueRef.current.textContent = value;
  }, [subscribe, value, editing]);
  useEffect(() => {
    if (!subscribe) return undefined;
    return subscribe((text) => {
      if (valueRef.current) valueRef.current.textContent = text;
    });
  }, [subscribe, editing]);

  // React's onWheel is passive, so a native listener is needed to stop the page scrolling while nudging.
  const nudgeable = interactive && onNudge !== undefined && !editing;
  useEffect(() => {
    const el = buttonRef.current;
    if (!nudgeable || !el) return undefined;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      if (event.deltaY !== 0) nudgeRef.current?.(event.deltaY < 0 ? 1 : -1);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [nudgeable]);

  const refocus = useRef(false);
  useEffect(() => {
    if (editing) {
      editInput.current?.focus();
      editInput.current?.select();
    } else if (refocus.current) {
      refocus.current = false;
      buttonRef.current?.focus();
    }
  }, [editing]);

  /** Ends the edit; `keepFocus` hands focus back to the cell button (Enter/Escape, not Tab-away). */
  function finish(save: boolean, keepFocus: boolean) {
    refocus.current = keepFocus;
    setEditing(false);
    if (save && draft.trim() !== "" && draft !== value) onEdit?.(draft.trim());
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!onNudge) return;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      onNudge(1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      onNudge(-1);
    }
  }

  const valueClass = styles["value"];
  const body = editing ? (
    <input
      ref={editInput}
      className={`${valueClass} ${styles["input"]}`}
      data-mono={mono ? "" : undefined}
      data-compact={compact ? "" : undefined}
      inputMode="numeric"
      aria-label={label ?? caption}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => finish(true, false)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Escape") {
          // Stop the Enter keypress from activating the button focus is about to return to.
          e.preventDefault();
          finish(e.key === "Enter", true);
        }
      }}
      size={Math.max(draft.length, 3)}
    />
  ) : (
    <span ref={valueRef} className={valueClass} data-mono={mono ? "" : undefined} data-compact={compact ? "" : undefined}>
      {subscribe ? null : value}
    </span>
  );
  const captionEl = <span className={styles["caption"]}>{caption}</span>;
  const style = minWidth === undefined ? undefined : { minWidth };

  if (onCaptionClick) {
    let valuePart;
    if (!interactive) {
      valuePart = <div className={styles["valueSlot"]}>{body}</div>;
    } else if (editing) {
      valuePart = <div className={styles["valueSlot"]}>{body}</div>;
    } else {
      valuePart = (
        <button
          ref={buttonRef}
          type="button"
          className={styles["valueSlot"]}
          aria-label={label}
          onClick={() => {
            onActivate?.();
            if (onEdit) {
              setDraft(value);
              setEditing(true);
            }
          }}
          onKeyDown={onKeyDown}
        >
          {body}
        </button>
      );
    }
    return (
      <>
        <span className={styles["rule"]} aria-hidden="true" />
        <div className={styles["cell"]} data-interactive="" style={style} data-cell={id}>
          {valuePart}
          <button type="button" className={styles["captionButton"]} aria-label={captionLabel} onClick={onCaptionClick}>
            {caption}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <span className={styles["rule"]} aria-hidden="true" />
      {interactive ? (
        <div className={styles["cell"]} data-interactive="" style={style} data-cell={id}>
          {editing ? (
            <div className={styles["button"]}>
              {body}
              {captionEl}
            </div>
          ) : (
            <button
              ref={buttonRef}
              type="button"
              className={styles["button"]}
              aria-label={label}
              onClick={() => {
                onActivate?.();
                if (onEdit) {
                  setDraft(value);
                  setEditing(true);
                }
              }}
              onKeyDown={onKeyDown}
            >
              {body}
              {captionEl}
            </button>
          )}
        </div>
      ) : (
        <div className={styles["cell"]} style={style} data-cell={id} aria-live="off">
          {body}
          {captionEl}
        </div>
      )}
    </>
  );
}
