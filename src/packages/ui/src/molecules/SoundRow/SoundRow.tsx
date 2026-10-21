import { forwardRef, type ComponentPropsWithoutRef, type DragEvent, type KeyboardEvent } from "react";
import { Icon } from "../../atoms/Icon";
import { IconButton } from "../../atoms/IconButton";
import styles from "./SoundRow.module.css";

/** Drag payload identifying a library sound. Mirrors the model's `SoundRef`; kept local so `@phyllo/ui` stays model-free. */
export interface SoundRef {
  source: "bank" | "synth" | "soundfont" | "sample";
  name: string;
  bank?: string;
}

/** `dataTransfer` type carrying the JSON-encoded `SoundRef`. Drop targets read this. */
export const SOUND_DRAG_MIME = "application/x-phyllo-sound";

export interface SoundRowProps extends Omit<ComponentPropsWithoutRef<"li">, "children"> {
  /** "bd", "gm_epiano1", "vox" */
  code: string;
  /** "Bass drum" */
  friendly: string;
  /** Guided: friendly name first. Pro: code first. */
  mode: "guided" | "pro";
  /** Hovered or selected row: raised background. */
  active?: boolean;
  /** Currently auditioning: the preview glyph becomes stop. */
  previewing?: boolean;
  /** Preview button, and Space while the row has focus. */
  onPreview: () => void;
  /** Serialised into `dataTransfer` under `SOUND_DRAG_MIME` when the row is dragged. */
  dragData: SoundRef;
  /** Enter while the row has focus: add to the selected track (the keyboard alternative to dragging). */
  onInsert?: () => void;
}

/**
 * One library sound: audition it, read its names, drag it into the project. Renders an `<li>`, so place it
 * inside a `<ul>`/`<ol>`. The row is focusable (Space previews, Enter inserts) and natively draggable.
 */
export const SoundRow = forwardRef<HTMLLIElement, SoundRowProps>(function SoundRow(
  { code, friendly, mode, active = false, previewing = false, onPreview, dragData, onInsert, className, onDragStart, onKeyDown, ...rest },
  ref,
) {
  const classes = className ? `${styles["row"]} ${className}` : styles["row"];
  const guided = mode === "guided";

  function handleDragStart(event: DragEvent<HTMLLIElement>) {
    onDragStart?.(event);
    if (event.defaultPrevented) return;
    event.dataTransfer.setData(SOUND_DRAG_MIME, JSON.stringify(dragData));
    event.dataTransfer.setData("text/plain", dragData.name);
    event.dataTransfer.effectAllowed = "copy";
  }

  function handleKeyDown(event: KeyboardEvent<HTMLLIElement>) {
    onKeyDown?.(event);
    // Only when the row itself has focus: Space/Enter on the preview button keep their native meaning.
    if (event.defaultPrevented || event.target !== event.currentTarget) return;
    if (event.key === " ") {
      event.preventDefault();
      onPreview();
    } else if (event.key === "Enter" && onInsert) {
      event.preventDefault();
      onInsert();
    }
  }

  const primary = guided ? friendly : code;
  const secondary = guided ? code : friendly;

  return (
    // The row is draggable and takes Space/Enter as the non-drag alternative, so it is deliberately focusable.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <li
      ref={ref}
      className={classes}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      draggable
      aria-roledescription="draggable sound"
      data-active={active ? "" : undefined}
      data-mode={mode}
      onDragStart={handleDragStart}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      <IconButton
        icon={previewing ? "stop" : "play"}
        label={previewing ? `Stop preview of ${friendly}` : `Preview ${friendly}`}
        size={26}
        shape="circle"
        onClick={onPreview}
        data-previewing={previewing ? "" : undefined}
      />
      <span className={styles["labels"]}>
        <span className={styles["primary"]} data-code={guided ? undefined : ""}>
          {primary}
        </span>
        <span className={styles["secondary"]} data-code={guided ? "" : undefined}>
          {secondary}
        </span>
      </span>
      <Icon name="drag" size={14} className={styles["handle"]} />
    </li>
  );
});
