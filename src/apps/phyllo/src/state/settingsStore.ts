import type { Settings, UiMode } from "@phyllo/model";
import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand/vanilla";
import type { SettingsStore as NativeSettingsStore } from "../native/api";
import { SETTINGS_KEY } from "../native/browser";
import type { Unsubscribe } from "./feed";
import { applySettingsPatch, defaultSettings, mergeSettings } from "./settingsModel";
import type { SettingsPatch, SettingsSectionPatch } from "./settingsModel";

export interface SettingsStoreState {
  settings: Settings;
  /** True once the persisted settings were read (or reading failed and defaults stay). */
  loaded: boolean;
  /** Replace one top-level section (object sections merge). Persists, debounced. */
  set<K extends keyof Settings>(key: K, value: SettingsSectionPatch<K>): void;
  /** Patch several sections at once. */
  patch(patch: SettingsPatch): void;
  /** Free-form update; the result is re-validated. */
  update(recipe: (settings: Settings) => Settings): void;
  setUiMode(mode: UiMode): void;
  /** Back to factory defaults (persists). */
  reset(): void;
}

/**
 * Cross-window settings sync (the Settings window is a second web view). NativeApi has no event emit, so
 * the default channel is a same-origin `BroadcastChannel` (works between Tauri windows of one app and between
 * browser tabs), falling back to `storage` events on the browser impl's localStorage key.
 */
export interface SettingsChannel {
  post(settings: Settings): void;
  subscribe(callback: (raw: unknown) => void): Unsubscribe;
  close(): void;
}

const CHANNEL_NAME = "phyllo:settings";

export function createDefaultSettingsChannel(): SettingsChannel | null {
  if (typeof BroadcastChannel === "function") {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    const listeners = new Set<(raw: unknown) => void>();
    channel.onmessage = (event: MessageEvent) => {
      for (const listener of [...listeners]) listener(event.data);
    };
    return {
      post: (settings) => channel.postMessage(settings),
      subscribe(callback) {
        listeners.add(callback);
        return () => listeners.delete(callback);
      },
      close: () => channel.close(),
    };
  }
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    return {
      post: () => {
        /* the browser NativeApi already wrote localStorage; other tabs get a storage event */
      },
      subscribe(callback) {
        const onStorage = (event: StorageEvent) => {
          if (event.key !== SETTINGS_KEY || event.newValue === null) return;
          try {
            callback(JSON.parse(event.newValue) as unknown);
          } catch {
            /* ignore malformed */
          }
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
      },
      close: () => {},
    };
  }
  return null;
}

export interface SettingsStoreDeps {
  persistence: NativeSettingsStore;
  channel: SettingsChannel | null;
  saveDebounceMs: number;
  onError?: (message: string, error: unknown) => void;
}

export interface SettingsStoreHandle {
  store: StoreApi<SettingsStoreState>;
  /** Reads persisted settings once and merges them over the defaults. */
  load(): Promise<void>;
  /** Write any pending change now. */
  flush(): Promise<void>;
  dispose(): void;
}

export function createSettingsStore(deps: SettingsStoreDeps, initial?: SettingsPatch): SettingsStoreHandle {
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let pending = false;
  let applyingRemote = false;
  let loadPromise: Promise<void> | undefined;

  const start = initial ? applySettingsPatch(defaultSettings(), initial) : defaultSettings();

  const store = createStore<SettingsStoreState>()((set, get) => {
    const commit = (next: Settings) => {
      if (JSON.stringify(next) === JSON.stringify(get().settings)) return;
      set({ settings: next });
    };
    return {
      settings: start,
      loaded: false,
      set: (key, value) => commit(applySettingsPatch(get().settings, { [key]: value } as SettingsPatch)),
      patch: (patch) => commit(applySettingsPatch(get().settings, patch)),
      update: (recipe) => commit(mergeSettings(recipe(get().settings), get().settings)),
      setUiMode: (mode) => commit(applySettingsPatch(get().settings, { uiMode: mode })),
      reset: () => commit(defaultSettings()),
    };
  });

  const write = async () => {
    pending = false;
    const value = store.getState().settings;
    try {
      await deps.persistence.save(value);
      deps.channel?.post(value);
    } catch (error) {
      deps.onError?.("Couldn't save settings", error);
    }
  };

  const unsubscribe = store.subscribe((state, prev) => {
    if (state.settings === prev.settings || applyingRemote) return;
    pending = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      void write();
    }, deps.saveDebounceMs);
  });

  const unsubscribeChannel =
    deps.channel?.subscribe((raw) => {
      applyingRemote = true;
      try {
        store.setState({ settings: mergeSettings(raw, store.getState().settings) });
      } finally {
        applyingRemote = false;
      }
    }) ?? (() => {});

  return {
    store,
    load() {
      loadPromise ??= (async () => {
        try {
          const raw = await deps.persistence.load();
          if (raw !== null && raw !== undefined) {
            applyingRemote = true;
            try {
              store.setState({ settings: mergeSettings(raw, store.getState().settings) });
            } finally {
              applyingRemote = false;
            }
          }
        } catch (error) {
          deps.onError?.("Couldn't read settings; using defaults", error);
        }
        store.setState({ loaded: true });
      })();
      return loadPromise;
    },
    async flush() {
      if (!pending) return;
      clearTimeout(saveTimer);
      saveTimer = undefined;
      await write();
    },
    dispose() {
      clearTimeout(saveTimer);
      unsubscribe();
      unsubscribeChannel();
      deps.channel?.close();
    },
  };
}
