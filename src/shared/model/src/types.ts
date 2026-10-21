/**
 * Shared Phyllo types. Owned by the orchestrator: subagents import from here but never edit it.
 *
 * Conventions:
 * - Bars are 1-based and ranges are inclusive (`startBar: 9, endBar: 16` = 8 bars).
 * - One cycle = one bar (SPEC §1.3).
 * - Track params hold real Strudel values (e.g. `lpf: 1600` Hz, `lpq: 10`), not knob positions.
 *   Knob position ↔ value mapping lives in the param specs.
 */

// ── Enumerations ────────────────────────────────────────────────────────────

export type TrackKind = 'drum' | 'melodic' | 'chord' | 'sample' | 'code';

/** The Strudel source call a track starts with. */
export type SourceType = 's' | 'note' | 'n' | 'chord';

/** Parameters with a knob or fader, in canonical code order (SPEC §4.1). `orbit` is a track field, emitted last. */
export const PARAM_ORDER = [
  'gain',
  'pan',
  'lpf',
  'lpq',
  'hpf',
  'shape',
  'room',
  'roomsize',
  'delay',
  'delaytime',
  'delayfeedback',
] as const;
export type ParamName = (typeof PARAM_ORDER)[number];

/** A literal number, or a mini-notation string emitted as a patterned value, e.g. `.gain("[.45 .7]*4")`. */
export type ParamValue = number | string;

export const TRACK_COLORS = ['#7FD98A', '#5ECFC8', '#8AB4FF', '#F5C25B', '#B9A2FF', '#F59AC7', '#FF9C7A'] as const;
export type TrackColor = (typeof TRACK_COLORS)[number];

export type UiMode = 'guided' | 'pro';
export type ThemeMode = 'dark' | 'light' | 'system';
export type Accent = 'green' | 'red' | 'blue' | 'purple' | 'orange' | 'teal';

// ── Project (.phyllo, SPEC §3) ──────────────────────────────────────────────

export interface TrackSource {
  type: SourceType;
  /** `sawtooth`, `gm_epiano1`, a sample name; null for drum tracks whose sounds live in the pattern. */
  sound: string | null;
  /** Drum machine bank, e.g. `RolandTR909`. */
  bank: string | null;
}

export type ModifierOrigin = 'suggestion' | 'feel' | 'user' | 'parsed';

export interface Modifier {
  id: string;
  /** Verbatim chained call(s) including the leading dot: `.lpf(sine.range(400, 1400).slow(8))`. */
  code: string;
  /** Plain-language label shown in Guided mode and the modifier list. */
  label?: string;
  enabled: boolean;
  origin?: ModifierOrigin;
}

export interface Clip {
  id: string;
  startBar: number;
  endBar: number;
}

export interface Track {
  id: string;
  name: string;
  color: string;
  kind: TrackKind;
  source: TrackSource;
  /** Mini-notation string (the argument of the source call). Empty for `code` tracks. */
  pattern: string;
  params: Partial<Record<ParamName, ParamValue>>;
  modifiers: Modifier[];
  /** Strudel orbit (effect bus). Default 1. */
  orbit: number;
  mute: boolean;
  solo: boolean;
  clips: Clip[];
  /** Only for `kind: "code"`: the verbatim pattern expression (without the `$:` label). */
  rawCode: string | null;
}

export interface Section {
  id: string;
  name: string;
  startBar: number;
  endBar: number;
}

export interface Bus {
  orbit: number;
  roomsize?: number;
  delaytime?: number;
  delayfeedback?: number;
}

export interface Master {
  postgain: number;
  limiter: boolean;
}

export interface Project {
  format: 'phyllo/1';
  id: string;
  name: string;
  tags: string[];
  favorite: boolean;
  /** ISO 8601 */
  created: string;
  /** ISO 8601 */
  modified: string;
  tempo: { bpm: number; beatsPerBar: number };
  /** e.g. `C minor`, `D dorian` */
  key: string;
  lengthBars: number;
  loop: { enabled: boolean; startBar: number; endBar: number };
  sections: Section[];
  tracks: Track[];
  buses: Bus[];
  master: Master;
  /** Unknown top-level statements preserved verbatim from imported code (SPEC §4.2), emitted after setcpm. */
  prelude: string[];
  ui: { selectedTrack: string | null; zoom: number };
}

