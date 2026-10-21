import type { UiMode } from "@phyllo/model";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { useAppStores } from "../state/context";
import { codeDrawerOpen } from "../state/settingsModel";
import type { SettingsStoreState } from "../state/settingsStore";

export type UseSettings = SettingsStoreState;

/**
 * design-system §5 `useSettings()`: `{ settings, loaded, set(key, patch), patch, update, setUiMode, reset }`.
 * Changes apply at once (side effects: OSC, look-ahead, output device, menu bar, media keys) and persist
 * debounced through `native.settingsStore`; other windows receive them over the settings channel.
 */
export function useSettings(): UseSettings {
  const { settings } = useAppStores();
  return useStore(
    settings,
    useShallow((s) => ({ ...s })),
  );
}

export interface UseUiMode {
  mode: UiMode;
  setMode(mode: UiMode): void;
}

/** design-system §5 `useUiMode()`. Switching never touches the project. */
export function useUiMode(): UseUiMode {
  const { settings } = useAppStores();
  return useStore(
    settings,
    useShallow((s) => ({ mode: s.settings.uiMode, setMode: s.setUiMode })),
  );
}

export interface UseCodeDrawer {
  /** Explicit user choice, else the mode default (collapsed in Guided, open in Pro). */
  open: boolean;
  setOpen(open: boolean): void;
  toggle(): void;
}

/** CodeDrawer open state (persisted override in `settings.codeDrawer.open`). */
export function useCodeDrawer(): UseCodeDrawer {
  const { settings } = useAppStores();
  const open = useStore(settings, (s) => codeDrawerOpen(s.settings));
  const state = settings.getState();
  return {
    open,
    setOpen: (next) => state.set("codeDrawer", { open: next }),
    toggle: () => state.set("codeDrawer", { open: !codeDrawerOpen(settings.getState().settings) }),
  };
}
