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
  | 'unsupported_format'
  | 'encode'
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

// ── Export (SPEC §6.5, DECISIONS V11) ──────────────────────────────────────

export type ExportFormat = 'wav' | 'flac' | 'mp3';

/** 16/24-bit integer or 32-bit float. FLAC is 16/24 only; MP3 is always 320 kbps CBR and ignores the depth. */
export type ExportBitDepth = 16 | 24 | 32;

export interface ExportBeginOptions {
  /** A bare file name goes to `Exports/`; otherwise an absolute path in an existing folder. A missing extension gets the format's. */
  path: string;
  format: ExportFormat;
  bitDepth: ExportBitDepth;
  /** Must equal the rate the PCM was rendered at; there is no resampler. MP3 needs 32000, 44100 or 48000. */
  sampleRate: number;
  channels: 1 | 2;
  /**
   * Scale the whole signal so its sample peak equals this many dBFS (typically -1). Boosts quiet audio and
   * attenuates loud audio alike; digital silence is left alone. `null`/missing leaves levels untouched.
   */
  normalizeDbfs?: number | null;
}

export interface ExportSession {
  sessionId: string;
}

export interface ExportResult {
  /** Final path of the written file. */
  path: string;
  durationSec: number;
  /** Sample peak of the written audio in dBFS (after normalize); `null` for digital silence. */
  peakDbfs: number | null;
  bytes: number;
}

export interface MidiFileNote {
  startSec: number;
  /** > 0 */
  durationSec: number;
  /** 0..127 */
  note: number;
  /** 1..127 */
  velocity: number;
}

export interface MidiFileTrack {
  name: string;
  /** 1..16 */
  channel: number;
  notes: MidiFileNote[];
}

export interface MidiFileSpec {
  /** 20..999 */
  bpm: number;
  /** Ticks per quarter note; defaults to 480. */
  ppq?: number;
  tracks: MidiFileTrack[];
}

export interface MidiFileResult {
  path: string;
  bytes: number;
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
  exportBegin: 'export_begin',
  exportChunk: 'export_chunk',
  exportFinish: 'export_finish',
  exportCancel: 'export_cancel',
  midiFileWrite: 'midi_file_write',
} as const;

export const EVENTS = {
  libraryChanged: 'library://changed',
  samplesChanged: 'samples://changed',
  midiMessage: 'midi://message',
  midiPortsChanged: 'midi://ports-changed',
} as const;
