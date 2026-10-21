import type { GrooveSummary } from "@phyllo/model";
import { describe, expect, it } from "vitest";
import { matchesText } from "./libraryQuery";
import type { SearchableGroove } from "./libraryQuery";

function item(overrides: Partial<GrooveSummary>, sounds: string[] = []): SearchableGroove {
  const groove: GrooveSummary = {
    id: "g",
    path: "/g.phyllo",
    name: "Groove",
    tags: [],
    favorite: false,
    bpm: 120,
    key: "C minor",
    lengthBars: 8,
    trackCount: 2,
    created: "2026-10-01T00:00:00.000Z",
    modified: "2026-10-01T00:00:00.000Z",
    opened: null,
    preview: [],
    ...overrides,
  };
  return { groove, sounds };
}

describe("matchesText", () => {
  it("should match everything for an empty or blank query", () => {
    expect(matchesText(item({}), "   ")).toBe(true);
  });

  it("should match the whole query as a substring of the key", () => {
    expect(matchesText(item({ name: "Night drive", key: "C minor" }), "c minor")).toBe(true);
  });

  it("should not match 'c minor' against A or E minor grooves whose words merely contain a c", () => {
    const aMinor = item({ name: "Sketch book", tags: ["sketch"], key: "A minor" }, ["bd", "cp", "hh"]);
    const eMinor = item({ name: "Warehouse 4am", tags: ["techno"], key: "E minor" }, ["c2"]);

    expect(matchesText(aMinor, "c minor")).toBe(false);
    expect(matchesText(eMinor, "c minor")).toBe(false);
  });

  it("should match a hyphenated tag as a whole", () => {
    expect(matchesText(item({ tags: ["lo-fi", "chill"] }), "lo-fi")).toBe(true);
    expect(matchesText(item({ tags: ["chill"] }), "lo-fi")).toBe(false);
  });

  it("should match BPM numbers as substrings", () => {
    expect(matchesText(item({ bpm: 124 }), "124")).toBe(true);
    expect(matchesText(item({ bpm: 90 }), "124")).toBe(false);
  });

  it("should match sound names, including a word start", () => {
    expect(matchesText(item({}, ["bass", "hh"]), "bass")).toBe(true);
    expect(matchesText(item({}, ["bass"]), "ba")).toBe(true);
    expect(matchesText(item({}, ["hh"]), "bass")).toBe(false);
  });

  it("should require every word to start a word when the whole query is not a substring", () => {
    const g = item({ name: "Night drive", tags: ["house"], key: "C minor" });

    expect(matchesText(g, "drive night")).toBe(true);
    expect(matchesText(g, "dri hou")).toBe(true);
    expect(matchesText(g, "rive hou")).toBe(false);
  });

  it("should be case-insensitive", () => {
    expect(matchesText(item({ name: "Night drive" }), "NIGHT")).toBe(true);
  });
});
