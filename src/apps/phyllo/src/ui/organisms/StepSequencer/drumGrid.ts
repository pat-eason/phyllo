/**
 * Drum track pattern ↔ editable step grid with per-step velocity (SPEC §4.3, §6.3).
 *
 * Velocity has two encodings, chosen so the code stays what a Strudel user would write:
 * - one sounding row (e.g. a hats track): the track's `.gain("<pattern>")` param (engine `velocitiesToGainPattern`, D52);
 * - several rows in one `s("…")` call: a single `.gain()` would apply to every layer, so each hit carries its own
 *   gain in Strudel's `s:n:gain` token form (`hh:0:.45`; `s` is registered as `['s', 'n', 'gain']`,
 *   @strudel/core controls.mjs:110). A hit at the default gain (.8) stays a plain `hh`.
 * A static or patterned `.gain()` on the track overrides those tokens in Strudel, so writing per-hit gains
 * bakes the track gain into the tokens and clears the param (the sound doesn't change).
 */
import {
  compressTokens,
  euclidSteps,
  formatGain,
  gainPatternToVelocities,
  miniToRows,
  rowToMini,
  velocitiesToGainPattern,
} from "@phyllo/engine";
import { DRUM_SOUNDS, TRACK_COLORS } from "@phyllo/model";
import type { ParamValue, StepRowModel } from "@phyllo/model";

/** One cycle on the grid (Length 1 cycle; longer lengths need engine support, see the report). */
export const STEPS = 16;
/** Strudel's default gain (superdough), used when neither the track nor a token sets one. */
export const DEFAULT_GAIN = 0.8;
/** Rows shown for every drum track, in this order (SPEC §6.3). */
export const KIT_ORDER = ["bd", "cp", "hh", "oh", "rim"] as const;

const KIT_META: Record<string, { label: string; color: string }> = {
  bd: { label: "Kick", color: "#7FD98A" },
  cp: { label: "Clap", color: "#5ECFC8" },
  hh: { label: "Closed hat", color: "#8AB4FF" },
  oh: { label: "Open hat", color: "#B9A2FF" },
  rim: { label: "Rimshot", color: "#F5C25B" },
};

/** Friendly row label: Kick for `bd`, catalog names for other drums, `Snare 3` for `sd:3`. */
export function drumLabel(sound: string): string {
  const [name = sound, n] = sound.split(":");
  const base = KIT_META[name]?.label ?? DRUM_SOUNDS.find((d) => d.code === name)?.name ?? name;
  return n !== undefined ? `${base} ${n}` : base;
}

/** Fixed colors for the kit rows (mockup), track palette for any other sound. */
export function drumColor(sound: string, index: number): string {
  const name = sound.split(":")[0] ?? sound;
  return KIT_META[name]?.color ?? TRACK_COLORS[index % TRACK_COLORS.length] ?? "#7FD98A";
}

export interface DrumRow {
  sound: string;
  label: string;
  color: string;
  steps: boolean[];
  /** Gain written on each hit's own token (`hh:0:.45`); undefined = plain token. */
  tokenGains: (number | undefined)[];
  /** Set while the row is a Euclid rhythm written `name(k,n)` (cleared by a hand edit). */
  euclid?: StepRowModel["euclid"];
  /** What each step sounds at (0 for rests); null when a patterned `.gain()` can't be read per step. */
  velocities: number[] | null;
}

export type DrumGrid =
  | { ok: true; rows: DrumRow[]; velocityMode: "param" | "tokens" }
  | { ok: false; reason: string; detail: string };

/** `hh:0:0.45` → `{ base: "hh", gain: .45 }`; `sd:3:1` → `sd:3`; anything else is its own row. */
function splitGainToken(name: string): { base: string; gain: number | undefined } {
  const parts = name.split(":");
  if (parts.length === 3 && /^\d+$/.test(parts[1] ?? "")) {
    const gain = Number(parts[2]);
    if (Number.isFinite(gain)) return { base: parts[1] === "0" ? (parts[0] ?? name) : `${parts[0]}:${parts[1]}`, gain };
  }
  return { base: name, gain: undefined };
}

/** `bd:0:.5(3,8)` layers: euclid flags for rows whose hits carry a gain (miniToRows only spots plain names). */
function gainEuclids(pattern: string): Map<string, NonNullable<StepRowModel["euclid"]>> {
  const out = new Map<string, NonNullable<StepRowModel["euclid"]>>();
  const re = /(?:^|,)\s*(\w+):(\d+):(\.\d+|\d+(?:\.\d+)?)\((\d+),(\d+)(?:,(-?\d+))?\)\s*(?=,|$)/g;
  for (const m of pattern.matchAll(re)) {
    const base = m[2] === "0" ? (m[1] ?? "") : `${m[1]}:${m[2]}`;
    const rotation = m[6] ? Number(m[6]) : 0;
    out.set(base, rotation ? { hits: Number(m[4]), steps: Number(m[5]), rotation } : { hits: Number(m[4]), steps: Number(m[5]) });
  }
  return out;
}

