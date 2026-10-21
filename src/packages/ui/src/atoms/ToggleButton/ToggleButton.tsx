import { forwardRef, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import styles from "./ToggleButton.module.css";

export interface ToggleButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  kind: "mute" | "solo" | "custom";
  pressed: boolean;
  /**
   * Called with the next pressed state. The originating click event is passed second so the parent can
   * implement modifier behavior (Alt-click = exclusive solo, Cmd-click = mute all others).
   */
  onChange: (pressed: boolean, event: MouseEvent<HTMLButtonElement>) => void;
  /** Accessible name, e.g. "Mute Kick". */
  label: string;
  /** Glyph. Defaults to "M" for mute and "S" for solo; required in practice for `custom`. */
  children?: ReactNode;
  /** 26 in lanes, 30 in the mixer. Default 26. */
  size?: 26 | 30;
  /** Stretch to the container width (mixer strip). */
  fullWidth?: boolean;
}

const DEFAULT_GLYPH = { mute: "M", solo: "S", custom: null } as const;

/** Small square on/off button, mainly Mute and Solo. Controlled: the visual state follows `pressed`. */
export const ToggleButton = forwardRef<HTMLButtonElement, ToggleButtonProps>(function ToggleButton(
  { kind, pressed, onChange, label, children, size = 26, fullWidth = false, className, onClick, type = "button", ...rest },
  ref,
) {
  const classes = className ? `${styles["toggle"]} ${className}` : styles["toggle"];

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onClick?.(event);
    if (!event.defaultPrevented) onChange(!pressed, event);
  }

  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={pressed}
      aria-label={label}
      className={classes}
      data-kind={kind}
      data-size={size}
      data-pressed={pressed ? "" : undefined}
      data-full-width={fullWidth ? "" : undefined}
      onClick={handleClick}
      {...rest}
    >
      {children ?? DEFAULT_GLYPH[kind]}
    </button>
  );
});
