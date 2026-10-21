import { describe, expect, it } from "vitest";
import { hapToOscMessage, oscArgs, oscControlsFromHap } from "./osc";

describe("oscControlsFromHap", () => {
  it("adds cps, cycle and delta (seconds) like Strudel's parseControlsFromHap", () => {
    expect(oscControlsFromHap({ value: { s: "bd" }, cps: 0.5, cycle: 3.25, durationCycles: 0.25 })).toEqual({
      cps: 0.5,
      cycle: 3.25,
      delta: 0.5,
      s: "bd",
    });
  });

  it("prefixes the bank onto s and copies roomsize to SuperDirt's size", () => {
    const c = oscControlsFromHap({ value: { s: "bd", bank: "RolandTR909", roomsize: 4 }, cps: 1, cycle: 0, durationCycles: 1 });
    expect(c["s"]).toBe("RolandTR909bd");
    expect(c["size"]).toBe(4);
  });

  it("adds midinote for note names and parses numeric notes", () => {
    expect(oscControlsFromHap({ value: { note: "c3" }, cps: 1, cycle: 0, durationCycles: 1 })["midinote"]).toBe(48);
    expect(oscControlsFromHap({ value: { note: "7" }, cps: 1, cycle: 0, durationCycles: 1 })["note"]).toBe(7);
  });

  it("undoes the cps speed adjustment for unit 'c'", () => {
    expect(oscControlsFromHap({ value: { unit: "c", speed: 1 }, cps: 0.5, cycle: 0, durationCycles: 1 })["speed"]).toBe(2);
  });
});

describe("oscArgs", () => {
  it("flattens to alternating key/value, dropping undefined and non-finite values", () => {
    expect(oscArgs({ s: "bd", n: 3, gain: undefined, x: Number.NaN, on: true, channels: [1, 2] })).toEqual([
      "s",
      "bd",
      "n",
      3,
      "on",
      1,
      "channels",
      "[1,2]",
    ]);
  });
});

describe("hapToOscMessage", () => {
  it("builds a /dirt/play message with a non-negative delay", () => {
    expect(hapToOscMessage({ value: { s: "hh" }, cps: 1, cycle: 1, durationCycles: 0.5 }, -3)).toEqual({
      address: "/dirt/play",
      args: ["cps", 1, "cycle", 1, "delta", 0.5, "s", "hh"],
      atMs: 0,
    });
  });
});