function sameSteps(a: readonly boolean[], b: readonly boolean[] | null): boolean {
  return b !== null && a.length === b.length && a.every((x, i) => x === b[i]);
}

function readVelocities(row: Pick<DrumRow, "steps" | "tokenGains">, gain: ParamValue | undefined): number[] | null {
  if (typeof gain === "string") return gainPatternToVelocities(gain, row.steps);
  return row.steps.map((on, i) => (on ? (typeof gain === "number" ? gain : (row.tokenGains[i] ?? DEFAULT_GAIN)) : 0));
}

/** Pattern + track gain → grid rows (kit rows first, then `extraSounds`, then other sounds in source order). */
export function deriveDrumGrid(pattern: string, gain: ParamValue | undefined, extraSounds: readonly string[] = []): DrumGrid {
  const parsed = miniToRows(pattern, { steps: STEPS, sounds: [...KIT_ORDER, ...extraSounds] });
  if (!parsed.ok) return parsed;

  const merged = new Map<string, { steps: boolean[]; tokenGains: (number | undefined)[]; euclid?: StepRowModel["euclid"] }>();
  let anyTokenGain = false;
  for (const row of parsed.rows) {
    const { base, gain: tokenGain } = splitGainToken(row.sound);
    let target = merged.get(base);
    if (!target) {
      target = { steps: new Array<boolean>(STEPS).fill(false), tokenGains: new Array<number | undefined>(STEPS).fill(undefined) };
      merged.set(base, target);
    }
    if (row.euclid && tokenGain === undefined) target.euclid = row.euclid;
    for (let i = 0; i < STEPS; i++) {
      if (!row.steps[i]) continue;
      if (target.steps[i]) {
        return { ok: false, reason: "This pattern can't be shown as steps", detail: `plays ${base} twice on the same step` };
      }
      target.steps[i] = true;
      target.tokenGains[i] = tokenGain;
      if (tokenGain !== undefined) anyTokenGain = true;
    }
  }
  for (const [base, eu] of gainEuclids(pattern)) {
    const target = merged.get(base);
    if (target && sameSteps(target.steps, euclidSteps(eu.hits, eu.steps, eu.rotation ?? 0, STEPS))) target.euclid = eu;
  }

  const rows: DrumRow[] = [...merged.entries()].map(([sound, r], index) => {
    const row: DrumRow = {
      sound,
      label: drumLabel(sound),
      color: drumColor(sound, index),
      steps: r.steps,
      tokenGains: r.tokenGains,
      velocities: null,
    };
    if (r.euclid) row.euclid = r.euclid;
    row.velocities = readVelocities(row, gain);
    return row;
  });
  const sounding = rows.filter((r) => r.steps.some(Boolean)).length;
  return { ok: true, rows, velocityMode: !anyTokenGain && sounding <= 1 ? "param" : "tokens" };
}

/** One hit's token: `hh`, or `hh:0:.45` when it carries its own gain. */
function hitToken(sound: string, gain: number | undefined): string {
  if (gain === undefined) return sound;
  const [name = sound, n = "0"] = sound.split(":");
  return `${name}:${n}:${formatGain(gain)}`;
}

/** The mini-notation a row writes ("" when empty): `oh(3,8)`, `[~ hh:0:.7]*4`, … */
export function drumRowMini(row: Pick<DrumRow, "sound" | "steps" | "tokenGains" | "euclid">): string {
  const tokens = row.steps.map((on, i) => (on ? hitToken(row.sound, row.tokenGains[i]) : null));
  const used = tokens.filter((t): t is string => t !== null);
  const first = used[0];
  if (first === undefined) return "";
  if (row.euclid && used.every((t) => t === first)) {
    const model: StepRowModel = { sound: first, steps: row.steps, euclid: row.euclid };
    return rowToMini(model);
  }
  return compressTokens(tokens);
}

/** All rows as one `s("…")` argument; an empty grid writes `~` (a rest, like the mockup's `s("~")`). */
export function drumGridMini(rows: readonly Pick<DrumRow, "sound" | "steps" | "tokenGains" | "euclid">[]): string {
  return rows.map(drumRowMini).filter((m) => m !== "").join(", ") || "~";
}

/** What a grid edit writes: the new pattern, and the track gain when it has to change (null = remove). */
export interface DrumWrite {
  pattern: string;
  gain?: ParamValue | null;
}

