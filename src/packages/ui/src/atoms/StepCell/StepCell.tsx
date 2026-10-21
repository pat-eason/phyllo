import { forwardRef, type ComponentPropsWithoutRef, type CSSProperties, type MouseEvent } from "react";
import styles from "./StepCell.module.css";

export interface StepCellProps
  extends Omit<ComponentPropsWithoutRef<"button">, "onChange" | "color" | "children" | "aria-pressed"> {
  on: boolean;
  /** Called with the new state (click, Space or Enter). */
  onChange: (on: boolean) => void;
  /** Track / row color when on (any CSS color, e.g. `var(--ph-track-1)`). */
  color: string;
  /** First step of a beat: tinted `--ph-step-beat` when off. */
  beatStart?: boolean;
  /** 0-based step index; the accessible name says `index + 1`. */
  index: number;
  /** Row name, e.g. "Kick" → aria-label "Kick step 5". */
  rowLabel: string;
  /** The playhead is on this step: 2 px inner ring in `--ph-text`. */
  playing?: boolean;
  /** 0–1. When on, the fill opacity is 0.45 + 0.55·velocity. Omit for full strength. */
  velocity?: number;
  /** The cell's row is the selected row: off cells pick up an accent edge. */
  rowSelected?: boolean;
  /** Euclid preview: drawn like a cell but not interactive or focusable. */
  readOnly?: boolean;
}

/**
 * One sequencer step: `<button aria-pressed>`. Paint mode (drag across cells) is the row's job; it can use
 * the native `onPointerDown` / `onPointerEnter` props, which pass straight through. Calling
 * `preventDefault()` in `onClick` skips the toggle.
 */
export const StepCell = forwardRef<HTMLButtonElement, StepCellProps>(function StepCell(
  {
    on,
    onChange,
    color,
    beatStart = false,
    index,
    rowLabel,
    playing = false,
    velocity,
    rowSelected = false,
    readOnly = false,
    disabled,
    className,
    style,
    onClick,
    "aria-label": ariaLabel,
    ...rest
  },
  ref,
) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onClick?.(event);
    if (!event.defaultPrevented && !readOnly) onChange(!on);
  }

  const alpha = velocity === undefined ? 1 : 0.45 + 0.55 * Math.min(1, Math.max(0, velocity));
  const classes = [styles["cell"], className].filter(Boolean).join(" ");
  const cellStyle = { ...style, "--step-color": color, "--step-alpha": alpha.toFixed(3) } as CSSProperties;

  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={on}
      aria-label={ariaLabel ?? `${rowLabel} step ${index + 1}`}
      disabled={disabled || readOnly}
      className={classes}
      style={cellStyle}
      data-on={on ? "" : undefined}
      data-beat={beatStart ? "" : undefined}
      data-playing={playing ? "" : undefined}
      data-row-selected={rowSelected ? "" : undefined}
      data-readonly={readOnly ? "" : undefined}
      onClick={handleClick}
      {...rest}
    />
  );
});
