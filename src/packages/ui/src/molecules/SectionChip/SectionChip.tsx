import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent } from "react";
import styles from "./SectionChip.module.css";

export interface SectionChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "onSelect"> {
  /** "Groove" */
  name: string;
  /** First bar of the section (1-based), e.g. 9. */
  startBar: number;
  /** Last bar of the section, e.g. 16. */
  endBar: number;
  /** The playhead is inside this section: inverted chip. */
  current: boolean;
  /** Click: select the section's bars (or loop it, the organism decides). */
  onSelect?: () => void;
  /** Double-click the name (or F2) to rename in place; Enter commits, Escape cancels. */
  onRename?: (name: string) => void;
}

/**
 * Ruler label naming a song section and showing which one is playing. Positioned by the ruler
 * (left/width as a percentage of the timeline) through `style`; the ruler also insets each slot by 2 px
 * so neighbours never touch (the chip fills whatever box it is given).
 */
export const SectionChip = forwardRef<HTMLButtonElement, SectionChipProps>(function SectionChip(
  { name, startBar, endBar, current, onSelect, onRename, className, onClick, onDoubleClick, onKeyDown, ...rest },
  ref,
) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const refocus = useRef(false);
  const classes = className ? `${styles["chip"]} ${className}` : styles["chip"];
  const range = startBar === endBar ? String(startBar) : `${startBar}–${endBar}`;
  const spoken = startBar === endBar ? `bar ${startBar}` : `bars ${startBar} to ${endBar}`;

  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    } else if (refocus.current) {
      refocus.current = false;
      button.current?.focus();
    }
  }, [editing]);

  function startEditing() {
    if (!onRename) return;
    setDraft(name);
    setEditing(true);
  }

  /** Ends the edit; `keepFocus` hands focus back to the chip (Enter/Escape, not Tab-away). */
  function finish(save: boolean, keepFocus: boolean) {
    refocus.current = keepFocus;
    setEditing(false);
    const next = draft.trim();
    if (save && next !== "" && next !== name) onRename?.(next);
  }

  if (editing) {
    return (
      <div className={classes} data-current={current ? "" : undefined} data-editing="" style={rest.style}>
        <input
          ref={input}
          className={styles["input"]}
          aria-label={`Rename section ${name}`}
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
          size={Math.max(draft.length, 4)}
        />
        <span className={styles["range"]}>{range}</span>
      </div>
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    onKeyDown?.(event);
    if (!event.defaultPrevented && event.key === "F2") startEditing();
  }

  return (
    <button
      ref={(node) => {
        button.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      type="button"
      className={classes}
      aria-current={current ? "true" : undefined}
      aria-label={`${name}, ${spoken}`}
      data-current={current ? "" : undefined}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onSelect?.();
      }}
      onDoubleClick={(event) => {
        onDoubleClick?.(event);
        if (!event.defaultPrevented) startEditing();
      }}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      <span className={styles["name"]}>{name}</span>
      <span className={styles["range"]}>{range}</span>
    </button>
  );
});
