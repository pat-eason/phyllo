import { useEffect, useEffectEvent } from "react";
import { useStore } from "zustand";
import type { NativeApi } from "../../native/api";
import type { MediaCommand, MenuActionEvent } from "../../native/types";
import type { AppStores } from "../../state/createAppStores";
import { isRunnableMenuId } from "./actions";
import type { RunAction } from "./actions";
import { mediaAction, menuStates, recentItems } from "./bridgeModel";

const ignore = () => undefined;

function listen(subscribe: Promise<() => void>): () => void {
  let off: (() => void) | null = null;
  let closed = false;
  void subscribe
    .then((unsubscribe) => {
      if (closed) unsubscribe();
      else off = unsubscribe;
    })
    .catch(ignore);
  return () => {
    closed = true;
    off?.();
  };
}

export interface NativeBridgeProps {
  stores: AppStores;
  run: RunAction;
  recentClearedAt: number;
}

/**
 * Glue between the shell and the OS (main window only): menu actions run through the shared action table; menu
 * labels/checks, Open Recent, media-key Now Playing and the tray's play state follow the stores. Renders nothing.
 */
export function NativeBridge({ stores, run, recentClearedAt }: NativeBridgeProps) {
  const native: NativeApi = stores.native;
  const playing = useStore(stores.transport, (s) => s.playing);
  const loop = useStore(stores.transport, (s) => s.loop.enabled);
  const recordArmed = useStore(stores.transport, (s) => s.recordArmed);
  const uiMode = useStore(stores.settings, (s) => s.settings.uiMode);
  const themeMode = useStore(stores.settings, (s) => s.settings.appearance.mode);
  const projectName = useStore(stores.project, (s) => s.project.name);
  const grooves = useStore(stores.library, (s) => s.grooves);

  const onMenu = useEffectEvent((event: MenuActionEvent) => {
    if (!isRunnableMenuId(event.id)) return;
    run(event.id, event.path !== undefined ? { path: event.path } : {});
  });
  const onMedia = useEffectEvent((command: MediaCommand) => {
    const action = mediaAction(command, stores.transport.getState().playing);
    if (action) run(action);
  });

  useEffect(() => listen(native.onMenuAction((event) => onMenu(event))), [native]);
  useEffect(() => listen(native.onMediaCommand((event) => onMedia(event.command))), [native]);

  useEffect(() => {
    for (const state of menuStates({ playing, loop, recordArmed, uiMode, themeMode })) {
      native.menuSetState(state).catch(ignore);
    }
  }, [native, playing, loop, recordArmed, uiMode, themeMode]);

  useEffect(() => {
    native.traySetPlaying(playing).catch(ignore);
    native.mediaSetNowPlaying({ title: projectName, playing }).catch(ignore);
  }, [native, playing, projectName]);

  useEffect(() => {
    native.menuSetRecent(recentItems(grooves, recentClearedAt)).catch(ignore);
  }, [native, grooves, recentClearedAt]);

  return null;
}
