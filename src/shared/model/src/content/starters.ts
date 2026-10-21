import type { Clip, Modifier, ParamName, ParamValue, Project, Section, Track, TrackKind, TrackSource } from "../types";
import { keyPrefersFlats, semitonesBetween, transposePattern } from "./transpose";

/**
 * Starter grooves for Guided start (SPEC §6.2). Every pattern here is original, generic groove material.
 * Source: the `S` array in `Onboarding.dc.html`, mapped onto the project model.
 */

export type StarterId = "house" | "lofi" | "breaks" | "stage" | "ambient" | "euclid" | "blank";

export interface StarterDef {
  id: StarterId;
  name: string;
  /** One line shown on the card */
  description: string;
  bpm: number;
  /** e.g. `A minor` */
  key: string;
  /** Three row colors for the preview strip */
  colors: [string, string, string];
  /** 3 rows × 16 steps for the card preview */
  preview: boolean[][];
  /** Number of tracks the starter creates */
  trackCount: number;
  /** Card chip: `4 tracks`, `Empty` */
  tracksLabel: string;
  /** Tags saved with the project */
  tags: string[];
}

export interface BuildStarterOptions {
  /** Tempo override; rounded and clamped to 40–240 */
  bpm?: number;
  /** Key override, e.g. `F major`. Melodic and chord tracks are transposed by the distance between the roots. */
  key?: string;
  /** Timestamp for `created` / `modified`. Default: now. */
  now?: Date | string;
  /** Id factory for the project, tracks, modifiers, clips and sections. Default: readable ids (`kick`, `kick-clip-1`), random project id. */
  newId?: (kind: "project" | "track" | "modifier" | "clip" | "section", hint: string) => string;
  /** Project name. Default `Untitled Groove`. */
  name?: string;
}

interface ModifierSpec {
  code: string;
  label: string;
}

interface TrackSpec {
  name: string;
  color: string;
  kind: Extract<TrackKind, "drum" | "melodic" | "chord">;
  source: TrackSource;
  pattern: string;
  params?: Partial<Record<ParamName, ParamValue>>;
  modifiers?: ModifierSpec[];
  /** Inclusive 1-based bar ranges where this track sounds */
  clips: [number, number][];
}

interface StarterSpec {
  def: Omit<StarterDef, "trackCount" | "tracksLabel" | "preview"> & { rows: [string, string, string] };
  sections: { id: string; name: string; startBar: number; endBar: number }[];
  loop: { startBar: number; endBar: number };
  tracks: TrackSpec[];
  bus?: { roomsize?: number };
}

const GREEN = "#7FD98A";
const TEAL = "#5ECFC8";
const BLUE = "#8AB4FF";
const AMBER = "#F5C25B";
const VIOLET = "#B9A2FF";
const PINK = "#F59AC7";

export const SONG_BARS = 32;
export const BPM_MIN = 40;
export const BPM_MAX = 240;

const drum = (bank: string | null): TrackSource => ({ type: "s", sound: null, bank });
const synth = (sound: string): TrackSource => ({ type: "note", sound, bank: null });
const chordVoice = (sound: string): TrackSource => ({ type: "chord", sound, bank: null });

const STANDARD_SECTIONS = [
  { id: "intro", name: "Intro", startBar: 1, endBar: 8 },
  { id: "groove", name: "Groove", startBar: 9, endBar: 16 },
  { id: "break", name: "Break", startBar: 17, endBar: 20 },
  { id: "drop", name: "Drop", startBar: 21, endBar: 32 },
];

