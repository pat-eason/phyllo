import { describe, expect, it } from "vitest";
import { registerTap } from "./tapTempo";

describe("registerTap", () => {
  it("should wait for a second tap before reporting a tempo", () => {
    // Arrange / Act
    const result = registerTap([], 1000);

    // Assert
    expect(result).toEqual({ taps: [1000], bpm: null });
  });

  it("should report 120 BPM for taps 500 ms apart", () => {
    // Arrange
    const first = registerTap([], 0);

    // Act
    const second = registerTap(first.taps, 500);

    // Assert
    expect(second.bpm).toBe(120);
  });

  it("should average only the last four taps", () => {
    // Arrange: one slow gap followed by three 500 ms gaps
    let state = registerTap([], 0);
    for (const at of [1500, 2000, 2500, 3000]) state = registerTap(state.taps, at);

    // Act / Assert
    expect(state.bpm).toBe(120);
  });

  it("should start over after a pause longer than two seconds", () => {
    // Arrange
    const before = registerTap(registerTap([], 0).taps, 500);

    // Act
    const after = registerTap(before.taps, 5000);

    // Assert
    expect(after).toEqual({ taps: [5000], bpm: null });
  });

  it("should clamp very fast taps to 240 BPM", () => {
    // Arrange
    const first = registerTap([], 0);

    // Act
    const second = registerTap(first.taps, 100);

    // Assert
    expect(second.bpm).toBe(240);
  });
});
