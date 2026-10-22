import { Icon } from "@phyllo/ui";
import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, DragEvent, KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { isSoundDrag, readSoundRef } from "./soundDrop";
import styles from "./Timeline.module.css";
import { TRACK_KINDS } from "./timelineModel";
import type { TimelineActions } from "./useTimelineActions";

const MENU_GAP = 4;
const MENU_MARGIN = 8;

/** Fixed-position anchor for the menu: opens upward unless the space below is larger, and scrolls if neither fits. */
function menuPlacement(anchor: DOMRect): CSSProperties {
  const above = anchor.top - MENU_MARGIN - MENU_GAP;
  const below = window.innerHeight - anchor.bottom - MENU_MARGIN - MENU_GAP;
  const left = Math.max(MENU_MARGIN, anchor.left + MENU_MARGIN);
  if (above >= below) {
    return {
      left,
      bottom: window.innerHeight - anchor.top + MENU_GAP,
      maxHeight: above,
    };
  }
  return { left, top: anchor.bottom + MENU_GAP, maxHeight: below };
}

export interface AddTrackRowProps {
  mode: "guided" | "pro";
  /** A sound is dragged over the row or the empty space below the lanes. */
  dropActive: boolean;
  actions: TimelineActions;
  onDropActiveChange(active: boolean): void;
}

/**
 * Bottom row: "Add track" opens a menu of track kinds (model `createTrack`); the dashed area accepts library
 * sounds (new track; ⇧ adds a layer to the selected track).
 */
export function AddTrackRow({
  mode,
  dropActive,
  actions,
  onDropActiveChange,
}: AddTrackRowProps) {
  const [placement, setPlacement] = useState<CSSProperties | null>(null);
  const open = placement !== null;
  const menuId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const hint =
    mode === "guided"
      ? "Drop a sound here, or click to add a track"
      : "Drop to add · ⇧ to add as a layer on the selected track";

  useEffect(() => {
    if (!open) return;
    items.current[0]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        (root.current?.contains(event.target) ||
          menu.current?.contains(event.target))
      )
        return;
      setPlacement(null);
    };
    // The menu is fixed-positioned, so any scroll or resize would detach it from the button.
    const dismiss = () => setPlacement(null);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [open]);

  function toggle() {
    if (open) setPlacement(null);
    else if (button.current)
      setPlacement(menuPlacement(button.current.getBoundingClientRect()));
  }

  function close(refocus: boolean) {
    setPlacement(null);
    if (refocus) button.current?.focus();
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = items.current.findIndex(
      (item) => item === document.activeElement,
    );
    const focusAt = (i: number) =>
      items.current[(i + TRACK_KINDS.length) % TRACK_KINDS.length]?.focus();
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(TRACK_KINDS.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
      default:
    }
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!isSoundDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    if (!dropActive) onDropActiveChange(true);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    if (!isSoundDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    onDropActiveChange(false);
    const ref = readSoundRef(event.dataTransfer);
    if (ref) actions.dropSound({ kind: "new" }, ref, event.shiftKey);
  }

  return (
    <div
      ref={root}
      className={styles["addRow"]}
      data-drop={dropActive ? "" : undefined}
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDrop={onDrop}
      data-testid="add-track-row"
    >
      <button
        ref={button}
        type="button"
        className={styles["addButton"]}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={toggle}
      >
        <span className={styles["addLabel"]}>
          <Icon name="plus" size={14} />
          Add track
        </span>
        <span className={styles["dropHint"]}>{hint}</span>
      </button>
      {placement
        ? createPortal(
            <div
              ref={menu}
              id={menuId}
              role="menu"
              aria-label="Track kind"
              className={styles["menu"]}
              style={placement}
              onKeyDown={onMenuKeyDown}
              tabIndex={-1}
            >
              {TRACK_KINDS.map((item, index) => (
                <button
                  key={item.kind}
                  ref={(node) => {
                    items.current[index] = node;
                  }}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  className={styles["menuItem"]}
                  onClick={() => {
                    close(false);
                    actions.addTrack(item.kind);
                  }}
                >
                  <span className={styles["menuLabel"]}>{item.label}</span>
                  <span className={styles["menuHint"]}>{item.hint}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