const SPECS: Record<StarterId, StarterSpec> = {
  house: {
    def: {
      id: "house",
      name: "House groove",
      description: "Four-on-the-floor kick, offbeat clap, a rolling bass.",
      bpm: 124,
      key: "A minor",
      colors: [GREEN, TEAL, BLUE],
      rows: ["x...x...x...x...", "....x.......x...", "xxxxxxxxxxxxxxxx"],
      tags: ["house"],
    },
    sections: STANDARD_SECTIONS,
    loop: { startBar: 9, endBar: 16 },
    tracks: [
      {
        name: "Kick",
        color: GREEN,
        kind: "drum",
        source: drum("RolandTR909"),
        pattern: "bd*4",
        clips: [
          [5, 16],
          [21, 32],
        ],
      },
      {
        name: "Clap",
        color: TEAL,
        kind: "drum",
        source: drum("RolandTR909"),
        pattern: "~ cp",
        params: { room: 0.2 },
        clips: [
          [9, 16],
          [21, 32],
        ],
      },
      {
        name: "Hats",
        color: BLUE,
        kind: "drum",
        source: drum("RolandTR909"),
        pattern: "hh*8",
        params: { gain: "[.4 .7]*4" },
        clips: [
          [1, 16],
          [21, 32],
        ],
      },
      {
        name: "Bass",
        color: AMBER,
        kind: "melodic",
        source: synth("sawtooth"),
        pattern: "<a1 a1 c2 g1>*2",
        params: { lpf: 900 },
        clips: [[9, 32]],
      },
    ],
  },

  lofi: {
    def: {
      id: "lofi",
      name: "Lo-fi keys",
      description: "Dusty drums under slow, warm jazz chords.",
      bpm: 82,
      key: "F major",
      colors: [GREEN, TEAL, VIOLET],
      rows: ["x.....x...x.....", "....x.......x...", "x...x...x...x..."],
      tags: ["lo-fi"],
    },
    sections: [
      { id: "intro", name: "Intro", startBar: 1, endBar: 8 },
      { id: "verse", name: "Verse", startBar: 9, endBar: 16 },
      { id: "bridge", name: "Bridge", startBar: 17, endBar: 20 },
      { id: "main", name: "Main", startBar: 21, endBar: 32 },
    ],
    loop: { startBar: 9, endBar: 16 },
    tracks: [
      {
        name: "Drums",
        color: GREEN,
        kind: "drum",
        source: drum("LinnDrum"),
        pattern: "bd ~ ~ bd, ~ sd",
        params: { lpf: 3000 },
        clips: [
          [9, 16],
          [21, 32],
        ],
      },
      {
        name: "Hats",
        color: TEAL,
        kind: "drum",
        source: drum(null),
        pattern: "hh*8",
        params: { gain: 0.3 },
        modifiers: [{ code: ".degradeBy(.3)", label: "Skip a few hits" }],
        clips: [
          [5, 16],
          [21, 32],
        ],
      },
      {
        name: "Keys",
        color: VIOLET,
        kind: "chord",
        source: chordVoice("gm_epiano1"),
        pattern: "<F^7 Em7 Dm7 C^7>",
        params: { room: 0.6 },
        clips: [[1, 32]],
      },
    ],
  },

  breaks: {
    def: {
      id: "breaks",
      name: "Breakbeat",
      description: "Syncopated kicks and snares at drum & bass speed.",
      bpm: 170,
      key: "E minor",
      colors: [GREEN, PINK, BLUE],
      rows: ["x.....x...x.....", "....x.......x..x", "x.x.x.x.x.x.x.x."],
      tags: ["breaks"],
    },
    sections: STANDARD_SECTIONS,
    loop: { startBar: 9, endBar: 16 },
    tracks: [
      {
        name: "Drums",
        color: GREEN,
        kind: "drum",
        source: drum("AkaiMPC60"),
        pattern: "bd ~ ~ bd ~ ~ bd ~, ~ sd ~ [~ sd]",
        clips: [
          [9, 16],
          [21, 32],
        ],
      },
      {
        name: "Hats",
        color: PINK,
        kind: "drum",
        source: drum("AkaiMPC60"),
        pattern: "hh*8",
        params: { gain: "[.5 .3]*4" },
        clips: [
          [1, 20],
          [21, 32],
        ],
      },
      {
        name: "Bass",
        color: BLUE,
        kind: "melodic",
        source: synth("sine"),
        pattern: "<e1 g1>",
        params: { shape: 0.4 },
        clips: [[13, 32]],
      },
    ],
  },

  stage: {
    def: {
      id: "stage",
      name: "16-bit stage",
      description: "Fast console-era action: FM octave bass, square lead, punchy drums.",
      bpm: 150,
      key: "C minor",
      colors: [GREEN, TEAL, AMBER],
      rows: ["x.........x.....", "....x.......x...", "x.x.x.x.x.x.x.x."],
      tags: ["chiptune"],
    },
    sections: STANDARD_SECTIONS,
    loop: { startBar: 9, endBar: 16 },
    tracks: [
      {
        name: "Drums",
        color: GREEN,
        kind: "drum",
        source: drum("RolandTR909"),
        pattern: "bd ~ [~ bd] ~, ~ sd ~ sd",
        clips: [
          [1, 16],
          [21, 32],
        ],
      },
      {
        name: "Hats",
        color: TEAL,
        kind: "drum",
        source: drum("RolandTR909"),
        pattern: "hh*8",
        clips: [
          [9, 16],
          [21, 32],
        ],
      },
      {
        name: "Bass",
        color: AMBER,
        kind: "melodic",
        source: synth("sine"),
        pattern: "<[c2 c3]*4 [ab1 ab2]*4 [bb1 bb2]*4 [g1 g2]*4>",
        modifiers: [
          { code: ".fmi(3).fmh(2)", label: "Buzzy FM tone" },
          { code: ".decay(.15).sustain(0)", label: "Short plucked notes" },
        ],
        clips: [[1, 32]],
      },
      {
        name: "Lead",
        color: PINK,
        kind: "melodic",
        source: synth("square"),
        pattern: "c5 eb5 g5 [bb5 g5] f5 ~ eb5 d5",
        params: { lpf: 3500, delay: 0.2 },
        clips: [
          [9, 16],
          [21, 32],
        ],
      },
    ],
  },

  ambient: {
    def: {
      id: "ambient",
      name: "Ambient drift",
      description: "Long sine tones that evolve slowly in a big room.",
      bpm: 70,
      key: "C minor",
      colors: [VIOLET, AMBER, TEAL],
      rows: ["x...............", "........x.......", "....x.......x..."],
      tags: ["ambient"],
    },
    sections: [
      { id: "intro", name: "Intro", startBar: 1, endBar: 8 },
      { id: "drift", name: "Drift", startBar: 9, endBar: 16 },
      { id: "hush", name: "Hush", startBar: 17, endBar: 20 },
      { id: "bloom", name: "Bloom", startBar: 21, endBar: 32 },
    ],
    loop: { startBar: 9, endBar: 16 },
    bus: { roomsize: 5 },
    tracks: [
      {
        name: "Pad",
        color: VIOLET,
        kind: "melodic",
        source: synth("sine"),
        pattern: "<c3 g3 eb4 bb3>",
        params: { room: 0.9 },
        modifiers: [
          { code: ".attack(2).release(4)", label: "Slow fade in and out" },
          { code: ".slow(2)", label: "Half speed" },
        ],
        clips: [[1, 32]],
      },
      {
        name: "Lead",
        color: AMBER,
        kind: "melodic",
        source: synth("triangle"),
        pattern: "c5 ~ g5 ~",
        params: { gain: 0.3, delay: 0.6 },
        clips: [
          [9, 16],
          [21, 32],
        ],
      },
    ],
  },

  euclid: {
    def: {
      id: "euclid",
      name: "Euclid rhythms",
      description: "Learn rhythm math: spread N hits evenly over M steps.",
      bpm: 110,
      key: "D dorian",
      colors: [GREEN, TEAL, BLUE],
      rows: ["x..x..x.x..x..x.", "..x...x...x...x.", "x.xx.xx.x.xx.xx."],
      tags: ["euclid"],
    },
    sections: STANDARD_SECTIONS,
    loop: { startBar: 9, endBar: 16 },
    tracks: [
      {
        name: "Kick",
        color: GREEN,
        kind: "drum",
        source: drum("RolandTR808"),
        pattern: "bd(3,8)",
        clips: [
          [5, 16],
          [21, 32],
        ],
      },
      {
        name: "Clap",
        color: TEAL,
        kind: "drum",
        source: drum("RolandTR808"),
        pattern: "cp(2,8,2)",
        clips: [
          [9, 16],
          [21, 32],
        ],
      },
      {
        name: "Hats",
        color: BLUE,
        kind: "drum",
        source: drum("RolandTR808"),
        pattern: "hh(5,8)",
        clips: [[1, 32]],
      },
    ],
  },

  blank: {
    def: {
      id: "blank",
      name: "Blank project",
      description: "No tracks. Drag sounds in from the library.",
      bpm: 120,
      key: "C minor",
      colors: [GREEN, TEAL, BLUE],
      rows: ["................", "................", "................"],
      tags: [],
    },
    sections: STANDARD_SECTIONS,
    loop: { startBar: 1, endBar: 8 },
    tracks: [],
  },
};

