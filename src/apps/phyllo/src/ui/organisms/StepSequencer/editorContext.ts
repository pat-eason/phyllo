import { createContext, useContext, useMemo, useState } from "react";

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
}

export const PatternEditorContext = createContext<PatternEditorState | null>(null);

export function useEditorState(trackId: string | null, defaultRow: string | null = null): PatternEditorState {
  const [selectedRow, setSelectedRow] = useState<string | null>(defaultRow);
  const [euclidHits, setEuclidHits] = useState(3);
  return useMemo(
    () => ({ trackId, selectedRow, setSelectedRow, euclidHits, setEuclidHits }),
    [trackId, selectedRow, euclidHits],
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
