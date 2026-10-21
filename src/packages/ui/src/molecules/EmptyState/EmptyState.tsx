import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { Button } from "../../atoms/Button";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps extends Omit<ComponentPropsWithoutRef<"div">, "title"> {
  /** "No grooves match" */
  title: string;
  /** "Try a different word, or remove a tag filter." */
  body?: string;
  /** Optional next step, e.g. "Clear filters" / "New groove". */
  action?: { label: string; onClick: () => void };
  /** Tighter padding (14 px) for small regions such as a sidebar list. */
  compact?: boolean;
}

/** Explains why a region is empty and what to do next. Plain text, no illustration; the organism picks the copy. */
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { title, body, action, compact = false, className, ...rest },
  ref,
) {
  const classes = className ? `${styles["empty"]} ${className}` : styles["empty"];

  return (
    <div ref={ref} className={classes} data-compact={compact ? "" : undefined} {...rest}>
      <span className={styles["title"]}>{title}</span>
      {body ? <span className={styles["body"]}>{body}</span> : null}
      {action ? (
        <Button className={styles["action"]} variant="secondary" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
});
