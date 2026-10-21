/**
 * "Feel" sliders in the Pattern editor tools panel (SPEC §6.3). Each slider writes one chained call into the
 * track's modifiers; a slider at its "off" value writes nothing.
 */

export type FeelId = "swing" | "skip" | "fill";

export interface FeelTool {
  id: FeelId;
  /** Slider label */
  label: string;
  /** Strudel function the slider writes, for the code hint under the label */
  fn: string;
  min: number;
  max: number;
  step: number;
  /** Value used the first time the slider is switched on (mockup defaults) */
  default: number;
  /** Slider position that means "off" (writes no code) */
  off: number;
  /** Chained call for a slider value, with the leading dot. Empty string when the value is "off". */
  codeFor(value: number): string;
  /** Plain-language sentence describing what the value does */
  describe(value: number): string;
  /** Recognise this tool's code and return its slider value, or null when the code is not this tool's output */
  parse(code: string): number | null;
}

/** Format a number the way the mockups write it: `.1`, `0`, `1.5`. */
export function formatNumber(value: number, digits = 3): string {
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return "0";
  const text = String(rounded);
  return Math.abs(rounded) < 1 ? text.replace(/^(-?)0\./, "$1.") : text;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Write a swing amount as a tidy fraction when it is one (`1/6`), otherwise as a decimal. */
export function formatFraction(value: number): string {
  for (const denominator of [2, 3, 4, 6, 8, 12, 16, 24]) {
    const numerator = Math.round(value * denominator);
    if (numerator > 0 && Math.abs(numerator / denominator - value) < 1e-4) {
      const d = gcd(numerator, denominator);
      const n = numerator / d;
      const den = denominator / d;
      return den === 1 ? String(n) : `${n}/${den}`;
    }
  }
  return formatNumber(value);
}

/** Evaluate `1/6`, `.1`, `0.25`, `3`. Returns null for anything else. */
function parseNumberOrFraction(text: string): number | null {
  const trimmed = text.trim();
  const fraction = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(trimmed);
  if (fraction) {
    const d = Number(fraction[2]);
    return d === 0 ? null : Number(fraction[1]) / d;
  }
  if (/^-?(\d+\.?\d*|\.\d+)$/.test(trimmed)) return Number(trimmed);
  return null;
}

const FILL_SPEEDS = [0, 2, 4] as const;

export const SWING: FeelTool = {
  id: "swing",
  label: "Swing",
  fn: "swingBy",
  min: 0,
  max: 1 / 3,
  step: 1 / 60,
  default: 1 / 6,
  off: 0,
  codeFor(value) {
    return value <= 0.0005 ? "" : `.swingBy(${formatFraction(value)}, 4)`;
  },
  describe(value) {
    if (value <= 0.0005) return "No swing: every step is evenly spaced.";
    const percent = Math.round((value / (1 / 3)) * 100);
    return `Swing ${percent}%: every other step lands a little late.`;
  },
  parse(code) {
    const m = /^\.swingBy\(\s*([^,]+?)\s*,\s*4\s*\)$/.exec(code.trim());
    return m ? parseNumberOrFraction(m[1] ?? "") : null;
  },
};

export const SKIP: FeelTool = {
  id: "skip",
  label: "Chance to skip",
  fn: "degradeBy",
  min: 0,
  max: 1,
  step: 0.05,
  default: 0.1,
  off: 0,
  codeFor(value) {
    return value <= 0.0005 ? "" : `.degradeBy(${formatNumber(value, 2)})`;
  },
  describe(value) {
    if (value <= 0.0005) return "Every hit plays.";
    return `Leaves out about ${Math.round(value * 100)}% of the hits.`;
  },
  parse(code) {
    const m = /^\.degradeBy\(\s*([^)]+?)\s*\)$/.exec(code.trim());
    return m ? parseNumberOrFraction(m[1] ?? "") : null;
  },
};

/** Fill strength 0 = off, 1 = double speed, 2 = four times speed, on the last cycle of every four. */
export const FILL: FeelTool = {
  id: "fill",
  label: "Fill every 4th cycle",
  fn: "lastOf",
  min: 0,
  max: 2,
  step: 1,
  default: 1,
  off: 0,
  codeFor(value) {
    const speed = FILL_SPEEDS[Math.min(2, Math.max(0, Math.round(value)))] ?? 0;
    return speed === 0 ? "" : `.lastOf(4, x => x.fast(${speed}))`;
  },
  describe(value) {
    const speed = FILL_SPEEDS[Math.min(2, Math.max(0, Math.round(value)))] ?? 0;
    if (speed === 0) return "No fill: every cycle sounds the same.";
    return speed === 2
      ? "Every 4th cycle plays twice as fast, like a drum fill."
      : "Every 4th cycle plays four times as fast, like a big drum fill.";
  },
  parse(code) {
    const m = /^\.lastOf\(\s*4\s*,\s*x\s*=>\s*x\.fast\(\s*(\d+)\s*\)\s*\)$/.exec(code.trim());
    if (!m) return null;
    const index = FILL_SPEEDS.indexOf(Number(m[1]) as (typeof FILL_SPEEDS)[number]);
    return index > 0 ? index : null;
  },
};

export const FEEL_TOOLS: readonly FeelTool[] = [SWING, SKIP, FILL];

export function getFeelTool(id: FeelId): FeelTool {
  const tool = FEEL_TOOLS.find((t) => t.id === id);
  if (!tool) throw new Error(`Unknown feel tool "${id}"`);
  return tool;
}

/** Match a modifier's code against the Feel tools, returning which slider it belongs to and its value. */
export function matchFeel(code: string): { id: FeelId; value: number } | null {
  for (const tool of FEEL_TOOLS) {
    const value = tool.parse(code);
    if (value !== null) return { id: tool.id, value };
  }
  return null;
}

/** Slider position 0–1 for drawing the slider fill. */
export function feelPosition(tool: FeelTool, value: number): number {
  return Math.min(1, Math.max(0, (value - tool.min) / (tool.max - tool.min)));
}
