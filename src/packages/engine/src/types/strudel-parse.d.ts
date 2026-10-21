/**
 * Extra ambient declarations for parse/ (merges with strudel.d.ts, DECISIONS V17).
 * `@strudel/mini` re-exports the krill (peggy) parser: `parse('"…"')` throws a `SyntaxError`
 * with `.location.start {offset, line, column}` (offset includes the opening quote) — REPORT (b).
 */
declare module "@strudel/mini" {
  export function parse(input: string, options?: Record<string, unknown>): unknown;
}
