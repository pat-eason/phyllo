import { forwardRef, type CSSProperties, type HTMLAttributes, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { Icon } from "../Icon";
import styles from "./Chip.module.css";

export type ChipVariant = "filter" | "tag" | "removable" | "code" | "meta";

export interface ChipProps extends Omit<HTMLAttributes<HTMLElement>, "onClick" | "color" | "children"> {
  variant: ChipVariant;
  children: ReactNode;
  /**
   * Pressed state, exposed as `aria-pressed`. `filter` always has it (the parent decides single vs multi select);
   * `code` only when this is passed (a selectable code chip, e.g. the chosen waveform), otherwise it is a plain action.
   */
  selected?: boolean;
  /** `tag` only: color of the leading dot, from the library's tag palette (any CSS color or `var(--ph-track-n)`). */
  color?: string;
  /** `filter` and `code`. */
  onClick?: () => void;
  /**
   * `removable`: renders the whole chip as a "Remove" button with a trailing x. Backspace/Delete on focus also removes.
   * The chip unmounts when removed, so the parent must move focus (e.g. to the next chip or the filter input) in this
   * callback, otherwise focus falls back to `<body>` and keyboard users lose their place.
   */
  onRemove?: () => void;
  /** `removable`: accessible name. Defaults to `Remove <children>` when children is text. */
  removeLabel?: string;
  /** 22 px (`sm`) or 28 px (`md`) for `filter` and `code`; 22 or 26 px for `removable`. `tag` and `meta` ignore it. */
  size?: "sm" | "md";
  /** `filter`, `code` and `removable` render a `<button>`; this disables it. */
  disabled?: boolean;
}

function textOf(children: ReactNode): string | undefined {
  return typeof children === "string" || typeof children === "number" ? String(children) : undefined;
}

/**
 * Compact label: static (`tag`, `meta`), selectable (`filter`, `code`) or removable. Interactive variants are
 * real buttons; static ones are spans. Native props, `className` and `ref` go to the root element.
 */
export const Chip = forwardRef<HTMLElement, ChipProps>(function Chip(
  { variant, children, selected, color, onClick, onRemove, removeLabel, size = "md", disabled, className, onKeyDown, ...rest },
  ref,
) {
  const classes = [styles["chip"], styles[variant], styles[size], selected && (variant === "filter" || variant === "code") && styles["selected"], className]
    .filter(Boolean)
    .join(" ");

  if (variant === "tag" || variant === "meta") {
    return (
      <span {...rest} ref={ref} className={classes}>
        {variant === "tag" && color ? <span aria-hidden="true" className={styles["dot"]} style={{ "--ph-chip-dot": color } as CSSProperties} /> : null}
        {children}
      </span>
    );
  }

  // Past this point the root is always a <button>; the public ref type stays HTMLElement so span variants share it.
  const buttonRef = ref as Ref<HTMLButtonElement>;

  if (variant === "removable") {
    const text = textOf(children);
    const name = removeLabel ?? (text === undefined ? "Remove" : `Remove ${text}`);

    const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented || disabled) return;
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        onRemove?.();
      }
    };

    return (
      <button
        {...rest}
        ref={buttonRef}
        type="button"
        className={classes}
        disabled={disabled}
        aria-label={name}
        onClick={onRemove}
        onKeyDown={handleKeyDown}
      >
        {children}
        <Icon name="close" size={10} className={styles["remove"]} />
      </button>
    );
  }

  return (
    <button
      {...rest}
      ref={buttonRef}
      type="button"
      className={classes}
      disabled={disabled}
      aria-pressed={variant === "filter" ? (selected ?? false) : variant === "code" ? selected : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {children}
    </button>
  );
});
