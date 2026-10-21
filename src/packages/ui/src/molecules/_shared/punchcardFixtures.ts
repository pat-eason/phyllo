import type { PunchcardRow } from "./Punchcard";

const TRACK_COLORS = ["var(--ph-track-1)", "var(--ph-track-2)", "var(--ph-track-3)"] as const;

/** Story and test helper: builds rows from 16-char patterns where `x` is an on step. */
export function rowsFromPatterns(patterns: readonly string[], colors: readonly string[] = TRACK_COLORS): PunchcardRow[] {
  return patterns.map((pattern, index) => ({
    color: colors[index] ?? TRACK_COLORS[0],
    steps: Array.from(pattern, (char) => char === "x"),
  }));
}

export const HOUSE_PREVIEW = rowsFromPatterns(["x...x...x...x...", "....x.......x...", "xxxxxxxxxxxxxxxx"]);
export const NIGHT_BUS_PREVIEW = rowsFromPatterns(
  ["x.....x...x.....", "....x.......x...", "x...x...x...x..."],
  ["var(--ph-track-1)", "var(--ph-track-2)", "var(--ph-track-5)"],
);
export const BLANK_PREVIEW = rowsFromPatterns(["................", "................", "................"]);
