import { forwardRef, useEffect, useRef, useState, type ComponentPropsWithoutRef, type KeyboardEvent } from "react";
import { Button } from "../../atoms/Button";
import { IconButton } from "../../atoms/IconButton";
import { Logo } from "../../atoms/Logo";
import styles from "./Toast.module.css";

export const DEFAULT_TOAST_DURATION = 6000;

export interface ToastProps extends Omit<ComponentPropsWithoutRef<"div">, "title"> {
  /** "Export finished" */
  title: string;
  /** "Untitled Groove.wav · 1:08 · 24-bit" */
  detail?: string;
  /** Single action, e.g. "Reveal". */
  action?: { label: string; onClick: () => void };
  /** `error` swaps the logo tile for a `--ph-rec` icon tile and announces as an alert. Default `neutral`. */
  tone?: "neutral" | "error";
  /** Called on timeout, on Escape and on the close button. The queue at the app root removes the toast. */
  onDismiss: () => void;
  /** Auto-dismiss delay in ms. Default 6000; `0` = sticky (errors). Paused while hovered or focused. */
  duration?: number;
  /** Accessible name of the close button, shown for sticky toasts only. Default "Dismiss". */
  dismissLabel?: string;
}

/**
 * In-app mirror of a native notification. Presentational: the queue (max 3, newest on top, top-right
 * inset 20 px) lives at the app root, and the app shows a Toast only while its window is focused.
 * `role="status"` (`role="alert"` for errors). Escape dismisses it while focus is inside.
 */
export const Toast = forwardRef<HTMLDivElement, ToastProps>(function Toast(
  {
    title,
    detail,
    action,
    tone = "neutral",
    onDismiss,
    duration = DEFAULT_TOAST_DURATION,
    dismissLabel = "Dismiss",
    className,
    onKeyDown,
    onMouseEnter,
    onMouseLeave,
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const sticky = duration <= 0;
  const remaining = useRef(duration);
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  });

  useEffect(() => {
    remaining.current = duration;
  }, [duration]);

  useEffect(() => {
    if (sticky || paused) return undefined;
    const startedAt = Date.now();
    const timer = setTimeout(() => dismissRef.current(), Math.max(remaining.current, 0));
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt;
    };
  }, [sticky, paused, duration]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event);
    if (!event.defaultPrevented && event.key === "Escape") onDismiss();
  }

  const classes = className ? `${styles["toast"]} ${className}` : styles["toast"];
  const isError = tone === "error";

  return (
    <div
      ref={ref}
      role={isError ? "alert" : "status"}
      className={classes}
      data-tone={tone}
      onKeyDown={handleKeyDown}
      onMouseEnter={(e) => {
        onMouseEnter?.(e);
        setHovered(true);
      }}
      onMouseLeave={(e) => {
        onMouseLeave?.(e);
        setHovered(false);
      }}
      onFocus={(e) => {
        onFocus?.(e);
        setFocused(true);
      }}
      onBlur={(e) => {
        onBlur?.(e);
        setFocused(false);
      }}
      {...rest}
    >
      {isError ? (
        <svg className={styles["errorTile"]} width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect width="24" height="24" rx="6" fill="var(--ph-rec)" />
          <path d="M12 6.5v7M12 16.6v.9" stroke="var(--ph-rec-ink)" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        </svg>
      ) : (
        <Logo className={styles["tile"]} size={30} wordmark={false} tile aria-hidden="true" />
      )}
      <div className={styles["text"]}>
        <span className={styles["title"]}>{title}</span>
        {detail ? <span className={styles["detail"]}>{detail}</span> : null}
      </div>
      {action ? (
        <Button className={styles["action"]} variant="secondary" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
      {sticky ? <IconButton icon="close" label={dismissLabel} size={26} variant="plain" onClick={onDismiss} /> : null}
    </div>
  );
});
