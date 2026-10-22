import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FocusEvent, KeyboardEvent, MouseEvent } from "react";
import { formatAccelerator, isMacPlatform } from "./menuModel";
import type { MenuEntry, MenuItemEntry, MenuSubmenuEntry } from "./menuModel";
import styles from "./ContextMenu.module.css";

const MARGIN = 8;
/** Submenus overlap their trigger by this much so the pointer can travel across. */
const SUBMENU_OVERLAP = 4;

export type MenuCloseReason = "escape" | "tab" | "blur" | "select";

export interface ContextMenuProps {
  /** Viewport position: the pointer for a right-click, an element's corner for Shift+F10. */
  x: number;
  y: number;
  /** Accessible name of the menu, e.g. "Track Bass". */
  label: string;
  entries: MenuEntry[];
  /** Esc, Tab, focus leaving the menu, or an item was chosen. The owner restores focus for `escape` and `tab`. */
  onClose: (reason: MenuCloseReason) => void;
  /** Shortcut glyphs; default from `navigator.platform`. */
  isMac?: boolean;
}

/**
 * Right-click / Shift+F10 menu with separators, check items, shortcut hints, colour swatches and submenus.
 * Focus moves to the first item; Up/Down/Home/End move, Enter or Space chooses, Right opens a submenu and Left or
 * Esc closes it, Esc on the top level closes the menu (the owner returns focus). Focus leaving the menu closes it,
 * so there is no document-level listener.
 */
export function ContextMenu({ x, y, label, entries, onClose, isMac }: ContextMenuProps) {
  const [mac] = useState(() => isMac ?? isMacPlatform());
  const anchor = useMemo<Anchor>(() => ({ kind: "point", x, y }), [x, y]);

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
    <div role="presentation" className={styles["root"]} onBlur={handleBlur} onMouseDown={keepFocus} onContextMenu={(event) => event.preventDefault()}>
      <MenuPanel
        anchor={anchor}
        label={label}
        entries={entries}
        mac={mac}
        focusFirst
        onClose={onClose}
        onBack={null}
      />
    </div>
  );
}

type Anchor = { kind: "point"; x: number; y: number } | { kind: "item"; rect: DOMRect };

interface MenuPanelProps {
  anchor: Anchor;
  label: string;
  entries: MenuEntry[];
  mac: boolean;
  /** Focus the first enabled item on mount (keyboard-opened submenus and the top level). */
  focusFirst: boolean;
  onClose: (reason: MenuCloseReason) => void;
  /** Close this submenu and return focus to its trigger; null at the top level. */
  onBack: (() => void) | null;
}

function isFocusable(entry: MenuEntry | undefined): boolean {
  return entry !== undefined && entry.type !== "separator" && !entry.disabled;
}

