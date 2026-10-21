import type { Project } from "@phyllo/model";

/** Undo history (SPEC §5 "history"): immutable project snapshots, newest last. */
export const UNDO_LIMIT = 200;

export interface HistoryEntry {
  project: Project;
  /** Revision of `project`; lets undo back to the saved revision clear `dirty`. */
  rev: number;
}

export interface UndoHistory {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export function emptyHistory(): UndoHistory {
  return { past: [], future: [] };
}

/** Records `entry` as the state before a new change; clears redo. Drops the oldest beyond `limit`. */
export function record(history: UndoHistory, entry: HistoryEntry, limit = UNDO_LIMIT): UndoHistory {
  const past = [...history.past, entry];
  return { past: past.length > limit ? past.slice(past.length - limit) : past, future: [] };
}

export function undo(history: UndoHistory, current: HistoryEntry): { history: UndoHistory; entry: HistoryEntry } | null {
  const entry = history.past[history.past.length - 1];
  if (!entry) return null;
  return { history: { past: history.past.slice(0, -1), future: [...history.future, current] }, entry };
}

export function redo(history: UndoHistory, current: HistoryEntry): { history: UndoHistory; entry: HistoryEntry } | null {
  const entry = history.future[history.future.length - 1];
  if (!entry) return null;
  return { history: { past: [...history.past, current], future: history.future.slice(0, -1) }, entry };
}

/**
 * Restoring a snapshot keeps the *current* UI state (selection and zoom are not undoable), dropping the
 * selection when that track no longer exists.
 */
export function withCurrentUi(restored: Project, current: Project): Project {
  const selected = current.ui.selectedTrack;
  const selectedTrack = selected !== null && restored.tracks.some((t) => t.id === selected) ? selected : null;
  if (restored.ui.selectedTrack === selectedTrack && restored.ui.zoom === current.ui.zoom) return restored;
  return { ...restored, ui: { ...restored.ui, selectedTrack, zoom: current.ui.zoom } };
}
