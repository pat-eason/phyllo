import { compressTokens } from "./grid";
import { hasRandomness, parseAst, queryEvents, repeatsEveryCycle, CYCLES_CHECKED } from "./query";

/** `0.8` → `.8`, `1` → `1`, `0.125` → `.125` (3 decimals, clamped to 0–1). */
export function formatGain(v: number): string {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 1));
  return String(Number(clamped.toFixed(3))).replace(/^0\./, ".");
}

/**
 * Velocity lane → `.gain()` argument (SPEC §6.3). Values sit at the row's active steps and rests (`~`)
 * elsewhere, compressed like a step row: hats on every 8th alternating .45/.7 → `[.45 .7]*4`.
 * One velocity on every hit → that number alone (`.8`). No active steps → "". A missing velocity counts as 1.
 * Velocities are written on the row's own grid, so the gain pattern must be regenerated when steps change.
 */
export function velocitiesToGainPattern(velocities: readonly number[], steps: readonly boolean[]): string {
  const values = steps.map((on, i) => (on ? formatGain(velocities[i] ?? 1) : null));
  const used = values.filter((v): v is string => v !== null);
  const only = used[0];
  if (only === undefined) return "";
  if (used.every((v) => v === only)) return only;
  return compressTokens(values);
}

/**
 * `.gain()` argument → velocity per step (best effort): each active step reads the gain value sounding at
 * its onset, inactive steps read 0. Null when the pattern can't be represented as one velocity per step:
 * a parse error, randomness, values that change between cycles, non-numeric values, or an active step
 * with no gain value at its onset (Strudel would drop that hit).
 */
export function gainPatternToVelocities(pattern: string, steps: readonly boolean[]): number[] | null {
  const text = pattern.trim();
  if (text === "") return null;
  const literal = Number(text);
  if (Number.isFinite(literal)) return steps.map((on) => (on ? literal : 0));
  try {
    if (hasRandomness(parseAst(text))) return null;
    const events = queryEvents(text, 0, CYCLES_CHECKED);
    if (!repeatsEveryCycle(events)) return null;
    const first = events.filter((e) => e.cycle === 0);
    const n = steps.length;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!steps[i]) {
        out.push(0);
        continue;
      }
      const at = i / n;
      const hit = first.find((e) => e.t <= at + 1e-9 && at < e.t + e.d - 1e-9);
      if (!hit || typeof hit.value !== "number") return null;
      out.push(hit.value);
    }
    return out;
  } catch {
    return null;
  }
}
