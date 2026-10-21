import type { StepRowModel } from "@phyllo/model";
import { euclidSteps } from "./bjorklund";

/** Divisors of n, ascending (16 → 1, 2, 4, 8, 16). */
function divisors(n: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= n; d++) if (n % d === 0) out.push(d);
  return out;
}

/**
 * Shortest mini-notation for one cycle of evenly spaced tokens (`null` = rest), per SPEC §4.3 / `toMini`:
 * 1. coarsest grid (a divisor of the length: 1, 2, 4, 8, 16) on which every token lands;
 * 2. shortest repeating period on that grid;
 * 3. `a*N` for one token repeated, `[a ~ b ~]*N` for a repeated group, else the plain token list.
 * All rests → "".
 */
export function compressTokens(tokens: readonly (string | null)[]): string {
  const n = tokens.length;
  if (!tokens.some((t) => t !== null)) return "";
  const grid = divisors(n).find((g) => tokens.every((t, i) => t === null || i % (n / g) === 0)) ?? n;
  const stride = n / grid;
  const onGrid = Array.from({ length: grid }, (_, j) => tokens[j * stride] ?? "~");
  const period = divisors(grid).find((p) => onGrid.every((t, i) => t === onGrid[i % p])) ?? grid;
  const seg = onGrid.slice(0, period);
  const reps = grid / period;
  if (seg.length === 1) return reps > 1 ? `${seg[0]}*${reps}` : (seg[0] ?? "");
  return reps > 1 ? `[${seg.join(" ")}]*${reps}` : seg.join(" ");
}

/** The `name(k,n)` / `name(k,n,r)` token for a Euclid row. */
export function euclidToken(sound: string, euclid: NonNullable<StepRowModel["euclid"]>): string {
  const { hits, steps, rotation } = euclid;
  return rotation ? `${sound}(${hits},${steps},${rotation})` : `${sound}(${hits},${steps})`;
}

function sameSteps(a: readonly boolean[], b: readonly boolean[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * Mini-notation one step row writes. "" for an empty row (the UI shows `—`).
 * A row with `euclid` set writes `name(k,n[,r])`, but only while its steps still equal that rhythm;
 * otherwise (hand-edited, stale flag) it falls back to the step form.
 */
export function rowToMini(row: StepRowModel): string {
  if (row.euclid && row.steps.some(Boolean)) {
    const { hits, steps, rotation = 0 } = row.euclid;
    const expected = euclidSteps(hits, steps, rotation, row.steps.length);
    if (expected && sameSteps(expected, row.steps)) return euclidToken(row.sound, row.euclid);
  }
  return compressTokens(row.steps.map((on) => (on ? row.sound : null)));
}

/** Non-empty rows joined as layers: `bd*4, [~ cp]*2, hh*8, [~ oh]*4`. "" when every row is empty. */
export function rowsToMini(rows: readonly StepRowModel[]): string {
  return rows
    .map(rowToMini)
    .filter((m) => m !== "")
    .join(", ");
}
