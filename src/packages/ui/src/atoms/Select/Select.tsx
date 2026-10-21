import { forwardRef, useId, type ForwardedRef, type ReactElement, type SelectHTMLAttributes } from "react";
import { Icon } from "../Icon";
import styles from "./Select.module.css";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Shown as the option's tooltip; native options cannot render rich content. */
  description?: string;
}

export interface SelectProps<T extends string> extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange" | "size" | "className" | "children"> {
  value: T;
  options: SelectOption<T>[];
  /** Receives the chosen option's value, not the event. */
  onChange: (value: T) => void;
  /** Accessible name. `top` shows it above, `inline` inside the box in muted text ("Snap  1 bar"), `hidden` visually hides it. */
  label: string;
  labelPosition?: "top" | "inline" | "hidden";
  /** Value text in JetBrains Mono (sound picker: `s("sawtooth")`). */
  mono?: boolean;
  /** 32 px (`sm`) or 38 px (`md`). */
  size?: "sm" | "md";
  /** Minimum width of the box, in px. */
  minWidth?: number;
  /** Applied to the outer wrapper. All other native props go to the `<select>`. */
  className?: string;
}

function SelectInner<T extends string>(
  {
    value,
    options,
    onChange,
    label,
    labelPosition = "hidden",
    mono = false,
    size = "md",
    minWidth,
    className,
    id,
    disabled,
    ...rest
  }: SelectProps<T>,
  ref: ForwardedRef<HTMLSelectElement>,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const inline = labelPosition === "inline";

  const classes = [styles["root"], className].filter(Boolean).join(" ");
  const boxClasses = [styles["box"], styles[size], mono && styles["mono"], disabled && styles["disabled"]].filter(Boolean).join(" ");
  const labelClass = labelPosition === "top" ? styles["label"] : inline ? styles["inlineLabel"] : styles["visuallyHidden"];

  const labelElement = (
    <label htmlFor={selectId} className={labelClass}>
      {label}
    </label>
  );

  return (
    <div className={classes}>
      {inline ? null : labelElement}
      <div className={boxClasses} style={minWidth === undefined ? undefined : { minWidth }}>
        {inline ? labelElement : null}
        <select
          {...rest}
          ref={ref}
          id={selectId}
          className={styles["select"]}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            const chosen = options.find((option) => option.value === event.target.value);
            if (chosen) onChange(chosen.value);
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} title={option.description}>
              {option.label}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" size={14} className={styles["chevron"]} />
      </div>
    </div>
  );
}

/** Styled native `<select>`: reliable keyboard and screen-reader behaviour in WKWebView and WebView2. */
export const Select = forwardRef(SelectInner) as <T extends string>(
  props: SelectProps<T> & { ref?: ForwardedRef<HTMLSelectElement> },
) => ReactElement;
