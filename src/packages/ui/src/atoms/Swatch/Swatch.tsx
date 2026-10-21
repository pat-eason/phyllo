import { forwardRef, type ComponentPropsWithoutRef, type CSSProperties, type MouseEvent } from "react";
import styles from "./Swatch.module.css";

export interface SwatchProps
  extends Omit<ComponentPropsWithoutRef<"button">, "color" | "onSelect" | "children" | "role" | "aria-checked"> {
  /** One CSS color, or `[darkShade, lightShade]` drawn split diagonally (accent picker). */
  color: string | [string, string];
  selected: boolean;
  /** Called when the swatch is chosen (click, Space or Enter). */
  onSelect: () => void;
  /** Accessible name; also the visible caption when `showLabel` is set. */
  label: string;
  /** 30 compact, 40 in Settings. Default 30. */
  size?: 30 | 40;
  /** Caption under the swatch (Settings). */
  showLabel?: boolean;
}

/**
 * A selectable color sample: `role="radio"` button.
 *
 * Put several inside a `role="radiogroup"`. The parent owns arrow-key movement: give the checked
 * swatch (or the first one when none is checked) `tabIndex={0}` and the rest `tabIndex={-1}`, and
 * move focus/selection from the group's `onKeyDown`. Props and ref reach the button, so
 * `ref.current.focus()` works.
 */
export const Swatch = forwardRef<HTMLButtonElement, SwatchProps>(function Swatch(
  { color, selected, onSelect, label, size = 30, showLabel = false, className, onClick, ...rest },
  ref,
) {
  const background = Array.isArray(color) ? `linear-gradient(135deg, ${color[0]} 0 50%, ${color[1]} 50% 100%)` : color;
  const classes = className ? `${styles["swatch"]} ${className}` : styles["swatch"];

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onClick?.(event);
    if (!event.defaultPrevented) onSelect();
  }

  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={showLabel ? undefined : label}
      className={classes}
      data-size={size}
      data-labelled={showLabel ? "" : undefined}
      data-selected={selected ? "" : undefined}
      onClick={handleClick}
      {...rest}
    >
      <span className={styles["disc"]} style={{ background } as CSSProperties} aria-hidden="true" />
      {showLabel ? <span className={styles["caption"]}>{label}</span> : null}
    </button>
  );
});
