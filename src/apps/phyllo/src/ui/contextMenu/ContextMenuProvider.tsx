import { ContextMenu, compactMenu } from "@phyllo/ui";
import type { MenuCloseReason, MenuEntry } from "@phyllo/ui";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ContextMenuContext } from "../../hooks/useContextMenu";
import type { ContextMenuApi, ContextMenuRequest } from "../../hooks/useContextMenu";
import type { NativeApi } from "../../native/api";
import { suppressWebViewMenu } from "./webViewMenu";

/** Keyboard-opened menus sit this far inside the element's corner. */
const KEYBOARD_OFFSET = 24;

interface OpenMenu {
  label: string;
  entries: MenuEntry[];
  x: number;
  y: number;
  returnFocus: HTMLElement | null;
}

export interface ContextMenuProviderProps {
  native: NativeApi;
  /** Hide the web view's Back/Forward/Reload menu where nothing else handles a right-click. Default: in the desktop app. */
  suppressWebViewMenu?: boolean;
  children: ReactNode;
}

function activeElement(): HTMLElement | null {
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

/**
 * Provides `useContextMenu()`. Shows native menus through `native.contextMenuPopup` and falls back to the DOM
 * `ContextMenu` (portaled to `<body>`) when there is no native menu or it fails.
 */
export function ContextMenuProvider({ native, suppressWebViewMenu: suppress = native.kind === "tauri", children }: ContextMenuProviderProps) {
  const [open, setOpen] = useState<OpenMenu | null>(null);

  useEffect(() => {
    if (!suppress) return undefined;
    return suppressWebViewMenu(document, { allowWithAlt: import.meta.env.DEV });
  }, [suppress]);

  const api = useMemo<ContextMenuApi>(() => {
    function show(request: ContextMenuRequest, at: { x: number; y: number }) {
      const entries = compactMenu(request.entries);
      if (entries.length === 0) return;
      const fallback: OpenMenu = { label: request.label, entries, ...at, returnFocus: request.returnFocus ?? activeElement() };
      native
        .contextMenuPopup(entries, at)
        .then((shown) => {
          if (!shown) setOpen(fallback);
        })
        .catch((error: unknown) => {
          console.warn("[phyllo] native context menu failed; using the in-app menu", error);
          setOpen(fallback);
        });
    }
    return {
      open: show,
      openFromEvent(event, request) {
        event.preventDefault();
        event.stopPropagation();
        show(request, { x: event.clientX, y: event.clientY });
      },
      openAtElement(element, request) {
        const rect = element.getBoundingClientRect();
        show(request, { x: rect.left + Math.min(KEYBOARD_OFFSET, rect.width / 2), y: rect.top + Math.min(KEYBOARD_OFFSET, rect.height / 2) });
      },
    };
  }, [native]);

  function close(reason: MenuCloseReason) {
    const returnFocus = open?.returnFocus;
    setOpen(null);
    if ((reason === "escape" || reason === "tab") && returnFocus?.isConnected) returnFocus.focus();
  }

  return (
    <ContextMenuContext.Provider value={api}>
      {children}
      {open
        ? createPortal(<ContextMenu x={open.x} y={open.y} label={open.label} entries={open.entries} onClose={close} />, document.body)
        : null}
    </ContextMenuContext.Provider>
  );
}
