import { describe, expect, it } from "vitest";
import { clipCurve, LIMITER } from "./master";

/** How a WaveShaperNode reads its curve: linear interpolation over [-1, 1], clamped beyond. */
function shape(curve: Float32Array, x: number): number {
  const n = curve.length;
  const pos = ((Math.max(-1, Math.min(1, x)) + 1) / 2) * (n - 1);
  const i = Math.floor(pos);
  const a = curve[i] ?? 0;
  const b = curve[Math.min(n - 1, i + 1)] ?? a;
  return a + (b - a) * (pos - i);
}

describe("LIMITER", () => {
  it("is a −1 dB / 20:1 hard-knee compressor with a −0.3 dBFS ceiling", () => {
    expect(LIMITER).toMatchObject({ threshold: -1, ratio: 20, knee: 0, ceilingDb: -0.3 });
    expect(LIMITER.ceiling).toBeCloseTo(0.96605, 4);
    expect(LIMITER.attack).toBeLessThanOrEqual(0.002);
  });
});

describe("clipCurve", () => {
  const curve = clipCurve(LIMITER.ceiling);

  it("has an odd length so 0 maps to exactly 0", () => {
    expect(curve.length % 2).toBe(1);
    expect(curve[(curve.length - 1) / 2]).toBe(0);
    expect(clipCurve(0.5, 10).length).toBe(11);
  });

  it.each([0, 0.1, -0.25, 0.5, -0.9, 0.96])("passes %d through unchanged", (x) => {
    expect(shape(curve, x)).toBeCloseTo(x, 5);
  });

  it.each([0.97, 1, 1.5, 4, 1e6])("never exceeds the ceiling (±%d)", (x) => {
    expect(shape(curve, x)).toBeLessThanOrEqual(LIMITER.ceiling + 1e-7);
    expect(shape(curve, -x)).toBeGreaterThanOrEqual(-LIMITER.ceiling - 1e-7);
    expect(shape(curve, x)).toBeCloseTo(LIMITER.ceiling, 5);
  });

  it("clamps the ceiling to 0..1", () => {
    expect(Math.max(...clipCurve(3, 11))).toBe(1);
    expect(Math.max(...clipCurve(-1, 11))).toBe(0);
  });
});
