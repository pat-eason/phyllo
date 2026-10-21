/**
 * Key helpers and mini-notation transposition (SPEC §6.2: changing the key transposes melodic starter tracks).
 *
 * Only the *root* moves. Keys keep their mode label as given by the caller, so moving "A minor" to "F major"
 * shifts every note by the distance between A and F and leaves the interval pattern (minor-shaped) untouched.
 */

const PITCH_CLASS: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

const SHARP_NAMES = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"] as const;
const FLAT_NAMES = ["c", "db", "d", "eb", "e", "f", "gb", "g", "ab", "a", "bb", "b"] as const;

/** Roots offered by the key select, in the order of the circle of semitones. Flat spelling for black keys. */
export const KEY_ROOTS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;
export const KEY_MODES = ["minor", "major", "dorian"] as const;
export type KeyMode = (typeof KEY_MODES)[number];

export interface ParsedKey {
  /** Root as typed, capitalised: `A`, `Eb`, `F#` */
  root: string;
  /** 0–11, C = 0 */
  pitchClass: number;
  /** Everything after the root, lower-cased: `minor`, `major`, `dorian`, ... (empty when absent) */
  mode: string;
}

/** Parse `A minor`, `F major`, `D dorian`, `Eb`, `f#` ... Returns null when the root is not a note name. */
export function parseKey(key: string): ParsedKey | null {
  const match = /^\s*([a-gA-G])([#b]?)\s*(.*?)\s*$/.exec(key);
  if (!match) return null;
  const letter = (match[1] ?? "").toLowerCase();
  const accidental = match[2] ?? "";
  const base = PITCH_CLASS[letter];
  if (base === undefined) return null;
  const shift = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;
  return {
    root: letter.toUpperCase() + accidental,
    pitchClass: (((base + shift) % 12) + 12) % 12,
    mode: (match[3] ?? "").toLowerCase(),
  };
}

/** Build a key string such as `Eb minor`. */
export function formatKey(root: string, mode: string): string {
  return `${root} ${mode}`.trim();
}

/**
 * Shortest signed semitone move from one key's root to another's, in the range -5..+6
 * (a tritone goes up). Unknown keys count as "no move" (0).
 */
export function semitonesBetween(fromKey: string, toKey: string): number {
  const from = parseKey(fromKey);
  const to = parseKey(toKey);
  if (!from || !to) return 0;
  let diff = (((to.pitchClass - from.pitchClass) % 12) + 12) % 12;
  if (diff > 6) diff -= 12;
  return diff;
}

const FLAT_ROOT_KEYS = new Set(["f", "bb", "eb", "ab", "db", "gb", "cb"]);
const FLAT_MINOR_ROOTS = new Set(["d", "g", "c", "f", "bb", "eb"]);

/**
 * True when notes in this key are conventionally spelled with flats (`eb2`) rather than sharps (`d#2`).
 * Dorian and minor modes use their relative-key signature, which is close enough for spelling.
 */
export function keyPrefersFlats(key: string): boolean {
  const parsed = parseKey(key);
  if (!parsed) return true;
  const root = parsed.root.toLowerCase();
  if (parsed.mode.startsWith("min")) return FLAT_MINOR_ROOTS.has(root) || root.endsWith("b");
  if (parsed.mode.startsWith("dor")) return ["c", "g", "f", "bb", "eb"].includes(root) || root.endsWith("b");
  return FLAT_ROOT_KEYS.has(root);
}

export type TransposeKind = "note" | "chord" | "auto";

export interface TransposeOptions {
  /**
   * `note`: tokens are note names (`c2`, `eb3`, `f#`). `chord`: tokens are chord symbols (`Cm7`, `Ab^7`).
   * `auto` (default): a token starting with a capital letter is a chord symbol, anything else a note name.
   */
  kind?: TransposeKind;
  /** Spell black keys with flats. Default: match the pattern's own accidentals (sharps only if it uses `#` and no flats). */
  flats?: boolean;
}

const NOTE_RE = /^([a-gA-G])(#{1,2}|b{1,2})?(-?\d+)?$/;
const CHORD_RE = /^([A-G])([#b]?)(.*)$/;
const WORD_RE = /[A-Za-z][A-Za-z0-9#^+]*/g;

function accidentalOffset(accidental: string | undefined): number {
  if (!accidental) return 0;
  return accidental.startsWith("#") ? accidental.length : -accidental.length;
}

function spell(pitchClass: number, flats: boolean): string {
  const index = ((pitchClass % 12) + 12) % 12;
  return (flats ? FLAT_NAMES : SHARP_NAMES)[index] ?? "c";
}

function transposeNote(word: string, semitones: number, flats: boolean): string | null {
  const match = NOTE_RE.exec(word);
  if (!match) return null;
  const letter = match[1] ?? "c";
  const upper = letter === letter.toUpperCase();
  const base = PITCH_CLASS[letter.toLowerCase()];
  if (base === undefined) return null;
  const hasOctave = match[3] !== undefined;
  const octave = hasOctave ? Number(match[3]) : 3; // Strudel's default octave
  const midi = (octave + 1) * 12 + base + accidentalOffset(match[2]) + semitones;
  const newOctave = Math.floor(midi / 12) - 1;
  const name = spell(midi, flats);
  const cased = upper ? name.charAt(0).toUpperCase() + name.slice(1) : name;
  return hasOctave || newOctave !== 3 ? `${cased}${newOctave}` : cased;
}

function transposeChord(word: string, semitones: number, flats: boolean): string | null {
  const match = CHORD_RE.exec(word);
  if (!match) return null;
  const letter = (match[1] ?? "C").toLowerCase();
  const base = PITCH_CLASS[letter];
  if (base === undefined) return null;
  const pc = base + accidentalOffset(match[2]) + semitones;
  const name = spell(pc, flats);
  return name.charAt(0).toUpperCase() + name.slice(1) + (match[3] ?? "");
}

/**
 * Shift every note name or chord root in a mini-notation string by `semitones`, keeping rhythm and operators
 * (`*`, `/`, `!`, `@`, `?`, brackets, `<>`, `,`, `~`, euclid arguments) exactly as written.
 *
 * `<c2 eb2 g2 bb1>*2` +2 → `<d2 f2 a2 c2>*2`; `<Cm7 Fm7 Ab^7 G7>` +2 → `<Dm7 Gm7 Bb^7 A7>`.
 * Words that are not notes (sample names such as `bd`, `vox`) are left alone.
 */
export function transposePattern(pattern: string, semitones: number, options: TransposeOptions = {}): string {
  const shift = Math.round(semitones);
  if (shift === 0) return pattern;
  const kind = options.kind ?? "auto";
  const words = pattern.match(WORD_RE) ?? [];
  const usesSharps = words.some((w) => /^[a-gA-G]#/.test(w));
  const usesFlats = words.some((w) => {
    const accidental = (NOTE_RE.exec(w) ?? CHORD_RE.exec(w))?.[2];
    return accidental !== undefined && accidental.startsWith("b");
  });
  const flats = options.flats ?? !(usesSharps && !usesFlats);
  return pattern.replace(WORD_RE, (word) => {
    const asChord = kind === "chord" || (kind === "auto" && /^[A-G]/.test(word));
    const result = asChord ? transposeChord(word, shift, flats) : transposeNote(word, shift, flats);
    return result ?? word;
  });
}
