import { forwardRef, type ComponentPropsWithoutRef } from "react";
import styles from "./Icon.module.css";
import { ICON_PATHS, SOLID_ICONS, type IconName } from "./icons";

export type IconSize = 10 | 12 | 14 | 16 | 18 | 20;

export interface IconProps extends Omit<ComponentPropsWithoutRef<"svg">, "name"> {
  name: IconName;
  /** Rendered size in px. Default 16. */
  size?: IconSize;
  /** Fill the shape (star favorite-on). Play/pause/stop/record/drag are always solid. */
  filled?: boolean;
  /** Makes the icon meaningful: `role="img"` plus a `<title>`. Without it the icon is `aria-hidden`. */
  title?: string;
}

/** The only way to draw an icon. Inherits `currentColor`; the parent control carries the accessible name. */
export const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
  { name, size = 16, filled = false, title, className, ...rest },
  ref,
) {
  const solid = SOLID_ICONS.has(name);
  const fill = solid || filled ? "currentColor" : "none";
  const a11y = title ? { role: "img" as const } : { "aria-hidden": true as const };

  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={solid ? "none" : "currentColor"}
      strokeWidth={size <= 14 ? 2 : 1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...a11y}
      {...rest}
      className={className ? `${styles["icon"]} ${className}` : styles["icon"]}
    >
      {title ? <title>{title}</title> : null}
      <path d={ICON_PATHS[name]} />
    </svg>
  );
});
