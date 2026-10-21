import { compressTokens, rowsToMini } from "@phyllo/engine";
import { findTrack } from "@phyllo/model";
import type { Project, StepRowModel, Track } from "@phyllo/model";
import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand/vanilla";
import type { MidiMessageEvent } from "../native/types";
import type { EngineHost } from "./engineHost";
import type { Unsubscribe } from "./feed";
import { DRUM_ROW_ORDER, GM_DRUMS, midiNoteName, sampleSoundOf } from "./midiInput";
import type { ProjectStoreState } from "./projectStore";
import type { TransportStoreState } from "./transportStore";

/** Steps per cycle (= bar) a take is quantized to (SPEC §6.1: 16ths). */
export const RECORD_STEPS = 16;

export interface RecordedNote {
  /** Heard song cycle (0-based) when the note-on arrived. */
  cycle: number;
  note: number;
  velocity: number;
}

export type RecordTakeStatus =
  /** Written to the track as its new pattern (one undo step). */
  | "written"
  /** Transport stopped without a note-on. */
  | "empty"
  /** No track was selected when the take ended. */
  | "noTrack"
  /** Nothing in the take maps onto this track (a code track, or a drum track and no GM drum notes). */
  | "unsupported";

export interface RecordTake {
  status: RecordTakeStatus;
  trackId: string | null;
  /** The written mini-notation; null unless `written`. */
  pattern: string | null;
  noteCount: number;
  /** Cycles the pattern spans (1, or the length of its `<…>` alternation). */
  bars: number;
  /** epoch ms */
  at: number;
}

export interface RecorderState {
  /** Mirrors the transport's record-arm flag. */
  armed: boolean;
  /** Armed and playing: incoming note-ons are captured. */
  recording: boolean;
  lastTake: RecordTake | null;
  arm(on: boolean): void;
}

export interface RecorderDeps {
  transport: StoreApi<TransportStoreState>;
  project: StoreApi<ProjectStoreState>;
  host: EngineHost;
  /** Note-ons from enabled inputs (`MidiInputHandle.onMessage`). */
  onMidiMessage(callback: (message: MidiMessageEvent) => void): Unsubscribe;
  now?: () => number;
  /**
   * Extra input latency to subtract, in ms (default 0). `engine.getCycle()` is already the *heard* position (the
   * scheduler look-ahead and output latency are compensated, DECISIONS V7), which is what a player plays along to.
   */
  inputLatencyMs?: number;
}

export interface RecorderHandle {
  store: StoreApi<RecorderState>;
  dispose(): void;
}

type Loop = Project["loop"];

/** Quantized take: 0-based cycle → step (0–15) → notes hit there (ascending, unique). */
export type QuantizedTake = Map<number, Map<number, number[]>>;

/**
 * Snaps every note to the nearest 16th. A note rounded onto the loop end (or past it) folds back to the loop start,
 * so a slightly late downbeat lands on bar 1 of the loop instead of outside it.
 */
export function quantizeTake(notes: readonly RecordedNote[], loop?: Loop): QuantizedTake {
  const out: QuantizedTake = new Map();
  for (const n of notes) {
    if (!Number.isFinite(n.cycle)) continue;
    let step = Math.round(Math.max(0, n.cycle) * RECORD_STEPS);
    if (loop?.enabled && loop.endBar >= loop.startBar) {
      const start = (loop.startBar - 1) * RECORD_STEPS;
      const len = (loop.endBar - loop.startBar + 1) * RECORD_STEPS;
      if (step >= start + len) step = start + ((step - start) % len);
    }
    const cycle = Math.floor(step / RECORD_STEPS);
    const at = step % RECORD_STEPS;
    let steps = out.get(cycle);
    if (!steps) out.set(cycle, (steps = new Map()));
    const hit = steps.get(at) ?? [];
    if (!hit.includes(n.note)) steps.set(at, [...hit, n.note].sort((a, b) => a - b));
  }
  return out;
}

/** A cycle's mini-notation as one element of `<…>`. */
function asElement(mini: string): string {
  if (mini === "") return "~";
  return /[\s,]/.test(mini) ? `[${mini}]` : mini;
}

/**
 * Folds per-cycle mini-notation into one pattern: a single cycle as-is, several as a `<…>` alternation rotated so
 * that the element for song cycle `c` sits at index `c mod length` (Strudel's slowcat picks by absolute cycle),
 * with `~` for cycles that had no notes.
 */
export function foldCycles(cycles: ReadonlyMap<number, string>): { pattern: string; bars: number } | null {
  const filled = [...cycles.entries()].filter(([, mini]) => mini !== "");
  if (!filled.length) return null;
  const keys = filled.map(([c]) => c);
  const first = Math.min(...keys);
  const last = Math.max(...keys);
  const bars = last - first + 1;
  if (bars === 1) return { pattern: filled[0]?.[1] ?? "", bars };
  const slots = Array.from({ length: bars }, () => "~");
  for (let c = first; c <= last; c++) slots[((c % bars) + bars) % bars] = asElement(cycles.get(c) ?? "");
  return { pattern: `<${slots.join(" ")}>`, bars };
}

