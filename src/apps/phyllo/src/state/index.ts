// App state layer (T3.1): vanilla Zustand stores behind React context. Organisms use the hooks in ../hooks.
export { PhylloProvider } from "./PhylloProvider";
export type { PhylloProviderProps } from "./PhylloProvider";
export { PhylloStoresContext, useAppStores } from "./context";
export { DEFAULT_TIMING, createAppStores } from "./createAppStores";
export type { AppDeps, AppStores, AppTiming } from "./createAppStores";

export type { EngineHost } from "./engineHost";
export { SILENT_METERS } from "./engineStore";
export type { EngineStoreState, LevelSubscribe } from "./engineStore";
export type { LoopRegion, TransportStoreState } from "./transportStore";
export type { NewProjectOptions, OpError, OpResult, ProjectStoreState, SaveResult } from "./projectStore";
export { UNDO_LIMIT } from "./history";
export type { SettingsChannel, SettingsStoreState } from "./settingsStore";
export { DEFAULT_SETTINGS, applySettingsPatch, codeDrawerOpen, defaultSettings, mergeSettings } from "./settingsModel";
export type { SettingsPatch, SettingsSectionPatch } from "./settingsModel";
export { stepCompletedBy } from "./tipsStore";
export type { TipsStoreState } from "./tipsStore";
export type { LibraryCounts, LibraryStoreState, TileSize } from "./libraryStore";
export { RECENT_DAYS, collectTags, filterGrooves, matchesText, previewFor, sortGrooves, toGrooveSummary } from "./libraryQuery";
export type { LibraryFilter } from "./libraryQuery";
export { createFeed, defaultFrameScheduler, timerFrameScheduler } from "./feed";
export type { Feed, FrameScheduler, Unsubscribe } from "./feed";
export { evaluatedAgoSeconds, formatAutosaved, formatClock, formatEvaluatedAgo } from "./format";

// Stories / tests
export { createFakeEngine } from "./fakeEngine";
export type { FakeEngine, FakeEngineOptions } from "./fakeEngine";
export { FIXTURE_NOW, createMockNative, createMockStores, fixtureProject, seedLibrary } from "./mocks";
export type { MockStores, MockStoresOptions } from "./mocks";
