import type { StepRowModel } from "@phyllo/model";
import { euclidSteps } from "./bjorklund";
import { hasRandomness, parseAst, queryEvents, repeatsEveryCycle, valueName, CYCLES_CHECKED } from "./query";
import type { MiniEvent } from "./query";

/** Shown instead of a lossy grid (SPEC §4.3). */
export const UNFIT_REASON = "This pattern can't be shown as steps";

/** Failure result: `reason` is the user-facing SPEC string, `detail` says why (for logs, tooltips, tests). */
export interface GridParseFailure {
  ok: false;
  reason: string;
  detail: string;
}

export type MiniToRowsResult = { ok: true; rows: StepRowModel[] } | GridParseFailure;

export interface MiniToRowsOptions {
  /** Grid length; one cycle = this many steps. Default 16. */
  steps?: number;
  /** Rows to keep, in this order, even when empty; other sounds are appended in source order. */
  sounds?: readonly string[];
}

const unfit = (detail: string): GridParseFailure => ({ ok: false, reason: UNFIT_REASON, detail });

const EPS = 1e-6;

type Euclid = NonNullable<StepRowModel["euclid"]>;

/** A literal integer leaf (`3`, `-1`) used as a Euclid argument. */
function literalInt(node: unknown): number | null {
  if (!node || typeof node !== "object") return null;
  const rec = node as { type_?: unknown; source_?: unknown; options_?: { ops?: unknown[] } };
  if (rec.type_ === "element") {
    if (rec.options_?.ops?.length) return null;
    return literalInt(rec.source_);
  }
  if (rec.type_ !== "atom" || typeof rec.source_ !== "string") return null;
  const n = Number(rec.source_);
  return Number.isInteger(n) ? n : null;
}

/**
 * Euclid layers (`name(k,n[,r])` as a whole comma-separated layer) found at the top level of the AST,
 * keyed by row name (`bd:3(3,8)` → `bd:3`).
 */
function topLevelEuclids(ast: unknown): Map<string, Euclid[]> {
  const out = new Map<string, Euclid[]>();
  const root = ast as { arguments_?: { alignment?: unknown }; source_?: unknown };
  const layers = root.arguments_?.alignment === "stack" && Array.isArray(root.source_) ? root.source_ : [ast];
  for (const layer of layers as { source_?: unknown }[]) {
    const elems = layer?.source_;
    if (!Array.isArray(elems) || elems.length !== 1) continue;
    const elem = elems[0] as { type_?: unknown; source_?: { type_?: unknown; source_?: unknown }; options_?: { ops?: unknown[] } };
    if (elem.type_ !== "element" || elem.source_?.type_ !== "atom" || typeof elem.source_.source_ !== "string") continue;
    const ops = (elem.options_?.ops ?? []) as { type_?: unknown; arguments_?: Record<string, unknown> }[];
    const last = ops[ops.length - 1];
    if (!last || last.type_ !== "bjorklund") continue;
    const parts = [elem.source_.source_];
    let ok = true;
    for (const op of ops.slice(0, -1)) {
      const tail = op.type_ === "tail" ? (op.arguments_?.element as { type_?: unknown; source_?: unknown } | undefined) : undefined;
      if (tail?.type_ !== "atom" || typeof tail.source_ !== "string") {
        ok = false;
        break;
      }
      parts.push(tail.source_);
    }
    if (!ok) continue;
    const hits = literalInt(last.arguments_?.pulse);
    const steps = literalInt(last.arguments_?.step);
    const rotation = last.arguments_?.rotation == null ? 0 : literalInt(last.arguments_.rotation);
    if (hits === null || steps === null || rotation === null) continue;
    const name = parts.join(":");
    const euclid: Euclid = rotation ? { hits, steps, rotation } : { hits, steps };
    out.set(name, [...(out.get(name) ?? []), euclid]);
  }
  return out;
}

/**
 * Mini-notation → step rows (SPEC §4.3): Strudel parses and queries the pattern, onsets are quantized to
 * the grid (onset only; durations are ignored), and each sound gets a row. Refuses (`ok: false`) rather
 * than showing a lossy grid when an onset is off the grid (triplets), the cycles differ (`<a b>`, `a/2`,
 * unaligned `{}`), the pattern is random (`?`, `|`), a value isn't a sound name, or one sound hits the
 * same step twice. A layer written `name(k,n[,r])` whose steps equal that rhythm sets `row.euclid`.
 */
export function miniToRows(pattern: string, opts: MiniToRowsOptions = {}): MiniToRowsResult {
  const gridSteps = opts.steps ?? 16;
  const wanted = [...new Set(opts.sounds ?? [])];

  let ast: unknown;
  let events: MiniEvent[];
  if (pattern.trim() === "") {
    ast = null;
    events = [];
  } else {
    try {
      ast = parseAst(pattern);
    } catch (err) {
      return unfit(err instanceof Error ? err.message : String(err));
    }
    if (hasRandomness(ast)) return unfit("uses random choice (? or |)");
    try {
      events = queryEvents(pattern, 0, CYCLES_CHECKED);
    } catch (err) {
      return unfit(err instanceof Error ? err.message : String(err));
    }
    if (!repeatsEveryCycle(events)) return unfit("changes from cycle to cycle");
  }

  const first = events.filter((e) => e.cycle === 0);
  const rows = new Map<string, { steps: boolean[]; loc: number; order: number }>();
  for (const name of wanted) rows.set(name, { steps: new Array<boolean>(gridSteps).fill(false), loc: -1, order: -1 });

  for (const [order, e] of first.entries()) {
    const name = valueName(e.value);
    if (name === null) return unfit("contains values that aren't sound names");
    const pos = e.t * gridSteps;
    const step = Math.round(pos);
    if (Math.abs(pos - step) > EPS || step >= gridSteps) return unfit("has hits between steps (e.g. triplets)");
    let row = rows.get(name);
    if (!row) {
      row = { steps: new Array<boolean>(gridSteps).fill(false), loc: e.loc, order };
      rows.set(name, row);
    }
    row.loc = Math.min(row.loc, e.loc);
    if (row.steps[step]) return unfit(`plays ${name} twice on the same step`);
    row.steps[step] = true;
  }

  const euclids = ast ? topLevelEuclids(ast) : new Map<string, Euclid[]>();
  const extra = [...rows.entries()]
    .filter(([name]) => !wanted.includes(name))
    .sort(([, a], [, b]) => a.loc - b.loc || a.order - b.order)
    .map(([name]) => name);

  const result: StepRowModel[] = [...wanted, ...extra].map((sound) => {
    const steps = rows.get(sound)?.steps ?? new Array<boolean>(gridSteps).fill(false);
    const euclid = euclids.get(sound)?.find((eu) => {
      const expected = euclidSteps(eu.hits, eu.steps, eu.rotation ?? 0, gridSteps);
      return expected !== null && expected.every((x, i) => x === steps[i]);
    });
    return euclid && steps.some(Boolean) ? { sound, steps, euclid } : { sound, steps };
  });
  return { ok: true, rows: result };
}
