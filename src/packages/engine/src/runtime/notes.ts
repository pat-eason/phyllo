/**
 * MIDI export (SPEC §6.5, T5.4): note events of a generated program, without audio.
 *
 * The code is evaluated like the runtime does it (transpiler + an evaluation-only `repl()`), recording each
 * `$:` block's pattern in source order through a wrapped `Pattern.prototype.p` (engine.ts `createEvaluator`).
 * Blocks map to tracks by their label line through the LineMap; muted blocks (`_$:`) are skipped and Strudel's
 * `S$:` solo rule is honoured. Onsets come from `onsetsInRange` (offline.ts), so the strict query throws on
 * pattern errors instead of exporting silence.
 *
 * Side effect to know about: Strudel's `repl()` points the global clock helpers (`setTime`, `setCpsFunc`) at its
 * own scheduler. Nothing on the live playback path reads them (the runtime's trigger uses its own clock and
 * re-installs both after every evaluation), the same as the runtime's own render evaluator.
 */
import * as core from "@strudel/core";
import { Pattern, evalScope, noteToMidi, repl } from "@strudel/core";
import type { Hap, Repl } from "@strudel/core";
import * as mini from "@strudel/mini";
import * as tonal from "@strudel/tonal";
import { transpiler } from "@strudel/transpiler";
import type { GeneratedProgram, LineMap } from "@phyllo/model";
import { lineAtOffset, trackAtLine } from "./errors";
import { onsetsInRange } from "./offline";

export interface NoteEvent {
  trackId: string;
  /** MIDI note 0–127 (drum sounds use the General MIDI drum map; the caller puts them on channel 10). */
  note: number;
  /** 1–127 */
  velocity: number;
  /** Seconds from `fromCycle`. */
  startSec: number;
  /** > 0 */
  durationSec: number;
}

export interface NoteQueryOptions {
  /** Song cycles, 0-based; `toCycle` exclusive. */
  fromCycle: number;
  toCycle: number;
  cps: number;
}

/** General MIDI percussion keys for Strudel's drum-machine sound names. */
export const GM_DRUM_NOTES: Readonly<Record<string, number>> = {
  bd: 36,
  sd: 38,
  cp: 39,
  hh: 42,
  oh: 46,
  rim: 37,
  lt: 41,
  mt: 45,
  ht: 48,
  cr: 49,
  rd: 51,
  cb: 56,
  sh: 70,
};

/** Velocity when a note sets neither `gain` nor `velocity`. */
export const DEFAULT_VELOCITY = 100;
/** Strudel's default gain (DECISIONS D42); a note at this gain gets `DEFAULT_VELOCITY`. */
const DEFAULT_GAIN = 0.8;

type HapValue = Record<string, unknown>;

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** `bd`, `RolandTR909_bd`, `bd:3` → `bd`. */
function drumKey(s: unknown): string | undefined {
  if (typeof s !== "string") return undefined;
  const base = s.split(":")[0] ?? s;
  const key = base.includes("_") ? base.slice(base.lastIndexOf("_") + 1) : base;
  return key.toLowerCase();
}

/**
 * MIDI note number of one hap value, or undefined when it has no pitch Phyllo can export:
 * `note` (number or name), else `freq`, else a drum sound name (GM map). `n` with `.scale()` already
 * arrives as `note` (tonal converts it); a bare `n` on a synth has no pitch in superdough, so it is skipped.
 */
export function midiNoteOf(value: unknown): number | undefined {
  if (isFiniteNumber(value)) return clampNote(value);
  if (typeof value === "string") return noteFromName(value);
  if (!value || typeof value !== "object") return undefined;
  const v = value as HapValue;
  if (v["note"] !== undefined) {
    const note = v["note"];
    if (isFiniteNumber(note)) return clampNote(note);
    if (typeof note === "string") return noteFromName(note);
    return undefined;
  }
  if (isFiniteNumber(v["freq"]) && v["freq"] > 0) return clampNote(69 + 12 * Math.log2(v["freq"] / 440));
  const drum = drumKey(v["s"]);
  if (drum !== undefined && drum in GM_DRUM_NOTES) return GM_DRUM_NOTES[drum];
  return undefined;
}

function noteFromName(name: string): number | undefined {
  try {
    const n = noteToMidi(name);
    return isFiniteNumber(n) ? clampNote(n) : undefined;
  } catch {
    return undefined;
  }
}

const clampNote = (n: number) => Math.min(127, Math.max(0, Math.round(n)));

/** Velocity 1–127 from `gain` (relative to Strudel's .8 default) × `velocity` (0–1); 0 means "not heard". */
export function midiVelocityOf(value: unknown): number {
  if (!value || typeof value !== "object") return DEFAULT_VELOCITY;
  const v = value as HapValue;
  const gain = isFiniteNumber(v["gain"]) ? v["gain"] : DEFAULT_GAIN;
  const velocity = isFiniteNumber(v["velocity"]) ? v["velocity"] : 1;
  const raw = DEFAULT_VELOCITY * (gain / DEFAULT_GAIN) * velocity;
  if (!(raw > 0)) return 0;
  return Math.min(127, Math.max(1, Math.round(raw)));
}

