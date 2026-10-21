import { createTrack } from "@phyllo/model";
import { describe, expect, it } from "vitest";
import { nextTakeFileName } from "./recordOutput";
import { effectOptions, formatElapsed, parseInsertValue, soundLine, trackInserts } from "./stripModel";

const synth = (overrides: Parameters<typeof createTrack>[1] = {}) =>
  createTrack("melodic", { id: "lead", name: "Lead", source: { type: "note", sound: "sawtooth", bank: null }, ...overrides });

describe("stripModel", () => {
  it("should list param inserts in code order with compact values and skip the strip's own params", () => {
    // Arrange
    const track = { ...synth(), params: { gain: 0.5, room: 0.3, hpf: 300, lpf: 3000, pan: 0.62 } };

    // Act
    const inserts = trackInserts(track);

    // Assert
    expect(inserts.map((i) => `${i.label} ${i.value}`)).toEqual(["pan .62", "lpf 3k", "hpf 300"]);
  });

  it("should mark params driven by a modifier or a pattern as modulated", () => {
    // Arrange
    const track = {
      ...synth(),
      params: { lpq: "<5 20>" },
      modifiers: [
        { id: "m1", code: ".lpf(sine.range(400, 1400).slow(8))", enabled: true },
        { id: "m2", code: ".crush(6)", enabled: true },
        { id: "m3", code: ".fast(2)", enabled: true },
        { id: "m4", code: ".vowel(\"a\")", enabled: false },
      ],
    };

    // Act
    const inserts = trackInserts(track);

    // Assert
    expect(inserts.map((i) => [i.label, i.value, i.modulated, i.editable])).toEqual([
      ["lpf", "~sine", true, false],
      ["lpq", "~5–20", true, false],
      ["crush", "6", false, false],
    ]);
  });

  it("should describe the sound in code terms", () => {
    // Arrange
    const drums = createTrack("drum", { pattern: "bd*4, ~ cp", source: { type: "s", sound: null, bank: "RolandTR909" } });

    // Assert
    expect(soundLine(drums)).toBe("bd cp · TR909");
    expect(soundLine(synth())).toBe("sawtooth");
  });

  it("should offer only effects the track doesn't use yet", () => {
    // Arrange
    const track = { ...synth(), params: { lpf: 900 }, modifiers: [{ id: "m1", code: ".crush(4)", enabled: true }] };

    // Act
    const codes = effectOptions(track).map((o) => o.code);

    // Assert
    expect(codes).toEqual([".hpf(300)", ".lpq(10)", ".shape(.3)", ".pan(.3)", ".coarse(8)", '.vowel("<a e i o>")', ".distort(1)", ".phaser(2)", ".jux(rev)"]);
  });

  it("should parse typed insert values", () => {
    // Assert
    expect(parseInsertValue("3k")).toBe(3000);
    expect(parseInsertValue(".25")).toBe(0.25);
    expect(parseInsertValue("1200 Hz")).toBe(1200);
    expect(parseInsertValue("")).toBeNull();
    expect(parseInsertValue("loud")).toBeUndefined();
  });

  it("should format elapsed time and number takes per project", () => {
    // Assert
    expect(formatElapsed(7_900)).toBe("0:07");
    expect(formatElapsed(723_000)).toBe("12:03");
    expect(nextTakeFileName("Night/Drive")).toBe("Night Drive take 1.wav");
    expect(nextTakeFileName("Night/Drive")).toBe("Night Drive take 2.wav");
  });
});
