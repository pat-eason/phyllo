import { describe, expect, it } from "vitest";
import { deriveDrumGrid, drumGridMini, withEuclid, withStep, writeSteps, writeVelocities } from "./drumGrid";
import { parseSourceCall, sourceCall } from "./liveCode";
import { derivePianoRoll, noteToMidi, pianoRollMini, pitchRows } from "./pitchGrid";

function okGrid(pattern: string, gain?: number | string) {
  const grid = deriveDrumGrid(pattern, gain);
  if (!grid.ok) throw new Error(grid.detail);
  return grid;
}

describe("pattern editor model", () => {
  it("should merge per-hit gain tokens into their sound's row", () => {
    // Arrange
    const pattern = "bd*4, [~ hh:0:.45 ~ hh:0:.7]*4";

    // Act
    const grid = okGrid(pattern);

    // Assert
    const hh = grid.rows.find((r) => r.sound === "hh");
    expect(grid.rows.map((r) => r.sound)).toEqual(["bd", "cp", "hh", "oh", "rim"]);
    expect(hh?.velocities?.slice(0, 4)).toEqual([0, 0.45, 0, 0.7]);
    expect(grid.velocityMode).toBe("tokens");
  });

  it("should round-trip a grid with gain tokens to the same text", () => {
    // Arrange
    const pattern = "bd*4, [~ hh:0:.45 ~ hh:0:.7]*4";

    // Act
    const text = drumGridMini(okGrid(pattern).rows);

    // Assert
    expect(text).toBe(pattern);
  });

  it("should refuse two tokens of one sound on the same step", () => {
    // Arrange
    const pattern = "bd, bd:0:.5";

    // Act
    const grid = deriveDrumGrid(pattern, undefined);

    // Assert
    expect(grid).toEqual({ ok: false, reason: "This pattern can't be shown as steps", detail: "plays bd twice on the same step" });
  });

  it("should keep a Euclid row with a gain in its (k,n) form", () => {
    // Arrange
    const pattern = "oh:0:.5(3,8)";

    // Act
    const text = drumGridMini(okGrid(pattern).rows);

    // Assert
    expect(text).toBe("oh:0:.5(3,8)");
  });

  it("should regenerate a patterned track gain when a single row gains a hit", () => {
    // Arrange
    const grid = okGrid("hh*8", "[.4 .7]*4");

    // Act
    const change = writeSteps(withStep(grid.rows, "hh", 1, true), "[.4 .7]*4");

    // Assert
    expect(change).toEqual({ pattern: "hh hh hh ~ hh ~ hh ~ hh ~ hh ~ hh ~ hh ~", gain: ".4 .4 .7 ~ .4 ~ .7 ~ .4 ~ .7 ~ .4 ~ .7 ~" });
  });

  it("should bake a patterned track gain into tokens once a second row sounds", () => {
    // Arrange
    const grid = okGrid("hh*8", "[.4 .7]*4");

    // Act
    const change = writeSteps(withStep(grid.rows, "bd", 0, true), "[.4 .7]*4");

    // Assert
    expect(change).toEqual({ pattern: "bd, [hh:0:.4 hh:0:.7]*4", gain: null });
  });

  it("should bake a static track gain when a multi-row velocity changes", () => {
    // Arrange
    const grid = okGrid("bd*2, cp", 0.5);

    // Act
    const change = writeVelocities(grid, "cp", [1, ...new Array<number>(15).fill(0)], 0.5);

    // Assert
    expect(change).toEqual({ pattern: "bd:0:.5*2, cp:0:1", gain: null });
  });

  it("should write a single-row velocity as the track gain", () => {
    // Arrange
    const grid = okGrid("bd*4");
    const v = [1, 0, 0, 0, 0.5, 0, 0, 0, 1, 0, 0, 0, 0.5, 0, 0, 0];

    // Act
    const change = writeVelocities(grid, "bd", v, undefined);

    // Assert
    expect(change).toEqual({ pattern: "bd*4", gain: "[1 .5]*2" });
  });

  it("should fill a row with a Euclid rhythm over 8 steps", () => {
    // Arrange
    const grid = okGrid("bd*4");

    // Act
    const text = drumGridMini(withEuclid(grid.rows, "oh", 3, 8));

    // Assert
    expect(text).toBe("bd*4, oh(3,8)");
  });

  it("should read notes and refuse chords in the piano roll", () => {
    // Arrange
    const melody = "a2 ~ c3 ~";

    // Act
    const roll = derivePianoRoll(melody);
    const chord = derivePianoRoll("[a2, c3]");

    // Assert
    expect(roll.ok && roll.notes.slice(0, 9)).toEqual([45, null, null, null, null, null, null, null, 48]);
    expect(chord).toEqual({ ok: false, reason: "This pattern can't be shown as steps", detail: "plays chords (two notes on one step)" });
  });

  it("should spell piano roll notes in the project key", () => {
    // Arrange
    const notes = [51, null, null, null, 55, null, null, null, 51, null, null, null, 55, null, null, null];

    // Act
    const text = pianoRollMini(notes, "C minor");

    // Assert
    expect(text).toBe("[eb3 g3]*2");
    expect(noteToMidi("eb3")).toBe(51);
  });

  it("should list two octaves of the key's scale, highest first", () => {
    // Arrange
    const notes = new Array<number | null>(16).fill(null);

    // Act
    const rows = pitchRows(notes, "A minor", true);

    // Assert
    expect(rows.map((r) => r.label)).toEqual(["A5", "G5", "F5", "E5", "D5", "C5", "B4", "A4", "G4", "F4", "E4", "D4", "C4", "B3", "A3"]);
  });

  it("should parse an edited live code call back into pattern and bank", () => {
    // Arrange
    const track = { kind: "drum" as const, pattern: "bd*4", source: { type: "s" as const, sound: null, bank: "RolandTR909" } };

    // Act
    const parsed = parseSourceCall('s("bd*2, hh*8").bank("LinnDrum")', track);

    // Assert
    expect(sourceCall(track)).toBe('s("bd*4").bank("RolandTR909")');
    expect(parsed).toEqual({ ok: true, pattern: "bd*2, hh*8", source: { bank: "LinnDrum" } });
  });

  it("should reject a live code edit that changes the call shape", () => {
    // Arrange
    const track = { kind: "drum" as const, source: { type: "s" as const, sound: null, bank: null } };

    // Act
    const parsed = parseSourceCall('note("c3")', track);

    // Assert
    expect(parsed.ok).toBe(false);
  });

  it("should reject a live code pattern that parses but can't be played", () => {
    // Arrange
    const track = { kind: "drum" as const, source: { type: "s" as const, sound: null, bank: null } };

    // Act
    const parsed = parseSourceCall('s("bd*lm")', track);

    // Assert
    expect(parsed).toEqual({ ok: false, error: "Column 4: `lm` isn't a number — `*` needs a number like `*4`." });
  });
});
