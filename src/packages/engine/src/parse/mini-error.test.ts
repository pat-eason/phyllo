import { describe, expect, it } from "vitest";
import { parseMiniPatternError } from "./mini-error";

describe("parseMiniPatternError", () => {
  it.each(["bd*4", "~ cp", "<c2 eb2 g2 bb1>*2", "bd(3,8)", "[bd sd]!2, hh*8?", "c4 [eb4 g4] ~ bb4", "<Cm7 Fm7 Ab^7 G7>"])(
    "should accept the valid pattern %j",
    (pattern) => {
      // Act / Assert
      expect(parseMiniPatternError(pattern)).toBeNull();
    },
  );

  it.each([
    ["bd sd]", 6],
    ["bd*", 4],
    ["bd [sd", 7],
    ["<a b", 5],
    ["", 1],
  ])("should locate the error in %j at column %i", (pattern, column) => {
    // Act
    const err = parseMiniPatternError(pattern);

    // Assert
    expect(err?.column).toBe(column);
    expect(err?.message).toMatch(/^Expected /);
  });
});
