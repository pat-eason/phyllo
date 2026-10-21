/**
 * Pure visualisation data for clips (SPEC §6.1), starter cards (§6.2) and library punchcards (§6.7).
 * Lenient by design: these are previews, so unlike `miniToRows` they quantize whatever cycle 0 holds and
 * never throw (a broken pattern yields empty data).
 */
import { isNote, noteToMidi } from "@strudel/core";
import type { Pattern } from "@strudel/core";
import "@strudel/tonal"; // registers Pattern.prototype.voicing
import { mini } from "@strudel/mini";
import type { Track } from "@phyllo/model";
import { queryEvents, valueName } from "./query";
import type { MiniEvent } from "./query";

export type VizTrack = Pick<Track, "kind" | "pattern" | "source">;

export type ClipViz =
  | { kind: "drum"; ticks: number[] }
  | { kind: "melodic"; notes: { t: number; d: number; pitch: number }[] }
  | { kind: "chord"; chords: { t: number; d: number; pitches: number[] }[] }
  | { kind: "sample" }
  | { kind: "code" };

const GRID = 16;

function safeEvents(pattern: string | Pattern, cycle: number): MiniEvent[] {
  try {
    return queryEvents(pattern, cycle, cycle + 1).filter((e) => e.cycle === cycle);
  } catch {
    return [];
  }
}

function toRow(events: readonly MiniEvent[]): boolean[] {
  const row = new Array<boolean>(GRID).fill(false);
  for (const e of events) row[Math.min(GRID - 1, Math.round(e.t * GRID))] = true;
  return row;
}

/**
 * 16-step onset rows of cycle 0 for a 3×16 punchcard. Drums: one row per sound in source order (first
 * `maxRows`); every other kind: one row with all onsets. Off-grid onsets snap to the nearest step.
 */
export function previewRows(track: VizTrack, maxRows = 3): boolean[][] {
  if (maxRows < 1 || track.pattern.trim() === "") return [];
  const events = safeEvents(track.pattern, 0);
  if (events.length === 0) return [];
  if (track.kind !== "drum") return [toRow(events)];
  const bySound = new Map<string, MiniEvent[]>();
  for (const e of [...events].sort((a, b) => a.loc - b.loc)) {
    const name = valueName(e.value) ?? "?";
    bySound.set(name, [...(bySound.get(name) ?? []), e]);
  }
  return [...bySound.values()].slice(0, maxRows).map(toRow);
}

/** MIDI number of a note value (`"eb2"`, `39`, `["c3", …]`), or null. */
function toMidi(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && isNote(value)) {
    try {
      return noteToMidi(value);
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) return toMidi(value[0]);
  if (value && typeof value === "object" && "note" in value) return toMidi((value as { note: unknown }).note);
  return null;
}

