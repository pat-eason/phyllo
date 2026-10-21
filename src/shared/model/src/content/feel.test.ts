import { describe, expect, it } from "vitest";
import { FEEL_TOOLS, FILL, SKIP, SWING, feelPosition, formatFraction, formatNumber, getFeelTool, matchFeel } from "./feel";

describe("number formatting", () => {
  it.each([
    [0.1, ".1"],
    [0.25, ".25"],
    [0, "0"],
    [1, "1"],
    [1.5, "1.5"],
    [-0.5, "-.5"],
    [0.3333333, ".333"],
  ])("formatNumber(%d) → %s", (value, expected) => {
    expect(formatNumber(value)).toBe(expected);
  });

  it.each([
    [1 / 6, "1/6"],
    [1 / 3, "1/3"],
    [1 / 12, "1/12"],
    [1 / 8, "1/8"],
    [1 / 2, "1/2"],
    [2 / 6, "1/3"],
    [0.05, ".05"],
    [0.2, ".2"],
  ])("formatFraction(%d) → %s", (value, expected) => {
    expect(formatFraction(value)).toBe(expected);
  });
});

describe("feel tools", () => {
  it("lists swing, chance to skip and fill in mockup order", () => {
    expect(FEEL_TOOLS.map((t) => t.label)).toEqual(["Swing", "Chance to skip", "Fill every 4th cycle"]);
    expect(FEEL_TOOLS.map((t) => t.id)).toEqual(["swing", "skip", "fill"]);
  });

  it("gives each tool a sensible slider range with a default inside it", () => {
    for (const tool of FEEL_TOOLS) {
      expect(tool.min).toBeLessThan(tool.max);
      expect(tool.step).toBeGreaterThan(0);
      expect(tool.default).toBeGreaterThanOrEqual(tool.min);
      expect(tool.default).toBeLessThanOrEqual(tool.max);
      expect(tool.off).toBeGreaterThanOrEqual(tool.min);
    }
    expect(SWING.max).toBeCloseTo(1 / 3, 10);
    expect(SWING.default).toBeCloseTo(1 / 6, 10);
    expect(SKIP.default).toBe(0.1);
    expect(SKIP.max).toBe(1);
  });

  it("writes the mockup code at the default values", () => {
    expect(SWING.codeFor(SWING.default)).toBe(".swingBy(1/6, 4)");
    expect(SKIP.codeFor(SKIP.default)).toBe(".degradeBy(.1)");
    expect(FILL.codeFor(FILL.default)).toBe(".lastOf(4, x => x.fast(2))");
  });

  it("writes nothing at the off value", () => {
    for (const tool of FEEL_TOOLS) expect(tool.codeFor(tool.off)).toBe("");
  });

  it("writes swing as a fraction when it is one and as a decimal otherwise", () => {
    expect(SWING.codeFor(1 / 3)).toBe(".swingBy(1/3, 4)");
    expect(SWING.codeFor(1 / 12)).toBe(".swingBy(1/12, 4)");
    expect(SWING.codeFor(0.05)).toBe(".swingBy(.05, 4)");
  });

  it("writes skip chance with at most two decimals", () => {
    expect(SKIP.codeFor(0.25)).toBe(".degradeBy(.25)");
    expect(SKIP.codeFor(0.3)).toBe(".degradeBy(.3)");
    expect(SKIP.codeFor(1)).toBe(".degradeBy(1)");
  });

  it("offers fill strengths off, double speed and quadruple speed", () => {
    expect(FILL.codeFor(1)).toBe(".lastOf(4, x => x.fast(2))");
    expect(FILL.codeFor(2)).toBe(".lastOf(4, x => x.fast(4))");
    expect(FILL.codeFor(0.4)).toBe("");
    expect(FILL.codeFor(7)).toBe(".lastOf(4, x => x.fast(4))");
  });

  it("describes every value in plain words", () => {
    expect(SWING.describe(0)).toBe("No swing: every step is evenly spaced.");
    expect(SWING.describe(1 / 6)).toBe("Swing 50%: every other step lands a little late.");
    expect(SWING.describe(1 / 3)).toBe("Swing 100%: every other step lands a little late.");
    expect(SKIP.describe(0)).toBe("Every hit plays.");
    expect(SKIP.describe(0.1)).toBe("Leaves out about 10% of the hits.");
    expect(FILL.describe(0)).toBe("No fill: every cycle sounds the same.");
    expect(FILL.describe(1)).toBe("Every 4th cycle plays twice as fast, like a drum fill.");
    expect(FILL.describe(2)).toBe("Every 4th cycle plays four times as fast, like a big drum fill.");
  });

  it("emits balanced code", () => {
    for (const tool of FEEL_TOOLS) {
      for (let v = tool.min; v <= tool.max + 1e-9; v += tool.step) {
        const code = tool.codeFor(v);
        const opens = (code.match(/\(/g) ?? []).length;
        const closes = (code.match(/\)/g) ?? []).length;
        expect(opens).toBe(closes);
        if (code !== "") expect(code.startsWith(".")).toBe(true);
      }
    }
  });

  it("looks tools up by id", () => {
    expect(getFeelTool("skip")).toBe(SKIP);
    // @ts-expect-error unknown id
    expect(() => getFeelTool("nope")).toThrow(/Unknown feel tool/);
  });

  it("computes slider position", () => {
    expect(feelPosition(SWING, 0)).toBe(0);
    expect(feelPosition(SWING, 1 / 6)).toBeCloseTo(0.5, 10);
    expect(feelPosition(SKIP, 2)).toBe(1);
    expect(feelPosition(SKIP, -1)).toBe(0);
  });
});

describe("matchFeel: reading modifier code back into sliders", () => {
  it("recognises the code each tool writes", () => {
    for (const tool of FEEL_TOOLS) {
      for (const value of [tool.default, tool.max]) {
        const code = tool.codeFor(value);
        const match = matchFeel(code);
        expect(match?.id).toBe(tool.id);
        expect(match?.value).toBeCloseTo(value, 2);
      }
    }
  });

  it.each([
    [".swingBy(1/6, 4)", { id: "swing", value: 1 / 6 }],
    [".swingBy(1/3,4)", { id: "swing", value: 1 / 3 }],
    [".degradeBy(.1)", { id: "skip", value: 0.1 }],
    [".degradeBy(0.25)", { id: "skip", value: 0.25 }],
    [".lastOf(4, x => x.fast(2))", { id: "fill", value: 1 }],
    [".lastOf(4, x => x.fast(4))", { id: "fill", value: 2 }],
  ])("%s", (code, expected) => {
    const match = matchFeel(code);
    expect(match?.id).toBe(expected.id);
    expect(match?.value).toBeCloseTo(expected.value, 10);
  });

  it("ignores code that is not a Feel tool's output", () => {
    for (const code of [".swingBy(1/6, 8)", ".lastOf(4, rev)", ".lastOf(3, x => x.fast(2))", ".sometimes(x => x.ply(2))", ".degradeBy(sine)", ".lastOf(4, x => x.fast(3))", ""]) {
      expect(matchFeel(code)).toBeNull();
    }
  });
});
