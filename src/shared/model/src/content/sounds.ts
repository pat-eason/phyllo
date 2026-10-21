import type { TrackSource, UiMode } from "../types";

/**
 * Built-in sound catalog for the library panel (SPEC §4.5, §6.1) plus friendly names for the inspector header.
 *
 * Verification:
 * - Drum bank ids and the sounds each bank contains come from Strudel's `tidal-drum-machines.json` (CDN map, fetched
 *   2026-10-21): RolandTR909 bd cp cr hh ht lt mt oh rd rim sd; RolandTR808 bd cb cp cr hh ht lt mt oh perc rim sd sh;
 *   LinnDrum bd cb cp cr hh ht lt mt oh perc rd rim sd sh tb; AkaiMPC60 bd cp cr hh ht lt mt oh perc rd rim sd.
 * - Synth waveforms: superdough/synth.mjs (sawtooth, square, triangle, sine, supersaw).
 * - Instruments: keys of `@strudel/soundfonts/gm.mjs` (checked in `sounds.test.ts`).
 */

export type SoundGroup = "drum" | "bank" | "synth" | "instrument";

export interface SoundEntry {
  group: SoundGroup;
  /** The code name used in Strudel: `bd`, `RolandTR909`, `sawtooth`, `gm_epiano1` */
  code: string;
  /** Friendly name shown first in Guided mode */
  name: string;
  /** One line shown under the name */
  description: string;
  /** Extra words Guided search matches ("warm bass") */
  keywords: readonly string[];
}

export interface DrumSound extends SoundEntry {
  group: "drum";
  /** Banks that contain this sound */
  banks: string[];
}

export interface DrumBank extends SoundEntry {
  group: "bank";
  /** Sounds this bank contains (codes from DRUM_SOUNDS) */
  sounds: readonly string[];
}

export interface SynthSound extends SoundEntry {
  group: "synth";
}

export interface InstrumentSound extends SoundEntry {
  group: "instrument";
}

// ── Drum banks ──────────────────────────────────────────────────────────────

export const DRUM_BANKS: readonly DrumBank[] = [
  {
    group: "bank",
    code: "RolandTR909",
    name: "TR-909",
    description: "Punchy house and techno drums",
    keywords: ["roland", "909", "house", "techno", "punchy", "classic"],
    sounds: ["bd", "sd", "hh", "oh", "cp", "rim", "lt", "mt", "ht", "cr", "rd"],
  },
  {
    group: "bank",
    code: "RolandTR808",
    name: "TR-808",
    description: "Deep, booming drums from hip-hop and electro",
    keywords: ["roland", "808", "hip hop", "trap", "boom", "deep", "classic"],
    sounds: ["bd", "sd", "hh", "oh", "cp", "rim", "lt", "mt", "ht", "cr", "cb", "sh", "perc"],
  },
  {
    group: "bank",
    code: "LinnDrum",
    name: "LinnDrum",
    description: "Dry, snappy drums from 80s pop",
    keywords: ["linn", "80s", "pop", "dry", "snappy", "retro"],
    sounds: ["bd", "sd", "hh", "oh", "cp", "rim", "lt", "mt", "ht", "cr", "rd", "cb", "sh", "perc", "tb"],
  },
  {
    group: "bank",
    code: "AkaiMPC60",
    name: "MPC60",
    description: "Gritty sampled drums for boom-bap and breaks",
    keywords: ["akai", "mpc", "boom bap", "gritty", "sampled", "breaks", "hip hop"],
    sounds: ["bd", "sd", "hh", "oh", "cp", "rim", "lt", "mt", "ht", "cr", "rd", "perc"],
  },
];

// ── Drum sounds ─────────────────────────────────────────────────────────────

type DrumSeed = Pick<SoundEntry, "code" | "name" | "description" | "keywords">;

const DRUM_SEEDS: readonly DrumSeed[] = [
  { code: "bd", name: "Bass drum", description: "The low thump on the beat", keywords: ["kick", "thump", "low", "boom"] },
  { code: "sd", name: "Snare", description: "The crack on beats 2 and 4", keywords: ["snap", "crack", "backbeat"] },
  { code: "hh", name: "Closed hat", description: "A short, tight tick", keywords: ["hi-hat", "hihat", "tick", "cymbal", "shut"] },
  { code: "oh", name: "Open hat", description: "A longer, hissing hat", keywords: ["hi-hat", "hihat", "hiss", "cymbal", "sizzle"] },
  { code: "cp", name: "Clap", description: "A hand clap", keywords: ["handclap", "hands", "snap"] },
  { code: "rim", name: "Rimshot", description: "A sharp click on the edge of the drum", keywords: ["click", "side stick", "sidestick", "knock"] },
  { code: "lt", name: "Low tom", description: "A deep tom drum", keywords: ["tom", "fill", "low", "drum"] },
  { code: "mt", name: "Mid tom", description: "A medium tom drum", keywords: ["tom", "fill", "middle", "drum"] },
  { code: "ht", name: "High tom", description: "A bright tom drum", keywords: ["tom", "fill", "high", "drum"] },
  { code: "cr", name: "Crash", description: "A big cymbal splash", keywords: ["cymbal", "splash", "accent"] },
  { code: "rd", name: "Ride", description: "A ringing cymbal for steady patterns", keywords: ["cymbal", "ping", "jazz"] },
  { code: "cb", name: "Cowbell", description: "A metallic clank", keywords: ["bell", "clank", "percussion"] },
  { code: "sh", name: "Shaker", description: "A soft rattle", keywords: ["rattle", "maraca", "percussion", "swish"] },
  { code: "perc", name: "Percussion", description: "Assorted hand percussion", keywords: ["conga", "bongo", "clave", "hand"] },
  { code: "tb", name: "Tambourine", description: "A jingly shake", keywords: ["jingle", "percussion", "shake"] },
];

