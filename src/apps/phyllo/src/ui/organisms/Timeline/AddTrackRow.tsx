import type { TrackKind } from "@phyllo/model";
import { Icon } from "@phyllo/ui";
import { useEffect, useId, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent } from "react";
import { isSoundDrag, readSoundRef } from "./soundDrop";
import styles from "./Timeline.module.css";
import type { TimelineActions } from "./useTimelineActions";

const KINDS: readonly { kind: TrackKind; label: string; hint: string }[] = [
  { kind: "drum", label: "Drums", hint: "Drum machine pattern" },
  { kind: "melodic", label: "Melodic", hint: "Synth notes" },
  { kind: "chord", label: "Chords", hint: "Chord progression" },
  { kind: "sample", label: "Sample", hint: "Your own sound file" },
  { kind: "code", label: "Code", hint: "Free Strudel code" },
];

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
export function AddTrackRow({ mode, dropActive, actions, onDropActiveChange }: AddTrackRowProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const hint =
    mode === "guided" ? "Drop a sound here, or click to add a track" : "Drop to add · ⇧ to add as a layer on the selected track";

  useEffect(() => {
    if (!open) return;
    items.current[0]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && root.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) button.current?.focus();
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = items.current.findIndex((item) => item === document.activeElement);
    const focusAt = (i: number) => items.current[(i + KINDS.length) % KINDS.length]?.focus();
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
        focusAt(KINDS.length - 1);
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
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles["addLabel"]}>
          <Icon name="plus" size={14} />
          Add track
        </span>
        <span className={styles["dropHint"]}>{hint}</span>
      </button>
      {open ? (
        <div id={menuId} role="menu" aria-label="Track kind" className={styles["menu"]} onKeyDown={onMenuKeyDown} tabIndex={-1}>
          {KINDS.map((item, index) => (
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
        </div>
      ) : null}
    </div>
  );
}
