import type { TrackKind, TrackSource } from "@phyllo/model";

/** Drum-machine sound names (with optional `:n` index) that mark an `s()` pattern as a drum track. */
export const DRUM_SOUNDS: ReadonlySet<string> = new Set([
  "bd", "sd", "cp", "hh", "oh", "rim", "lt", "mt", "ht", "cr", "rd", "cb", "sh", "perc", "tom",
]);

/** Track names for a drum track that plays a single sound. */
export const DRUM_NAMES: Readonly<Record<string, string>> = {
  bd: "Kick", sd: "Snare", cp: "Clap", hh: "Hats", oh: "Open hat", rim: "Rimshot", lt: "Low tom", mt: "Mid tom",
  ht: "High tom", cr: "Crash", rd: "Ride", cb: "Cowbell", sh: "Shaker", perc: "Perc", tom: "Tom",
};

/** Superdough synth sources (superdough/synth.mjs, noises in helpers.mjs); `gm_*` soundfonts and `z_*` ZZFX too. */
export const SYNTH_SOUNDS: ReadonlySet<string> = new Set([
  "sine", "sin", "sawtooth", "saw", "square", "sqr", "triangle", "tri", "supersaw", "pulse", "user", "one",
  "white", "pink", "brown", "crackle", "bytebeat",
]);

/** Methods that slice or stretch a sample, marking `s("name")` as a sample track. */
export const SAMPLE_METHODS: ReadonlySet<string> = new Set(["chop", "slice", "splice", "loopAt", "striate", "fit", "scrub"]);

export function isSynthSound(name: string): boolean {
  return SYNTH_SOUNDS.has(name) || /^(gm|z)_\w+/.test(name);
}

/** Sound-name tokens of a mini-notation string: `"bd:3 [~ hh]*2"` → `["bd", "hh"]`. */
export function soundTokens(pattern: string): string[] {
  return pattern.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
}

export interface InferredSource {
  kind: Exclude<TrackKind, "code">;
  source: TrackSource;
}

/**
 * Track kind for an `s()`/`sound()` source (SPEC §4.2 kind inference):
 * - `.bank()` present → drum;
 * - a sample method (`.chop`, `.slice`, …) → sample (sound = first token);
 * - every token a drum name (`bd`, `hh:2`, …) → drum;
 * - every token a synth (`sawtooth`, `gm_epiano1`, …) → melodic with `source.type: "s"`, sound = first token
 *   (a synth played without `note()` keeps its `s("…")` form; codegen writes it back as `s(pattern)`);
 * - one distinct non-drum, non-synth name (`vox`, `vox:2`) → sample;
 * - anything else (mixed names, empty) → drum (the sounds live in the pattern).
 */
export function inferSoundSource(pattern: string, bank: string | null, methods: readonly string[]): InferredSource {
  const tokens = soundTokens(pattern);
  const first = tokens[0] ?? null;
  if (bank !== null) return { kind: "drum", source: { type: "s", sound: null, bank } };
  if (methods.some((m) => SAMPLE_METHODS.has(m)) && first !== null) {
    return { kind: "sample", source: { type: "s", sound: first, bank: null } };
  }
  if (tokens.length > 0 && tokens.every((t) => DRUM_SOUNDS.has(t))) {
    return { kind: "drum", source: { type: "s", sound: null, bank: null } };
  }
  if (first !== null && tokens.every(isSynthSound)) {
    return { kind: "melodic", source: { type: "s", sound: first, bank: null } };
  }
  if (first !== null && new Set(tokens).size === 1) {
    return { kind: "sample", source: { type: "s", sound: first, bank: null } };
  }
  return { kind: "drum", source: { type: "s", sound: null, bank: null } };
}
