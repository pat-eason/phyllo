import { forwardRef, useId, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "../Icon";
import styles from "./TextField.module.css";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "onChange" | "value" | "className"> {
  value: string;
  /** Receives the new value, not the event. */
  onChange: (value: string) => void;
  /** Accessible name: shown above the field (`labelPosition="top"`) or visually hidden. */
  label: string;
  labelPosition?: "top" | "hidden";
  variant?: "plain" | "search" | "code";
  /** 36 px (`md`), 42 px (`lg`) or 40 px (`40`, the Export / Onboarding / Library forms). */
  size?: "md" | "lg" | 40;
  /** Red border plus `aria-invalid`; the description turns red and reads as the error message. */
  invalid?: boolean;
  /** Help text or error message under the field, wired up through `aria-describedby`. */
  description?: string;
  /** Sits inside the right edge: a `Kbd` hint such as ⌘K, or a small `Button`. */
  trailing?: ReactNode;
  /** Applied to the outer wrapper. All other native props go to the `<input>`. */
  className?: string;
}

/**
 * Single-line text input. `search` adds a leading magnifier and clears on Esc; `code` is monospace with an
 * accent border for live pattern editing. Background defaults to `--ph-bg`; set `--ph-field-bg` on a parent
 * (e.g. `var(--ph-panel)`) when the field sits directly on the app ground.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  {
    value,
    onChange,
    label,
    labelPosition = "hidden",
    variant = "plain",
    size = "md",
    invalid = false,
    description,
    trailing,
    className,
    id,
    type,
    onKeyDown,
    disabled,
    spellCheck,
    autoCapitalize,
    "aria-describedby": describedByProp,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const describedBy = [describedByProp, descriptionId].filter(Boolean).join(" ") || undefined;
  const isCode = variant === "code";
  const isSearch = variant === "search";

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (isSearch && event.key === "Escape" && value !== "") {
      event.preventDefault();
      onChange("");
    }
  }

  const classes = [styles["root"], className].filter(Boolean).join(" ");
  const boxClasses = [styles["box"], styles[size === 40 ? "s40" : size], isCode && styles["code"], invalid && styles["invalid"], disabled && styles["disabled"]]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <label htmlFor={inputId} className={labelPosition === "top" ? styles["label"] : styles["visuallyHidden"]}>
        {label}
      </label>
      <div className={boxClasses}>
        {isSearch ? <Icon name="search" size={16} className={styles["lead"]} /> : null}
        <input
          {...rest}
          ref={ref}
          id={inputId}
          className={styles["input"]}
          type={isSearch ? "search" : (type ?? "text")}
          value={value}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          spellCheck={isCode ? false : spellCheck}
          autoCapitalize={isCode ? "off" : autoCapitalize}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        {trailing ? <span className={styles["trailing"]}>{trailing}</span> : null}
      </div>
      {description ? (
        <p id={descriptionId} className={invalid ? `${styles["description"]} ${styles["descriptionInvalid"]}` : styles["description"]}>
          {description}
        </p>
      ) : null}
    </div>
  );
});
