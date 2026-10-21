export const MIN_BPM = 40;
export const MAX_BPM = 240;
/** A pause longer than this starts a new tap sequence. */
export const TAP_RESET_MS = 2000;
const MAX_TAPS = 5;

export function clampBpm(bpm: number): number {
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
}

/** Appends a tap time (epoch ms) to the running sequence; a long pause restarts it. Keeps the last few taps. */
export function addTap(taps: readonly number[], now: number): number[] {
  const last = taps[taps.length - 1];
  const kept = last !== undefined && now - last > TAP_RESET_MS ? [] : taps;
  return [...kept, now].slice(-MAX_TAPS);
}

/** BPM from the average gap between taps (clamped 40–240), or null until there are two taps. */
export function bpmFromTaps(taps: readonly number[]): number | null {
  const first = taps[0];
  const last = taps[taps.length - 1];
  if (first === undefined || last === undefined || taps.length < 2 || last <= first) return null;
  const averageGapMs = (last - first) / (taps.length - 1);
  return clampBpm(60_000 / averageGapMs);
}
