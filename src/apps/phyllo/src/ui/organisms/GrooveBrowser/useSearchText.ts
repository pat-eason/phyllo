import { useEffect, useRef, useState } from "react";

export const SEARCH_DEBOUNCE_MS = 100;

export interface SearchText {
  /** What the field shows (updates on every keystroke). */
  text: string;
  /** Typing: the store's query follows 100 ms after the last keystroke, immediately when emptied. */
  change: (value: string) => void;
  /** Empties the field now and drops a pending update ("Clear all"). The caller clears the store. */
  reset: () => void;
}

/** Debounces the library's search query (design-system: filters as you type, debounced 100 ms). */
export function useSearchText(query: string, setQuery: (query: string) => void): SearchText {
  const [text, setText] = useState(query);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function change(value: string) {
    setText(value);
    clearTimeout(timer.current);
    if (value === "") {
      setQuery("");
      return;
    }
    timer.current = setTimeout(() => setQuery(value), SEARCH_DEBOUNCE_MS);
  }

  function reset() {
    clearTimeout(timer.current);
    setText("");
  }

  return { text, change, reset };
}
