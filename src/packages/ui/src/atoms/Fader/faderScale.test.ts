import { describe, expect, it } from "vitest";
import { dbToFaderPos, dbToGain, faderPosToDb, formatDb, gainToDb } from "./faderScale";

describe("faderScale", () => {
  it.each([
    [6, 0],
    [0, 0.2],
    [-6, 0.4],
    [-12, 0.6],
    [-24, 0.8],
    [-48, 1],
  ])("should put the %s dB mark at position %s", (db, pos) => {
    // Arrange / Act / Assert
    expect(dbToFaderPos(db)).toBeCloseTo(pos, 10);
  });

  it.each([
    [3, 0.1],
    [-3, 0.3],
    [-2.2, 0.27333],
    [-9, 0.5],
    [-18, 0.7],
    [-36, 0.9],
  ])("should interpolate linearly between marks (%s dB → %s)", (db, pos) => {
    // Arrange / Act / Assert
    expect(dbToFaderPos(db)).toBeCloseTo(pos, 4);
  });

  it.each([
    [12, 0],
    [-60, 1],
    [-Infinity, 1],
    [Number.NaN, 1],
  ])("should pin out-of-range %s dB to position %s", (db, pos) => {
    // Arrange / Act / Assert
    expect(dbToFaderPos(db)).toBe(pos);
  });

  it.each([
    [0, 6],
    [0.2, 0],
    [0.3, -3],
    [0.5, -9],
    [0.9, -36],
    [1, -48],
    [-0.5, 6],
    [1.5, -48],
  ])("should map position %s back to %s dB", (pos, db) => {
    // Arrange / Act / Assert
    expect(faderPosToDb(pos)).toBeCloseTo(db, 10);
  });

  it("should round-trip dB → position → dB across the scale", () => {
    // Arrange
    const values = [6, 4.5, 0, -1.7, -6, -10, -12, -20, -24, -30, -48];

    // Act
    const roundTripped = values.map((db) => faderPosToDb(dbToFaderPos(db)));

    // Assert
    roundTripped.forEach((db, i) => expect(db).toBeCloseTo(values[i] ?? 0, 10));
  });

  it("should space a custom scale evenly", () => {
    // Arrange
    const scale = [6, 0, -12, -48];

    // Act / Assert
    expect(dbToFaderPos(0, scale)).toBeCloseTo(1 / 3, 10);
    expect(dbToFaderPos(-12, scale)).toBeCloseTo(2 / 3, 10);
    expect(faderPosToDb(0.5, scale)).toBeCloseTo(-6, 10);
  });

  it.each([
    [-2.2, "−2.2 dB"],
    [-2.26, "−2.3 dB"],
    [0, "0.0 dB"],
    [-0.04, "0.0 dB"],
    [3, "+3.0 dB"],
    [-60, "−∞ dB"],
    [-80, "−∞ dB"],
  ])("should format %s as %s", (db, text) => {
    // Arrange / Act / Assert
    expect(formatDb(db)).toBe(text);
  });

  it("should convert between gain and dB", () => {
    // Arrange / Act / Assert
    expect(gainToDb(1)).toBe(0);
    expect(gainToDb(0.5)).toBeCloseTo(-6.0206, 4);
    expect(gainToDb(0)).toBe(-60);
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6.0206)).toBeCloseTo(0.5, 4);
    expect(dbToGain(-60)).toBe(0);
  });
});