// ── Reducer actions (useProject().dispatch) ─────────────────────────────────

export type ProjectAction =
  | { type: 'project/load'; project: Project }
  | { type: 'project/rename'; name: string }
  | { type: 'project/setTags'; tags: string[] }
  | { type: 'project/setFavorite'; favorite: boolean }
  | { type: 'project/setKey'; key: string }
  | { type: 'project/setLength'; lengthBars: number }
  | { type: 'tempo/set'; bpm?: number; beatsPerBar?: number }
  | { type: 'loop/set'; enabled?: boolean; startBar?: number; endBar?: number }
  | { type: 'section/add'; section: Section }
  | { type: 'section/update'; sectionId: string; patch: Partial<Omit<Section, 'id'>> }
  | { type: 'section/remove'; sectionId: string }
  | { type: 'track/add'; track: Track; index?: number }
  | { type: 'track/remove'; trackId: string }
  | { type: 'track/update'; trackId: string; patch: Partial<Omit<Track, 'id'>> }
  | { type: 'track/move'; trackId: string; toIndex: number }
  | { type: 'track/setParam'; trackId: string; param: ParamName; value: ParamValue | null }
  | { type: 'track/setPattern'; trackId: string; pattern: string }
  | { type: 'track/setSource'; trackId: string; source: Partial<TrackSource> }
  | { type: 'track/setMute'; trackId: string; mute: boolean }
  | { type: 'track/setSolo'; trackId: string; solo: boolean }
  | { type: 'track/setOrbit'; trackId: string; orbit: number }
  | { type: 'modifier/add'; trackId: string; modifier: Modifier; index?: number }
  | { type: 'modifier/remove'; trackId: string; modifierId: string }
  | { type: 'modifier/update'; trackId: string; modifierId: string; patch: Partial<Omit<Modifier, 'id'>> }
  | { type: 'modifier/move'; trackId: string; modifierId: string; toIndex: number }
  | { type: 'clip/add'; trackId: string; clip: Clip }
  | { type: 'clip/update'; trackId: string; clipId: string; patch: Partial<Omit<Clip, 'id'>> }
  | { type: 'clip/split'; trackId: string; clipId: string; atBar: number; newClipId: string }
  | { type: 'clip/remove'; trackId: string; clipId: string }
  | { type: 'bus/set'; orbit: number; patch: Partial<Omit<Bus, 'orbit'>> }
  | { type: 'master/set'; patch: Partial<Master> }
  /** Replace all tracks + prelude from parsed code (code drawer edit, strudel.cc import). */
  | {
      type: 'code/replace';
      tracks: Track[];
      prelude: string[];
      tempo?: { bpm: number; beatsPerBar: number };
      buses?: Bus[];
      master?: Partial<Master>;
      lengthBars?: number;
    }
  | { type: 'ui/select'; trackId: string | null }
  | { type: 'ui/setZoom'; zoom: number };

// ── Code generation & parsing (engine) ──────────────────────────────────────

export type CodeScope = 'section' | 'song';

/** 1-based inclusive line range per track in generated code. */
export type LineMap = Record<string, { start: number; end: number }>;

export interface GeneratedProgram {
  code: string;
  lines: LineMap;
  scope: CodeScope;
}

export interface ParseWarning {
  message: string;
  line?: number;
}

export interface GenerateOptions {
  scope: CodeScope;
  /** For scope `section`: the bar whose section is rendered (the playhead's bar). Defaults to the loop start or bar 1. */
  atBar?: number;
  /** Append `.analyze("<trackId>")` to each track for per-track meters. Evaluated code only; never shown (DECISIONS V9). */
  instrument?: boolean;
}

