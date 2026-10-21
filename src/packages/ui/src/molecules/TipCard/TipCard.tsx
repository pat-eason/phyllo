import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { Button } from "../../atoms/Button";
import { Icon } from "../../atoms/Icon";
import styles from "./TipCard.module.css";

export interface TipCardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Current Guided step, 1-based. */
  step: number;
  /** Total steps. */
  total: number;
  title: string;
  /** One sentence; wrap control names in `<strong>` to set them in `--ph-text`. */
  body: ReactNode;
  /** Primary action label. Default "Show me". The primary button renders only when `onPrimary` is given. */
  primaryLabel?: string;
  onPrimary?: () => void;
  /** Secondary action label. Default "Hide tips". */
  dismissLabel?: string;
  onDismiss: () => void;
  /** Smaller variant (Kit): tighter padding, 36 px icon tile, no progress bar. */
  compact?: boolean;
}

/**
 * Guided-mode tip: step eyebrow with progress, title, one-sentence body and two actions. Pure presentation; the
 * TipCoach decides when it shows. Text changes are announced politely through the live region on the text column.
 */
export const TipCard = forwardRef<HTMLElement, TipCardProps>(function TipCard(
  { step, total, title, body, primaryLabel = "Show me", onPrimary, dismissLabel = "Hide tips", onDismiss, compact = false, className, ...rest },
  ref,
) {
  const classes = className ? `${styles["card"]} ${className}` : styles["card"];
  const stepText = `Step ${step} of ${total}`;
  const buttonSize = compact ? "sm" : "md";

  return (
    <section ref={ref} aria-label="Tip" className={classes} data-compact={compact ? "" : undefined} {...rest}>
      <div className={styles["icon"]} aria-hidden="true">
        <Icon name="tip" size={compact ? 18 : 20} />
      </div>
      <div className={styles["text"]} aria-live="polite">
        <div className={styles["eyebrowRow"]}>
          <span className={styles["eyebrow"]}>{stepText}</span>
          {compact ? null : (
            <div
              className={styles["progress"]}
              role="progressbar"
              aria-label={stepText}
              aria-valuemin={1}
              aria-valuemax={total}
              aria-valuenow={step}
            >
              {Array.from({ length: total }, (_, index) => (
                <span key={index} className={styles["segment"]} data-filled={index < step ? "" : undefined} />
              ))}
            </div>
          )}
        </div>
        <span className={styles["title"]}>{title}</span>
        <span className={styles["body"]}>{body}</span>
      </div>
      <div className={styles["actions"]}>
        <Button variant="secondary" size={buttonSize} onClick={onDismiss}>
          {dismissLabel}
        </Button>
        {onPrimary ? (
          <Button variant="primary" size={buttonSize} onClick={onPrimary}>
            {primaryLabel}
          </Button>
        ) : null}
      </div>
    </section>
  );
});
