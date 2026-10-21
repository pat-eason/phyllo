import type { ReactNode } from "react";
import { PatternEditorContext, useEditorState } from "./editorContext";

export interface PatternEditorProviderProps {
  /** Track both organisms edit. Default: the selected track. */
  trackId?: string | null;
  /** Drum row selected at first (`oh`). Default: the first row that plays. */
  defaultRow?: string | null;
  children: ReactNode;
}

/**
 * Wrap the Pattern editor screen's StepSequencer and PatternTools so they share the selected row and the
 * Euclid preview. Each organism also works without it (local state).
 */
export function PatternEditorProvider({ trackId = null, defaultRow = null, children }: PatternEditorProviderProps) {
  const state = useEditorState(trackId, defaultRow);
  return <PatternEditorContext.Provider value={state}>{children}</PatternEditorContext.Provider>;
}
