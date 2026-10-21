/**
 * Transport position math (DECISIONS V6/V7). Pure: no audio, testable in Node.
 *
 * Two time axes:
 * - scheduler cycles `s`: what Strudel's Cyclist counts (0 at every start, never jumps);
 * - song cycles `u`: the position in the song (one cycle = one bar), moved by seek and wrapped by the loop.
 *
 * A `Segment` maps `s → u` from `fromS` on. Seek / loop changes append a segment that starts at the
 * scheduler's query frontier, so already-scheduled audio and the heard playhead stay consistent.
 * Playback wraps only when the playhead crosses the loop end (a playhead already past the loop end plays on).
 */
import { Pattern, TimeSpan } from "@strudel/core";
import type { Hap, State } from "@strudel/core";
import type { TransportPosition } from "@phyllo/model";

/** Loop in song cycles: `[start, end)`. */
export interface LoopCycles {
  enabled: boolean;
  start: number;
  end: number;
}

export interface Segment {
  /** First scheduler cycle this segment applies to (-Infinity for the first one). */
  fromS: number;
  anchorS: number;
  anchorU: number;
  loop: LoopCycles;
  /** Song length in cycles; Infinity = no end. */
  length: number;
  /** A seek: the displayed playhead holds at `anchorU` until the audio reaches `fromS`. */
  seek: boolean;
}

export interface MappedPosition {
  /** Song cycle. */
  u: number;
  /** True past the song end (nothing plays). */
  silent: boolean;
  /** Next scheduler cycle (> s) where the mapping jumps, or Infinity. */
  boundary: number;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Converts 1-based inclusive loop bars to `[start, end)` cycles. */
export function loopToCycles(loop: { enabled: boolean; startBar: number; endBar: number }): LoopCycles {
  const start = Math.max(0, loop.startBar - 1);
  const end = Math.max(start, loop.endBar);
  return { enabled: loop.enabled && end > start, start, end };
}

function wraps(seg: Segment): boolean {
  return seg.loop.enabled && seg.loop.end > seg.loop.start && seg.anchorU < seg.loop.end;
}

/** Maps a scheduler cycle to a song cycle within one segment. */
export function mapCycle(seg: Segment, s: number): MappedPosition {
  const lin = seg.anchorU + (s - seg.anchorS);
  let u = lin;
  let boundary = Infinity;
  if (wraps(seg)) {
    const { start, end } = seg.loop;
    if (lin >= end) u = start + mod(lin - start, end - start);
    boundary = s + (end - u);
  }
  const silent = u >= seg.length || u < 0;
  if (u < seg.length) boundary = Math.min(boundary, s + (seg.length - u));
  return { u, silent, boundary };
}

/** The segment in effect at scheduler cycle `s` (segments sorted by `fromS`). */
export function segmentAt(segments: readonly Segment[], s: number): Segment | undefined {
  let found: Segment | undefined;
  for (const seg of segments) {
    if (seg.fromS <= s) found = seg;
    else break;
  }
  return found ?? segments[0];
}

/**
 * Song position shown for a heard scheduler cycle. During a pending seek (audio hasn't reached the new
 * segment yet) the playhead holds at the seek target.
 */
export function songCycleAt(segments: readonly Segment[], s: number): number {
  const last = segments[segments.length - 1];
  if (last && last.seek && s < last.fromS) return last.anchorU;
  const seg = segmentAt(segments, s);
  return seg ? mapCycle(seg, s).u : 0;
}

/** Splits `[b, e)` into pieces with a constant song shift `d = u - s`. Silent pieces are dropped. */
export function planQuery(segments: readonly Segment[], b: number, e: number): { b: number; e: number; shift: number }[] {
  const pieces: { b: number; e: number; shift: number }[] = [];
  let cur = b;
  let guard = 0;
  while (cur < e && guard++ < 10_000) {
    const seg = segmentAt(segments, cur);
    if (!seg) break;
    const next = segments.find((x) => x.fromS > cur)?.fromS ?? Infinity;
    const m = mapCycle(seg, cur);
    const pieceEnd = Math.min(e, m.boundary, next);
    if (!m.silent && pieceEnd > cur) pieces.push({ b: cur, e: pieceEnd, shift: m.u - cur });
    if (pieceEnd <= cur) break;
    cur = pieceEnd;
  }
  return pieces;
}

export interface TransportSource {
  /** Current song pattern; may be swapped at any time (hot-swap). */
  get(): Pattern | undefined;
  /** Called when the song pattern throws while queried; return a replacement (last good) or undefined. */
  onQueryError(err: unknown): Pattern | undefined;
}

/**
 * Pattern handed to the scheduler: plays the song pattern through the segment mapping
 * (equivalent to `p.early(B)` for seek and `p.ribbon(start, len).late(c0)` for the loop; V6).
 */
export function transportPattern(source: TransportSource, getSegments: () => readonly Segment[]): Pattern {
  return new Pattern((state: State) => {
    const b = state.span.begin.valueOf();
    const e = state.span.end.valueOf();
    const out: Hap[] = [];
    for (const piece of planQuery(getSegments(), b, e)) {
      out.push(...queryPiece(source, state, piece));
    }
    return out;
  });
}

function queryPiece(source: TransportSource, state: State, piece: { b: number; e: number; shift: number }): Hap[] {
  let pat = source.get();
  for (let attempt = 0; pat && attempt < 2; attempt++) {
    try {
      const shifted = piece.shift === 0 ? pat : pat._early(piece.shift);
      return shifted.query(state.setSpan(new TimeSpan(piece.b, piece.e)));
    } catch (err) {
      pat = source.onQueryError(err);
    }
  }
  return [];
}

/** bar.beat.16th for a song cycle (SPEC §6.1 readout). */
export function positionFromCycle(cycle: number, beatsPerBar: number): TransportPosition {
  const c = Math.max(0, cycle);
  const bar = Math.floor(c);
  const beats = (c - bar) * beatsPerBar;
  const beat = Math.min(beatsPerBar - 1, Math.floor(beats + 1e-9));
  const sixteenth = Math.min(3, Math.floor((beats - beat) * 4 + 1e-9));
  return { bar: bar + 1, beat: beat + 1, sixteenth: sixteenth + 1, cycle: c };
}

/**
 * Heard scheduler cycle (V7): Cyclist anchors minus its latency, at the audio output time.
 * Returns undefined before the scheduler's first tick.
 */
export function heardSchedulerCycle(
  anchors: { numCyclesAtCpsChange: number; secondsAtCpsChange: number | undefined; cps: number; latency: number },
  outputTime: number,
): number | undefined {
  if (anchors.secondsAtCpsChange === undefined || !Number.isFinite(anchors.secondsAtCpsChange)) return undefined;
  return anchors.numCyclesAtCpsChange + (outputTime - anchors.secondsAtCpsChange - anchors.latency) * anchors.cps;
}
