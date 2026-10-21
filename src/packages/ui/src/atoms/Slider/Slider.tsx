import { forwardRef, type CSSProperties, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import styles from "./Slider.module.css";

export interface SliderProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "min" | "max" | "step" | "size" | "width" | "className" | "type" | "children"
> {
  value: number;
  /** Receives the new value on every input event (live), not the event. */
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Accessible name (the slider has no visible label of its own). */
  label: string;
  /**
   * Spoken value → `aria-valuetext`, e.g. "Medium" for tile size 3 or "17%" for a 0 to 1 feel slider. A string is used
   * as-is (the parent formats it); a function gets the current value. Without it screen readers read the raw number.
   */
  valueText?: string | ((value: number) => string);
  /** Track width in px. Default 120. */
  width?: number;
  /** Decorative detents drawn on the track (tile size 1 to 5). They do not change stepping. */
  marks?: number[];
  /** Small glyph before the track (smallest end), e.g. a grid `Icon`. */
  startGlyph?: ReactNode;
  /** Glyph after the track (largest end). */
  endGlyph?: ReactNode;
  /** Applied to the outer wrapper. All other native props go to the range `<input>`. */
  className?: string;
}

const DEFAULT_WIDTH = 120;

function decimalsOf(step: number): number {
  const text = String(step);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

function clampToStep(raw: number, min: number, max: number, step: number): number {
  const stepped = min + Math.round((raw - min) / step) * step;
  const clamped = Math.min(max, Math.max(min, stepped));
  return Number(clamped.toFixed(decimalsOf(step)));
}

/** Fraction (0 to 1) of the way from `min` to `max`. */
function fractionOf(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/**
 * Horizontal value slider on a native `<input type="range">`. Arrow keys step, PageUp/PageDown move 10% of
 * the range, Home/End jump to the ends. Emits while dragging, not only on release.
 */
export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  { value, onChange, min = 0, max = 1, step = 0.01, label, valueText, width = DEFAULT_WIDTH, marks, startGlyph, endGlyph, className, onKeyDown, disabled, ...rest },
  ref,
) {
  const fraction = fractionOf(value, min, max);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented || disabled) return;
    const page = (max - min) / 10;
    let next: number | undefined;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = value + step;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = value - step;
        break;
      case "PageUp":
        next = value + page;
        break;
      case "PageDown":
        next = value - page;
        break;
      case "Home":
        next = min;
        break;
      case "End":
        next = max;
        break;
      default:
        return;
    }
    // Handled here so the behaviour is identical in every webview; the native handler would do the same.
    event.preventDefault();
    const clamped = clampToStep(next, min, max, step);
    if (clamped !== value) onChange(clamped);
  }

  const classes = [styles["root"], disabled && styles["disabled"], className].filter(Boolean).join(" ");
  const controlStyle = { width, "--ph-slider-fraction": fraction } as CSSProperties;

  return (
    <div className={classes}>
      {startGlyph ? <span className={styles["glyph"]}>{startGlyph}</span> : null}
      <div className={styles["control"]} style={controlStyle}>
        <input
          {...rest}
          ref={ref}
          type="range"
          className={styles["input"]}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-label={label}
          aria-valuetext={typeof valueText === "function" ? valueText(value) : valueText}
          onChange={(event) => onChange(Number(event.target.value))}
          onKeyDown={handleKeyDown}
        />
        {marks?.map((mark) => (
          <span
            key={mark}
            aria-hidden="true"
            className={styles["mark"]}
            style={{ "--ph-slider-mark": fractionOf(mark, min, max) } as CSSProperties}
          />
        ))}
      </div>
      {endGlyph ? <span className={styles["glyph"]}>{endGlyph}</span> : null}
    </div>
  );
});
