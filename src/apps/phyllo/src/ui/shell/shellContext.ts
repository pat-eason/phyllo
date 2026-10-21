import { createContext, useContext } from "react";
import type { RefObject } from "react";
import type { LibraryPanelHandle } from "../organisms/LibraryPanel";
import type { EditTool, Snap } from "../organisms/Timeline";
import type { Route } from "./router";

export interface ShellToast {
  title: string;
  detail?: string;
  tone?: "neutral" | "error";
}

/** App-shell state the screens share: route, Arrange edit tool/snap, app-level dialogs and toasts. */
export interface ShellState {
  route: Route | null;
  /**
   * A real project is open. False while only the empty placeholder exists (startup landed on the Library / Guided
   * start without loading one): headers then hide the project name and the Arrange / Pattern / Mixer tabs, and the
   * view shortcuts don't open an empty phantom project.
   */
  projectOpen: boolean;
  navigate(route: Route, options?: { replace?: boolean }): void;
  /** Arrange edit tool (Pro), lifted here so V / B / S work from the global shortcut layer. */
  tool: EditTool;
  setTool(tool: EditTool): void;
  snap: Snap;
  setSnap(snap: Snap): void;
  exportOpen: boolean;
  openExport(): void;
  closeExport(): void;
  openHistory(): void;
  openShortcuts(): void;
  /** ⌘K: focus the library search on Arrange (waits a few frames for Arrange to mount after navigating). */
  requestSearchFocus(): void;
  /**
   * Run `proceed` once the open project's changes are safe: at once when clean, after flushing autosave when autosave
   * is on, else after the Save / Don't save / Cancel dialog (Cancel never runs it).
   */
  guardUnsaved(proceed: () => void | Promise<void>): void;
  notify(toast: ShellToast): void;
  /** Epoch ms of File › Open Recent › Clear (recents opened before it are hidden). */
  recentClearedAt: number;
  clearRecent(): void;
}

export const ShellContext = createContext<ShellState | null>(null);

/** The Arrange LibraryPanel handle (⌘K → `focusSearch()`); its own context so the shell state stays ref-free. */
export const LibraryPanelRefContext = createContext<RefObject<LibraryPanelHandle | null> | null>(null);

export function useLibraryPanelRef(): RefObject<LibraryPanelHandle | null> | undefined {
  return useContext(LibraryPanelRefContext) ?? undefined;
}

export function useShell(): ShellState {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error("useShell needs <AppShell>");
  return shell;
}