const CHORD_INTERVALS: Record<string, number[]> = {
  "": [0, 4, 7],
  M: [0, 4, 7],
  maj: [0, 4, 7],
  m: [0, 3, 7],
  min: [0, 3, 7],
  "-": [0, 3, 7],
  "7": [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  min7: [0, 3, 7, 10],
  "-7": [0, 3, 7, 10],
  "^7": [0, 4, 7, 11],
  maj7: [0, 4, 7, 11],
  M7: [0, 4, 7, 11],
  "^": [0, 4, 7, 11],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  "9": [0, 4, 7, 10, 14],
  m9: [0, 3, 7, 10, 14],
  "^9": [0, 4, 7, 11, 14],
  maj9: [0, 4, 7, 11, 14],
  add9: [0, 4, 7, 14],
  dim: [0, 3, 6],
  o: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  o7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  h7: [0, 3, 6, 10],
  aug: [0, 4, 8],
  "+": [0, 4, 8],
  sus2: [0, 2, 7],
  sus: [0, 5, 7],
  sus4: [0, 5, 7],
  "7sus4": [0, 5, 7, 10],
};

/** Fallback when tonal can't voice a symbol: root in octave 3 + a fixed interval table. */
export function chordSymbolPitches(symbol: string): number[] | null {
  const match = /^([A-Ga-g])([#b]?)(.*)$/.exec(symbol);
  if (!match) return null;
  const [, root = "", acc = "", quality = ""] = match;
  const intervals = CHORD_INTERVALS[quality];
  if (!intervals) return null;
  const base = noteToMidi(`${root}${acc}3`);
  return intervals.map((i) => base + i);
}

function callMethod(pat: Pattern, method: string, ...args: unknown[]): Pattern {
  const fn = pat[method];
  if (typeof fn !== "function") throw new Error(`Pattern.${method} is unavailable`);
  return fn.apply(pat, args) as Pattern;
}

const normaliser = (pitches: readonly number[]): ((p: number) => number) => {
  const lo = Math.min(...pitches);
  const hi = Math.max(...pitches);
  return (p) => (hi > lo ? (p - lo) / (hi - lo) : 0.5);
};

const span = (e: MiniEvent) => ({ t: e.t, d: Math.max(0, Math.min(e.d, 1 - e.t)) });

function melodicViz(pattern: string, cycle: number): ClipViz {
  const notes = safeEvents(pattern, cycle)
    .map((e) => ({ ...span(e), midi: toMidi(e.value) }))
    .filter((n): n is { t: number; d: number; midi: number } => n.midi !== null)
    .sort((a, b) => a.t - b.t || a.midi - b.midi);
  const norm = normaliser(notes.map((n) => n.midi));
  return { kind: "melodic", notes: notes.map(({ t, d, midi }) => ({ t, d, pitch: norm(midi) })) };
}

/** Chord events via Strudel's `chord(…).voicing()` (tonal), falling back to `chordSymbolPitches`. */
function chordViz(pattern: string, cycle: number): ClipViz {
  const groups = new Map<string, { t: number; d: number; midis: number[] }>();
  const add = (key: string, t: number, d: number, midis: number[]) => {
    const g = groups.get(key) ?? { t, d, midis: [] };
    g.midis.push(...midis);
    groups.set(key, g);
  };
  const keyOf = (t: number, d: number) => `${t.toFixed(6)}|${d.toFixed(6)}`;
  let voiced: MiniEvent[] = [];
  try {
    const pat = callMethod(callMethod(mini(pattern), "fmap", (c: unknown) => ({ chord: c })), "voicing");
    voiced = safeEvents(pat, cycle);
  } catch {
    voiced = [];
  }
  for (const v of voiced) {
    const midi = toMidi(v.value);
    const { t, d } = span(v);
    if (midi !== null) add(keyOf(t, d), t, d, [midi]);
  }
  // Symbols tonal couldn't voice (it logs and drops them) get the fallback table.
  for (const e of safeEvents(pattern, cycle)) {
    const { t, d } = span(e);
    if (groups.has(keyOf(t, d))) continue;
    const symbol = valueName(e.value);
    const midis = symbol === null ? null : chordSymbolPitches(symbol);
    if (midis) add(keyOf(t, d), t, d, midis);
  }
  const list = [...groups.values()].sort((a, b) => a.t - b.t);
  const norm = normaliser(list.flatMap((g) => g.midis));
  return {
    kind: "chord",
    chords: list.map((g) => ({ t: g.t, d: g.d, pitches: [...new Set(g.midis)].sort((a, b) => a - b).map(norm) })),
  };
}

/**
 * What a clip draws for one cycle (default cycle 0; clip-local, DECISIONS V5). `t`/`d` are in 0..1 of the
 * cycle; `pitch` is normalised 0..1 across that cycle's lowest..highest note (0.5 when all equal).
 * Drums: onset times of every hit (merged, unique). Melodic: one dash per note (`note`/`n` values; numbers
 * are taken as MIDI or scale degrees, both fine for relative height). Chords: each chord symbol voiced by
 * tonal's default `voicing()`; unknown symbols fall back to a small chord table.
 */
export function clipViz(track: VizTrack, cycle = 0): ClipViz {
  switch (track.kind) {
    case "drum": {
      const ticks = [...new Set(safeEvents(track.pattern, cycle).map((e) => Number(e.t.toFixed(9))))].sort((a, b) => a - b);
      return { kind: "drum", ticks };
    }
    case "melodic":
      return melodicViz(track.pattern, cycle);
    case "chord":
      return chordViz(track.pattern, cycle);
    case "sample":
      return { kind: "sample" };
    case "code":
      return { kind: "code" };
  }
}
