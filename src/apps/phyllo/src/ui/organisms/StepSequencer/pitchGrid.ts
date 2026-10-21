/**
 * Melodic `note("…")` pattern ↔ piano roll (SPEC §6.3 proposed): 16 steps, one note per step, `~` rests.
 * Chords, cycle-to-cycle changes (`<a b>`), random ops and off-grid hits refuse (same rule as the step grid).
 */
import { compressTokens, miniToRows, UNFIT_REASON } from "@phyllo/engine";
import { keyPrefersFlats, parseKey } from "@phyllo/model";
import { STEPS } from "./drumGrid";

const PITCH_CLASS: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const SHARPS = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"] as const;
const FLATS = ["c", "db", "d", "eb", "e", "f", "gb", "g", "ab", "a", "bb", "b"] as const;

/** Scale intervals per mode (`parseKey().mode`); unknown modes fall back to major. */
const MODES: Record<string, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
};

/** Strudel note name or MIDI number → MIDI (`a1` 33, `eb3` 51, `c` 48 — octave 3 by default). */
export function noteToMidi(name: string): number | null {
  if (/^-?\d+(\.\d+)?$/.test(name)) {
    const n = Number(name);
    return Number.isInteger(n) ? n : null;
  }
  const m = /^([a-gA-G])(#{1,2}|b{1,2}|s|f)?(-?\d+)?$/.exec(name);
  if (!m) return null;
  const base = PITCH_CLASS[(m[1] ?? "c").toLowerCase()];
  if (base === undefined) return null;
  const acc = m[2] ?? "";
  const shift = acc === "s" ? 1 : acc === "f" ? -1 : acc.startsWith("#") ? acc.length : -acc.length;
  const octave = m[3] === undefined ? 3 : Number(m[3]);
  return (octave + 1) * 12 + base + shift;
}

/** MIDI → lower-case Strudel note name (`33` → `a1`, flats when the key prefers them). */
export function midiToNote(midi: number, flats: boolean): string {
  const pc = ((midi % 12) + 12) % 12;
  return `${(flats ? FLATS : SHARPS)[pc]}${Math.floor(midi / 12) - 1}`;
}

/** `A1`, `Eb3` for row headers. */
export function noteLabel(midi: number, flats: boolean): string {
  const name = midiToNote(midi, flats);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export type PianoRollGrid = { ok: true; notes: (number | null)[] } | { ok: false; reason: string; detail: string };

/** `note("…")` pattern → one MIDI note (or null) per step. */
export function derivePianoRoll(pattern: string): PianoRollGrid {
  const parsed = miniToRows(pattern, { steps: STEPS });
  if (!parsed.ok) return parsed;
  const notes: (number | null)[] = new Array<number | null>(STEPS).fill(null);
  for (const row of parsed.rows) {
    const midi = noteToMidi(row.sound);
    if (midi === null) return { ok: false, reason: UNFIT_REASON, detail: `"${row.sound}" isn't a note name` };
    for (let i = 0; i < STEPS; i++) {
      if (!row.steps[i]) continue;
      if (notes[i] !== null) return { ok: false, reason: UNFIT_REASON, detail: "plays chords (two notes on one step)" };
      notes[i] = midi;
    }
  }
  return { ok: true, notes };
}

/** Notes → mini-notation, compressed like a step row (`a1*4`, `[a1 ~ c2 ~]*2`); all rests → `~`. */
export function pianoRollMini(notes: readonly (number | null)[], key: string): string {
  const flats = keyPrefersFlats(key);
  return compressTokens(notes.map((n) => (n === null ? null : midiToNote(n, flats)))) || "~";
}

export interface PitchRow {
  midi: number;
  label: string;
  /** The key's root (tinted like a beat start). */
  root: boolean;
  /** In the project key's scale. */
  inKey: boolean;
}

/**
 * Pitch rows, highest first: two octaves from the key's root at or below the lowest note (octave 3 when
 * empty), extended to cover every note. Snap → only scale notes (plus any off-key notes already used).
 */
export function pitchRows(notes: readonly (number | null)[], key: string, snap: boolean): PitchRow[] {
  const parsed = parseKey(key);
  const rootPc = parsed?.pitchClass ?? 0;
  const intervals = MODES[parsed?.mode.split(/\s+/)[0] ?? ""] ?? MODES["major"] ?? [];
  const used = notes.filter((n): n is number => n !== null);
  const lowest = used.length ? Math.min(...used) : 4 * 12 + rootPc;
  let base = lowest - ((((lowest - rootPc) % 12) + 12) % 12);
  if (base < 0) base += 12;
  let top = base + 24;
  while (used.some((n) => n > top)) top += 12;
  const flats = keyPrefersFlats(key);
  const rows: PitchRow[] = [];
  for (let midi = top; midi >= base; midi--) {
    const degree = (((midi - rootPc) % 12) + 12) % 12;
    const inKey = intervals.includes(degree);
    if (snap && !inKey && !used.includes(midi)) continue;
    rows.push({ midi, label: noteLabel(midi, flats), root: degree === 0, inKey });
  }
  return rows;
}