export const DRUM_SOUNDS: readonly DrumSound[] = DRUM_SEEDS.map((seed) => ({
  ...seed,
  group: "drum" as const,
  banks: DRUM_BANKS.filter((b) => b.sounds.includes(seed.code)).map((b) => b.code),
}));

/** Drum sounds available in a bank, in catalog order. Unknown banks return the full list. */
export function drumSoundsFor(bank: string | null | undefined): readonly DrumSound[] {
  if (!bank) return DRUM_SOUNDS;
  const known = DRUM_BANKS.find((b) => b.code.toLowerCase() === bank.toLowerCase());
  return known ? DRUM_SOUNDS.filter((d) => known.sounds.includes(d.code)) : DRUM_SOUNDS;
}

// ── Synths ──────────────────────────────────────────────────────────────────

export const SYNTHS: readonly SynthSound[] = [
  { group: "synth", code: "sawtooth", name: "Sawtooth synth", description: "Bright and buzzy, great for bass and leads", keywords: ["saw", "buzzy", "warm", "bass", "lead", "classic"] },
  { group: "synth", code: "square", name: "Square synth", description: "Hollow and reedy, like an old game console", keywords: ["pulse", "hollow", "retro", "chiptune", "8-bit", "lead"] },
  { group: "synth", code: "triangle", name: "Triangle synth", description: "Soft and mellow, between a sine and a square", keywords: ["mellow", "soft", "flute", "lead", "gentle"] },
  { group: "synth", code: "sine", name: "Sine synth", description: "Pure and smooth, the simplest tone", keywords: ["pure", "smooth", "sub", "bass", "soft", "pad", "deep"] },
  { group: "synth", code: "supersaw", name: "Supersaw synth", description: "A thick stack of detuned saws", keywords: ["big", "wide", "lush", "trance", "huge", "pad", "lead", "chords"] },
];

// ── Instruments (General MIDI soundfonts) ───────────────────────────────────

type InstrumentSeed = Pick<SoundEntry, "code" | "name" | "description" | "keywords">;

const INSTRUMENT_SEEDS: readonly InstrumentSeed[] = [
  { code: "gm_piano", name: "Piano", description: "Acoustic grand piano", keywords: ["keys", "acoustic", "chords", "classical"] },
  { code: "gm_epiano1", name: "Electric piano", description: "Warm, bell-like keys", keywords: ["keys", "rhodes", "warm", "jazz", "soft", "chords"] },
  { code: "gm_vibraphone", name: "Vibraphone", description: "Mellow metal bars with a gentle shimmer", keywords: ["vibes", "mallet", "jazz", "shimmer", "soft"] },
  { code: "gm_marimba", name: "Marimba", description: "Woody, round mallet notes", keywords: ["mallet", "wood", "percussion", "warm"] },
  { code: "gm_kalimba", name: "Kalimba", description: "Plucked metal tines, sweet and small", keywords: ["thumb piano", "plucked", "cute", "music box", "gentle"] },
  { code: "gm_drawbar_organ", name: "Organ", description: "Full, breathy organ", keywords: ["keys", "church", "gospel", "warm", "chords"] },
  { code: "gm_acoustic_guitar_nylon", name: "Nylon guitar", description: "Soft classical guitar", keywords: ["acoustic", "plucked", "warm", "gentle", "spanish"] },
  { code: "gm_electric_guitar_clean", name: "Clean electric guitar", description: "Clear, glassy electric guitar", keywords: ["plucked", "bright", "funk", "jazz", "chords"] },
  { code: "gm_acoustic_bass", name: "Upright bass", description: "Round, woody bass", keywords: ["bass", "jazz", "warm", "low", "acoustic", "plucked"] },
  { code: "gm_electric_bass_finger", name: "Electric bass", description: "Smooth fingered bass guitar", keywords: ["bass", "warm", "low", "funk", "smooth"] },
  { code: "gm_synth_bass_1", name: "Synth bass", description: "Punchy, synthetic bass", keywords: ["bass", "low", "electronic", "punchy", "warm"] },
  { code: "gm_string_ensemble_1", name: "Strings", description: "A full string section", keywords: ["orchestra", "pad", "lush", "cinematic", "warm"] },
  { code: "gm_cello", name: "Cello", description: "Rich, singing low strings", keywords: ["strings", "orchestra", "bass", "warm", "sad"] },
  { code: "gm_violin", name: "Violin", description: "Bright, expressive solo strings", keywords: ["strings", "orchestra", "lead", "sad"] },
  { code: "gm_choir_aahs", name: "Choir", description: "A choir singing \"aah\"", keywords: ["voice", "vocal", "pad", "lush", "church", "ethereal"] },
  { code: "gm_pad_warm", name: "Warm pad", description: "A soft, slow-moving synth cloud", keywords: ["pad", "ambient", "soft", "lush", "bed", "atmosphere"] },
  { code: "gm_flute", name: "Flute", description: "Airy, breathy flute", keywords: ["wind", "airy", "soft", "lead", "gentle"] },
  { code: "gm_trumpet", name: "Trumpet", description: "A bold, bright horn", keywords: ["brass", "horn", "bright", "lead", "jazz"] },
];