function MenuPanel({ anchor, label, entries, mac, focusFirst, onClose, onBack }: MenuPanelProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [initialIndex] = useState(() => entries.findIndex(isFocusable));
  /** The open submenu: its entry index, its trigger's rect, and whether it was opened from the keyboard. */
  const [open, setOpen] = useState<{ index: number; rect: DOMRect; byKeyboard: boolean } | null>(null);

  // Keep the panel on screen by writing the clamped position straight to the element.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    let left: number;
    let top: number;
    if (anchor.kind === "point") {
      left = anchor.x;
      top = anchor.y;
    } else {
      left = anchor.rect.right - SUBMENU_OVERLAP;
      if (left + width > window.innerWidth - MARGIN) left = anchor.rect.left - width + SUBMENU_OVERLAP;
      top = anchor.rect.top - parseFloat(getComputedStyle(menu).paddingTop || "0");
    }
    menu.style.left = `${Math.max(MARGIN, Math.min(left, window.innerWidth - width - MARGIN))}px`;
    menu.style.top = `${Math.max(MARGIN, Math.min(top, window.innerHeight - height - MARGIN))}px`;
  }, [anchor]);

  useEffect(() => {
    if (focusFirst && initialIndex >= 0) itemRefs.current[initialIndex]?.focus();
    else if (focusFirst) menuRef.current?.focus();
  }, [focusFirst, initialIndex]);

  function move(from: number, step: 1 | -1): number {
    for (let i = 1; i <= entries.length; i += 1) {
      const index = (((from + step * i) % entries.length) + entries.length) % entries.length;
      if (isFocusable(entries[index])) return index;
    }
    return from;
  }

  function focusItem(index: number) {
    itemRefs.current[index]?.focus();
  }

  function openSubmenu(index: number, byKeyboard: boolean) {
    const rect = itemRefs.current[index]?.getBoundingClientRect();
    if (rect) setOpen({ index, rect, byKeyboard });
  }

  function closeSubmenu() {
    const index = open?.index;
    setOpen(null);
    if (index !== undefined) focusItem(index);
  }

  function choose(entry: MenuItemEntry) {
    onClose("select");
    entry.onSelect();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = itemRefs.current.findIndex((node) => node === document.activeElement);
    const entry = current >= 0 ? entries[current] : undefined;
    let target: number | undefined;
    switch (event.key) {
      case "ArrowDown":
        target = move(current < 0 ? -1 : current, 1);
        break;
      case "ArrowUp":
        target = move(current < 0 ? 0 : current, -1);
        break;
      case "Home":
        target = move(-1, 1);
        break;
      case "End":
        target = move(entries.length, -1);
        break;
      case "ArrowRight":
        if (entry?.type === "submenu" && !entry.disabled) {
          event.preventDefault();
          event.stopPropagation();
          openSubmenu(current, true);
        }
        return;
      case "ArrowLeft":
        if (onBack) {
          event.preventDefault();
          event.stopPropagation();
          onBack();
        }
        return;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        if (onBack) onBack();
        else onClose("escape");
        return;
      case "Tab":
        event.preventDefault();
        event.stopPropagation();
        onClose("tab");
        return;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    focusItem(target);
  }

  const openEntry = open ? entries[open.index] : undefined;
  const openSub: MenuSubmenuEntry | undefined = openEntry?.type === "submenu" ? openEntry : undefined;

  return (
    <>
      <div
        ref={menuRef}
        className={styles["menu"]}
        role="menu"
        aria-label={label}
        style={anchor.kind === "point" ? ({ left: anchor.x, top: anchor.y } satisfies CSSProperties) : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        {entries.map((entry, index) => {
          if (entry.type === "separator") {
            return <div key={`sep-${index}`} role="separator" className={styles["separator"]} />;
          }
          const isSubmenu = entry.type === "submenu";
          const item = isSubmenu ? undefined : entry;
          const checkable = item?.checked !== undefined;
          return (
            <button
              key={entry.id}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              type="button"
              role={checkable ? "menuitemcheckbox" : "menuitem"}
              aria-checked={checkable ? item?.checked : undefined}
              aria-haspopup={isSubmenu ? "menu" : undefined}
              aria-expanded={isSubmenu ? open?.index === index : undefined}
              className={styles["item"]}
              data-destructive={item?.destructive ? "" : undefined}
              data-open={open?.index === index ? "" : undefined}
              disabled={entry.disabled}
              title={item?.title}
              onMouseEnter={(event) => {
                if (entry.disabled) return;
                event.currentTarget.focus();
                if (isSubmenu) openSubmenu(index, false);
                else if (open) setOpen(null);
              }}
              onClick={() => {
                if (isSubmenu) openSubmenu(index, true);
                else if (item) choose(item);
              }}
            >
              <span className={styles["check"]} aria-hidden="true">
                {item?.checked ? "✓" : null}
              </span>
              {item?.swatch ? <span className={styles["swatch"]} style={{ background: item.swatch }} aria-hidden="true" /> : null}
              <span className={styles["label"]}>{entry.label}</span>
              {item?.accelerator ? (
                <span className={styles["shortcut"]} aria-hidden="true">
                  {formatAccelerator(item.accelerator, mac)}
                </span>
              ) : null}
              {isSubmenu ? (
                <span className={styles["chevron"]} aria-hidden="true">
                  ›
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {open && openSub ? (
        <MenuPanel
          key={open.index}
          anchor={{ kind: "item", rect: open.rect }}
          label={openSub.label}
          entries={openSub.items}
          mac={mac}
          focusFirst={open.byKeyboard}
          onClose={onClose}
          onBack={closeSubmenu}
        />
      ) : null}
    </>
  );
}
