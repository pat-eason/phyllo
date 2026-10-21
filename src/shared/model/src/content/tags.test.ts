import { describe, expect, it } from "vitest";
import { TRACK_COLORS } from "../types";
import { STARTERS } from "./starters";
import { DEFAULT_TAGS, TAG_PALETTE, tagColor } from "./tags";

describe("tags", () => {
  it("builds the default palette from the track colors", () => {
    expect(TAG_PALETTE).toEqual([...TRACK_COLORS]);
    for (const tag of DEFAULT_TAGS) expect(TAG_PALETTE).toContain(tag.color);
    expect(new Set(DEFAULT_TAGS.map((t) => t.name)).size).toBe(DEFAULT_TAGS.length);
    expect(new Set(DEFAULT_TAGS.map((t) => t.color)).size).toBe(DEFAULT_TAGS.length);
  });

  it("covers every tag the starters apply", () => {
    const names = DEFAULT_TAGS.map((t) => t.name);
    for (const starter of STARTERS) for (const tag of starter.tags) expect(names).toContain(tag);
  });

  it("keeps default tag colors", () => {
    expect(tagColor("house")).toBe("#7FD98A");
    expect(tagColor("lo-fi")).toBe("#B9A2FF");
  });

  it("ignores case and surrounding spaces", () => {
    expect(tagColor("House")).toBe(tagColor("house"));
    expect(tagColor("  night bus ")).toBe(tagColor("Night Bus"));
  });

  it("returns the same palette color for the same custom name", () => {
    expect(tagColor("night bus")).toBe(tagColor("night bus"));
    expect(TAG_PALETTE).toContain(tagColor("night bus"));
  });

  it("pins hash results so colors never change between releases", () => {
    expect(tagColor("night bus")).toBe("#B9A2FF");
    expect(tagColor("chill")).toBe("#8AB4FF");
    expect(tagColor("demo")).toBe("#5ECFC8");
    expect(tagColor("study")).toBe("#7FD98A");
  });

  it("spreads custom names over the palette", () => {
    const names = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t"];
    const used = new Set(names.map(tagColor));
    expect(used.size).toBeGreaterThanOrEqual(5);
  });
});