// ── evaluation ──────────────────────────────────────────────────────────────

/** indent, `_` prefix, label (`$`, `S$`, `name`), `_` suffix, colon — the same label rule as stems.ts. */
const LABEL = /^(\s*)(_?)((?:S?\$)|[A-Za-z](?:\w*[A-Za-z0-9])?)(_?)(\s*:)(?!:)/;

interface Block {
  id: string;
  pattern: Pattern;
}

let scopeReady: Promise<void> | undefined;
let evaluator: { repl: Repl; blocks: Block[]; errors: unknown[] } | undefined;
let queue: Promise<unknown> = Promise.resolve();

/** Strudel's globals (`s`, `note`, `.voicing()`…). The runtime's `init` installs them too; this covers "before init". */
function ensureScope(): Promise<void> {
  scopeReady ??= (async () => {
    if (typeof (globalThis as Record<string, unknown>)["note"] === "function") return;
    mini.miniAllStrings();
    await evalScope(core, mini, tonal);
  })();
  return scopeReady;
}

function getEvaluator() {
  if (evaluator) return evaluator;
  const state: { blocks: Block[]; errors: unknown[] } = { blocks: [], errors: [] };
  const r = repl({
    defaultOutput: async () => undefined,
    getTime: () => 0,
    transpiler,
    onEvalError: (err) => state.errors.push(err),
    beforeEval: () => {
      const inner = Pattern.prototype.p as (this: Pattern, id: string) => Pattern;
      Pattern.prototype.p = function (this: Pattern, id: string) {
        state.blocks.push({ id: String(id), pattern: this });
        return inner.call(this, id);
      };
    },
  });
  evaluator = Object.assign(state, { repl: r });
  return evaluator;
}

const isMuted = (id: string) => id.startsWith("_") || id.endsWith("_");
const isSolo = (id: string) => id.length > 1 && id.startsWith("S");

/** 1-based label lines of the code, in order (one per `$:` / `name:` block). */
function labelLines(code: string): number[] {
  const out: number[] = [];
  code.split("\n").forEach((text, i) => {
    if (LABEL.test(text)) out.push(i + 1);
  });
  return out;
}

/** Track of each block: by label order when the counts agree, else by the first hap's source location. */
function blockTracks(blocks: readonly Block[], code: string, lines: LineMap, probe: (b: Block) => Hap[]): (string | undefined)[] {
  const labels = labelLines(code);
  if (labels.length === blocks.length) return labels.map((ln) => trackAtLine(lines, ln));
  return blocks.map((b) => {
    const loc = probe(b).find((h) => h.context.locations?.length)?.context.locations?.[0];
    return loc ? trackAtLine(lines, lineAtOffset(code, loc.start)) : undefined;
  });
}

/**
 * Note events of every audible track in `[fromCycle, toCycle)`, sorted by start time (then track, then note).
 * Times are relative to `fromCycle`; notes running past `toCycle` are cut there. Rejects when the code doesn't
 * evaluate or a pattern throws while queried.
 */
export function queryNoteEvents(program: GeneratedProgram, opts: NoteQueryOptions): Promise<NoteEvent[]> {
  const run = queue.then(() => collect(program, opts));
  queue = run.catch(() => undefined);
  return run;
}

async function collect(program: GeneratedProgram, { fromCycle, toCycle, cps }: NoteQueryOptions): Promise<NoteEvent[]> {
  if (!(cps > 0)) throw new Error("queryNoteEvents: cps must be > 0");
  if (!(toCycle > fromCycle)) return [];
  await ensureScope();
  const ev = getEvaluator();
  ev.blocks = [];
  ev.errors = [];
  let result: Pattern | undefined;
  try {
    result = await ev.repl.evaluate(program.code, false);
  } catch (err) {
    ev.errors.push(err);
  }
  if (ev.errors.length || !result) {
    const first = ev.errors[0];
    throw first instanceof Error ? first : new Error(first === undefined ? "evaluation failed" : String(first));
  }

  const blocks = ev.blocks;
  const probe = (b: Block) => onsetsInRange(b.pattern, fromCycle, Math.min(toCycle, fromCycle + 64), cps);
  const tracks = blockTracks(blocks, program.code, program.lines, probe);
  const soloActive = blocks.some((b) => isSolo(b.id));

  const events: NoteEvent[] = [];
  blocks.forEach((block, i) => {
    const trackId = tracks[i];
    if (trackId === undefined || isMuted(block.id) || (soloActive && !isSolo(block.id))) return;
    for (const hap of onsetsInRange(block.pattern, fromCycle, toCycle, cps)) {
      const note = midiNoteOf(hap.value);
      const velocity = midiVelocityOf(hap.value);
      if (note === undefined || velocity === 0) continue;
      const begin = hap.whole?.begin.valueOf() ?? 0;
      const end = Math.min(toCycle, hap.whole?.end.valueOf() ?? begin);
      const durationSec = (end - begin) / cps;
      if (!(durationSec > 0)) continue;
      events.push({ trackId, note, velocity, startSec: (begin - fromCycle) / cps, durationSec });
    }
  });
  return events.sort((a, b) => a.startSec - b.startSec || a.trackId.localeCompare(b.trackId) || a.note - b.note);
}
