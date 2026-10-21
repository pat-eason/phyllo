import { describe, expect, it } from "vitest";
import { channelNibble, hapToMidiMessages, midiPortName, toMidiNote } from "./midi";

describe("toMidiNote", () => {
  it.each([
    ["c3", 48],
    ["C4", 60],
    ["eb2", 39],
    ["f#1", 30],
    [60, 60],
    [60.4, 60],
    ["64", 64],
    ["", undefined],
    ["xyz", undefined],
    [undefined, undefined],
  ])("%s → %s", (note, midi) => {
    expect(toMidiNote(note)).toBe(midi);
  });
});

describe("channelNibble", () => {
  it.each([
    [undefined, 0],
    [1, 0],
    [10, 9],
    [16, 15],
    [0, 0],
    [17, 15],
  ])("midichan %s → %d", (ch, nibble) => {
    expect(channelNibble(ch)).toBe(nibble);
  });
});

describe("hapToMidiMessages", () => {
  it("emits note on at the target time and note off 10 ms before the hap ends", () => {
    expect(hapToMidiMessages({ value: { note: "c3" }, durationSec: 0.5, atMs: 120 })).toEqual([
      { bytes: [0x90, 48, 114], atMs: 120 }, // default velocity .9
      { bytes: [0x80, 48, 0], atMs: 610 },
    ]);
  });

  it("scales velocity by gain and uses the 1-based channel", () => {
    const [on] = hapToMidiMessages({ value: { note: 60, velocity: 1, gain: 0.5, midichan: 10 }, durationSec: 1, atMs: 0 });
    expect(on).toEqual({ bytes: [0x99, 60, 64], atMs: 0 });
  });

  it("never sends velocity 0 (which would read as note off)", () => {
    const [on] = hapToMidiMessages({ value: { note: 60, gain: 0 }, durationSec: 1, atMs: 0 });
    expect(on?.bytes[2]).toBe(1);
  });

  it("clamps negative delays to now", () => {
    const [on] = hapToMidiMessages({ value: { note: 60 }, durationSec: 1, atMs: -5 });
    expect(on?.atMs).toBe(0);
  });

  it("sends control change, program change, pitch bend and aftertouch", () => {
    const msgs = hapToMidiMessages({
      value: { ccn: 74, ccv: 0.5, progNum: 5, midibend: 0, miditouch: 1, midichan: 2 },
      durationSec: 1,
      atMs: 10,
    });
    expect(msgs).toEqual([
      { bytes: [0xb1, 74, 64], atMs: 10 },
      { bytes: [0xc1, 5], atMs: 10 },
      { bytes: [0xe1, 0x00, 0x40], atMs: 10 }, // 8192 centre: LSB 0, MSB 64
      { bytes: [0xd1, 127], atMs: 10 },
    ]);
  });

  it("maps pitch bend extremes to 0 and 16383", () => {
    expect(hapToMidiMessages({ value: { midibend: -1 }, durationSec: 1, atMs: 0 })[0]?.bytes).toEqual([0xe0, 0, 0]);
    expect(hapToMidiMessages({ value: { midibend: 1 }, durationSec: 1, atMs: 0 })[0]?.bytes).toEqual([0xe0, 0x7f, 0x7f]);
  });

  it("sends nothing for a hap without MIDI controls (e.g. a drum sample)", () => {
    expect(hapToMidiMessages({ value: { s: "bd" }, durationSec: 0.25, atMs: 0 })).toEqual([]);
  });
});

describe("midiPortName", () => {
  it("prefers the midiport control, then the .midi() argument, else the default port", () => {
    expect(midiPortName({ midiport: "IAC" }, "Other")).toBe("IAC");
    expect(midiPortName({}, "Other")).toBe("Other");
    expect(midiPortName({}, undefined)).toBeNull();
    expect(midiPortName({}, 0)).toBeNull();
  });
});
