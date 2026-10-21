import { DRUM_BANKS, DRUM_SOUNDS, INSTRUMENTS, SYNTHS, findModifier, findSuggestionByCode, friendlySoundName } from "@phyllo/model";
import type { Modifier, ParamName, Settings, SoundEntry, Track } from "@phyllo/model";
import { controlsSetBy } from "@phyllo/engine";

/** Pure helpers behind the Inspector (kept out of the components so tests can exercise them directly). */

/** What the Sound picker shows and edits for a track kind. */
export interface SoundSlot {
  /** `.bank()` for drum tracks, `.s()` otherwise. */
  label: string;
  /** The source code shown in the picker, e.g. `s("sawtooth")`, `.bank("RolandTR909")`. */
  code: string;
  /** The current code name (bank or sound), or null. */
  current: string | null;
  /** Which source field a pick writes. */
  field: "bank" | "sound";
}

export function soundSlot(track: Track): SoundSlot {
  if (track.kind === "drum") {
    const bank = track.source.bank;
    return { label: ".bank()", code: bank ? `.bank("${bank}")` : "default kit", current: bank, field: "bank" };
  }
  const sound = track.source.sound;
  return { label: ".s()", code: sound ? `s("${sound}")` : `s("${track.pattern}")`, current: sound, field: "sound" };
}

/** Sounds a track of this kind can switch to, in picker order. */
export function soundChoices(track: Track): readonly SoundEntry[] {
  switch (track.kind) {
    case "drum":
      return DRUM_BANKS;
    case "melodic":
      return [...SYNTHS, ...INSTRUMENTS];
    case "chord":
      return [...INSTRUMENTS, ...SYNTHS];
    case "sample":
      return DRUM_SOUNDS;
    default:
      return [];
  }
}

/** Case-insensitive filter over code, name, description and keywords (every word must match). */
export function filterSounds(entries: readonly SoundEntry[], query: string): SoundEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...entries];
  return entries.filter((e) => {
    const hay = `${e.code} ${e.name} ${e.description} ${e.keywords.join(" ")}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** `bd*4` → `bd`: the single drum sound a drum pattern plays, for "Bass drum · TR-909". */
export function singleDrumSound(pattern: string): string | undefined {
  const words = new Set((pattern.match(/[a-z][a-z0-9]*/gi) ?? []).map((w) => w.toLowerCase()));
  if (words.size !== 1) return undefined;
  const [only] = [...words];
  return DRUM_SOUNDS.some((d) => d.code === only) ? only : undefined;
}

/** Plain description under the header name. */
export function friendlyDescription(track: Track): string {
  if (track.kind === "code") return "Code track";
  const drumSound = track.kind === "drum" ? singleDrumSound(track.pattern) : undefined;
  return friendlySoundName(track.source, drumSound ? { drumSound } : {});
}

const ws = (code: string) => code.replace(/\s+/g, "");

/** The enabled modifier with exactly this code (whitespace-insensitive). */
export function findModifierByCode(track: Track, code: string, enabled?: boolean): Modifier | undefined {
  const target = ws(code);
  return track.modifiers.find((m) => ws(m.code) === target && (enabled === undefined || m.enabled === enabled));
}

/** Function name of a chained call: `.sometimes(x => …)` → `sometimes`. */
export function modifierName(code: string): string | null {
  const m = /^\s*\.?\s*([A-Za-z_$][\w$]*)/.exec(code);
  return m?.[1] ?? null;
}

/** ModifierRow description: the modifier's own label, else the suggestion or catalog text, else a fallback. */
export function modifierDescription(modifier: Modifier): string {
  if (modifier.label) return modifier.label;
  const suggestion = findSuggestionByCode(modifier.code);
  if (suggestion) return suggestion.label;
  const name = modifierName(modifier.code);
  const def = name ? findModifier(name) : undefined;
  return def?.description ?? "Custom modifier";
}

/** Enabled modifiers that set `param` (they win over the knob; SPEC §4.1). */
export function modifiersSetting(track: Track, param: ParamName): Modifier[] {
  return track.modifiers.filter((m) => m.enabled && controlsSetBy(m.code).has(param));
}

/**
 * MIDI CC mapped to this knob (SPEC §5/§6.6: CCs drive the inspector's knobs on whichever track is selected).
 * `settings.midi.ccMap` is keyed by `String(cc)` (DECISIONS D120/D121); the entry's `trackParam` names the knob.
 */
export function ccFor(ccMap: Settings["midi"]["ccMap"], param: ParamName): number | null {
  for (const entry of Object.values(ccMap)) {
    if (entry.trackParam === param) return entry.cc;
  }
  return null;
}

/** Parses a typed knob value in real units; null when it isn't a finite number. */
export function parseTypedValue(text: string): number | null {
  const cleaned = text.trim().replace(/,/g, "").replace(/\s*(hz|s)$/i, "");
  const k = /^(-?\d*\.?\d+)\s*k$/i.exec(cleaned);
  const n = k ? Number(k[1]) * 1000 : Number(cleaned);
  return cleaned !== "" && Number.isFinite(n) ? n : null;
}

/** MIME type for dragging a modifier template (payload = template code) onto the modifier list. */
export const MODIFIER_DRAG_MIME = "application/x-phyllo-modifier";

/**
 * Strudel's mini-notation parser speaks Peggy ("Expected "!", "(", … but "\"" found."); turn it into one short line.
 * The pattern sits inside quotes, so a found `"` means the pattern ended while something was still open.
 */
export function friendlyPatternError(error: { message: string; column: number }): string {
  const found = / but (.+) found\.?$/.exec(error.message)?.[1];
  let detail: string;
  if (found === undefined) detail = error.message;
  else if (found === '"\\""' || found === "end of input") detail = "it ends before a bracket is closed";
  else detail = `unexpected ${found}`;
  return `Can’t read this pattern at column ${error.column}: ${detail}. The last valid pattern keeps playing.`;
}
