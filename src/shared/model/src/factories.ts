import { newId } from "./ids";
import { TRACK_COLORS } from "./types";
import type {
  Clip,
  Master,
  Modifier,
  ModifierOrigin,
  ParamName,
  ParamValue,
  Project,
  Section,
  Track,
  TrackKind,
  TrackSource,
} from "./types";

export const PROJECT_FORMAT = "phyllo/1" as const;
export const DEFAULT_BPM = 120;
export const DEFAULT_BEATS_PER_BAR = 4;
export const DEFAULT_LENGTH_BARS = 32;
export const DEFAULT_ORBIT = 1;
export const DEFAULT_KEY = "C minor";
export const DEFAULT_PROJECT_NAME = "Untitled Groove";
/** Loop region of a fresh project (clamped to the song length). */
export const DEFAULT_LOOP_BARS = 8;
export const DEFAULT_MASTER: Readonly<Master> = { postgain: 1, limiter: true };

// ── clips & sections ────────────────────────────────────────────────────────

export function createClip(startBar: number, endBar: number, id: string = newId("clip_")): Clip {
  return { id, startBar, endBar };
}

export function createSection(name: string, startBar: number, endBar: number, id: string = newId("sec_")): Section {
  return { id, name, startBar, endBar };
}

// ── modifiers ───────────────────────────────────────────────────────────────

export interface CreateModifierOptions {
  id?: string;
  label?: string;
  enabled?: boolean;
  origin?: ModifierOrigin;
}

/** A modifier from a chained call. The code is trimmed and gets a leading dot if it lacks one. */
export function createModifier(code: string, opts: CreateModifierOptions = {}): Modifier {
  const trimmed = code.trim();
  const modifier: Modifier = {
    id: opts.id ?? newId("mod_"),
    code: trimmed.startsWith(".") ? trimmed : `.${trimmed}`,
    enabled: opts.enabled ?? true,
  };
  if (opts.label !== undefined) modifier.label = opts.label;
  if (opts.origin !== undefined) modifier.origin = opts.origin;
  return modifier;
}

// ── tracks ──────────────────────────────────────────────────────────────────

/** First palette colour not used by `tracks`; once all seven are taken, round-robin by track count. */
export function nextTrackColor(tracks: readonly Pick<Track, "color">[]): string {
  const used = new Set(tracks.map((t) => t.color.toLowerCase()));
  const free = TRACK_COLORS.find((c) => !used.has(c.toLowerCase()));
  return free ?? TRACK_COLORS[tracks.length % TRACK_COLORS.length] ?? TRACK_COLORS[0];
}

const KIND_NAMES: Record<TrackKind, string> = {
  drum: "Drums",
  melodic: "Melody",
  chord: "Chords",
  sample: "Sample",
  code: "Code",
};

const KIND_DEFAULTS: Record<TrackKind, { source: TrackSource; pattern: string }> = {
  drum: { source: { type: "s", sound: null, bank: "RolandTR909" }, pattern: "bd*4" },
  melodic: { source: { type: "note", sound: "sawtooth", bank: null }, pattern: "c3 eb3 g3 bb3" },
  chord: { source: { type: "chord", sound: "gm_epiano1", bank: null }, pattern: "<Cm7 Fm7>" },
  sample: { source: { type: "s", sound: null, bank: null }, pattern: "~" },
  code: { source: { type: "s", sound: null, bank: null }, pattern: "" },
};

