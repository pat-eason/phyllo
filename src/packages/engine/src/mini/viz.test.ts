import { describe, expect, it } from "vitest";
import type { TrackKind } from "@phyllo/model";
import { chordSymbolPitches, clipViz, previewRows } from "./viz";
import type { VizTrack } from "./viz";

const grid = (s: string) => s.split("").map((c) => c === "x");

function track(kind: TrackKind, pattern: string, sound: string | null = null): VizTrack {
  const type = kind === "drum" || kind === "sample" ? "s" : kind === "chord" ? "chord" : "note";
  return { kind, pattern, source: { type, sound, bank: null } };
}

const close = (actual: readonly number[], expected: readonly number[]) => {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i] ?? NaN, 6));
};

describe("pattern visualisation data", () => {
  it("should give a drum track one punchcard row per sound, first three only", () => {
    // Arrange
    const t = track("drum", "bd*4, [~ cp]*2, hh*8, [~ oh]*4");

    // Act
    const rows = previewRows(t);

    // Assert
    expect(rows).toEqual([grid("x...x...x...x..."), grid("....x.......x..."), grid("x.x.x.x.x.x.x.x.")]);
  });

  it("should honour maxRows", () => {
    // Arrange
    const t = track("drum", "bd*4, [~ cp]*2, hh*8");

    // Act
    const rows = previewRows(t, 1);

    // Assert
    expect(rows).toEqual([grid("x...x...x...x...")]);
  });

  it("should snap off-grid drum hits to the nearest step in previews", () => {
    // Arrange
    const t = track("drum", "[bd bd bd]");

    // Act
    const rows = previewRows(t);

    // Assert
    expect(rows).toEqual([grid("x....x.....x....")]);
  });

  it("should give a melodic track one row of note onsets from cycle 0", () => {
    // Arrange
    const t = track("melodic", "<c2 eb2 g2 bb1>*2", "sawtooth");

    // Act
    const rows = previewRows(t);

    // Assert
    expect(rows).toEqual([grid("x.......x.......")]);
  });

  it("should show a sample track's pattern onsets", () => {
    // Arrange
    const t = track("sample", "vox", "vox");

    // Act
    const rows = previewRows(t);

    // Assert
    expect(rows).toEqual([grid("x...............")]);
  });

  it.each([
    ["a code track", track("code", "")],
    ["a broken pattern", track("drum", "[bd")],
    ["a silent pattern", track("drum", "~")],
  ])("should return no preview rows for %s without throwing", (_label, t) => {
    // Arrange
    const input = t;

    // Act
    const rows = previewRows(input);

    // Assert
    expect(rows).toEqual([]);
  });

  it("should give drum clips one tick per distinct hit time", () => {
    // Arrange
    const t = track("drum", "bd*4, hh*8");

    // Act
    const viz = clipViz(t);

    // Assert
    expect(viz).toEqual({ kind: "drum", ticks: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875] });
  });

  it("should place melodic dashes at their time, length and relative pitch", () => {
    // Arrange
    const t = track("melodic", "c4 [eb4 g4] ~ bb4", "triangle");

    // Act
    const viz = clipViz(t);

    // Assert
    expect(viz.kind).toBe("melodic");
    if (viz.kind !== "melodic") return;
    close(viz.notes.map((n) => n.t), [0, 0.25, 0.375, 0.75]);
    close(viz.notes.map((n) => n.d), [0.25, 0.125, 0.125, 0.25]);
    close(viz.notes.map((n) => n.pitch), [0, 0.3, 0.7, 1]);
  });

  it("should take the requested cycle of an alternating melody", () => {
    // Arrange
    const t = track("melodic", "<c2 eb2 g2 bb1>*2", "sawtooth");

    // Act
    const viz = clipViz(t, 1);

    // Assert
    expect(viz.kind === "melodic" && viz.notes.map((n) => n.pitch)).toEqual([1, 0]);
  });

  it("should centre the pitch of a one-note melody", () => {
    // Arrange
    const t = track("melodic", "c2*4", "sawtooth");

    // Act
    const viz = clipViz(t);

    // Assert
    expect(viz.kind === "melodic" && viz.notes.map((n) => n.pitch)).toEqual([0.5, 0.5, 0.5, 0.5]);
  });

  it("should treat numeric note values as relative pitch", () => {
    // Arrange
    const t = track("melodic", "0 4 2", "sine");

    // Act
    const viz = clipViz(t);

    // Assert
    expect(viz.kind === "melodic" && viz.notes.map((n) => n.pitch)).toEqual([0, 1, 0.5]);
  });

  it("should stack each chord's voiced notes as pitches", () => {
    // Arrange
    const t = track("chord", "<Cm7 Fm7 Ab^7 G7>", "gm_epiano1");

    // Act
    const viz = clipViz(t);

    // Assert
    expect(viz.kind).toBe("chord");
    if (viz.kind !== "chord") return;
    expect(viz.chords).toHaveLength(1);
    const [chord] = viz.chords;
    expect(chord?.t).toBe(0);
    expect(chord?.d).toBe(1);
    // tonal's default voicing of Cm7: Bb3 Eb4 G4 Bb4 C5 (58 63 67 70 72), normalised over 58–72
    close(chord?.pitches ?? [], [0, 5 / 14, 9 / 14, 12 / 14, 1]);
  });

  it("should give two chords per cycle their own time slots", () => {
    // Arrange
    const t = track("chord", "Cm7 Fm7", "gm_epiano1");

    // Act
    const viz = clipViz(t);

    // Assert
    expect(viz.kind === "chord" && viz.chords.map((c) => [c.t, c.d])).toEqual([
      [0, 0.5],
      [0.5, 0.5],
    ]);
  });

  it("should fall back to the chord table for symbols tonal can't voice", () => {
    // Arrange
    const t = track("chord", "Cdim", "gm_epiano1"); // tonal's default dictionary spells it `Co`

    // Act
    const viz = clipViz(t);

    // Assert
    expect(viz).toEqual({ kind: "chord", chords: [{ t: 0, d: 1, pitches: [0, 0.5, 1] }] });
  });

  it.each([
    ["sample", { kind: "sample" }],
    ["code", { kind: "code" }],
  ] as const)("should mark %s clips by kind only", (kind, expected) => {
    // Arrange
    const t = track(kind, kind === "sample" ? "vox" : "");

    // Act
    const viz = clipViz(t);

    // Assert
    expect(viz).toEqual(expected);
  });

  it("should return empty visualisations for broken patterns", () => {
    // Arrange
    const broken = "[c4";

    // Act
    const drum = clipViz(track("drum", broken));
    const melodic = clipViz(track("melodic", broken));
    const chord = clipViz(track("chord", broken));

    // Assert
    expect(drum).toEqual({ kind: "drum", ticks: [] });
    expect(melodic).toEqual({ kind: "melodic", notes: [] });
    expect(chord).toEqual({ kind: "chord", chords: [] });
  });

  it.each([
    ["Cm7", [48, 51, 55, 58]],
    ["Ab^7", [56, 60, 63, 67]],
    ["F#", [54, 58, 61]],
    ["Bbsus4", [58, 63, 65]],
    ["Hm7", null],
    ["Cxyz", null],
  ])("should spell fallback chord %s as %j", (symbol, expected) => {
    // Arrange
    const input = symbol;

    // Act
    const pitches = chordSymbolPitches(input);

    // Assert
    expect(pitches).toEqual(expected);
  });
});
