import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, MouseEvent } from "react";
import styles from "./ContextMenu.module.css";

const MARGIN = 8;

export interface MenuItem {
  id: string;
  label: string;
  onSelect: () => void;
  /** Red text (Move to Trash). */
  destructive?: boolean;
  disabled?: boolean;
  /** Native tooltip, e.g. why an item is disabled. */
  title?: string;
}

export type MenuCloseReason = "escape" | "tab" | "blur" | "select";

export interface ContextMenuProps {
  /** Viewport position (pointer position, or the focused card's corner for the keyboard). */
  x: number;
  y: number;
  label: string;
  items: MenuItem[];
  /** Esc, Tab, focus leaving the menu, or an item was chosen. The owner restores focus for `escape` and `tab` only. */
  onClose: (reason: MenuCloseReason) => void;
}

/**
 * Right-click / Shift+F10 menu. Focus moves to the first item; Up/Down/Home/End move, Enter or Space chooses, Esc closes
 * (the owner returns focus). Focus leaving the menu closes it, so there is no document-level listener.
 */
export function ContextMenu({ x, y, label, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [initialIndex] = useState(() => Math.max(0, items.findIndex((item) => !item.disabled)));

  // Keep the menu on screen by writing the clamped position straight to the element.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN))}px`;
    menu.style.top = `${Math.max(MARGIN, Math.min(y, window.innerHeight - height - MARGIN))}px`;
  }, [x, y]);

  useEffect(() => {
    itemRefs.current[initialIndex]?.focus();
  }, [initialIndex]);

  function move(from: number, step: 1 | -1): number {
    for (let i = 1; i <= items.length; i += 1) {
      const index = (from + step * i + items.length * i) % items.length;
      if (!items[index]?.disabled) return index;
    }
    return from;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = itemRefs.current.findIndex((node) => node === document.activeElement);
    let target: number | undefined;
    switch (event.key) {
      case "ArrowDown":
        target = move(current, 1);
        break;
      case "ArrowUp":
        target = move(current < 0 ? 0 : current, -1);
        break;
      case "Home":
        target = move(-1, 1);
        break;
      case "End":
        target = move(items.length, -1);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        onClose("escape");
        return;
      case "Tab":
        event.preventDefault();
        onClose("tab");
        return;
      default:
        return;
    }
    event.preventDefault();
    itemRefs.current[target]?.focus();
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    onClose("blur");
  }

  // Keep focus on the current item while the pointer is down so a click is not preceded by a blur-close.
  function keepFocus(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  return (
    <div
      ref={menuRef}
      className={styles["menu"]}
      role="menu"
      aria-label={label}
      style={{ left: x, top: y }}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      onMouseDown={keepFocus}
    >
      {items.map((item, index) => (
        <button
          key={item.id}
          ref={(node) => {
            itemRefs.current[index] = node;
          }}
          type="button"
          role="menuitem"
          className={styles["item"]}
          data-destructive={item.destructive ? "" : undefined}
          disabled={item.disabled}
          title={item.title}
          onClick={() => {
            onClose("select");
            item.onSelect();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
