import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Icon } from "../../atoms/Icon";
import styles from "./SuggestionButton.module.css";

export interface SuggestionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "onToggle"> {
  /** Plain-language idea, e.g. "Bouncier". */
  label: string;
  /** The modifier it writes, e.g. `.swingBy(1/6, 4)`. Also the native tooltip. */
  code: string;
  /** Already on the selected track: pressed look (accent border + soft fill, check before the label). */
  applied: boolean;
  /** Receives the next applied state (`!applied`). */
  onToggle: (applied: boolean) => void;
}

/**
 * "Try one" card: a one-click musical idea that adds (or removes) a modifier and shows the code it writes.
 * `<button aria-pressed>`; accessible name "Bouncier, adds .swingBy(1/6, 4)" unless `aria-label` is given.
 */
export const SuggestionButton = forwardRef<HTMLButtonElement, SuggestionButtonProps>(function SuggestionButton(
  { label, code, applied, onToggle, className, onClick, type = "button", title, "aria-label": ariaLabel, ...rest },
  ref,
) {
  const classes = [styles["suggestion"], className].filter(Boolean).join(" ");

  return (
    <button
      ref={ref}
      type={type}
      title={title ?? code}
      aria-pressed={applied}
      aria-label={ariaLabel ?? `${label}, adds ${code}`}
      className={classes}
      data-applied={applied ? "" : undefined}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onToggle(!applied);
      }}
      {...rest}
    >
      <span className={styles["label"]}>
        {applied ? <Icon name="check" size={12} className={styles["check"]} /> : null}
        {label}
      </span>
      <span className={styles["code"]}>{code}</span>
    </button>
  );
});