function asParam(text: string): ParamValue | null {
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : text;
}

/** Same rows with every sounding step's gain moved into its token (when the track gain would override them). */
function bake(rows: readonly DrumRow[]): DrumRow[] {
  return rows.map((row) => ({
    ...row,
    tokenGains: row.steps.map((on, i) => {
      if (!on) return undefined;
      const v = row.velocities?.[i] ?? row.tokenGains[i] ?? DEFAULT_GAIN;
      return Math.abs(v - DEFAULT_GAIN) < 1e-9 ? undefined : v;
    }),
  }));
}

/**
 * Write rows whose steps changed (toggle, paint, Euclid). New hits sound at the row's usual level. A patterned
 * track `.gain()` is regenerated for the new steps (a hit at a `~` in it would be dropped): single row → the
 * same `.gain("…")` form, several sounding rows → per-hit tokens and the param removed.
 */
export function writeSteps(rows: readonly DrumRow[], gain: ParamValue | undefined): DrumWrite {
  if (typeof gain !== "string") return { pattern: drumGridMini(rows) };
  const readable = rows.every((r) => r.velocities !== null || !r.steps.some(Boolean));
  if (!readable) return { pattern: drumGridMini(rows) };
  const withNew = rows.map((row) => ({
    ...row,
    velocities: row.steps.map((on, i) => (on ? (row.velocities?.[i] ?? DEFAULT_GAIN) : 0)),
  }));
  const sounding = withNew.filter((r) => r.steps.some(Boolean));
  const only = sounding[0];
  if (sounding.length <= 1 && withNew.every((r) => r.tokenGains.every((g) => g === undefined))) {
    const text = only ? velocitiesToGainPattern(only.velocities, only.steps) : "";
    return { pattern: drumGridMini(withNew), gain: asParam(text) };
  }
  return { pattern: drumGridMini(bake(withNew)), gain: null };
}

/**
 * Write new velocities (0–1 per step) for one row. Single sounding row without tokens → `.gain("…")` param
 * (SPEC §6.3); otherwise per-hit tokens, baking any track gain into them first.
 */
export function writeVelocities(
  grid: Extract<DrumGrid, { ok: true }>,
  sound: string,
  velocities: readonly number[],
  gain: ParamValue | undefined,
): DrumWrite | null {
  const row = grid.rows.find((r) => r.sound === sound);
  if (!row) return null;
  if (grid.velocityMode === "param") {
    const text = velocitiesToGainPattern(velocities, row.steps);
    return { pattern: drumGridMini(grid.rows), gain: asParam(text) };
  }
  const rows = grid.rows.map((r) => (r.sound === sound ? { ...r, velocities: r.steps.map((on, i) => (on ? (velocities[i] ?? 0) : 0)) } : r));
  if (gain === undefined) {
    // No track gain: only this row's tokens change.
    const [baked] = bake(rows.filter((r) => r.sound === sound));
    const next = rows.map((r) => (r.sound === sound && baked ? baked : r));
    return { pattern: drumGridMini(next) };
  }
  return { pattern: drumGridMini(bake(rows)), gain: null };
}

/** Toggle / set one step of one row (a hand edit: drops the row's Euclid flag). */
export function withStep(rows: readonly DrumRow[], sound: string, step: number, on: boolean): DrumRow[] {
  return rows.map((row) => {
    if (row.sound !== sound) return row;
    const steps = row.steps.slice();
    steps[step] = on;
    const tokenGains = row.tokenGains.slice();
    if (!on) tokenGains[step] = undefined;
    let velocities = row.velocities;
    if (velocities) {
      velocities = velocities.slice();
      velocities[step] = on ? (velocities.find((v) => v > 0) ?? DEFAULT_GAIN) : 0;
    }
    const next: DrumRow = { ...row, steps, tokenGains, velocities };
    delete next.euclid;
    return next;
  });
}

/** Replace one row with a Euclid rhythm `name(k,n)` over the grid (uniform gain, so the `(k,n)` form holds). */
export function withEuclid(rows: readonly DrumRow[], sound: string, hits: number, steps: number): DrumRow[] {
  const pattern = euclidSteps(hits, steps, 0, STEPS);
  if (!pattern) return rows.slice();
  return rows.map((row) => {
    if (row.sound !== sound) return row;
    const firstGain = row.tokenGains.find((g) => g !== undefined);
    return {
      ...row,
      steps: pattern,
      tokenGains: pattern.map((on) => (on ? firstGain : undefined)),
      velocities: row.velocities ? pattern.map((on) => (on ? (row.velocities?.find((v) => v > 0) ?? DEFAULT_GAIN) : 0)) : null,
      euclid: { hits, steps },
    };
  });
}
