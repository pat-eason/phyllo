import { forwardRef, type ButtonHTMLAttributes } from "react";
import styles from "./Switch.module.css";

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "role"> {
  checked: boolean;
  /** Receives the next checked state, not the event. */
  onChange: (checked: boolean) => void;
  /** Accessible name. Ignored when `aria-labelledby` points at visible text. */
  label: string;
  /** `sm` 28x16 (ModifierRow), `md` 44x26 (Settings). Default `md`. */
  size?: "sm" | "md";
}

/** Immediate on/off setting: `<button role="switch" aria-checked>`. Click, Space and Enter toggle. */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, onChange, label, size = "md", className, onClick, type = "button", ...rest },
  ref,
) {
  const classes = className ? `${styles["switch"]} ${className}` : styles["switch"];

  return (
    <button
      ref={ref}
      type={type}
      role="switch"
      aria-checked={checked}
      aria-label={rest["aria-labelledby"] ? undefined : label}
      className={classes}
      data-size={size}
      data-checked={checked ? "" : undefined}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onChange(!checked);
      }}
      {...rest}
    >
      <span className={styles["thumb"]} aria-hidden="true" />
    </button>
  );
});
