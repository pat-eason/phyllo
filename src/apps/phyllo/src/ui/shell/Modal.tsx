import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import styles from "./Modal.module.css";

export interface ModalProps {
  title: string;
  /** Helper text under the title, wired as the dialog's description. */
  description?: ReactNode;
  /** Escape, a click on the scrim, or a Cancel button. */
  onClose: () => void;
  children?: ReactNode;
  /** Button row (right aligned). */
  footer?: ReactNode;
  /** Max width in px. Default 460. */
  width?: number;
  /** `alertdialog` for confirmations. Default `dialog`. */
  role?: "dialog" | "alertdialog";
  /** Selector of the element to focus first (default: the first field, else the first control). */
  initialFocus?: string;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * App-level modal (unsaved changes, version history, shortcuts): `aria-modal`, focus moves in on open and back
 * to the previously focused element on close, Tab stays inside, Escape and a scrim click close it.
 */
export function Modal({ title, description, onClose, children, footer, width = 460, role = "dialog", initialFocus }: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const first =
      (initialFocus ? panel?.querySelector<HTMLElement>(initialFocus) : null) ??
      panel?.querySelector<HTMLElement>("input, select, textarea") ??
      panel?.querySelector<HTMLElement>(FOCUSABLE) ??
      panel;
    first?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
    // Focus moves in once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
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
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <h2 id={titleId} className={styles["title"]}>
          {title}
        </h2>
        {description ? (
          <div id={descriptionId} className={styles["description"]}>
            {description}
          </div>
        ) : null}
        {children ? <div className={styles["body"]}>{children}</div> : null}
        {footer ? <div className={styles["footer"]}>{footer}</div> : null}
      </div>
    </div>
  );
}