/** Default name for a new track of `kind`: `Drums`, then `Drums 2`, `Drums 3`, … */
export function defaultTrackName(kind: TrackKind, existing: readonly Pick<Track, "name">[] = []): string {
  const base = KIND_NAMES[kind];
  const names = new Set(existing.map((t) => t.name));
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/** True for names a parser/factory would invent (`Track 2`, `Drums`, `$1`, empty…) rather than something the user chose. */
export function isGenericTrackName(name: string): boolean {
  const n = name.trim();
  return n === "" || /^(?:track|pattern|drums?|melody|chords?|sample|code)\s*\d*$/i.test(n) || /^_?\$\d*$/.test(n);
}

export interface CreateTrackOptions {
  id?: string;
  name?: string;
  color?: string;
  /** Tracks already in the project: used for the next colour and unique default name. */
  existing?: readonly Track[];
  /** Song length for the default full-song clip. Default 32. */
  lengthBars?: number;
  pattern?: string;
  /** Partial override of the per-kind source (`sound`, `bank`, `type`). */
  source?: Partial<TrackSource>;
  params?: Partial<Record<ParamName, ParamValue>>;
  modifiers?: Modifier[];
  orbit?: number;
  mute?: boolean;
  solo?: boolean;
  clips?: Clip[];
  /** For `kind: "code"`; defaults to `silence`. */
  rawCode?: string;
}

/**
 * New track with per-kind defaults: drum → `s` + bank `RolandTR909`; melodic → `note` + `sawtooth`;
 * chord → `chord` + `gm_epiano1`; sample → `s`; code → raw code. One clip spanning the whole song, orbit 1.
 */
export function createTrack(kind: TrackKind, opts: CreateTrackOptions = {}): Track {
  const existing = opts.existing ?? [];
  const defaults = KIND_DEFAULTS[kind];
  const lengthBars = opts.lengthBars ?? DEFAULT_LENGTH_BARS;
  return {
    id: opts.id ?? newId("trk_"),
    name: opts.name ?? defaultTrackName(kind, existing),
    color: opts.color ?? nextTrackColor(existing),
    kind,
    source: { ...defaults.source, ...opts.source },
    pattern: opts.pattern ?? defaults.pattern,
    params: { ...opts.params },
    modifiers: opts.modifiers ?? [],
    orbit: opts.orbit ?? DEFAULT_ORBIT,
    mute: opts.mute ?? false,
    solo: opts.solo ?? false,
    clips: opts.clips ?? [createClip(1, lengthBars)],
    rawCode: kind === "code" ? (opts.rawCode ?? "silence") : null,
  };
}

// ── project ─────────────────────────────────────────────────────────────────

export interface CreateProjectOptions {
  id?: string;
  name?: string;
  tags?: string[];
  favorite?: boolean;
  bpm?: number;
  beatsPerBar?: number;
  key?: string;
  lengthBars?: number;
  tracks?: Track[];
  sections?: Section[];
  /** Timestamp for `created`/`modified`. Default: now. */
  now?: Date | string;
}

function isoNow(now: Date | string | undefined): string {
  if (typeof now === "string") return now;
  return (now ?? new Date()).toISOString();
}

/** A blank `phyllo/1` project: Untitled Groove, 120 BPM 4/4, C minor, 32 bars, loop on over bars 1–8, one "Song" section. */
export function createProject(opts: CreateProjectOptions = {}): Project {
  const lengthBars = opts.lengthBars ?? DEFAULT_LENGTH_BARS;
  const stamp = isoNow(opts.now);
  return {
    format: PROJECT_FORMAT,
    id: opts.id ?? newId("prj_"),
    name: opts.name ?? DEFAULT_PROJECT_NAME,
    tags: opts.tags ?? [],
    favorite: opts.favorite ?? false,
    created: stamp,
    modified: stamp,
    tempo: { bpm: opts.bpm ?? DEFAULT_BPM, beatsPerBar: opts.beatsPerBar ?? DEFAULT_BEATS_PER_BAR },
    key: opts.key ?? DEFAULT_KEY,
    lengthBars,
    loop: { enabled: true, startBar: 1, endBar: Math.min(DEFAULT_LOOP_BARS, lengthBars) },
    sections: opts.sections ?? [createSection("Song", 1, lengthBars)],
    tracks: opts.tracks ?? [],
    buses: [],
    master: { ...DEFAULT_MASTER },
    prelude: [],
    ui: { selectedTrack: null, zoom: 1 },
  };
}
