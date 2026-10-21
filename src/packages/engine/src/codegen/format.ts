import type { ParamValue } from "@phyllo/model";

/**
 * Number text as the mockups write it: `.82`, `-.5`, `0`, `10`, `1.25`; at most 4 decimals (so 3/16 = `.1875` survives).
 * Non-finite values print as `0` so generated code always evaluates.
 */
export function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return "0";
  const r = Math.round(v * 10000) / 10000;
  if (r === 0) return "0";
  if (Number.isInteger(r)) return String(r);
  return String(r).replace(/^(-?)0\./, "$1.");
}

/** True when `formatNumber(v)` reads back as exactly `v` (parse keeps other literals verbatim). */
export function isExactNumber(v: number): boolean {
  return Number.isFinite(v) && Number(formatNumber(v)) === v;
}

/** A double-quoted JS string literal (Strudel's transpiler mini-parses double-quoted strings). */
export function quote(s: string): string {
  return JSON.stringify(s);
}

/** A param argument: numbers plain, strings as a quoted patterned value `"[.45 .7]*4"`. */
export function formatParamValue(v: ParamValue): string {
  return typeof v === "number" ? formatNumber(v) : quote(v);
}
