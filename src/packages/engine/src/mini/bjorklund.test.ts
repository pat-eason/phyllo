import { describe, expect, it } from "vitest";
import { mini } from "@strudel/mini";
import { bjorklund, euclidSteps } from "./bjorklund";

const grid = (s: string) => s.split("").map((c) => c === "x");
const onsets = (steps: readonly boolean[]) => steps.flatMap((on, i) => (on ? [i] : []));

/** Onset indices (0…n-1) Strudel itself plays for `bd(k,n[,r])` in cycle 0. */
function strudelEuclid(k: number, n: number, r: number): number[] {
  const code = r === 0 ? `bd(${k},${n})` : `bd(${k},${n},${r})`;
  return mini(code)
    .queryArc(0, 1)
    .filter((h) => h.hasOnset())
    .map((h) => Math.round((h.whole?.begin.valueOf() ?? 0) * n))
    .sort((a, b) => a - b);
}

const cases: [number, number, number][] = [];
for (let n = 1; n <= 16; n++) {
  for (let k = 1; k <= n; k++) {
    for (const r of new Set([0, 1, 2, 3, n - 1, -1, -2])) cases.push([k, n, r]);
  }
}

describe("bjorklund", () => {
  it.each(cases)("should match Strudel's own euclid for bd(%i,%i,%i)", (k, n, r) => {
    // Arrange
    const expected = strudelEuclid(k, n, r);

    // Act
    const pattern = bjorklund(k, n, r);

    // Assert
    expect(pattern).toHaveLength(n);
    expect(onsets(pattern)).toEqual(expected);
  });

  it.each([
    [3, 8, 0, "x..x..x."],
    [3, 8, 2, "x.x..x.."],
    [5, 8, 0, "x.xx.xx."],
    [2, 8, 0, "x...x..."],
    [4, 16, 0, "x...x...x...x..."],
    [3, 8, -1, "..x..x.x"],
  ])("should spread %i hits over %i steps rotated %i as %s", (k, n, r, expected) => {
    // Arrange
    const want = grid(expected);

    // Act
    const pattern = bjorklund(k, n, r);

    // Assert
    expect(pattern).toEqual(want);
  });

  it("should return no hits for zero hits and every step for too many hits", () => {
    // Arrange
    const steps = 8;

    // Act
    const none = bjorklund(0, steps);
    const all = bjorklund(12, steps);

    // Assert
    expect(none).toEqual(new Array(8).fill(false));
    expect(all).toEqual(new Array(8).fill(true));
  });

  it("should return an empty pattern for fewer than one step", () => {
    // Arrange
    const steps = 0;

    // Act
    const pattern = bjorklund(3, steps);

    // Assert
    expect(pattern).toEqual([]);
  });

  it("should invert the pattern for negative hits like Strudel", () => {
    // Arrange
    const expected = strudelEuclid(-3, 8, 0);

    // Act
    const pattern = bjorklund(-3, 8);

    // Assert
    expect(onsets(pattern)).toEqual(expected);
    expect(pattern).toEqual(grid(".xx.xx.x"));
  });

  it("should stretch an 8-step rhythm so each Euclid step spans two sixteenths", () => {
    // Arrange
    const expected = grid("x.....x.....x...");

    // Act
    const row = euclidSteps(3, 8, 0, 16);

    // Assert
    expect(row).toEqual(expected);
  });

  it("should place a 12-step rhythm on 16ths when every hit lands on a step", () => {
    // Arrange
    const expected = grid("x.......x.......");

    // Act
    const row = euclidSteps(2, 12);

    // Assert
    expect(row).toEqual(expected);
  });

  it("should return null when a Euclid hit falls between grid steps", () => {
    // Arrange
    const [hits, steps] = [3, 5];

    // Act
    const row = euclidSteps(hits, steps);

    // Assert
    expect(row).toBeNull();
  });
});
