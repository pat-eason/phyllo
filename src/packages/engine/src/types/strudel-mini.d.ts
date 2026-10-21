/**
 * Extra Strudel declarations used by engine/src/mini (T1.3). Merges with types/strudel.d.ts.
 * Functions only (not consts), so another area declaring the same name merges as an overload.
 */

declare module "@strudel/mini" {
  /** Parse a *quoted* mini string (`"\"bd*4\""`) into krill's AST. Throws `Error("[mini] parse error …")`. */
  export function mini2ast(code: string, start?: number, userCode?: string): unknown;
}

declare module "@strudel/core" {
  /** `"eb2"` → 39. Throws on anything that isn't a note name. core/util.mjs:31 */
  export function noteToMidi(note: string, defaultOctave?: number): number;
  /** `/^[a-gA-G][#bsf]*-?[0-9]*$/` core/util.mjs:11 */
  export function isNote(name: string): boolean;
}
