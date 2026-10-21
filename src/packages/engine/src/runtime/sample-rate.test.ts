// B8: the live AudioContext is created at the configured rate (Node: a stand-in AudioContext constructor).
import { describe, expect, it } from "vitest";
import { createAudioContext, requestedSampleRate } from "./engine";

/** Records the options of every construction; rejects `unsupported` rates like a real platform would. */
function fakeContextClass(unsupported: number[] = []) {
  const created: (AudioContextOptions | undefined)[] = [];
  class FakeContext {
    readonly sampleRate: number;
    constructor(options?: AudioContextOptions) {
      if (options?.sampleRate !== undefined && unsupported.includes(options.sampleRate)) {
        throw new DOMException("sample rate not supported", "NotSupportedError");
      }
      created.push(options);
      this.sampleRate = options?.sampleRate ?? 48000;
    }
  }
  return { Ctor: FakeContext as unknown as new (options?: AudioContextOptions) => AudioContext, created };
}

describe("engine sample rate", () => {
  it("should request the configured rate with an interactive latency hint", () => {
    // Arrange
    const { Ctor, created } = fakeContextClass();
    // Act
    const ctx = createAudioContext(44100, () => undefined, Ctor);
    // Assert
    expect(ctx.sampleRate).toBe(44100);
    expect(created).toEqual([{ latencyHint: "interactive", sampleRate: 44100 }]);
  });

  it("should use the device default when the rate is null or missing", () => {
    const { Ctor, created } = fakeContextClass();
    createAudioContext(null, () => undefined, Ctor);
    createAudioContext(undefined, () => undefined, Ctor);
    expect(created).toEqual([{ latencyHint: "interactive" }, { latencyHint: "interactive" }]);
  });

  it("should fall back to the device default with a warning when the platform rejects the rate", () => {
    const { Ctor, created } = fakeContextClass([44100]);
    const warnings: string[] = [];
    const ctx = createAudioContext(44100, (m) => warnings.push(m), Ctor);
    expect(ctx.sampleRate).toBe(48000);
    expect(created).toEqual([{ latencyHint: "interactive" }]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^sample rate 44100 Hz not supported .*device default$/);
  });

  it.each([
    [44100, 44100],
    [48000.4, 48000],
    [96000, 96000],
    [8000, 8000],
    [7999, undefined],
    [192000, undefined],
    [Number.NaN, undefined],
    [null, undefined],
    [undefined, undefined],
  ])("should map a setting of %s to a requested rate of %s", (setting, expected) => {
    expect(requestedSampleRate(setting)).toBe(expected);
  });
});
