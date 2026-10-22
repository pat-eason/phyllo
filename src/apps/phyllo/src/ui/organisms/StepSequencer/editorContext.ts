import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

/** Editor state the StepSequencer and PatternTools share on the Pattern editor screen. */
export interface PatternEditorState {
  /** Track being edited; null = the selected track. */
  trackId: string | null;
  /** Selected drum row (`bd`, `oh`): targets the Velocity lane and the Euclid tool. Null = first sounding row. */
  selectedRow: string | null;
  setSelectedRow(sound: string | null): void;
  /** Euclid tool hits (1–8 over 8 steps), so its preview survives tab or layout changes. */
  euclidHits: number;
  setEuclidHits(hits: number): void;
  /** The Euclid tool tells the editor where focus goes for "Euclid…" in a row's menu. Returns the unregister. */
  registerEuclidFocus(focus: () => void): () => void;
  /** Whether the Euclid tool is mounted, i.e. `focusEuclid` has somewhere to go. */
  canFocusEuclid(): boolean;
  /** Moves focus to the Euclid tool's hits control; false when the tool isn't mounted. */
  focusEuclid(): boolean;
}

export const PatternEditorContext = createContext<PatternEditorState | null>(null);

export function useEditorState(trackId: string | null, defaultRow: string | null = null): PatternEditorState {
  const [selectedRow, setSelectedRow] = useState<string | null>(defaultRow);
  const [euclidHits, setEuclidHits] = useState(3);
  const euclidFocus = useRef<(() => void) | null>(null);

  const registerEuclidFocus = useCallback((focus: () => void) => {
    euclidFocus.current = focus;
    return () => {
      if (euclidFocus.current === focus) euclidFocus.current = null;
    };
  }, []);
  const canFocusEuclid = useCallback(() => euclidFocus.current !== null, []);
  const focusEuclid = useCallback(() => {
    if (!euclidFocus.current) return false;
    euclidFocus.current();
    return true;
  }, []);

  return useMemo(
    () => ({ trackId, selectedRow, setSelectedRow, euclidHits, setEuclidHits, registerEuclidFocus, canFocusEuclid, focusEuclid }),
    [trackId, selectedRow, euclidHits, registerEuclidFocus, canFocusEuclid, focusEuclid],
  );
}

/**
 * The shared editor state from `<PatternEditorProvider>`; without one, each organism keeps its own
 * (so it still works alone in a story).
 */
export function usePatternEditor(): PatternEditorState {
  const shared = useContext(PatternEditorContext);
  const local = useEditorState(null);
  return shared ?? local;
}
