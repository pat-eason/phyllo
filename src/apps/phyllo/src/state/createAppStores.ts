import { createEngine } from "@phyllo/engine";
import type { EngineOptions, PhylloEngine } from "@phyllo/engine";
import { newId as modelNewId, sectionAtBar } from "@phyllo/model";
import type { Project, Settings } from "@phyllo/model";
import type { StoreApi } from "zustand/vanilla";
import type { NativeApi } from "../native/api";
import { createCachedUrlResolver } from "../native/soundCache";
import { createNativeBridge } from "./bridge";
import { createEngineHost } from "./engineHost";
import type { EngineHost } from "./engineHost";
import { createEngineStore } from "./engineStore";
import type { EngineStoreState } from "./engineStore";
import { defaultFrameScheduler } from "./feed";
import type { FrameScheduler, Unsubscribe } from "./feed";
import { createLibraryStore } from "./libraryStore";
import type { LibraryStoreState } from "./libraryStore";
import { createProjectStore } from "./projectStore";
import type { ProjectStoreState } from "./projectStore";
import { createNativeSettingsChannel, createSettingsStore } from "./settingsStore";
import type { SettingsChannel, SettingsStoreState } from "./settingsStore";
import type { SettingsPatch } from "./settingsModel";
import { createTipsStore } from "./tipsStore";
import type { TipsStoreState } from "./tipsStore";
import { createTransportStore } from "./transportStore";
import type { TransportStoreState } from "./transportStore";

export interface AppTiming {
  /** SPEC §5: ~1.5 s after the last change. */
  autosaveMs: number;
  /** SPEC §4.1: ~50–100 ms. */
  regenerateMs: number;
  settingsSaveMs: number;
  /** TipCoach "Show me" outline. */
  tipHighlightMs: number;
}

export const DEFAULT_TIMING: Readonly<AppTiming> = Object.freeze({
  autosaveMs: 1500,
  regenerateMs: 60,
  settingsSaveMs: 300,
  tipHighlightMs: 4000,
});

export interface AppDeps {
  native: NativeApi;
  /** Default `createEngine` from `@phyllo/engine`. Called once, lazily. */
  engineFactory?: (options: EngineOptions) => PhylloEngine;
  /** epoch ms; default `Date.now` */
  now?: () => number;
  /** Default the model's `newId`. */
  newId?: (prefix: string) => string;
  /** rAF for playhead/meter feeds. Default `requestAnimationFrame`. */
  scheduler?: FrameScheduler;
  /** Cross-window settings sync; default BroadcastChannel / storage events; `null` disables. */
  settingsChannel?: SettingsChannel | null;
  /** Project shown before anything is opened (default: blank, not dirty). */
  initialProject?: Project;
  initialFilePath?: string | null;
  /** Settings to start from before the persisted ones load (stories, tests). */
  initialSettings?: SettingsPatch;
  timing?: Partial<AppTiming>;
  /** Non-fatal failures (save errors also surface in store state). Default `console.warn`. */
  onError?: (message: string, error: unknown) => void;
}

export interface AppStores {
  native: NativeApi;
  project: StoreApi<ProjectStoreState>;
  engine: StoreApi<EngineStoreState>;
  transport: StoreApi<TransportStoreState>;
  settings: StoreApi<SettingsStoreState>;
  tips: StoreApi<TipsStoreState>;
  library: StoreApi<LibraryStoreState>;
  /** The lazily created engine (export pipeline, tests). */
  engineHost: EngineHost;
  /** Load settings, apply their side effects, scan + watch the library. Idempotent. */
  start(): Promise<void>;
  /** Write pending autosave and settings now (before quit / window close). */
  flush(): Promise<void>;
  dispose(): void;
}

const defaultOnError = (message: string, error: unknown) => console.warn(`[phyllo] ${message}`, error);

