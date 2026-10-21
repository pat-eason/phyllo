// Needs types/strudel-parse.d.ts (referenced from src/index.ts).
import { parse as krillParse } from "@strudel/mini";

export interface MiniPatternError {
  message: string;
  /** 1-based column in the pattern string (`pattern.length + 1` for "unexpected end of input"). */
  column: number;
}

/**
 * Mini-notation syntax check for the Inspector's pattern field, using Strudel's own krill parser.
 * Returns null when the pattern parses.
 */
export function parseMiniPatternError(pattern: string): MiniPatternError | null {
  try {
    krillParse(`"${pattern}"`);
    return null;
  } catch (err) {
    const e = err as { message?: string; location?: { start?: { offset?: number } } };
    const offset = e.location?.start?.offset;
    // The offset counts the opening quote, so it equals the 1-based column in the pattern.
    const column = typeof offset === "number" ? Math.min(Math.max(offset, 1), pattern.length + 1) : 1;
    return { message: e.message ?? String(err), column };
  }
}
