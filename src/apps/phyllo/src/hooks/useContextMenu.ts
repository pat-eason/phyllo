import type { MenuEntryInput } from "@phyllo/ui";
import { createContext, useContext } from "react";
import type { KeyboardEvent, MouseEvent } from "react";

export interface ContextMenuRequest {
  /** Accessible name of the DOM menu, e.g. `Track "Bass"`. */
  label: string;
  /** Falsy entries, empty submenus and stray separators are dropped. Nothing left → nothing opens. */
  entries: MenuEntryInput[];
  /** Where focus goes when the DOM menu is dismissed with Esc/Tab. Default: the element focused when it opened. */
  returnFocus?: HTMLElement | null;
}

export interface ContextMenuApi {
  /** Open at a viewport point. */
  open(request: ContextMenuRequest, at: { x: number; y: number }): void;
  /** Right-click: stops the web view menu and any outer element's menu, opens at the pointer. */
  openFromEvent(event: MouseEvent, request: ContextMenuRequest): void;
  /** Keyboard (Shift+F10 / ContextMenu key): opens near the element's top-left corner. */
  openAtElement(element: Element, request: ContextMenuRequest): void;
}

export const ContextMenuContext = createContext<ContextMenuApi | null>(null);

/**
 * Right-click menus. In the desktop app they are native OS menus; in a browser (Vite dev, Playwright, Storybook)
 * the same entries render as the DOM `ContextMenu`. Render under `<PhylloProvider>`.
 */
export function useContextMenu(): ContextMenuApi {
  const api = useContext(ContextMenuContext);
  if (!api) throw new Error("useContextMenu must be used inside <PhylloProvider>");
  return api;
}

/** Shift+F10 or the ContextMenu key. */
export function isContextMenuKey(event: Pick<KeyboardEvent, "key" | "shiftKey">): boolean {
  return event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
}

export interface ContextMenuTrigger {
  onContextMenu(event: MouseEvent<HTMLElement>): void;
  /** Handles Shift+F10 / ContextMenu only; call it from an existing `onKeyDown` or spread it. */
  onKeyDown(event: KeyboardEvent<HTMLElement>): void;
}

/**
 * Handlers that open the menu `build` returns, for right-click and the keyboard. `build` runs at open time, so the
 * entries reflect current state; return null to let the event through untouched (an outer element's menu, if any).
 */
export function useContextMenuTrigger(build: (target: HTMLElement) => ContextMenuRequest | null): ContextMenuTrigger {
  const menu = useContextMenu();
  return {
    onContextMenu(event) {
      const request = build(event.currentTarget);
      if (request) menu.openFromEvent(event, request);
    },
    onKeyDown(event) {
      if (!isContextMenuKey(event)) return;
      const request = build(event.currentTarget);
      if (!request) return;
      event.preventDefault();
      event.stopPropagation();
      menu.openAtElement(event.currentTarget, request);
    },
  };
}
