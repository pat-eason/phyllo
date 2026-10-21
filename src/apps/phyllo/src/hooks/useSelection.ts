import { findTrack } from "@phyllo/model";
import type { Track } from "@phyllo/model";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { useAppStores } from "../state/context";

export interface UseSelection {
  /** `project.ui.selectedTrack` */
  trackId: string | null;
  /** The selected track, if it exists. */
  track: Track | undefined;
  /** Select a track (or null). Not undoable and doesn't make the project dirty. */
  select(trackId: string | null): void;
}

/** design-system §5 `useSelection()`. */
export function useSelection(): UseSelection {
  const { project } = useAppStores();
  return useStore(
    project,
    useShallow((s) => ({
      trackId: s.project.ui.selectedTrack,
      track: findTrack(s.project, s.project.ui.selectedTrack),
      select: selectFor(s.dispatch),
    })),
  );
}

const selectors = new WeakMap<object, (trackId: string | null) => void>();

/** One stable `select` per store dispatch, so `useShallow` keeps the hook result stable. */
function selectFor(dispatch: (action: { type: "ui/select"; trackId: string | null }) => void) {
  let select = selectors.get(dispatch);
  if (!select) {
    select = (trackId) => dispatch({ type: "ui/select", trackId });
    selectors.set(dispatch, select);
  }
  return select;
}
