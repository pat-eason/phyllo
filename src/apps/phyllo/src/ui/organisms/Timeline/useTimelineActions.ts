import { createTrack, findTrack } from "@phyllo/model";
import type { Project, ProjectAction, Track, TrackKind } from "@phyllo/model";
import type { SoundRef } from "@phyllo/ui";
import { useMemo } from "react";
import { useAppStores } from "../../../hooks";
import { layerSoundActions, replaceSoundActions, trackForSound } from "./soundDrop";

/** Where a library sound was dropped. */
export type SoundDropTarget = { kind: "lane"; trackId: string } | { kind: "new" };

export interface TimelineActions {
  /** The model right now (event handlers read it instead of closing over render-time props). */
  getProject(): Project;
  dispatch(action: ProjectAction): void;
  /** Runs `fn` as one undo step. */
  batch(fn: () => void): void;
  beginGesture(): void;
  endGesture(): void;
  select(trackId: string | null): void;
  seek(bar: number): void;
  setLoop(patch: Partial<Project["loop"]>): void;
  /** `othersOnly` (⌘-click): mute every other track and unmute this one; again on that exact state unmutes them all. */
  setMute(trackId: string, mute: boolean, othersOnly: boolean): void;
  /** `exclusive` (⌥-click): solo only this track, or clear every solo when it already was the only one. */
  setSolo(trackId: string, solo: boolean, exclusive: boolean): void;
  /** Adds and selects a new track of `kind` (Add-track menu). */
  addTrack(kind: TrackKind): Track;
  /** Library drop; `layer` = ⇧ held. Returns the id of the track that changed or was created. */
  dropSound(target: SoundDropTarget, ref: SoundRef, layer: boolean): string | null;
}

/**
 * Stable Timeline commands over the project and transport stores. Reads `getState()` at call time, so the
 * object never changes and never subscribes the caller to anything (memoised lanes keep their props).
 */
export function useTimelineActions(): TimelineActions {
  const stores = useAppStores();
  return useMemo(() => {
    const project = () => stores.project.getState();
    const transport = () => stores.transport.getState();
    const dispatch = (action: ProjectAction) => project().dispatch(action);
    const batch = (fn: () => void) => {
      project().beginGesture();
      try {
        fn();
      } finally {
        project().endGesture();
      }
    };
    const insertTrack = (track: Track, index?: number) => {
      batch(() => {
        dispatch(index === undefined ? { type: "track/add", track } : { type: "track/add", track, index });
        dispatch({ type: "ui/select", trackId: track.id });
      });
      return track;
    };
    const actions: TimelineActions = {
      getProject: () => project().project,
      dispatch,
      batch,
      beginGesture: () => project().beginGesture(),
      endGesture: () => project().endGesture(),
      select: (trackId) => dispatch({ type: "ui/select", trackId }),
      seek: (bar) => transport().seek(bar),
      setLoop: (patch) => transport().setLoop(patch),
      setMute(trackId, mute, othersOnly) {
        if (!othersOnly) {
          dispatch({ type: "track/setMute", trackId, mute });
          return;
        }
        const tracks = project().project.tracks;
        const othersMuted = tracks.every((t) => t.mute === (t.id !== trackId));
        batch(() => {
          for (const t of tracks) {
            const next = othersMuted ? false : t.id !== trackId;
            if (t.mute !== next) dispatch({ type: "track/setMute", trackId: t.id, mute: next });
          }
        });
      },
      setSolo(trackId, solo, exclusive) {
        if (!exclusive) {
          dispatch({ type: "track/setSolo", trackId, solo });
          return;
        }
        const tracks = project().project.tracks;
        const onlyThis = tracks.every((t) => t.solo === (t.id === trackId));
        batch(() => {
          for (const t of tracks) {
            const next = onlyThis ? false : t.id === trackId;
            if (t.solo !== next) dispatch({ type: "track/setSolo", trackId: t.id, solo: next });
          }
        });
      },
      addTrack(kind) {
        const p = project().project;
        return insertTrack(createTrack(kind, { existing: p.tracks, lengthBars: p.lengthBars }));
      },
      dropSound(target, ref, layer) {
        const p = project().project;
        if (target.kind === "lane") {
          const track = findTrack(p, target.trackId);
          if (track) {
            const planned = layer ? layerSoundActions(track, ref) : replaceSoundActions(track, ref);
            if (planned) {
              batch(() => {
                for (const action of planned) dispatch(action);
                dispatch({ type: "ui/select", trackId: track.id });
              });
              return track.id;
            }
            // Kinds don't fit (a synth onto a drum lane): add the sound as a new track right below.
            return insertTrack(trackForSound(ref, p), p.tracks.indexOf(track) + 1).id;
          }
        }
        if (layer && p.ui.selectedTrack) {
          // ⇧ onto empty space / the Add-track row: layer onto the selected track (Pro drop hint).
          const selected = findTrack(p, p.ui.selectedTrack);
          const planned = selected ? layerSoundActions(selected, ref) : null;
          if (selected && planned) {
            batch(() => {
              for (const action of planned) dispatch(action);
            });
            return selected.id;
          }
        }
        return insertTrack(trackForSound(ref, p)).id;
      },
    };
    return actions;
  }, [stores]);
}
