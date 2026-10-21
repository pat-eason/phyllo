import { describe, expect, it } from "vitest";
import type { Pattern } from "@strudel/core";
import { mini } from "@strudel/mini";
import { rowToMini } from "./grid";
import { formatGain, gainPatternToVelocities, velocitiesToGainPattern } from "./velocity";

const grid = (s: string) => s.split("").map((c) => c === "x");
const EIGHTHS = grid("x.x.x.x.x.x.x.x.");
const QUARTERS = grid("x...x...x...x...");

/** What Strudel plays for `s("<row>").gain("<gain>")`: gain per onset step. */
function strudelGains(rowMini: string, gain: string): Record<number, number> {
  const sounds = (mini(rowMini) as unknown as { fmap: (f: (v: unknown) => unknown) => Pattern }).fmap((v) => ({ s: v }));
  const withGain = (sounds as unknown as { gain: (p: Pattern) => Pattern }).gain(mini(gain));
  const out: Record<number, number> = {};
  for (const hap of withGain.queryArc(0, 1)) {
    if (!hap.hasOnset()) continue;
    out[Math.round((hap.whole?.begin.valueOf() ?? 0) * 16)] = (hap.value as { gain: number }).gain;
  }
  return out;
}

describe("velocity lane ↔ gain pattern", () => {
  it.each([
    ["alternating hats", [0.45, 0, 0.7, 0, 0.45, 0, 0.7, 0, 0.45, 0, 0.7, 0, 0.45, 0, 0.7, 0], EIGHTHS, "[.45 .7]*4"],
    ["accented quarter notes", [1, 0, 0, 0, 0.5, 0, 0, 0, 0.8, 0, 0, 0, 0.5, 0, 0, 0], QUARTERS, "1 .5 .8 .5"],
    ["a half-bar figure", [0.8, 0, 0, 0, 0.5, 0, 0, 0, 0.8, 0, 0, 0, 0.5, 0, 0, 0], QUARTERS, "[.8 .5]*2"],
    ["one velocity everywhere", new Array(16).fill(0.8), EIGHTHS, ".8"],
    ["off-beat hits", [0, 0, 0.6, 0, 0, 0, 0.3, 0, 0, 0, 0.6, 0, 0, 0, 0.3, 0], grid("..x...x...x...x."), "[~ .6 ~ .3]*2"],
  ])("should write %s compactly", (_label, velocities, steps, expected) => {
    // Arrange
    const input = velocities;

    // Act
    const pattern = velocitiesToGainPattern(input, steps);

    // Assert
    expect(pattern).toBe(expected);
  });

  it("should write nothing for a row without hits", () => {
    // Arrange
    const steps = grid("................");

    // Act
    const pattern = velocitiesToGainPattern(new Array(16).fill(0.5), steps);

    // Assert
    expect(pattern).toBe("");
  });

  it("should give every hit its velocity when Strudel plays the gain pattern", () => {
    // Arrange
    const steps = grid("x.x.x..xx.x.x..x");
    const velocities = steps.map((_, i) => (i % 3 === 0 ? 1 : 0.25 + i / 40));

    // Act
    const pattern = velocitiesToGainPattern(velocities, steps);

    // Assert
    const expected = Object.fromEntries(steps.flatMap((on, i) => (on ? [[i, Number((velocities[i] ?? 0).toFixed(3))]] : [])));
    expect(strudelGains(rowToMini({ sound: "hh", steps }), pattern)).toEqual(expected);
  });

  it.each([
    ["[.45 .7]*4", EIGHTHS, [0.45, 0, 0.7, 0, 0.45, 0, 0.7, 0, 0.45, 0, 0.7, 0, 0.45, 0, 0.7, 0]],
    [".8", QUARTERS, [0.8, 0, 0, 0, 0.8, 0, 0, 0, 0.8, 0, 0, 0, 0.8, 0, 0, 0]],
    ["0.5 1", QUARTERS, [0.5, 0, 0, 0, 0.5, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]],
    ["[.4 .7]*2", EIGHTHS, [0.4, 0, 0.4, 0, 0.7, 0, 0.7, 0, 0.4, 0, 0.4, 0, 0.7, 0, 0.7, 0]],
  ])("should read %s back as per-step velocities", (pattern, steps, expected) => {
    // Arrange
    const input = pattern;

    // Act
    const velocities = gainPatternToVelocities(input, steps);

    // Assert
    expect(velocities).toEqual(expected);
  });

  it.each([
    ["<.5 .8>", "changes per cycle"],
    ["[.5|.8]*4", "random"],
    [".5?", "random"],
    ["~ .5", "leaves a hit without gain"],
    ["a b", "not numeric"],
    ["[.5", "parse error"],
    ["", "empty"],
  ])("should return null for %s (%s)", (pattern) => {
    // Arrange
    const steps = QUARTERS;

    // Act
    const velocities = gainPatternToVelocities(pattern, steps);

    // Assert
    expect(velocities).toBeNull();
  });

  it("should round-trip velocities on the active steps", () => {
    // Arrange
    const steps = grid("x..xx.x.x.xx..x.");
    const velocities = steps.map((on, i) => (on ? Number(((i * 37) % 100 / 100).toFixed(2)) : 0));

    // Act
    const back = gainPatternToVelocities(velocitiesToGainPattern(velocities, steps), steps);

    // Assert
    expect(back).toEqual(velocities);
  });

  it.each([
    [0.8, ".8"],
    [1, "1"],
    [0, "0"],
    [0.125, ".125"],
    [0.33333, ".333"],
    [1.4, "1"],
    [-0.2, "0"],
  ])("should format gain %f as %s", (value, expected) => {
    // Arrange
    const v = value;

    // Act
    const text = formatGain(v);

    // Assert
    expect(text).toBe(expected);
  });
});
