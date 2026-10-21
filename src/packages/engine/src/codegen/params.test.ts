import { describe, expect, it } from "vitest";
import type { Modifier } from "@phyllo/model";
import { formatNumber, formatParamValue, isExactNumber } from "./format";
import { controlsSetBy, formatCompact, isDefaultParam, modulatedParams, modulationRange } from "./params";
import { arrangeEntries, resolveSection } from "./arrange";
import { arrangeDemo, track } from "./fixtures.test-util";

const mod = (code: string, enabled = true): Modifier => ({ id: code, code, enabled });

describe("codegen helpers", () => {
  it.each([
    [0.82, ".82"],
    [0, "0"],
    [-0, "0"],
    [10, "10"],
    [1600, "1600"],
    [1.25, "1.25"],
    [-0.5, "-.5"],
    [0.1234, ".123"],
    [0.0004, "0"],
    [2.0005, "2.001"],
    [Number.NaN, "0"],
    [Number.POSITIVE_INFINITY, "0"],
  ])("should format %d as %s", (value, text) => {
    // Act / Assert
    expect(formatNumber(value)).toBe(text);
  });

  it("should tell which numbers survive formatting exactly", () => {
    // Act / Assert
    expect([0.82, 0.125, 1400, -2].every(isExactNumber)).toBe(true);
    expect([0.0625, 1 / 3].some(isExactNumber)).toBe(false);
  });

  it("should quote patterned param values", () => {
    // Act / Assert
    expect(formatParamValue("[.45 .7]*4")).toBe('"[.45 .7]*4"');
    expect(formatParamValue(0.45)).toBe(".45");
  });

  it("should treat only audibly neutral values as defaults", () => {
    // Act / Assert
    expect(isDefaultParam("gain", 0.8)).toBe(true);
    expect(isDefaultParam("gain", 0.8000001)).toBe(true);
    expect(isDefaultParam("gain", "0.8")).toBe(false);
    expect(isDefaultParam("lpq", 0)).toBe(false);
    expect(isDefaultParam("roomsize", 0)).toBe(false);
  });

  it.each([
    [".lpf(sine.range(400, 1400).slow(8))", ["lpf"]],
    [".cutoff(200).resonance(4)", ["lpf", "lpq"]],
    [".ctf(200).hp(100).sz(2).dt(.25).dfb(.3).o(2)", ["lpf", "hpf", "roomsize", "delaytime", "delayfeedback", "orbit"]],
    [".sometimes(x => x.gain(1.2))", ["gain"]],
    [".layer(x => x.add(note(12)).room(.4))", ["room"]],
    ['.lpf("800:10")', ["lpf", "lpq"]],
    ['.room(".5:4")', ["room", "roomsize"]],
    ['.delay(".5:.25:.4")', ["delay", "delaytime", "delayfeedback"]],
    [".jux(rev)", ["pan"]],
    [".ply(2).swingBy(1/6, 4)", []],
    ['.s("gain")', []],
    [".lpf(sine.range(400, 1400) // broken", ["lpf"]],
  ])("should detect the controls %s sets", (code, expected) => {
    // Act
    const set = [...controlsSetBy(code)].sort();

    // Assert
    expect(set).toEqual([...expected].sort());
  });

  it("should report modulated params only from enabled modifiers, and none for code tracks", () => {
    // Arrange
    const t = track({ id: "t", modifiers: [mod(".lpf(sine.range(400, 1400))"), mod(".gain(perlin)", false), mod(".orbit(2)")] });
    const code = track({ id: "c", kind: "code", rawCode: 's("bd").lpf(300)', modifiers: [mod(".lpf(1)")] });

    // Act / Assert
    expect([...modulatedParams(t)]).toEqual(["lpf"]);
    expect(modulatedParams(code).size).toBe(0);
  });

  it.each([
    [[".lpf(sine.range(400, 1400).slow(8))"], "lpf", "~400–1.4k"],
    [[".cutoff(saw.rangex(2000, 200))"], "lpf", "~200–2k"],
    [[".gain(sine.range(.2, .8))"], "gain", "~.2–.8"],
    [['.lpf("<400 800 1200>")'], "lpf", "~400–1.2k"],
    [[".sometimes(x => x.ply(2))", ".pan(sine.range(-1, 1))"], "pan", "~-1–1"],
    [[".lpf(perlin.mul(1000))"], "lpf", null],
    [[".ply(2)"], "lpf", null],
  ] as const)("should read the range of %j for %s", (codes, param, expected) => {
    // Arrange
    const t = track({ id: "t", modifiers: codes.map((c) => mod(c)) });

    // Act / Assert
    expect(modulationRange(t, param)).toBe(expected);
  });

  it("should read the range of a patterned static value", () => {
    // Arrange
    const t = track({ id: "t", params: { gain: "[.45 .7]*4" } });

    // Act / Assert
    expect(modulationRange(t, "gain")).toBe("~.45–.7");
    expect(modulationRange(track({ id: "u", params: { gain: 0.5 } }), "gain")).toBeNull();
  });

  it("should format compact values", () => {
    // Act / Assert
    expect([400, 1400, 2000, 12345, 0.25, 0.333].map(formatCompact)).toEqual(["400", "1.4k", "2k", "12.3k", ".25", ".33"]);
  });

  it.each([
    [[[1, 32]], 32, "full"],
    [[[1, 40]], 32, "full"],
    [[], 32, "none"],
    [[[40, 48]], 32, "none"],
    [[[9, 16], [21, 32]], 32, [[8, false], [8, true], [4, false], [12, true]]],
    [[[21, 32], [9, 16]], 32, [[8, false], [8, true], [4, false], [12, true]]],
    [[[1, 8]], 32, [[8, true], [24, false]]],
    [[[1, 16], [17, 32]], 32, [[16, true], [16, true]]],
    [[[1, 10], [5, 12]], 16, [[10, true], [2, true], [4, false]]],
    [[[3, 3]], 4, [[2, false], [1, true], [1, false]]],
  ] as const)("should arrange clips %j over %i bars", (spans, length, expected) => {
    // Arrange
    const clips = spans.map(([startBar, endBar], i) => ({ id: `c${i}`, startBar, endBar }));

    // Act
    const out = arrangeEntries(clips, length);

    // Assert
    expect(typeof out === "string" ? out : out.map((e) => [e.bars, e.play])).toEqual(expected);
  });

  it("should sum arrange entries to exactly the song length", () => {
    // Arrange
    const p = arrangeDemo();

    // Act
    const totals = p.tracks.map((t) => arrangeEntries(t.clips, p.lengthBars)).filter(Array.isArray).map((e) => e.reduce((n, x) => n + x.bars, 0));

    // Assert
    expect(totals.length).toBeGreaterThan(0);
    expect(new Set(totals)).toEqual(new Set([32]));
  });

  it("should resolve the drawer section from the playhead bar or the loop", () => {
    // Arrange
    const p = arrangeDemo();

    // Act / Assert
    expect(resolveSection(p).section?.name).toBe("Groove");
    expect(resolveSection(p, 20)).toMatchObject({ startBar: 17, endBar: 20, section: { id: "break" } });
    expect(resolveSection({ ...p, sections: [] }, 3)).toEqual({ startBar: 1, endBar: 32, section: null });
  });
});
