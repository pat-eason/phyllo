import { clampBpm } from "@phyllo/model";

/** Taps further apart than this start a new measurement (a pause of 2 s is slower than 30 BPM). */
export const TAP_RESET_MS = 2000;
/** The average covers the last four taps (three gaps). */
export const TAP_WINDOW = 4;

/**
 * Tap tempo: add `at` (epoch ms) to the recent taps. Returns the new tap list and, from the second tap on,
 * the BPM averaged over the last four taps, clamped to 40-240.
 */
export function registerTap(taps: readonly number[], at: number): { taps: number[]; bpm: number | null } {
  const last = taps[taps.length - 1];
  const fresh = last === undefined || at - last > TAP_RESET_MS || at <= last ? [at] : [...taps, at];
  const recent = fresh.slice(-TAP_WINDOW);
  const first = recent[0];
  if (recent.length < 2 || first === undefined) return { taps: recent, bpm: null };
  const gap = (at - first) / (recent.length - 1);
  return { taps: recent, bpm: clampBpm(60000 / gap) };
}
