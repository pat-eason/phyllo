import type { ModifierDef, ProjectAction } from "@phyllo/model";
import type { PreviewSound } from "@phyllo/engine";
import type { SoundRef } from "@phyllo/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStores, useEngine } from "../../../hooks";
import { layerSoundActions, replaceSoundActions } from "../Timeline/soundDrop";
import { modifierInsertActions, newTrackActions, soundInsertActions } from "./insert";

/** How long a preview shows as "playing" (the engine plays a short hit or phrase). */
const PREVIEW_MS = 700;
const NOTICE_MS = 3200;

export interface LibraryActions {
  /** Key of the sound being auditioned (`bank:RolandTR909:bd`), or null. */
  previewingKey: string | null;
  /** Audition `sound`; calling again for the same key while it plays stops the preview. */
  preview(key: string, sound: PreviewSound): void;
  /** Enter on a row or chip: swap the selected track's sound, or add a new track. */
  insertSound(ref: SoundRef): void;
  /** Menu: swap the selected track's sound for `ref` (what dropping it on the track does). No-op when it doesn't fit. */
  replaceSound(ref: SoundRef): void;
  /** Menu: layer `ref` onto the selected track (what ⇧-dropping it does). No-op when it doesn't fit. */
  layerSound(ref: SoundRef): void;
  /** Menu: add `ref` as a new track and select it, even when a compatible track is selected. */
  addSoundAsTrack(ref: SoundRef): void;
  /** Menu: put `text` on the system clipboard; `what` names it in the status line ("code"). */
  copyText(text: string, what: string): void;
  /** Enter on a snippet: add the modifier to the selected track. */
  insertModifier(def: Pick<ModifierDef, "name" | "template" | "description">): void;
  /** Short status line (aria-live) such as "Select a track first". */
  notice: string | null;
}

/** Preview and insert behaviour shared by every tab. Reads the project at call time, so it never re-renders on edits. */
export function useLibraryActions(): LibraryActions {
  const { project } = useAppStores();
  const { preview: enginePreview, stopPreview } = useEngine();
  const [previewingKey, setPreviewingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const previewToken = useRef(0);
  const timers = useRef<{ preview?: ReturnType<typeof setTimeout>; notice?: ReturnType<typeof setTimeout> }>({});

  useEffect(() => {
    const t = timers.current;
    return () => {
      clearTimeout(t.preview);
      clearTimeout(t.notice);
    };
  }, []);

  const say = useCallback((message: string) => {
    clearTimeout(timers.current.notice);
    setNotice(message);
    timers.current.notice = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  const preview = useCallback(
    (key: string, sound: PreviewSound) => {
      const token = ++previewToken.current;
      clearTimeout(timers.current.preview);
      if (previewingKey === key) {
        setPreviewingKey(null);
        stopPreview();
        return;
      }
      setPreviewingKey(key);
      const settle = () => {
        if (previewToken.current !== token) return;
        timers.current.preview = setTimeout(() => {
          if (previewToken.current === token) setPreviewingKey(null);
        }, PREVIEW_MS);
      };
      // `preview` starts the audio context itself (this runs inside the click/key gesture) before playing.
      enginePreview(sound).then(settle, () => {
        if (previewToken.current === token) setPreviewingKey(null);
        say("Couldn't play that sound");
      });
    },
    [enginePreview, stopPreview, previewingKey, say],
  );

  const run = useCallback(
    (actions: readonly ProjectAction[]) => {
      const { dispatch, beginGesture, endGesture } = project.getState();
      beginGesture();
      try {
        for (const action of actions) dispatch(action);
      } finally {
        endGesture();
      }
    },
    [project],
  );

  const insertSound = useCallback(
    (ref: SoundRef) => {
      run(soundInsertActions(project.getState().project, ref));
    },
    [project, run],
  );

  const replaceSound = useCallback(
    (ref: SoundRef) => {
      const { project: current } = project.getState();
      const track = current.tracks.find((t) => t.id === current.ui.selectedTrack);
      const actions = track ? replaceSoundActions(track, ref) : null;
      if (actions && actions.length > 0) run(actions);
    },
    [project, run],
  );

  const layerSound = useCallback(
    (ref: SoundRef) => {
      const { project: current } = project.getState();
      const track = current.tracks.find((t) => t.id === current.ui.selectedTrack);
      const actions = track ? layerSoundActions(track, ref) : null;
      if (actions && actions.length > 0) run(actions);
    },
    [project, run],
  );

  const addSoundAsTrack = useCallback(
    (ref: SoundRef) => {
      run(newTrackActions(project.getState().project, ref));
    },
    [project, run],
  );

  const copyText = useCallback(
    (text: string, what: string) => {
      // The clipboard can be missing or refuse (permissions, an unfocused window): say so rather than fail silently.
      const written = navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error("No clipboard"));
      written.then(
        () => say(`Copied ${what}`),
        () => say(`Couldn't copy ${what}`),
      );
    },
    [say],
  );

  const insertModifier = useCallback(
    (def: Pick<ModifierDef, "name" | "template" | "description">) => {
      const actions = modifierInsertActions(project.getState().project, def);
      if (actions.length === 0) {
        say("Select a track first, then add the snippet");
        return;
      }
      run(actions);
      say(`Added ${def.template} to the selected track`);
    },
    [project, run, say],
  );

  return { previewingKey, preview, insertSound, replaceSound, layerSound, addSoundAsTrack, copyText, insertModifier, notice };
}
