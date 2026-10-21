import { forwardRef, useEffect, useRef, type InputHTMLAttributes, type ReactNode } from "react";
import styles from "./Checkbox.module.css";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "checked" | "children"> {
  checked: boolean;
  /** Receives the next checked state, not the event. */
  onChange: (checked: boolean) => void;
  /** Visible label; the whole row is the click target and the text is the accessible name. */
  label: ReactNode;
  /** Partial state ("select all stems"). Set through a ref, mirrors the native `indeterminate` property. */
  indeterminate?: boolean;
}

/**
 * Native `<input type="checkbox">` with accent color, wrapped in a `<label>`.
 * `className` goes on the label (root); the remaining native props and the ref go on the input.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { checked, onChange, label, indeterminate = false, disabled, className, ...rest },
  forwardedRef,
) {
  const innerRef = useRef<HTMLInputElement | null>(null);
  const classes = className ? `${styles["checkbox"]} ${className}` : styles["checkbox"];

  useEffect(() => {
    if (innerRef.current) innerRef.current.indeterminate = indeterminate;
  }, [indeterminate, checked]);

  return (
    <label className={classes} data-disabled={disabled ? "" : undefined}>
      <input
        ref={(node) => {
          innerRef.current = node;
          if (typeof forwardedRef === "function") forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        type="checkbox"
        className={styles["input"]}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        {...rest}
      />
      <span className={styles["label"]}>{label}</span>
    </label>
  );
});
