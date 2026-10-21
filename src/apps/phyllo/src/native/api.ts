import type {
  LibraryScan,
  NotifyOptions,
  OpenDialogOptions,
  PhylloPaths,
  SampleScan,
  SamplesChangedEvent,
  SaveDialogOptions,
  SnapshotInfo,
  Unsubscribe,
} from './types';

export interface SettingsStore {
  /** The saved settings blob, or `null` when nothing has been saved yet. Validation/merging is the caller's job. */
  load(): Promise<unknown | null>;
  save(value: unknown): Promise<void>;
}

/**
 * Everything the frontend needs from the OS. Two implementations: `tauri.ts` (real) and `browser.ts`
 * (in-memory + localStorage, for Vite dev, Playwright and Storybook). Failures reject with `NativeError`.
 */
export interface NativeApi {
  /** Which implementation is active. */
  readonly kind: 'tauri' | 'browser';

  /** Project root and exports folder; both are created on demand. */
  getPaths(): Promise<PhylloPaths>;

  // Project IO
  projectRead(path: string): Promise<string>;
  /** Rejects with `json` / `invalid_format` unless `json` parses and has `"format": "phyllo/1"`. Atomic. */
  projectWrite(path: string, json: string): Promise<void>;
  /** Free path for a new project named `name` in the root (` 2`, ` 3`… on collision). Does not create it. */
  projectNewPath(name: string): Promise<string>;
  strudelRead(path: string): Promise<string>;
  strudelWrite(path: string, code: string): Promise<void>;

  // Library
  libraryScan(): Promise<LibraryScan>;
  libraryMarkOpened(path: string): Promise<void>;
  /** Start watching the root; `onLibraryChanged` listeners fire (debounced) when `.phyllo` files change. */
  libraryWatch(): Promise<void>;
  onLibraryChanged(callback: () => void): Promise<Unsubscribe>;

  // Version history
  historySnapshot(projectId: string, json: string): Promise<SnapshotInfo>;
  /** Newest first. */
  historyList(projectId: string): Promise<SnapshotInfo[]>;
  historyRead(projectId: string, snapshotId: string): Promise<string>;

  /** Moves to the OS Trash. */
  moveToTrash(path: string): Promise<void>;

  // Sample folders
  /** Scans recursively and allows the folder on the asset protocol so `convertFileSrc` URLs load. */
  sampleFolderScan(path: string): Promise<SampleScan>;
  /** Replaces the watched set. */
  sampleFoldersWatch(paths: string[]): Promise<void>;
  onSamplesChanged(callback: (event: SamplesChangedEvent) => void): Promise<Unsubscribe>;

  // OS integration
  openDialog(options?: OpenDialogOptions): Promise<string | string[] | null>;
  saveDialog(options?: SaveDialogOptions): Promise<string | null>;
  revealInFinder(path: string): Promise<void>;
  /** Requests permission if needed. Resolves `true` when a notification was handed to the OS. */
  notify(options: NotifyOptions): Promise<boolean>;
  /** URL the web view can load for a file on disk (asset protocol). */
  convertFileSrc(path: string): string;

  settingsStore: SettingsStore;
}
