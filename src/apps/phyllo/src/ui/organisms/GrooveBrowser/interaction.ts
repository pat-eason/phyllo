import type { GrooveSummary } from "@phyllo/model";
import type { KeyboardEvent } from "react";

/** Where a context menu opens and which element gets focus back when it closes. */
export interface ContextAnchor {
  x: number;
  y: number;
  trigger: HTMLElement | null;
}

/** Callbacks a groove tile or row reports to the browser. */
export interface GrooveHandlers {
  onOpen: (groove: GrooveSummary) => void;
  onPreview: (groove: GrooveSummary) => void;
  onFavoriteChange: (groove: GrooveSummary, favorite: boolean) => void;
  onContextMenu: (groove: GrooveSummary, anchor: ContextAnchor) => void;
}

/** Shift+F10 or the ContextMenu key on a tile/row: anchors the menu to the card's top-left corner. */
export function contextAnchorFromKey(event: KeyboardEvent<HTMLElement>): ContextAnchor | null {
  const isMenuKey = event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
  if (!isMenuKey) return null;
  const rect = event.currentTarget.getBoundingClientRect();
  const target = event.target instanceof HTMLElement ? event.target : null;
  return { x: rect.left + 24, y: rect.top + 24, trigger: target };
}
