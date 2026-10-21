// @vitest-environment jsdom
// Strudel's repl() builds a kabelsalat instance that needs `window`, so this file runs under jsdom.
import { describe, expect, it } from "vitest";
import type { GeneratedProgram } from "@phyllo/model";
import { midiNoteOf, midiVelocityOf, queryNoteEvents } from "./notes";

function program(code: string, lines: GeneratedProgram["lines"]): GeneratedProgram {
  return { code, lines, scope: "song" };
}

describe("queryNoteEvents", () => {
  it("should map drum sounds to the GM drum map with times relative to fromCycle", async () => {
    // Arrange
    const prog = program(`setcpm(120/4)\n$: s("bd sd").bank("RolandTR909")`, { drums: { start: 2, end: 2 } });

    // Act
    const events = await queryNoteEvents(prog, { fromCycle: 1, toCycle: 2, cps: 0.5 });

    // Assert
    expect(events).toEqual([
      { trackId: "drums", note: 36, velocity: 100, startSec: 0, durationSec: 1 },
      { trackId: "drums", note: 38, velocity: 100, startSec: 1, durationSec: 1 },
    ]);
  });

  it("should convert note names, numbers and n with a scale to MIDI numbers", async () => {
    // Arrange
    const prog = program(`setcpm(120/4)\n$: note("eb2 60").s("sawtooth")\n$: n("0 2").scale("C:minor").s("piano")`, {
      bass: { start: 2, end: 2 },
      keys: { start: 3, end: 3 },
    });

    // Act
    const events = await queryNoteEvents(prog, { fromCycle: 0, toCycle: 1, cps: 0.5 });

    // Assert
    expect(events.map((e) => [e.trackId, e.note, e.startSec])).toEqual([
      ["bass", 39, 0],
      ["keys", 48, 0],
      ["bass", 60, 1],
      ["keys", 51, 1],
    ]);
  });

  it("should take velocity from gain and velocity", async () => {
    // Arrange
    const prog = program(`$: note("c3 c3").gain("[.4 .8]")\n$: note("e3").velocity(.5)`, {
      a: { start: 1, end: 1 },
      b: { start: 2, end: 2 },
    });

    // Act
    const events = await queryNoteEvents(prog, { fromCycle: 0, toCycle: 1, cps: 1 });

    // Assert
    expect(events.map((e) => [e.trackId, e.velocity])).toEqual([
      ["a", 50],
      ["b", 50],
      ["a", 100],
    ]);
  });

  it("should skip muted blocks and keep chord voicings as separate notes", async () => {
    // Arrange
    const prog = program(`setcpm(120/4)\n_$: s("bd*4")\n$: chord("<Cm7>").voicing().s("gm_epiano1")`, {
      kick: { start: 2, end: 2 },
      chords: { start: 3, end: 3 },
    });

    // Act
    const events = await queryNoteEvents(prog, { fromCycle: 0, toCycle: 1, cps: 0.5 });

    // Assert
    expect(events.every((e) => e.trackId === "chords")).toBe(true);
    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(events.every((e) => e.startSec === 0 && e.durationSec === 2)).toBe(true);
  });

  it("should honour arrange() so notes only appear inside clips", async () => {
    // Arrange
    const code = `setcpm(120/4)\n$: arrange(\n     [2, silence],\n     [2, s("bd")])`;
    const prog = program(code, { kick: { start: 2, end: 4 } });

    // Act
    const events = await queryNoteEvents(prog, { fromCycle: 0, toCycle: 4, cps: 0.5 });

    // Assert
    expect(events.map((e) => e.startSec)).toEqual([4, 6]);
  });

  it("should cut notes that run past toCycle", async () => {
    // Arrange
    const prog = program(`$: note("c3").slow(4)`, { pad: { start: 1, end: 1 } });

    // Act
    const events = await queryNoteEvents(prog, { fromCycle: 0, toCycle: 2, cps: 1 });

    // Assert
    expect(events).toEqual([{ trackId: "pad", note: 48, velocity: 100, startSec: 0, durationSec: 2 }]);
  });

  it("should reject code that does not evaluate", async () => {
    // Arrange
    const prog = program(`$: s("bd"`, { kick: { start: 1, end: 1 } });

    // Act
    const result = queryNoteEvents(prog, { fromCycle: 0, toCycle: 1, cps: 1 });

    // Assert
    await expect(result).rejects.toThrow();
  });

  it("should read pitch from note, freq or a drum name and velocity from gain", () => {
    // Arrange
    const values = [{ note: "a4" }, { freq: 440 }, { s: "RolandTR909_hh" }, { s: "oh", n: 2 }, { s: "sawtooth" }, 61.6];

    // Act
    const notes = values.map((v) => midiNoteOf(v));
    const velocities = [{}, { gain: 0 }, { gain: 2 }, { gain: 0.4, velocity: 0.5 }].map((v) => midiVelocityOf(v));

    // Assert
    expect(notes).toEqual([69, 69, 42, 46, undefined, 62]);
    expect(velocities).toEqual([100, 0, 127, 25]);
  });
});
