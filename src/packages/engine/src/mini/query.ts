/** Internal helpers: parse and query mini-notation with Strudel's own parser (not exported from the barrel). */
import { State, TimeSpan } from "@strudel/core";
import type { Hap, Pattern } from "@strudel/core";
import { mini, mini2ast } from "@strudel/mini";

/** One event with an onset, in cycle-relative time. */
export interface MiniEvent {
  /** cycle index the onset falls in */
  cycle: number;
  /** onset within its cycle, 0 ≤ t < 1 */
  t: number;
  /** duration in cycles */
  d: number;
  value: unknown;
  /** source offset of the leaf (for stable row order); Infinity when unknown */
  loc: number;
}

/** Krill AST for a mini string (throws on a parse error). */
export function parseAst(pattern: string): unknown {
  return mini2ast(`"${pattern}"`);
}

/** True when the AST uses Strudel's random operators (`bd?`, `bd?0.3`, `[a|b]`). */
export function hasRandomness(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(hasRandomness);
  if (node === null || typeof node !== "object") return false;
  const rec = node as Record<string, unknown>;
  if (rec.type_ === "degradeBy") return true;
  const args = rec.arguments_;
  if (args && typeof args === "object" && (args as Record<string, unknown>).alignment === "rand") return true;
  return Object.values(rec).some(hasRandomness);
}

/**
 * Events with an onset in cycles [from, to). Uses `pattern.query` rather than `queryArc`, which swallows
 * query-time errors (REPORT (b)); throws on a parse or query error.
 */
export function queryEvents(pattern: string | Pattern, from: number, to: number): MiniEvent[] {
  const pat = typeof pattern === "string" ? mini(pattern) : pattern;
  const haps: Hap[] = pat.query(new State(new TimeSpan(from, to)));
  const out: MiniEvent[] = [];
  for (const hap of haps) {
    if (!hap.whole || !hap.hasOnset()) continue;
    const begin = hap.whole.begin.valueOf();
    const cycle = Math.floor(begin + 1e-9);
    out.push({
      cycle,
      t: Math.max(0, begin - cycle),
      d: hap.whole.end.valueOf() - begin,
      value: hap.value,
      loc: hap.context.locations?.[0]?.start ?? Number.POSITIVE_INFINITY,
    });
  }
  return out;
}

/** Sound/row name of a mini value: `"bd"`, `["bd", 3]` → `"bd:3"`, `0` → `"0"`; null for anything else. */
export function valueName(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string" || typeof v === "number")) {
    return value.join(":");
  }
  return null;
}

/** Order-insensitive signature of the events in one cycle, for comparing cycles. */
export function cycleSignature(events: readonly MiniEvent[], cycle: number): string {
  return events
    .filter((e) => e.cycle === cycle)
    .map((e) => `${e.t.toFixed(9)}|${e.d.toFixed(9)}|${JSON.stringify(e.value)}`)
    .sort()
    .join(";");
}

/** Number of cycles compared when deciding whether a pattern repeats every cycle (`<a b>`, `a/2`, `{a b c}%4`). */
export const CYCLES_CHECKED = 16;

/** True when cycles 1…CYCLES_CHECKED-1 hold exactly the events of cycle 0. */
export function repeatsEveryCycle(events: readonly MiniEvent[]): boolean {
  const first = cycleSignature(events, 0);
  for (let c = 1; c < CYCLES_CHECKED; c++) if (cycleSignature(events, c) !== first) return false;
  return true;
}
