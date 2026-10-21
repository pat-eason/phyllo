import { describe, expect, it } from "vitest";
import { validatePattern } from "./validate";

describe("validatePattern", () => {
  it.each(["bd*4", "~ cp", "<c2 eb2 g2 bb1>*2", "bd(3,8)", "[bd sd]!2, hh*8?", "bd:3 hh", "bd(<3 5>,8)", "bd*2.5", "<Cm7 Fm7 Ab^7 G7>"])(
    "should accept the valid pattern %j",
    (pattern) => {
      // Act / Assert
      expect(validatePattern(pattern, "s")).toEqual({ ok: true });
    },
  );

  it("should accept note, number and chord patterns for their source types", () => {
    // Act / Assert
    expect(validatePattern("c4 [eb4 g4] ~ bb4 f#2", "note")).toEqual({ ok: true });
    expect(validatePattern("0 2 [4 -1] 7", "n")).toEqual({ ok: true });
    expect(validatePattern("<Cm7 Fm7 Ab^7 G7>", "chord")).toEqual({ ok: true });
  });

  it("should reject a word after * that parses but cannot be evaluated", () => {
    // Act
    const result = validatePattern("bd*lm", "s");

    // Assert
    expect(result).toEqual({ ok: false, message: "`lm` isn't a number — `*` needs a number like `*4`.", column: 4 });
  });

  it("should reject a word after / and report its column", () => {
    // Act
    const result = validatePattern("<bd sd>/q", "s");

    // Assert
    expect(result).toEqual({ ok: false, message: "`q` isn't a number — `/` needs a number like `/4`.", column: 9 });
  });

  it("should reject a non-numeric euclid argument", () => {
    // Act
    const result = validatePattern("bd(3,x)", "s");

    // Assert
    expect(result).toEqual({ ok: false, message: "`x` isn't a number — `(3,8)` needs numbers like `(3,8)`.", column: 6 });
  });

  it("should catch an error that only appears in a later cycle", () => {
    // Act
    const result = validatePattern("bd*<2 q>", "s");

    // Assert
    expect(result.ok).toBe(false);
  });

  it("should explain an unclosed bracket with its column", () => {
    // Act
    const result = validatePattern("bd [sd", "s");

    // Assert
    expect(result).toEqual({ ok: false, message: "`[` is never closed — add `]`.", column: 7 });
  });

  it("should explain an extra closing bracket", () => {
    // Act
    const result = validatePattern("bd sd]", "s");

    // Assert
    expect(result).toEqual({ ok: false, message: "There's an extra `]` with nothing to close.", column: 6 });
  });

  it("should explain a dangling operator", () => {
    // Act
    const result = validatePattern("bd*", "s");

    // Assert
    expect(result).toEqual({ ok: false, message: "`*` needs a number after it, like `*4`.", column: 4 });
  });

  it("should reject a non-note word in a note pattern", () => {
    // Act
    const result = validatePattern("c3 xx e3", "note");

    // Assert
    expect(result).toEqual({
      ok: false,
      message: "`xx` isn't a note — use names like c3, eb4 or f#2 (or a MIDI number).",
      column: 4,
    });
  });

  it("should reject a word in a numbered-note pattern", () => {
    // Act
    const result = validatePattern("0 bd 2", "n");

    // Assert
    expect(result.ok).toBe(false);
  });

  it("should accept any sound name in a sample pattern", () => {
    // Act / Assert
    expect(validatePattern("xx foo", "s")).toEqual({ ok: true });
  });
});
