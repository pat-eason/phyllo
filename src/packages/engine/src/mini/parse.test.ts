import { describe, expect, it } from "vitest";
import { miniToRows, UNFIT_REASON } from "./parse";

const grid = (s: string) => s.split("").map((c) => c === "x");

/** Rows as `{ sound: "x...x..." }` for compact assertions. */
function asStrings(pattern: string, sounds?: string[]): Record<string, string> | string {
  const result = miniToRows(pattern, sounds ? { sounds } : {});
  if (!result.ok) return `unfit: ${result.detail}`;
  return Object.fromEntries(result.rows.map((r) => [r.sound, r.steps.map((on) => (on ? "x" : ".")).join("")]));
}

describe("miniToRows", () => {
  it("should read the SPEC §4.3 example back into four rows", () => {
    // Arrange
    const pattern = "bd*4, [~ cp]*2, hh*8, [~ oh]*4";

    // Act
    const result = miniToRows(pattern);

    // Assert
    expect(result).toEqual({
      ok: true,
      rows: [
        { sound: "bd", steps: grid("x...x...x...x...") },
        { sound: "cp", steps: grid("....x.......x...") },
        { sound: "hh", steps: grid("x.x.x.x.x.x.x.x.") },
        { sound: "oh", steps: grid("..x...x...x...x.") },
      ],
    });
  });

  it.each([
    ["bd*16", { bd: "xxxxxxxxxxxxxxxx" }],
    ["bd ~ ~ bd, ~ sd", { bd: "x...........x...", sd: "........x......." }],
    ["bd ~ ~ bd ~ ~ bd ~, ~ sd ~ [~ sd]", { bd: "x.....x.....x...", sd: "....x.........x." }],
    ["bd@3 sd", { bd: "x...............", sd: "............x..." }],
    ["bd!4", { bd: "x...x...x...x..." }],
    ["bd sd . hh hh hh hh", { bd: "x.......", sd: "....x...", hh: "........x.x.x.x." }],
    ["bd:3*2 bd", { "bd:3": "x...x...", bd: "........x" }],
    ["{bd sd, hh hh hh hh}", { bd: "x", sd: "........x", hh: "x.......x" }],
    ["<bd bd>*4", { bd: "x...x...x...x..." }],
  ])("should fit %s", (pattern, expected) => {
    // Arrange
    const steps16 = Object.fromEntries(Object.entries(expected).map(([k, v]) => [k, v.padEnd(16, ".")]));

    // Act
    const rows = asStrings(pattern);

    // Assert
    expect(rows).toEqual(steps16);
  });

  it.each([
    ["[bd bd bd]", "between steps"],
    ["bd*3", "between steps"],
    ["<bd sd>", "cycle to cycle"],
    ["bd/2", "cycle to cycle"],
    ["{bd sd hh}%4", "cycle to cycle"],
    ["bd?", "random"],
    ["bd*8?", "random"],
    ["[bd|sd]*4", "random"],
    ["bd(3,5)", "between steps"],
    ["bd*4, bd*2", "twice on the same step"],
    ["[bd", "parse error"],
  ])("should refuse %s instead of showing a lossy grid", (pattern, why) => {
    // Arrange
    const input = pattern;

    // Act
    const result = miniToRows(input);

    // Assert
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(UNFIT_REASON);
    expect(result.reason).toBe("This pattern can't be shown as steps");
    expect(result.detail).toContain(why);
  });

  it("should recognize a Euclid layer and keep its (k,n) form", () => {
    // Arrange
    const pattern = "bd(3,8), hh*8";

    // Act
    const result = miniToRows(pattern);

    // Assert
    expect(result).toEqual({
      ok: true,
      rows: [
        { sound: "bd", steps: grid("x.....x.....x..."), euclid: { hits: 3, steps: 8 } },
        { sound: "hh", steps: grid("x.x.x.x.x.x.x.x.") },
      ],
    });
  });

  it("should fit bd(3,8,2) and record its rotation", () => {
    // Arrange
    const pattern = "bd(3,8,2)";

    // Act
    const result = miniToRows(pattern);

    // Assert
    expect(result).toEqual({
      ok: true,
      rows: [{ sound: "bd", steps: grid("x...x.....x....."), euclid: { hits: 3, steps: 8, rotation: 2 } }],
    });
  });

  it("should recognize a numbered sample's Euclid layer", () => {
    // Arrange
    const pattern = "cp:2(2,8,2)";

    // Act
    const result = miniToRows(pattern);

    // Assert
    expect(result.ok && result.rows[0]).toEqual({ sound: "cp:2", steps: grid("....x.......x..."), euclid: { hits: 2, steps: 8, rotation: 2 } });
  });

  it("should not mark a row as Euclid when other layers add hits for the same sound", () => {
    // Arrange
    const pattern = "bd(3,8), ~ bd";

    // Act
    const result = miniToRows(pattern);

    // Assert
    expect(result).toEqual({ ok: true, rows: [{ sound: "bd", steps: grid("x.....x.x...x...") }] });
  });

  it("should keep the given sound order, include empty rows and append other sounds", () => {
    // Arrange
    const sounds = ["bd", "cp", "hh", "oh", "rim"];

    // Act
    const rows = asStrings("hh*8, sd(2,8), bd*4", sounds);

    // Assert
    expect(rows).toEqual({
      bd: "x...x...x...x...",
      cp: "................",
      hh: "x.x.x.x.x.x.x.x.",
      oh: "................",
      rim: "................",
      sd: "x.......x.......",
    });
    const result = miniToRows("hh*8, sd(2,8), bd*4", { sounds });
    expect(result.ok && result.rows.map((r) => r.sound)).toEqual(["bd", "cp", "hh", "oh", "rim", "sd"]);
  });

  it("should order unlisted sounds by where they first appear in the text", () => {
    // Arrange
    const pattern = "~ hh, bd cp";

    // Act
    const result = miniToRows(pattern);

    // Assert
    expect(result.ok && result.rows.map((r) => r.sound)).toEqual(["hh", "bd", "cp"]);
  });

  it("should return empty rows for an empty pattern", () => {
    // Arrange
    const sounds = ["bd", "cp"];

    // Act
    const result = miniToRows("  ", { sounds });

    // Assert
    expect(result).toEqual({
      ok: true,
      rows: [
        { sound: "bd", steps: grid("................") },
        { sound: "cp", steps: grid("................") },
      ],
    });
  });

  it("should treat a pattern of rests as an empty grid", () => {
    // Arrange
    const pattern = "~ ~";

    // Act
    const result = miniToRows(pattern);

    // Assert
    expect(result).toEqual({ ok: true, rows: [] });
  });
});
