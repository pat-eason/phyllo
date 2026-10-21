/**
 * Wire types for the native (Rust) layer. They mirror the serde structs in `src-tauri/src` one to one
 * (camelCase via `#[serde(rename_all = "camelCase")]`). Anything computed in TypeScript (previews, `GrooveSummary`)
 * lives in `@phyllo/model`, not here.
 */

/** Stable error codes; mirrors `Error::code()` in `src-tauri/src/error.rs`. */
export type NativeErrorCode =
  | 'not_found'
  | 'io'
  | 'json'
  | 'invalid_format'
  | 'invalid_argument'
  | 'trash'
  | 'watch'
  | 'midi'
  | 'osc'
  | 'internal'
  /** The command never reached Rust, or rejected with something that is not `{ code, message }`. */
  | 'unknown';

export interface NativeErrorPayload {
  code: NativeErrorCode;
  message: string;
}

export type Unsubscribe = () => void;

// ── Paths ───────────────────────────────────────────────────────────────────

export interface PhylloPaths {
  /** `~/Music/Phyllo` (or `PHYLLO_HOME`) */
  root: string;
  /** `<root>/Exports` */
  exports: string;
}

// ── Library index (SPEC §6.7) ───────────────────────────────────────────────

export interface TrackSummary {
  kind: string;
  color: string;
  pattern: string;
  sourceType: string;
  mute: boolean;
}

export interface LibrarySummary {
  id: string;
  name: string;
  tags: string[];
  favorite: boolean;
  bpm: number;
  beatsPerBar: number;
  key: string;
  lengthBars: number;
  trackCount: number;
  /** ISO 8601 */
  created: string;
  /** ISO 8601 */
  modified: string;
  /** The first three tracks only. */
  tracks: TrackSummary[];
}

export interface LibraryEntry {
  path: string;
  fileModifiedMs: number;
  summary: LibrarySummary;
  /** ISO 8601 of the last time the project was opened, from the `.phyllo-index.json` sidecar. */
  opened: string | null;
}

export interface LibraryScanError {
  path: string;
  message: string;
}

export interface LibraryScan {
  entries: LibraryEntry[];
  errors: LibraryScanError[];
}

// ── Version history ─────────────────────────────────────────────────────────

export interface SnapshotInfo {
  /** Sortable timestamp id, e.g. `20261021T124100123Z`. */
  id: string;
  /** ISO 8601 */
  takenAt: string;
  sizeBytes: number;
}

// ── Sample folders (SPEC §4.5) ──────────────────────────────────────────────

export interface SampleFile {
  /** Strudel sound name (`vox.wav` -> `vox`); collisions get numeric suffixes. */
  name: string;
  path: string;
  /** lowercase, no dot */
  ext: string;
}

export interface SampleScan {
  path: string;
  files: SampleFile[];
}

export interface SamplesChangedEvent {
  folder: string;
}

// ── Dialogs / notifications ─────────────────────────────────────────────────

export interface DialogFilter {
  name: string;
  extensions: string[];
}

export interface OpenDialogOptions {
  title?: string;
  filters?: DialogFilter[];
  defaultPath?: string;
  multiple?: boolean;
  directory?: boolean;
}

export interface SaveDialogOptions {
  title?: string;
  filters?: DialogFilter[];
  defaultPath?: string;
}

export interface NotifyOptions {
  title: string;
  body?: string;
}

// ── MIDI (SPEC §5, §6.6) ────────────────────────────────────────────────────

export type MidiDirection = 'in' | 'out';

export interface MidiPortInfo {
  /** `<in|out>:<name>:<index among ports with the same name>`; stable across rescans while the device stays plugged in. */
  id: string;
  name: string;
  direction: MidiDirection;
}

export type MidiMessageKind = 'noteon' | 'noteoff' | 'cc' | 'pitchbend' | 'other';

/**
 * One incoming message (`midi://message`). `channel` is 1-based (1..16, like Strudel's `midichan`); 0 for system messages.
 * `noteon`/`noteoff`: data1 = note, data2 = velocity (note-on with velocity 0 arrives as `noteoff`).
 * `cc`: data1 = controller, data2 = value. `pitchbend`: data1 = 14-bit value (0..16383, centre 8192), data2 = 0.
 * `other`: data1/data2 are the raw data bytes (start/continue/stop have none). `status` is always the raw status byte.
 * Clock, active sensing and SysEx are dropped. Bursts of the same CC or pitch-bend are coalesced to the latest value.
 */
export interface MidiMessageEvent {
  portId: string;
  kind: MidiMessageKind;
  channel: number;
  data1: number;
  data2: number;
  status: number;
  /** Microseconds on a monotonic clock with an arbitrary origin; only differences are meaningful. */
  timestampUs: number;
}

export interface MidiOutMessage {
  /** Raw MIDI bytes starting with a status byte (>= 0x80), at most 1024 bytes. */
  bytes: number[];
  /** Delay in ms relative to the moment the command reaches Rust (clamped to 0..60000). Missing means now. */
  atMs?: number;
}

// ── OSC ─────────────────────────────────────────────────────────────────────

export interface OscConfig {
  enabled: boolean;
  host: string;
  port: number;
}

/** Default: off, SuperDirt on loopback. */
export const DEFAULT_OSC_CONFIG: OscConfig = { enabled: false, host: '127.0.0.1', port: 57120 };

export type OscArg = number | string;

export interface OscMessageOut {
  /** Must start with `/`, e.g. `/dirt/play` (args are alternating key, value). */
  address: string;
  /** Integral numbers that fit int32 go out as int32, other finite numbers as float32, strings as strings. */
  args: OscArg[];
  /** With it the message is sent as a bundle timetagged now + atMs; without it as a plain message. */
  atMs?: number;
}

// ── Command and event names (single source of truth for tauri.ts and its tests) ──

export const COMMANDS = {
  pathsGet: 'paths_get',
  projectRead: 'project_read',
  projectWrite: 'project_write',
  projectNewPath: 'project_new_path',
  strudelRead: 'strudel_read',
  strudelWrite: 'strudel_write',
  libraryScan: 'library_scan',
  libraryMarkOpened: 'library_mark_opened',
  libraryWatch: 'library_watch',
  historySnapshot: 'history_snapshot',
  historyList: 'history_list',
  historyRead: 'history_read',
  moveToTrash: 'move_to_trash',
  sampleFolderScan: 'sample_folder_scan',
  sampleFoldersWatch: 'sample_folders_watch',
  midiListPorts: 'midi_list_ports',
  midiRescan: 'midi_rescan',
  midiOpenInput: 'midi_open_input',
  midiCloseInput: 'midi_close_input',
  midiOpenOutput: 'midi_open_output',
  midiCloseOutput: 'midi_close_output',
  midiSend: 'midi_send',
  midiPanic: 'midi_panic',
  oscConfigure: 'osc_configure',
  oscSend: 'osc_send',
} as const;

export const EVENTS = {
  libraryChanged: 'library://changed',
  samplesChanged: 'samples://changed',
  midiMessage: 'midi://message',
  midiPortsChanged: 'midi://ports-changed',
} as const;
