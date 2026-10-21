import { findTrack } from "@phyllo/model";
import type { Project } from "@phyllo/model";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { useStore } from "zustand";
import { useAppStores } from "../../state/context";
import type { AppStores } from "../../state/createAppStores";

interface Session {
  trackId: string;
  /** The project right after our temporary solo (null = the track was already soloed, nothing to undo). */
  soloed: Project | null;
  unsubscribe(): void;
}

/**
 * Takes a temporary solo back: when the solo is still the latest change, `undo()` removes it (no extra history
 * entry, dirty flag restored); after other edits it dispatches the solo off instead.
 */
function restoreSolo(stores: AppStores, session: Session) {
  if (session.soloed === null) return;
  const state = stores.project.getState();
  if (state.project === session.soloed && state.canUndo) {
    state.undo();
    return;
  }
  if (findTrack(state.project, session.trackId)?.solo) {
    state.dispatch({ type: "track/setSolo", trackId: session.trackId, solo: false });
  }
}

function endSession(stores: AppStores, ref: RefObject<Session | null>, setTrack: (id: string | null) => void) {
  const session = ref.current;
  if (!session) return;
  ref.current = null;
  session.unsubscribe();
  restoreSolo(stores, session);
  setTrack(null);
}

export interface PlayPattern {
  /** The edited track is playing on its own. */
  active: boolean;
  /** Start (solo + play) or stop. Call from the click handler (audio needs the gesture). */
  toggle(): void;
}

/**
 * Pattern editor "Play pattern" (SPEC §6.3): solos the edited track temporarily and plays. The solo is taken back
 * when the transport stops or pauses, the edited track changes, or the editor closes.
 */
export function usePlayPattern(trackId: string | null): PlayPattern {
  const stores = useAppStores();
  const playing = useStore(stores.transport, (s) => s.playing);
  const session = useRef<Session | null>(null);
  const [sessionTrack, setSessionTrack] = useState<string | null>(null);

  useEffect(() => () => endSession(stores, session, setSessionTrack), [stores, trackId]);

  return {
    active: playing && sessionTrack !== null && sessionTrack === trackId,
    toggle() {
      const transport = stores.transport.getState();
      if (session.current) {
        transport.stop();
        return;
      }
      if (trackId === null) return;
      const project = stores.project.getState();
      const track = findTrack(project.project, trackId);
      if (!track) return;
      let soloed: Project | null = null;
      if (!track.solo) {
        project.dispatch({ type: "track/setSolo", trackId, solo: true });
        soloed = stores.project.getState().project;
      }
      let started = transport.playing;
      const unsubscribe = stores.transport.subscribe((state) => {
        if (state.playing) started = true;
        else if (started) endSession(stores, session, setSessionTrack);
      });
      session.current = { trackId, soloed, unsubscribe };
      setSessionTrack(trackId);
      // Audio failed to start: nothing is playing, so give the solo back now (the error shows in the status bar).
      const settle = () => {
        if (!stores.transport.getState().playing) endSession(stores, session, setSessionTrack);
      };
      transport.play().then(settle, settle);
    },
  };
}
