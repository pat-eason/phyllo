import { describe, expect, it } from "vitest";
import { clickPattern } from "./metronome";

const clicks = (beatsPerBar: number, cycle = 0) =>
  clickPattern(beatsPerBar)
    .queryArc(cycle, cycle + 1)
    .map((hap) => ({ at: hap.whole?.begin.valueOf(), ...(hap.value as { note: number; orbit: number }) }));

describe("clickPattern", () => {
  it("should click once per beat with a higher downbeat", () => {
    // Arrange
    const beatsPerBar = 4;

    // Act
    const bar = clicks(beatsPerBar);

    // Assert
    expect(bar.map((c) => [c.at, c.note])).toEqual([
      [0, 96],
      [0.25, 84],
      [0.5, 84],
      [0.75, 84],
    ]);
  });

  it("should follow the time signature", () => {
    // Arrange
    const beatsPerBar = 3;

    // Act
    const bar = clicks(beatsPerBar, 5);

    // Assert
    expect(bar.map((c) => c.note)).toEqual([96, 84, 84]);
  });

  it("should play on its own orbit, away from the song's buses", () => {
    // Arrange
    const beatsPerBar = 4;

    // Act
    const orbits = new Set(clicks(beatsPerBar).map((c) => c.orbit));

    // Assert
    expect([...orbits]).toEqual([-2]);
  });

  it("should fall back to four beats for a nonsense time signature", () => {
    // Arrange
    const beatsPerBar = Number.NaN;

    // Act
    const bar = clicks(beatsPerBar);

    // Assert
    expect(bar).toHaveLength(4);
  });
});
