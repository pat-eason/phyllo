import { useState } from "react";

export type SelectMode = "only" | "toggle" | "range";

export interface RowSelection {
  /** Selected paths in display order; paths that left the results are dropped. */
  selected: string[];
  isSelected: (path: string) => boolean;
  select: (path: string, mode: SelectMode) => void;
  clear: () => void;
}

interface SelectionState {
  paths: readonly string[];
  /** Where Shift ranges start. */
  anchor: string | null;
}

/**
 * Multi-select over the visible rows (`order`): plain click on a row selects one, ⌘/Ctrl toggles, ⇧ selects from the anchor (the first row until one is set).
 * Selection is derived against `order` on every render, so filtering never leaves hidden rows selected.
 */
export function useRowSelection(order: readonly string[]): RowSelection {
  const [state, setState] = useState<SelectionState>({ paths: [], anchor: null });
  const selected = order.filter((path) => state.paths.includes(path));

  function select(path: string, mode: SelectMode) {
    setState((current) => {
      if (mode === "only") return { paths: [path], anchor: path };
      if (mode === "toggle") {
        const has = current.paths.includes(path);
        return { paths: has ? current.paths.filter((p) => p !== path) : [...current.paths, path], anchor: path };
      }
      // With no anchor yet a Shift range starts at the first row.
      const from = current.anchor === null ? 0 : order.indexOf(current.anchor);
      const to = order.indexOf(path);
      if (from < 0 || to < 0) return { paths: [path], anchor: path };
      const [start, end] = from <= to ? [from, to] : [to, from];
      return { paths: order.slice(start, end + 1), anchor: current.anchor ?? order[0] ?? null };
    });
  }

  return {
    selected,
    isSelected: (path) => selected.includes(path),
    select,
    clear: () => setState({ paths: [], anchor: null }),
  };
}
