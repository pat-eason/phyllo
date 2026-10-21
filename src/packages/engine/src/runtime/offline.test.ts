import { describe, expect, it } from "vitest";
import type { Pattern } from "@strudel/core";
import { mini } from "@strudel/mini";
import { peakOf } from "./master";
import { onsetsInRange, renderDurationSec } from "./offline";

describe("renderDurationSec", () => {
  it.each([
    [0, 2, 0.5, 0, 4],
    [0, 2, 0.5, 2, 6],
    [8, 16, 0.5, 1, 17],
    [4, 2, 0.5, 1, 1], // empty range: tail only
  ])("cycles %d–%d at %d cps + %ds tail = %ds", (from, to, cps, tail, seconds) => {
    expect(renderDurationSec(from, to, cps, tail)).toBe(seconds);
  });
});

describe("onsetsInRange", () => {
  it("returns onsets inside the range in time order", () => {
    const pat = mini("[a b, c]") as Pattern;
    const haps = onsetsInRange(pat, 0, 2, 0.5);
    expect(haps.map((h) => [h.whole?.begin.valueOf(), h.value])).toEqual([
      [0, "a"],
      [0, "c"],
      [0.5, "b"],
      [1, "a"],
      [1, "c"],
      [1.5, "b"],
    ]);
  });

  it("drops notes that started before the range", () => {
    const pat = mini("a@3 b") as Pattern; // a: 0–.75
    expect(onsetsInRange(pat, 0.5, 1, 0.5).map((h) => h.value)).toEqual(["b"]);
  });

  it("throws on query errors instead of rendering silence", () => {
    const pat = mini("a") as Pattern & { fmap(f: (v: unknown) => unknown): Pattern };
    const bad = pat.fmap(() => {
      throw new Error("boom");
    });
    expect(() => onsetsInRange(bad, 0, 1, 0.5)).toThrow("boom");
  });
});

describe("peakOf", () => {
  it("is the largest absolute sample", () => {
    expect(peakOf(new Float32Array([0, -0.75, 0.5]))).toBe(0.75);
    expect(peakOf(new Float32Array(0))).toBe(0);
  });
});
