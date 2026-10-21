import { createModifier, createTrack } from "@phyllo/model";
import type { ClipViz } from "@phyllo/ui";
import { describe, expect, it } from "vitest";
import { trackSoundCode, trackViz } from "./trackDisplay";

const asBars = (viz: ClipViz | ClipViz[]) => (Array.isArray(viz) ? viz : [viz]);

describe("trackDisplay", () => {
  it("should scale melodic heights across every bar of the pattern, not per bar", () => {
    // Arrange
    const track = createTrack("melodic", { pattern: "<c2 eb2 g2 bb1>*2", source: { sound: "square" } });

    // Act
    const bars = asBars(trackViz(track, 4));

    // Assert
    const heights = new Set(bars.flatMap((bar) => (bar.kind === "melodic" ? bar.notes.map((n) => n.pitch.toFixed(3)) : [])));
    expect(heights.size).toBe(4);
    expect(bars[0]).toEqual({
      kind: "melodic",
      notes: [
        { t: 0, d: 0.5, pitch: expect.closeTo(2 / 9, 5) },
        { t: 0.5, d: 0.5, pitch: expect.closeTo(5 / 9, 5) },
      ],
    });
  });

  it("should draw different chords at different heights", () => {
    // Arrange
    const track = createTrack("chord", { pattern: "<Cm7 Fm7 Ab^7 G7>", source: { sound: "gm_epiano1" } });

    // Act
    const bars = asBars(trackViz(track, 4));

    // Assert
    const shapes = new Set(bars.map((bar) => (bar.kind === "chord" ? JSON.stringify(bar.chords.map((c) => c.pitches)) : "")));
    expect(bars).toHaveLength(4);
    expect(shapes.size).toBe(4);
  });

  it("should add the first enabled sound modifiers to the sound line, leaving knob modulations to the knobs", () => {
    // Arrange
    const track = createTrack("sample", {
      pattern: "vox",
      source: { sound: "vox" },
      modifiers: [createModifier(".lpf(sine.range(400, 1400))"), createModifier(".chop(8)"), createModifier(".rev()", { enabled: false })],
    });

    // Act
    const line = trackSoundCode(track);

    // Assert
    expect(line).toBe('s("vox").chop(8)');
  });
});
