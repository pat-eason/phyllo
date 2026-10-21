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
} as const;

export const EVENTS = {
  libraryChanged: 'library://changed',
  samplesChanged: 'samples://changed',
} as const;