const STARTER_ORDER: StarterId[] = ["house", "lofi", "breaks", "stage", "ambient", "euclid", "blank"];

function parseRow(row: string): boolean[] {
  return Array.from({ length: 16 }, (_, i) => row[i] === "x");
}

/** The seven starter cards, in display order. */
export const STARTERS: readonly StarterDef[] = STARTER_ORDER.map((id) => {
  const { rows, ...rest } = SPECS[id].def;
  const count = SPECS[id].tracks.length;
  return {
    ...rest,
    preview: rows.map(parseRow),
    trackCount: count,
    tracksLabel: count === 0 ? "Empty" : `${count} tracks`,
  };
});

export function getStarter(id: string): StarterDef | undefined {
  return STARTERS.find((s) => s.id === id);
}

export function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return 120;
  return Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(bpm)));
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function defaultProjectId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Build a complete, valid project from a starter.
 * `key` transposes melodic and chord tracks by the distance between the starter's root and the new root.
 * `bpm` changes tempo only. Unknown ids throw.
 */
export function buildStarterProject(id: StarterId | string, options: BuildStarterOptions = {}): Project {
  const spec = SPECS[id as StarterId];
  if (!spec) throw new Error(`Unknown starter "${id}"`);
  const def = spec.def;
  const nowValue = options.now ?? new Date();
  const iso = typeof nowValue === "string" ? nowValue : nowValue.toISOString();
  const key = options.key ?? def.key;
  const semitones = semitonesBetween(def.key, key);
  const flats = keyPrefersFlats(key);
  const next =
    options.newId ??
    ((kind: string, hint: string): string => {
      if (kind === "project") return defaultProjectId();
      return hint;
    });

  const usedTrackIds = new Set<string>();
  const tracks: Track[] = spec.tracks.map((t) => {
    let trackId = next("track", slug(t.name));
    if (usedTrackIds.has(trackId)) trackId = `${trackId}-${usedTrackIds.size + 1}`;
    usedTrackIds.add(trackId);
    const pattern =
      semitones !== 0 && t.kind === "melodic"
        ? transposePattern(t.pattern, semitones, { kind: "note", flats })
        : semitones !== 0 && t.kind === "chord"
          ? transposePattern(t.pattern, semitones, { kind: "chord", flats })
          : t.pattern;
    const modifiers: Modifier[] = (t.modifiers ?? []).map((m, i) => ({
      id: next("modifier", `${trackId}-mod-${i + 1}`),
      code: m.code,
      label: m.label,
      enabled: true,
    }));
    const clips: Clip[] = t.clips.map(([startBar, endBar], i) => ({
      id: next("clip", `${trackId}-clip-${i + 1}`),
      startBar,
      endBar,
    }));
    return {
      id: trackId,
      name: t.name,
      color: t.color,
      kind: t.kind,
      source: { ...t.source },
      pattern,
      params: { ...(t.params ?? {}) },
      modifiers,
      orbit: 1,
      mute: false,
      solo: false,
      clips,
      rawCode: null,
    };
  });

  const sections: Section[] = spec.sections.map((s) => ({
    id: next("section", s.id),
    name: s.name,
    startBar: s.startBar,
    endBar: s.endBar,
  }));

  return {
    format: "phyllo/1",
    id: next("project", ""),
    name: options.name ?? "Untitled Groove",
    tags: [...def.tags],
    favorite: false,
    created: iso,
    modified: iso,
    tempo: { bpm: clampBpm(options.bpm ?? def.bpm), beatsPerBar: 4 },
    key,
    lengthBars: SONG_BARS,
    loop: { enabled: true, startBar: spec.loop.startBar, endBar: spec.loop.endBar },
    sections,
    tracks,
    buses: [{ orbit: 1, ...(spec.bus ?? {}) }],
    master: { postgain: 1, limiter: true },
    prelude: [],
    ui: { selectedTrack: tracks[0]?.id ?? null, zoom: 1 },
  };
}
