import { TextField } from "@phyllo/ui";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import styles from "./Inspector.module.css";

export interface SearchItem {
  key: string;
  /** Mono code line, e.g. `.fast(2)` / `sawtooth`. */
  code: string;
  /** Plain text, e.g. "Play the pattern twice as fast". */
  text: string;
  /** Marks the current choice (sound picker). */
  selected?: boolean;
}

export interface SearchPopoverProps {
  /** Dialog name, e.g. "Choose a sound". */
  label: string;
  /** Search field name / placeholder. */
  searchLabel: string;
  placeholder?: string;
  /** Items for the current query. */
  itemsFor: (query: string) => readonly SearchItem[];
  onPick: (item: SearchItem) => void;
  /** Offer the typed text as its own row ("Use as typed"). */
  freeText?: { label: string; onPick: (text: string) => void };
  onClose: () => void;
  /** Focus returns here on close. */
  returnFocus: RefObject<HTMLElement | null>;
}

/**
 * Small non-modal search list anchored under its trigger (sound picker, "+" modifier). Type to filter;
 * ↓ moves into the list, ↑/↓ between rows, Enter/click picks, Escape or a click outside closes.
 */
export function SearchPopover({ label, searchLabel, placeholder, itemsFor, onPick, freeText, onClose, returnFocus }: SearchPopoverProps) {
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement | null>(null);
  const search = useRef<HTMLInputElement | null>(null);
  const listId = useId();
  const items = itemsFor(query);
  const typed = query.trim();

  useEffect(() => {
    search.current?.focus();
  }, []);

  useEffect(() => {
    function onDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target && root.current?.contains(target)) return;
      if (target && returnFocus.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [onClose, returnFocus]);

  function close() {
    onClose();
    returnFocus.current?.focus();
  }

  function options(): HTMLButtonElement[] {
    return Array.from(root.current?.querySelectorAll<HTMLButtonElement>("[data-option]") ?? []);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const list = options();
    if (list.length === 0) return;
    event.preventDefault();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1) {
      (event.key === "ArrowDown" ? list[0] : list[list.length - 1])?.focus();
      return;
    }
    const next = index + (event.key === "ArrowDown" ? 1 : -1);
    if (next < 0) search.current?.focus();
    else list[Math.min(next, list.length - 1)]?.focus();
  }

  function pick(item: SearchItem) {
    onPick(item);
    close();
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- keyboard navigation for the list inside
    <div ref={root} role="dialog" aria-label={label} className={styles["popover"]} onKeyDown={handleKeyDown}>
      <TextField
        ref={search}
        variant="search"
        label={searchLabel}
        placeholder={placeholder ?? searchLabel}
        value={query}
        onChange={setQuery}
        aria-controls={listId}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            const first = items[0];
            if (first) pick(first);
            else if (freeText && typed) {
              freeText.onPick(typed);
              close();
            }
          }
        }}
      />
      <ul id={listId} className={styles["popoverList"]} aria-label={label}>
        {items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              data-option=""
              className={styles["popoverItem"]}
              aria-current={item.selected ? "true" : undefined}
              onClick={() => pick(item)}
            >
              <span className={styles["popoverCode"]}>{item.code}</span>
              <span className={styles["popoverText"]}>{item.text}</span>
            </button>
          </li>
        ))}
        {freeText && typed ? (
          <li>
            <button
              type="button"
              data-option=""
              className={styles["popoverItem"]}
              onClick={() => {
                freeText.onPick(typed);
                close();
              }}
            >
              <span className={styles["popoverCode"]}>{typed}</span>
              <span className={styles["popoverText"]}>{freeText.label}</span>
            </button>
          </li>
        ) : null}
        {items.length === 0 && !(freeText && typed) ? <li className={styles["popoverEmpty"]}>Nothing matches “{query}”.</li> : null}
      </ul>
    </div>
  );
}
