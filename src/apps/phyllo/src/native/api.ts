import type {
  LibraryScan,
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