function drumCycle(steps: ReadonlyMap<number, number[]>): string {
  const rows = new Map<string, boolean[]>();
  for (const [at, notes] of steps) {
    for (const note of notes) {
      const sound = GM_DRUMS[note];
      if (!sound) continue;
      let row = rows.get(sound);
      if (!row) rows.set(sound, (row = Array.from({ length: RECORD_STEPS }, () => false)));
      row[at] = true;
    }
  }
  const ordered: StepRowModel[] = DRUM_ROW_ORDER.flatMap((sound) => {
    const steps = rows.get(sound);
    return steps ? [{ sound, steps }] : [];
  });
  return rowsToMini(ordered);
}

function tokenCycle(steps: ReadonlyMap<number, number[]>, token: (notes: number[]) => string): string {
  const tokens = Array.from({ length: RECORD_STEPS }, (_, i): string | null => {
    const notes = steps.get(i);
    return notes?.length ? token(notes) : null;
  });
  return compressTokens(tokens);
}

const noteToken = (notes: number[]) => (notes.length === 1 ? midiNoteName(notes[0] ?? 60) : `[${notes.map(midiNoteName).join(",")}]`);

/**
 * The pattern a take writes on `track` (SPEC §6.1 Record): drum → step layers from the GM drum map
 * (`bd*4, [~ cp]*2`, via `rowsToMini`); melodic/chord → note names (`c3 eb3 [g3,bb3] ~`); sample → the sample's
 * rhythm. More than one cycle folds into `<…>`. Null when nothing maps (code tracks, no drum notes).
 */
export function takeToPattern(notes: readonly RecordedNote[], track: Track, loop?: Loop): { pattern: string; bars: number } | null {
  const take = quantizeTake(notes, loop);
  let cycleMini: (steps: ReadonlyMap<number, number[]>) => string;
  switch (track.kind) {
    case "drum":
      cycleMini = drumCycle;
      break;
    case "melodic":
    case "chord":
      cycleMini = (steps) => tokenCycle(steps, noteToken);
      break;
    case "sample": {
      const sound = sampleSoundOf(track);
      if (!sound) return null;
      cycleMini = (steps) => tokenCycle(steps, () => sound);
      break;
    }
    default:
      return null;
  }
  const cycles = new Map<number, string>();
  for (const [cycle, steps] of take) cycles.set(cycle, cycleMini(steps));
  return foldCycles(cycles);
}

/**
 * MIDI record (SPEC §6.1, proposed): while the transport is record-armed and playing, note-ons from enabled inputs
 * are captured at the heard cycle; when playback stops (or the arm is released) the take is quantized to 16ths and
 * written as the selected track's new pattern in one undo step.
 */
export function createRecorder(deps: RecorderDeps): RecorderHandle {
  const { host } = deps;
  const now = deps.now ?? (() => Date.now());
  const latencySec = Math.max(0, deps.inputLatencyMs ?? 0) / 1000;
  const cleanups: Unsubscribe[] = [];
  let take: RecordedNote[] | null = null;

  const store = createStore<RecorderState>()(() => ({
    armed: deps.transport.getState().recordArmed,
    recording: false,
    lastTake: null,
    arm: (on) => deps.transport.getState().setRecordArmed(on),
  }));

  const finish = (notes: RecordedNote[]) => {
    const { project, dispatch, beginGesture, endGesture } = deps.project.getState();
    const track = findTrack(project, project.ui.selectedTrack);
    const base = { at: now(), noteCount: notes.length, pattern: null, bars: 0 };
    if (!track) {
      store.setState({ lastTake: { ...base, status: "noTrack", trackId: null } });
      return;
    }
    if (!notes.length) {
      store.setState({ lastTake: { ...base, status: "empty", trackId: track.id } });
      return;
    }
    const result = takeToPattern(notes, track, project.loop);
    if (!result) {
      store.setState({ lastTake: { ...base, status: "unsupported", trackId: track.id } });
      return;
    }
    beginGesture();
    try {
      if (track.kind === "chord") {
        dispatch({ type: "track/update", trackId: track.id, patch: { kind: "melodic", source: { ...track.source, type: "note" } } });
      } else if (track.kind === "melodic" && track.source.type !== "note") {
        dispatch({ type: "track/setSource", trackId: track.id, source: { type: "note" } });
      }
      dispatch({ type: "track/setPattern", trackId: track.id, pattern: result.pattern });
    } finally {
      endGesture();
    }
    store.setState({ lastTake: { ...base, status: "written", trackId: track.id, pattern: result.pattern, bars: result.bars } });
  };

  const sync = (state: TransportStoreState) => {
    const recording = state.recordArmed && state.playing;
    if (recording && !take) take = [];
    const ended = !recording && take ? take : null;
    if (ended) take = null;
    const s = store.getState();
    if (s.armed !== state.recordArmed || s.recording !== recording) store.setState({ armed: state.recordArmed, recording });
    if (ended) finish(ended);
  };

  cleanups.push(
    deps.transport.subscribe((state, prev) => {
      if (state.recordArmed !== prev.recordArmed || state.playing !== prev.playing) sync(state);
    }),
    deps.onMidiMessage((message) => {
      if (!take || message.kind !== "noteon") return;
      const engine = host.peek();
      if (!engine) return;
      take.push({ cycle: engine.getCycle() - latencySec * engine.getCps(), note: message.data1, velocity: message.data2 });
    }),
  );
  sync(deps.transport.getState());

  return {
    store,
    dispose() {
      for (const cleanup of cleanups.splice(0)) cleanup();
      take = null;
    },
  };
}
