import { findTrack } from "@phyllo/model";
import type { ParamValue, ProjectAction, Track, TrackSource } from "@phyllo/model";
import { useMemo } from "react";
import { useAppStores, useProjectSelector } from "../../../hooks";
import type { DrumWrite } from "./drumGrid";
import { usePatternEditor } from "./editorContext";

export interface TrackEditor {
  /** The edited track (prop → editor provider → selection); undefined when none. */
  track: Track | undefined;
  /** The track as it is in the store right now (handlers read this, not the render snapshot). */
  current(): Track | undefined;
  /** Writes a pattern (and the track gain when given) as one undo step. */
  write(change: DrumWrite): void;
  setSource(source: Partial<TrackSource>): void;
  setParam(param: "gain", value: ParamValue | null): void;
  /** Any project action (modifier add/update/remove for the Feel tools). */
  dispatch(action: ProjectAction): void;
  beginGesture(): void;
  endGesture(): void;
}

/** The track both Pattern editor organisms edit, plus the writes they make to it. */
export function useTrackEditor(trackIdProp: string | null | undefined): TrackEditor {
  const stores = useAppStores();
  const editor = usePatternEditor();
  const trackId = useProjectSelector((p) => trackIdProp ?? editor.trackId ?? p.ui.selectedTrack);
  const track = useProjectSelector((p) => findTrack(p, trackId));

  return useMemo(() => {
    const store = stores.project;
    const current = () => findTrack(store.getState().project, trackId);
    return {
      track,
      current,
      write(change) {
        const t = current();
        if (!t) return;
        const s = store.getState();
        s.beginGesture();
        if (change.pattern !== t.pattern) s.dispatch({ type: "track/setPattern", trackId: t.id, pattern: change.pattern });
        if (change.gain !== undefined) s.dispatch({ type: "track/setParam", trackId: t.id, param: "gain", value: change.gain });
        s.endGesture();
      },
      setSource(source) {
        if (trackId) store.getState().dispatch({ type: "track/setSource", trackId, source });
      },
      setParam(param, value) {
        if (trackId) store.getState().dispatch({ type: "track/setParam", trackId, param, value });
      },
      dispatch: (action) => store.getState().dispatch(action),
      beginGesture: () => store.getState().beginGesture(),
      endGesture: () => store.getState().endGesture(),
    };
  }, [stores.project, trackId, track]);
}