export interface ParseResult {
  tracks: Track[];
  prelude: string[];
  tempo?: { bpm: number; beatsPerBar: number };
  /** From a top-level `all(x => x.postgain(v))`. */
  master?: Partial<Master>;
  /** Song length implied by `arrange()` totals, when present. */
  lengthBars?: number;
  /** Orbit bus settings inferred from tracks (parse option `inferBuses`). */
  buses?: Bus[];
  /** false when the code has a syntax error; tracks are then empty and the caller keeps its last good model. */
  ok: boolean;
  error?: { message: string; line: number; column: number };
  warnings: ParseWarning[];
}

export interface EngineError {
  /** `eval`: JS/transpile error; `pattern`: mini-notation parse error; `query`: thrown while querying haps; `runtime`: error while playing a hap (e.g. sound not found). */
  kind?: 'eval' | 'pattern' | 'query' | 'runtime';
  message: string;
  trackId?: string;
  line?: number;
  column?: number;
  /** For `pattern` errors: 1-based column inside the mini-notation string (`column` is absolute in the code). */
  patternColumn?: number;
}

export interface EngineStatus {
  ok: boolean;
  /** epoch ms of the last successful evaluation */
  evaluatedAt: number | null;
  error?: EngineError;
}

export interface TransportPosition {
  /** 1-based */
  bar: number;
  /** 1-based */
  beat: number;
  /** 1-based, 1–4 */
  sixteenth: number;
  /** float cycles since song start, 0-based */
  cycle: number;
}

/** [left, right] linear peak 0–1 */
export type MeterLevel = readonly [number, number];

// ── Step grid (SPEC §4.3) ───────────────────────────────────────────────────

export interface StepRowModel {
  /** sound name, e.g. `bd` */
  sound: string;
  /** 16 booleans */
  steps: boolean[];
  /** optional per-step gain 0–1 (velocity lane) */
  velocities?: number[];
  /** set while the row came from the Euclid tool and hasn't been hand-edited */
  euclid?: { hits: number; steps: number; rotation?: number };
}

export type GridParseResult =
  | { ok: true; rows: StepRowModel[] }
  | { ok: false; reason: string };

// ── Library (Rust index, SPEC §6.7) ─────────────────────────────────────────

export interface GrooveSummary {
  id: string;
  path: string;
  name: string;
  tags: string[];
  favorite: boolean;
  bpm: number;
  key: string;
  lengthBars: number;
  trackCount: number;
  created: string;
  modified: string;
  /** ISO 8601; drives the Recent collection (opened within 14 days) */
  opened: string | null;
  /** Up to 3 rows × 16 steps from the first tracks, with each row's track color */
  preview: { color: string; steps: boolean[] }[];
}

export interface TagInfo {
  name: string;
  color: string;
  count: number;
}

export type LibrarySort = 'edited' | 'name' | 'created' | 'bpm';
export type LibraryView = 'grid' | 'list';
export type LibraryCollection = 'all' | 'favorites' | 'recent';

// ── Settings (user config, not the project; SPEC §6.6) ──────────────────────

export type MidiDirection = 'in' | 'out';

export interface MidiPort {
  id: string;
  name: string;
  vendor?: string;
  direction: MidiDirection;
  enabled: boolean;
}

export interface SampleFolder {
  path: string;
  fileCount: number;
  watching: boolean;
}

export interface Settings {
  appearance: { mode: ThemeMode; accent: Accent };
  uiMode: UiMode;
  audio: { outputDevice: string | null; sampleRate: number | null; lookaheadMs: number };
  midi: {
    enabledPorts: string[];
    /** Keyed by `String(cc)`; each CC drives that knob on whichever track is selected (SPEC §6.6). */
    ccMap: Record<string, { trackParam: ParamName; cc: number }>;
  };
  osc: { enabled: boolean; host: string; port: number };
  sampleFolders: string[];
  system: { mediaKeys: boolean; menuBar: boolean; fileAssociations: boolean; autosave: boolean };
  tips: { hidden: boolean; step: number };
  library: { view: LibraryView; tileSize: 0 | 1 | 2 | 3 | 4; sort: LibrarySort };
  codeDrawer: { open: boolean | null };
}
