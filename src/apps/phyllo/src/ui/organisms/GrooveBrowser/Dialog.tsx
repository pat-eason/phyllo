import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import styles from "./Dialog.module.css";

export interface DialogProps {
  title: string;
  /** Short helper text under the title; wired as the dialog's description. */
  description?: string;
  onClose: () => void;
  children: ReactNode;
  /** Buttons row. */
  footer?: ReactNode;
  /** Max width in px. Default 440. */
  width?: number;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Small modal used by the browser's rename, tag, manage and trash flows. Focus moves in on open (the first field,
 * or the first control), Tab stays inside, Esc and a click on the scrim close it. The owner restores focus.
 */
export function Dialog({ title, description, onClose, children, footer, width = 440 }: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const first = panel.querySelector<HTMLElement>("input, select, textarea") ?? panel.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleScrimDown(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <div className={styles["scrim"]} role="presentation" onMouseDown={handleScrimDown} onKeyDown={handleKeyDown}>
      <div
        ref={panelRef}
        className={styles["panel"]}
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <h2 id={titleId} className={styles["title"]}>
          {title}
        </h2>
        {description ? (
          <p id={descriptionId} className={styles["description"]}>
            {description}
          </p>
        ) : null}
        <div className={styles["body"]}>{children}</div>
        {footer ? <div className={styles["footer"]}>{footer}</div> : null}
      </div>
    </div>
  );
}
