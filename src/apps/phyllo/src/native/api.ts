import type { MenuEntry } from '@phyllo/ui';

import type {
  ExportBeginOptions,
  ExportFinishedNotification,
  ExportResult,
  ExportSession,
  LibraryScan,
  MediaCommandEvent,
  MenuActionEvent,
  MenuItemState,
  NowPlaying,
  OpenFilesEvent,
  RecentItem,
  MidiFileResult,
  MidiFileSpec,
  MidiMessageEvent,
  MidiOutMessage,
  MidiPortInfo,
  NotifyOptions,
  OpenDialogOptions,
  OscConfig,
  OscMessageOut,
  PhylloPaths,
  SampleScan,
  SamplesChangedEvent,
  SaveDialogOptions,
  SnapshotInfo,
  SoundCacheFetchResult,
  SoundCacheProgress,
  SoundCacheStatus,
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

  // MIDI (native via midir; Web MIDI where the browser has it)
  /** Inputs first, then outputs. */
  midiListPorts(): Promise<MidiPortInfo[]>;
  /** Re-enumerate now and return the fresh list (hot-plug is also polled every 2 s). */
  midiRescan(): Promise<MidiPortInfo[]>;
  /** Idempotent. Messages arrive through `onMidiMessage`. Rejects `not_found` for an unknown id. */
  midiOpenInput(id: string): Promise<void>;
  midiCloseInput(id: string): Promise<void>;
  midiOpenOutput(id: string): Promise<void>;
  /** Sends all-notes-off, drops queued messages for the port, then disconnects. */
  midiCloseOutput(id: string): Promise<void>;
  /** Queue messages; each `atMs` is relative to when the command reaches the native side. Rejects `not_found` if the port is not open. */
  midiSend(id: string, messages: MidiOutMessage[]): Promise<void>;
  /** All-notes-off on 16 channels now; drops anything still queued for the port. */
  midiPanic(id: string): Promise<void>;
  onMidiMessage(callback: (message: MidiMessageEvent) => void): Promise<Unsubscribe>;
  /** Fires with the new full port list when it differs from the previous one. Open ports that vanished are closed. */
  onMidiPortsChanged(callback: (ports: MidiPortInfo[]) => void): Promise<Unsubscribe>;

  // OSC (SuperDirt over UDP; off until configured)
  oscConfigure(config: OscConfig): Promise<void>;
  /** A no-op while OSC is disabled. */
  oscSend(messages: OscMessageOut[]): Promise<void>;

  // Export (streaming PCM; see `streamAudioBuffer` in `export.ts`)
  /**
   * Open an export session. Rejects `invalid_argument` for impossible combinations (FLAC 32-bit, MP3 at 22.05 kHz,
   * channels other than 1/2, normalize outside -60..0 dBFS) and `unsupported_format` where the format cannot be
   * produced (the browser implementation only writes WAV).
   */
  exportBegin(options: ExportBeginOptions): Promise<ExportSession>;
  /** Append interleaved frames (a whole number of frames for the session's channel count). Sent as raw bytes, not JSON. */
  exportChunk(sessionId: string, frames: Float32Array): Promise<void>;
  /** Normalize (if requested), encode and move into place atomically. The session is consumed even on failure. */
  exportFinish(sessionId: string): Promise<ExportResult>;
  /** Discard the session and any partial data. Idempotent. */
  exportCancel(sessionId: string): Promise<void>;
  /**
   * A path for a default-named export that won't replace an earlier file (B12): `fileName` if free, else
   * `<stem> 2.<ext>`, `<stem> 3.<ext>`… A bare name resolves in `Exports/` (the result is absolute); an absolute
   * path keeps its folder. Nothing is written. In the browser (downloads) it returns `fileName` unchanged.
   */
  exportUniquePath(fileName: string): Promise<string>;
  /**
   * Write a Standard MIDI File (type 1: a tempo track plus one track per entry). A bare file name goes to
   * `Exports/`; `.mid` is added if missing. In the browser this triggers a download.
   */
  midiFileWrite(path: string, spec: MidiFileSpec): Promise<MidiFileResult>;

  // OS integration
  openDialog(options?: OpenDialogOptions): Promise<string | string[] | null>;
  saveDialog(options?: SaveDialogOptions): Promise<string | null>;
  revealInFinder(path: string): Promise<void>;
  /** Requests permission if needed. Resolves `true` when a notification was handed to the OS. */
  notify(options: NotifyOptions): Promise<boolean>;
  /** URL the web view can load for a file on disk (asset protocol). */
  convertFileSrc(path: string): string;

  // Menu bar (SPEC §7). Desktop: native menu; browser: no menu, these no-op and no actions arrive.
  /**
   * `menu://action` from the menu bar and the tray menu, delivered to the main window only. Accelerators belong to
   * the menu (see `MENU_ACTIONS`), so don't bind them in JS as well. App-level undo is the exception: the Edit menu
   * uses the predefined text Undo/Redo, and a JS ⌘Z / ⇧⌘Z `keydown` handler that finds focus outside editable
   * content calls `preventDefault()` and runs the app's undo (the web view sees key equivalents before the menu).
   */
  onMenuAction(callback: (event: MenuActionEvent) => void): Promise<Unsubscribe>;
  /** Enable/disable, check or relabel one custom item. Rejects `not_found` for an unknown id. */
  menuSetState(state: MenuItemState): Promise<void>;
  /** Replace File › Open Recent (first 10 shown, in the given order). */
  menuSetRecent(items: RecentItem[]): Promise<void>;

  // Context menus (right-click, Shift+F10). Most callers want `useContextMenu()`, which falls back to a DOM menu.
  /**
   * Show `entries` as an OS-drawn context menu at `at` (CSS px from the window's top-left); a chosen item's
   * `onSelect` runs. Resolves `true` once the menu was shown (on macOS: once it has closed again), `false` where
   * there is no native menu (browser), so the caller draws its own.
   */
  contextMenuPopup(entries: MenuEntry[], at: { x: number; y: number }): Promise<boolean>;
  /**
   * Draw OS chrome (context menus, the title bar) in the app's theme instead of the system one; `null` follows the
   * system again. Browser: no-op.
   */
  windowSetTheme(theme: 'dark' | 'light' | null): Promise<void>;

  // Windows
  /**
   * Send `payload` to every *other* Phyllo window on `channel` (letters, digits, `-`, `_`), e.g. settings changes
   * between main and Settings. Desktop: a global Tauri event; browser: `BroadcastChannel` between tabs.
   */
  broadcast(channel: string, payload: unknown): Promise<void>;
  onBroadcast(channel: string, callback: (payload: unknown) => void): Promise<Unsubscribe>;

  // Menu-bar mini transport (Settings › System "Keep playing from the menu bar", off by default)
  /** Create or remove the tray icon (Play/Pause, Stop, Show Phyllo, Quit). Resolves whether one exists; browser `false`. */
  traySetEnabled(enabled: boolean): Promise<boolean>;
  /** Tray Play/Pause label. */
  traySetPlaying(playing: boolean): Promise<void>;
  /** While on, closing the main window hides it and audio keeps playing. Turn on together with the tray. */
  appSetKeepRunning(keep: boolean): Promise<void>;

  // Media keys (Settings › System, on by default)
  /**
   * Native on macOS (MPRemoteCommandCenter); otherwise `navigator.mediaSession`. Resolves whether a handler set is
   * registered (`false` when turning off, or when neither exists).
   */
  mediaSetEnabled(enabled: boolean): Promise<boolean>;
  /** Project name and play state for Now Playing / the OS media overlay. Resolves `false` while media keys are off. */
  mediaSetNowPlaying(info: NowPlaying): Promise<boolean>;
  onMediaCommand(callback: (event: MediaCommandEvent) => void): Promise<Unsubscribe>;

  // Files opened from the OS (Finder double-click / Open With, `phyllo <file>`)
  /** Files the OS handed over before JS listened (cold start). Call once at startup, after `onOpenFiles`. */
  takePendingOpenFiles(): Promise<string[]>;
  onOpenFiles(callback: (event: OpenFilesEvent) => void): Promise<Unsubscribe>;

  /**
   * Native "export finished" notification with a Reveal action that shows `path` in Finder / Explorer (clicking the
   * body brings Phyllo forward). Keep the in-app Toast's Reveal button regardless: under `tauri dev` and on some
   * notification servers the action button does not show. Resolves `false` in the browser.
   */
  notifyExportFinished(notification: ExportFinishedNotification): Promise<boolean>;

  // Offline cache for Strudel's built-in sounds (DECISIONS V15). Allowlisted hosts only (`SOUND_CACHE_HOSTS`);
  // anything else rejects `invalid_argument`. Most callers want `createCachedUrlResolver` instead.
  /**
   * Make sure `url` is cached in `~/Music/Phyllo/.cache/sounds/` (downloading it if needed; concurrent calls for one
   * URL share a download) and resolve its path. Rejects `network` when the download fails. Browser: resolves the URL
   * itself, since the HTTP cache handles it.
   */
  soundCacheFetch(url: string): Promise<SoundCacheFetchResult>;
  soundCacheStatus(): Promise<SoundCacheStatus>;
  /** Delete every cached sound. Idempotent. */
  soundCacheClear(): Promise<void>;
  /**
   * Download all `urls` (6 at a time), skipping cached ones. Rejects `invalid_argument` up front if any URL is not
   * allowlisted; individual download failures only count in `failed`. Resolves with the final counts.
   */
  soundCachePrefetch(urls: string[]): Promise<SoundCacheProgress>;
  /** `sound-cache://progress` while a prefetch runs: once at the start (`done: 0`) and after every file. */
  onSoundCacheProgress(callback: (progress: SoundCacheProgress) => void): Promise<Unsubscribe>;

  settingsStore: SettingsStore;
}
