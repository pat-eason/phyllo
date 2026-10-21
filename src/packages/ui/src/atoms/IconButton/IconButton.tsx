import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Icon, type IconName, type IconSize } from "../Icon";
import styles from "./IconButton.module.css";

export type IconButtonSize = 26 | 30 | 32 | 38 | 40;

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: IconName;
  /** Required. Becomes `aria-label` and the native tooltip. */
  label: string;
  /** Hit area in px. Default 32. */
  size?: IconButtonSize;
  /** `circle` is for Preview. Default `square`. */
  shape?: "square" | "circle";
  /** `outline` = 1px `--ph-line`, `plain` = no border, `filled` = accent fill. Default `outline`. */
  variant?: "outline" | "plain" | "filled";
  /** Toggle state; sets `aria-pressed`. Leave undefined for a plain action button. */
  pressed?: boolean;
  /** How the pressed state looks: `neutral` raised surface, `accent` soft accent tint for on/off features (metronome). */
  tone?: "neutral" | "accent";
}

const ICON_SIZE: Record<IconButtonSize, IconSize> = { 26: 12, 30: 14, 32: 14, 38: 18, 40: 18 };

/** Square (or circular) button holding only an `Icon`. The accessible name comes from `label`. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, size = 32, shape = "square", variant = "outline", pressed, tone = "neutral", className, type = "button", ...rest },
  ref,
) {
  const classes = className ? `${styles["button"]} ${className}` : styles["button"];

  return (
    <button
      ref={ref}
      type={type}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className={classes}
      data-size={size}
      data-shape={shape}
      data-variant={variant}
      data-tone={tone}
      data-pressed={pressed ? "" : undefined}
      {...rest}
    >
      {/* The Kit's 26 px round Preview button carries a 10 px glyph; other 26 px buttons keep 12. */}
      <Icon name={icon} size={shape === "circle" && size === 26 ? 10 : ICON_SIZE[size]} />
    </button>
  );
});
