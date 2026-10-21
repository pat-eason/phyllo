import { forwardRef, type ComponentPropsWithoutRef } from "react";
import styles from "./StatusDot.module.css";

export type StatusDotStatus = "ok" | "busy" | "warn" | "error" | "off";

export interface StatusDotProps extends ComponentPropsWithoutRef<"span"> {
  status: StatusDotStatus;
  /** Visible text next to the dot. Without it, pass `aria-label` so the state is still named. */
  label?: string;
  /** Pill background (`--ph-sel`) with accent text. */
  badge?: boolean;
  /** Busy only: gentle pulse on the dot. Default true; always off under `prefers-reduced-motion`. */
  pulse?: boolean;
}

/** Colored dot plus optional label. Static: organisms map engine/native state to `status`. */
export const StatusDot = forwardRef<HTMLSpanElement, StatusDotProps>(function StatusDot(
  { status, label, badge = false, pulse = true, className, "aria-label": ariaLabel, ...rest },
  ref,
) {
  const classes = className ? `${styles["statusDot"]} ${className}` : styles["statusDot"];
  // With no visible label the wrapper becomes the only thing that can name the state.
  const labelled = label === undefined && ariaLabel !== undefined;

  return (
    <span
      ref={ref}
      className={classes}
      data-status={status}
      data-badge={badge ? "" : undefined}
      role={labelled ? "img" : undefined}
      aria-label={ariaLabel}
      {...rest}
    >
      <span className={styles["dot"]} data-pulse={status === "busy" && pulse ? "" : undefined} aria-hidden="true" />
      {label !== undefined ? <span className={styles["label"]}>{label}</span> : null}
    </span>
  );
});