export function createAppStores(deps: AppDeps): AppStores {
  const native = deps.native;
  const now = deps.now ?? (() => Date.now());
  const newId = deps.newId ?? modelNewId;
  const scheduler = deps.scheduler ?? defaultFrameScheduler();
  const timing: AppTiming = { ...DEFAULT_TIMING, ...deps.timing };
  const onError = deps.onError ?? defaultOnError;
  const engineFactory = deps.engineFactory ?? createEngine;
  const cleanups: Unsubscribe[] = [];

  const settings = createSettingsStore(
    {
      persistence: native.settingsStore,
      channel: deps.settingsChannel === undefined ? createNativeSettingsChannel(native) : deps.settingsChannel,
      saveDebounceMs: timing.settingsSaveMs,
      onError,
    },
    deps.initialSettings,
  );
  const settingsNow = (): Settings => settings.store.getState().settings;

  const project = createProjectStore({
    native,
    now,
    newId,
    autosaveEnabled: () => settingsNow().system.autosave,
    autosaveMs: timing.autosaveMs,
    ...(deps.initialProject ? { initialProject: deps.initialProject } : {}),
    ...(deps.initialFilePath !== undefined ? { initialFilePath: deps.initialFilePath } : {}),
  });

  const bridge = createNativeBridge(native, () => settingsNow().midi.enabledPorts, onError);
  const engineHost = createEngineHost(() =>
    engineFactory({
      bridge: bridge.bridge,
      lookaheadMs: settingsNow().audio.lookaheadMs,
      // Built-in sounds go through the Rust cache so they keep working offline (DECISIONS V15, D108).
      resolveUrl: createCachedUrlResolver(native),
      logger: (message, level) => {
        if (level === "warn" || level === "error") onError(message, null);
      },
    }),
  );
  cleanups.push(
    engineHost.onCreate((engine) => {
      const device = settingsNow().audio.outputDevice;
      if (device !== null) void engine.setOutputDevice(device).catch((e: unknown) => onError("Output device", e));
    }),
  );

  const engine = createEngineStore({
    host: engineHost,
    project: project.store,
    scheduler,
    regenerateMs: timing.regenerateMs,
    onError,
  });
  const transport = createTransportStore({ host: engineHost, project: project.store, engine: engine.store, scheduler });
  const tips = createTipsStore({
    settings: settings.store,
    onAction: (callback) => project.onAction((action) => callback(action)),
    highlightMs: timing.tipHighlightMs,
  });
  const library = createLibraryStore({ native, settings: settings.store, project: project.store, now, newId });

  // "This section" scope follows the playhead's section while playing.
  let offSectionWatch: Unsubscribe | undefined;
  const watchSection = (on: boolean) => {
    offSectionWatch?.();
    offSectionWatch = undefined;
    if (!on) return;
    let lastSection: string | null | undefined;
    offSectionWatch = transport.store.getState().subscribePosition((pos) => {
      const section = sectionAtBar(project.store.getState().project, pos.bar)?.id ?? null;
      if (section === lastSection) return;
      lastSection = section;
      engine.setSectionBar(pos.bar);
    });
  };
  cleanups.push(
    engine.store.subscribe((state, prev) => {
      if (state.scope !== prev.scope) watchSection(state.scope === "section");
    }),
  );
  if (engine.store.getState().scope === "section") watchSection(true);
  cleanups.push(() => offSectionWatch?.());

  // Settings side effects (only once the persisted settings are in, so OSC isn't configured twice).
  const applyEffects = (next: Settings, prev: Settings | null) => {
    const changed = <K extends keyof Settings>(key: K) => prev === null || JSON.stringify(next[key]) !== JSON.stringify(prev[key]);
    if (changed("osc")) native.oscConfigure({ ...next.osc }).catch((e: unknown) => onError("OSC configure failed", e));
    if (prev !== null && next.audio.lookaheadMs !== prev.audio.lookaheadMs) engineHost.peek()?.setLookahead(next.audio.lookaheadMs);
    if (prev !== null && next.audio.outputDevice !== prev.audio.outputDevice) {
      void engineHost.peek()?.setOutputDevice(next.audio.outputDevice).catch((e: unknown) => onError("Output device", e));
    }
    if (prev === null || next.system.menuBar !== prev.system.menuBar) {
      native.traySetEnabled(next.system.menuBar).catch((e: unknown) => onError("Menu bar", e));
      native.appSetKeepRunning(next.system.menuBar).catch((e: unknown) => onError("Keep running", e));
    }
    if (prev === null || next.system.mediaKeys !== prev.system.mediaKeys) {
      native.mediaSetEnabled(next.system.mediaKeys).catch((e: unknown) => onError("Media keys", e));
    }
    if (prev !== null && next.system.autosave !== prev.system.autosave) project.autosaveSettingChanged();
  };
  cleanups.push(
    settings.store.subscribe((state, prev) => {
      if (!state.loaded) return;
      if (!prev.loaded) applyEffects(state.settings, null);
      else if (state.settings !== prev.settings) applyEffects(state.settings, prev.settings);
    }),
  );

  let started: Promise<void> | undefined;
  return {
    native,
    project: project.store,
    engine: engine.store,
    transport: transport.store,
    settings: settings.store,
    tips: tips.store,
    library: library.store,
    engineHost,
    start() {
      started ??= (async () => {
        await settings.load();
        await library.start();
      })();
      return started;
    },
    async flush() {
      await Promise.all([project.flushAutosave(), settings.flush()]);
    },
    dispose() {
      for (const cleanup of cleanups.splice(0)) cleanup();
      tips.dispose();
      library.dispose();
      transport.dispose();
      engine.dispose();
      project.dispose();
      settings.dispose();
      bridge.dispose();
      engineHost.dispose();
    },
  };
}
