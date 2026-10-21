import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type Ref,
} from "react";
import { Icon, type IconName } from "../Icon";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "dashed";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Default `secondary`. One `primary` per region at most. */
  variant?: ButtonVariant;
  /** 32 / 38 / 44 px high. Default `md`. */
  size?: ButtonSize;
  iconStart?: IconName;
  iconEnd?: IconName;
  /** `a` renders a link (navigation: Export, Continue) and needs `href`. Default `button`. */
  as?: "button" | "a";
  href?: string;
  /** Shows a spinner, keeps the width and sets `aria-busy`. Clicks are ignored while loading. */
  loading?: boolean;
  /** `inverse` (primary only) fills with `--ph-text` so the title-bar Export doesn't compete with the play key. */
  tone?: "accent" | "inverse";
}

const ICON_SIZE = { sm: 12, md: 14, lg: 16 } as const;

/**
 * Text button. Native `<button type="button">` (or `<a>` with `as="a"`), never a div.
 * Disabled buttons use the native `disabled` attribute; disabled links get `aria-disabled` and leave the tab order.
 */
export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    iconStart,
    iconEnd,
    as = "button",
    href,
    loading = false,
    tone = "accent",
    disabled = false,
    className,
    children,
    onClick,
    type = "button",
    ...rest
  },
  ref,
) {
  const classes = className ? `${styles["button"]} ${className}` : styles["button"];
  const iconSize = ICON_SIZE[size];

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (loading || disabled) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  const content = (
    <>
      <span className={styles["content"]}>
        {iconStart ? <Icon name={iconStart} size={iconSize} /> : null}
        {children}
        {iconEnd ? <Icon name={iconEnd} size={iconSize} /> : null}
      </span>
      {loading ? <span className={styles["spinner"]} aria-hidden="true" /> : null}
    </>
  );

  const shared = {
    className: classes,
    "data-variant": variant,
    "data-size": size,
    "data-tone": variant === "primary" ? tone : undefined,
    "data-loading": loading ? "" : undefined,
    "aria-busy": loading ? true : undefined,
  } as const;

  if (as === "a") {
    return (
      <a
        ref={ref as Ref<HTMLAnchorElement>}
        href={href}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : undefined}
        onClick={handleClick as unknown as AnchorHTMLAttributes<HTMLAnchorElement>["onClick"]}
        {...shared}
        {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      type={type}
      disabled={disabled}
      onClick={handleClick}
      {...shared}
      {...rest}
    >
      {content}
    </button>
  );
});
