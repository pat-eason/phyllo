import { useEffect } from "react";
import type { ReactNode } from "react";
import { useAppStores } from "../../../hooks";

export interface StorySeedProps {
  /** Start playback once mounted. */
  play?: boolean;
  /** Make the engine report an eval error on the first track's line. */
  error?: boolean;
  /** Make one edit so autosave files the project (the status bar shows "Autosaved …"). */
  autosave?: boolean;
  children: ReactNode;
}

/** Drives the mock stores into the state a story shows. Runs once per mount. */
export function Seed({ play = false, error = false, autosave = false, children }: StorySeedProps) {
  const stores = useAppStores();

  useEffect(() => {
    stores.engine.getState().regenerateNow();
    if (play) void stores.transport.getState().play();
    if (error) {
      void stores.engineHost.get().evaluate({
        code: 'ERROR\n$: s("bd")',
        lines: { kick: { start: 1, end: 1 } },
        scope: "song",
      });
    }
    if (autosave) stores.project.getState().dispatch({ type: "project/setFavorite", favorite: true });
  }, [stores, play, error, autosave]);

  return children;
}
