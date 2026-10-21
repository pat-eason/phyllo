import { describe, expect, it } from "vitest";
import type { StepRowModel } from "@phyllo/model";
import { compressTokens, rowToMini, rowsToMini } from "./grid";

const grid = (s: string) => s.split("").map((c) => c === "x");
const row = (sound: string, steps: string, extra: Partial<StepRowModel> = {}): StepRowModel => ({ sound, steps: grid(steps), ...extra });

describe("rowToMini / rowsToMini", () => {
  it.each([
    ["kick every beat", row("bd", "x...x...x...x..."), "bd*4"],
    ["clap on beats 2 and 4", row("cp", "....x.......x..."), "[~ cp]*2"],
    ["eighth-note hats", row("hh", "x.x.x.x.x.x.x.x."), "hh*8"],
    ["off-beat open hat", row("oh", "..x...x...x...x."), "[~ oh]*4"],
    ["sixteenth hats", row("hh", "xxxxxxxxxxxxxxxx"), "hh*16"],
    ["one hit on the downbeat", row("bd", "x..............."), "bd"],
    ["one hit on beat 3", row("bd", "........x......."), "~ bd"],
    ["a non-repeating quarter-note group", row("bd", "x.......x...x..."), "bd ~ bd bd"],
    ["a repeated half-bar group", row("bd", "x..x..x.x..x..x."), "[bd ~ ~ bd ~ ~ bd ~]*2"],
    ["an irregular sixteenth row", row("rim", "x..x.....x....x."), "rim ~ ~ rim ~ ~ ~ ~ ~ rim ~ ~ ~ ~ rim ~"],
    ["a numbered sample", row("bd:3", "x...x...x...x..."), "bd:3*4"],
  ])("should write %s as %s", (_label, input, expected) => {
    // Arrange
    const r = input;

    // Act
    const mini = rowToMini(r);

    // Assert
    expect(mini).toBe(expected);
  });

  it("should write an empty row as an empty string", () => {
    // Arrange
    const r = row("rim", "................");

    // Act
    const mini = rowToMini(r);

    // Assert
    expect(mini).toBe("");
  });

  it("should write a Euclid row in (k,n) form", () => {
    // Arrange
    const r = row("bd", "x.....x.....x...", { euclid: { hits: 3, steps: 8 } });

    // Act
    const mini = rowToMini(r);

    // Assert
    expect(mini).toBe("bd(3,8)");
  });

  it("should write a rotated Euclid row in (k,n,r) form", () => {
    // Arrange
    const r = row("cp", "....x.......x...", { euclid: { hits: 2, steps: 8, rotation: 2 } });

    // Act
    const mini = rowToMini(r);

    // Assert
    expect(mini).toBe("cp(2,8,2)");
  });

  it("should fall back to the step form when a Euclid row's steps no longer match", () => {
    // Arrange
    const r = row("bd", "x...x.......x...", { euclid: { hits: 3, steps: 8 } });

    // Act
    const mini = rowToMini(r);

    // Assert
    expect(mini).toBe("bd bd ~ bd");
  });

  it("should join non-empty rows with commas (SPEC §4.3 example)", () => {
    // Arrange
    const rows = [
      row("bd", "x...x...x...x..."),
      row("cp", "....x.......x..."),
      row("hh", "x.x.x.x.x.x.x.x."),
      row("oh", "..x...x...x...x."),
      row("rim", "................"),
    ];

    // Act
    const mini = rowsToMini(rows);

    // Assert
    expect(mini).toBe("bd*4, [~ cp]*2, hh*8, [~ oh]*4");
  });

  it("should return an empty string when every row is empty", () => {
    // Arrange
    const rows = [row("bd", "................")];

    // Act
    const mini = rowsToMini(rows);

    // Assert
    expect(mini).toBe("");
  });

  it("should compress tokens on any grid length by its divisors", () => {
    // Arrange
    const tokens = [".5", null, ".8", null, ".5", null, ".8", null];

    // Act
    const mini = compressTokens(tokens);

    // Assert
    expect(mini).toBe("[.5 .8]*2");
  });
});