export const INSTRUMENTS: readonly InstrumentSound[] = INSTRUMENT_SEEDS.map((seed) => ({
  ...seed,
  group: "instrument" as const,
}));

// ── Lookup & names ──────────────────────────────────────────────────────────

/** Everything the library can show, in panel order: banks, drum sounds, synths, instruments. */
export const ALL_SOUNDS: readonly SoundEntry[] = [...DRUM_BANKS, ...DRUM_SOUNDS, ...SYNTHS, ...INSTRUMENTS];

export function findSound(code: string): SoundEntry | undefined {
  const lower = code.toLowerCase();
  return ALL_SOUNDS.find((s) => s.code.toLowerCase() === lower);
}

function prettifyCode(code: string): string {
  const spaced = code.replace(/^gm_/, "").replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export interface FriendlyNameOptions {
  /** For drum tracks, the single drum sound being described (`bd`) */
  drumSound?: string;
}

/**
 * Plain-language name for the inspector header and library rows.
 *
 * - `{ type: "s", sound: null, bank: "RolandTR909" }` → "TR-909 drums"
 * - same with `{ drumSound: "bd" }` → "Bass drum · TR-909"
 * - `{ type: "note", sound: "sawtooth" }` → "Sawtooth synth"; `gm_epiano1` → "Electric piano"
 * - unknown sample `vox` → "Your sample · vox"
 * A bare string is treated as a sound code or bank id.
 */
export function friendlySoundName(source: TrackSource | string, options: FriendlyNameOptions = {}): string {
  const src: TrackSource = typeof source === "string" ? { type: "s", sound: source, bank: null } : source;
  const bank = src.bank ? DRUM_BANKS.find((b) => b.code.toLowerCase() === src.bank?.toLowerCase()) : undefined;
  const bankLabel = src.bank ? (bank?.name ?? src.bank) : null;
  const sound = src.sound ? findSound(src.sound) : undefined;

  if (!src.sound || (sound?.group === "bank")) {
    const asBank = sound?.group === "bank" ? sound : bank;
    const label = asBank?.name ?? bankLabel;
    const drum = options.drumSound ? DRUM_SOUNDS.find((d) => d.code === options.drumSound) : undefined;
    if (drum) return label ? `${drum.name} · ${label}` : drum.name;
    if (label) return `${label} drums`;
    return src.type === "chord" || src.type === "note" || src.type === "n" ? "Synth" : "Drums";
  }
  if (sound?.group === "drum") return bankLabel ? `${sound.name} · ${bankLabel}` : sound.name;
  if (sound) return sound.name;
  if (src.sound.startsWith("gm_")) return prettifyCode(src.sound);
  return `Your sample · ${src.sound}`;
}

// ── Search ──────────────────────────────────────────────────────────────────

/**
 * Library search. Case-insensitive; every word of the query must match.
 * Pro mode matches code names and friendly names. Guided also matches each entry's plain-word keywords
 * and description, so "warm bass" finds the sawtooth and the electric bass.
 * Exact code matches rank first, then code prefixes, then name prefixes.
 */
export function searchSounds(query: string, mode: UiMode = "guided"): SoundEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...ALL_SOUNDS];
  const scored: { entry: SoundEntry; score: number; index: number }[] = [];
  ALL_SOUNDS.forEach((entry, index) => {
    const code = entry.code.toLowerCase();
    const name = entry.name.toLowerCase();
    const extra = mode === "guided" ? `${entry.keywords.join(" ").toLowerCase()} ${entry.description.toLowerCase()}` : "";
    const haystack = `${code} ${name} ${extra}`;
    if (!words.every((w) => haystack.includes(w))) return;
    const first = words[0] ?? "";
    let score = 0;
    if (code === first) score = 4;
    else if (code.startsWith(first)) score = 3;
    else if (name.startsWith(first)) score = 2;
    else if (code.includes(first) || name.includes(first)) score = 1;
    scored.push({ entry, score, index });
  });
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map((s) => s.entry);
}
