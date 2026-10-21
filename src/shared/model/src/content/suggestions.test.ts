import { describe, expect, it } from "vitest";
import type { TrackKind } from "../types";
import { CORE_SUGGESTIONS, SUGGESTIONS, findSuggestionByCode, suggestionsFor } from "./suggestions";

function balanced(code: string): boolean {
  let depth = 0;
  for (const ch of code) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

describe("suggestions", () => {
  it("offers the four mockup suggestions with their exact code", () => {
    expect(CORE_SUGGESTIONS.map((s) => [s.label, s.code])).toEqual([
      ["Slow filter sweep", ".lpf(sine.range(400,1400).slow(8))"],
      ["Bouncier", ".swingBy(1/6, 4)"],
      ["Busier now and then", ".sometimes(x => x.ply(2))"],
      ["Flip every 4th bar", ".lastOf(4, rev)"],
    ]);
  });

  it("has unique ids and chained-call code", () => {
    expect(new Set(SUGGESTIONS.map((s) => s.id)).size).toBe(SUGGESTIONS.length);
    for (const s of SUGGESTIONS) {
      expect(s.code.startsWith(".")).toBe(true);
      expect(balanced(s.code)).toBe(true);
      expect(s.label.length).toBeGreaterThan(3);
      expect(s.kinds.length).toBeGreaterThan(0);
    }
  });

  it.each<[TrackKind, string[]]>([
    ["drum", ["slow-filter-sweep", "bouncier", "busier-now-and-then", "flip-every-4th-bar", "drop-some-hits", "fill-every-4th-bar", "crunch"]],
    ["melodic", ["slow-filter-sweep", "bouncier", "busier-now-and-then", "flip-every-4th-bar", "echoey", "fifth-above", "octave-pops", "stereo-twist", "chord-up-octave"]],
    ["chord", ["slow-filter-sweep", "bouncier", "busier-now-and-then", "flip-every-4th-bar", "stereo-twist", "broken-chord", "pulse-chord", "chord-up-octave"]],
    ["sample", ["slow-filter-sweep", "bouncier", "busier-now-and-then", "flip-every-4th-bar", "crunch", "half-speed", "chop-it-up"]],
    ["code", []],
  ])("lists the right suggestions for %s tracks, core ones first", (kind, ids) => {
    expect(suggestionsFor(kind).map((s) => s.id)).toEqual(ids);
  });

  it("finds a suggestion from a modifier's code regardless of spaces", () => {
    expect(findSuggestionByCode(".swingBy(1/6,4)")?.id).toBe("bouncier");
    expect(findSuggestionByCode(".lpf(sine.range(400, 1400).slow(8))")?.id).toBe("slow-filter-sweep");
    expect(findSuggestionByCode(".fast(2)")).toBeUndefined();
  });
});
