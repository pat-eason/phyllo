import { describe, expect, it } from "vitest";
import { mini } from "@strudel/mini";
import type { StepRowModel } from "@phyllo/model";
import { euclidSteps } from "./bjorklund";
import { rowsToMini } from "./grid";
import { miniToRows } from "./parse";

/** Deterministic PRNG (mulberry32) so the property cases are reproducible. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SOUNDS = ["bd", "cp", "hh", "oh", "rim", "bd:3"];

function randomRows(rand: () => number): StepRowModel[] {
  const count = 1 + Math.floor(rand() * SOUNDS.length);
  return SOUNDS.slice(0, count).map((sound) => {
    const style = rand();
    if (style < 0.25) {
      // a repeating figure on a coarse grid
      const every = [1, 2, 4, 8][Math.floor(rand() * 4)] ?? 4;
      const offset = Math.floor(rand() * every);
      return { sound, steps: Array.from({ length: 16 }, (_, i) => i % every === offset) };
    }
    if (style < 0.4) {
      const n = [4, 8, 16][Math.floor(rand() * 3)] ?? 8;
      const hits = 1 + Math.floor(rand() * n);
      const rotation = Math.floor(rand() * n);
      const steps = euclidSteps(hits, n, rotation) ?? new Array<boolean>(16).fill(false);
      return { sound, steps, euclid: rotation ? { hits, steps: n, rotation } : { hits, steps: n } };
    }
    const density = rand();
    return { sound, steps: Array.from({ length: 16 }, () => rand() < density * 0.6) };
  });
}

/** Strudel's own onsets for a mini string, as `sound → sorted step indices`. */
function strudelOnsets(pattern: string): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  if (pattern === "") return out;
  for (const hap of mini(pattern).queryArc(0, 1)) {
    if (!hap.hasOnset()) continue;
    const name = Array.isArray(hap.value) ? hap.value.join(":") : String(hap.value);
    (out[name] ??= []).push((hap.whole?.begin.valueOf() ?? 0) * 16);
  }
  for (const k of Object.keys(out)) out[k]?.sort((a, b) => a - b);
  return out;
}

function rowOnsets(rows: readonly StepRowModel[]): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const r of rows) {
    const on = r.steps.flatMap((x, i) => (x ? [i] : []));
    if (on.length) out[r.sound] = on;
  }
  return out;
}

const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

describe("step grid round trip", () => {
  it.each(SEEDS)("should reproduce random rows exactly through mini-notation (seed %i)", (seed) => {
    // Arrange
    const rows = randomRows(prng(seed));

    // Act
    const text = rowsToMini(rows);
    const back = miniToRows(text, { sounds: rows.map((r) => r.sound) });

    // Assert
    const expected = rows.map((r) => (r.euclid && r.steps.some(Boolean) ? r : { sound: r.sound, steps: r.steps }));
    expect(back).toEqual({ ok: true, rows: expected });
  });

  it.each(SEEDS)("should emit mini-notation Strudel plays with the rows' onsets (seed %i)", (seed) => {
    // Arrange
    const rows = randomRows(prng(seed));

    // Act
    const text = rowsToMini(rows);

    // Assert
    expect(strudelOnsets(text)).toEqual(rowOnsets(rows));
  });
});
