import type { GrooveSummary } from "@phyllo/model";
import type { KeyboardEvent, MouseEvent } from "react";

/** Callbacks a groove tile or row reports to the browser. */
export interface GrooveHandlers {
  onOpen: (groove: GrooveSummary) => void;
  onPreview: (groove: GrooveSummary) => void;
  onFavoriteChange: (groove: GrooveSummary, favorite: boolean) => void;
  /** Right-click on the tile or row. */
  onContextMenu: (groove: GrooveSummary, event: MouseEvent<HTMLElement>) => void;
  /** Shift+F10 / ContextMenu key on the tile or row (or a button inside it). */
  onContextKey: (groove: GrooveSummary, event: KeyboardEvent<HTMLElement>) => void;
}
