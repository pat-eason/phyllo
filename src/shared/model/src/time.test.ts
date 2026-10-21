import { describe, expect, it } from "vitest";
import { createProject, createSection } from "./factories";
import {
  barsToSeconds,
  cyclesPerMinute,
  cyclesPerSecond,
  formatDuration,
  formatPosition,
  isRecent,
  positionFromCycle,
  sectionAtBar,
} from "./time";

describe("positionFromCycle", () => {
  it.each([
    [0, 4, 1, 1, 1],
    [12.25, 4, 13, 2, 1], // SPEC / mockup readout: cycle 12.25 -> 13.2.1
    [12.0, 4, 13, 1, 1],
    [12.5, 4, 13, 3, 1],
    [12.3125, 4, 13, 2, 2],
    [12.99, 4, 13, 4, 4],
    [0.0625, 4, 1, 1, 2],
    [2.25, 3, 3, 1, 4], // 3/4: a quarter bar is 3 sixteenths
    [2.5, 3, 3, 2, 3],
    [7.75, 6, 8, 5, 3], // 6/8: .75 of 24 sixteenths = 18 -> beat 5, 16th 3
  ])("cycle %s at %i beats/bar -> %i.%i.%i", (cycle, beats, bar, beat, sixteenth) => {
    expect(positionFromCycle(cycle, beats)).toEqual({ bar, beat, sixteenth, cycle });
  });

  it("formats as bar.beat.16th", () => {
    expect(formatPosition(positionFromCycle(12.25, 4))).toBe("13.2.1");
  });

  it("is robust to float noise and bad input", () => {
    expect(positionFromCycle(0.1 + 0.15, 4).beat).toBe(2); // 0.25000000000000006-ish
    expect(positionFromCycle(2.9999999999, 4)).toMatchObject({ bar: 4, beat: 1, sixteenth: 1 }); // noise snaps up
    expect(positionFromCycle(2.999, 4)).toMatchObject({ bar: 3, beat: 4, sixteenth: 4 });
    expect(positionFromCycle(-3, 4)).toMatchObject({ bar: 1, beat: 1, sixteenth: 1, cycle: 0 });
    expect(positionFromCycle(Number.NaN, 4).bar).toBe(1);
  });
});

describe("tempo math", () => {
  it("setcpm(120/4) is 30 cycles per minute", () => {
    expect(cyclesPerMinute(120, 4)).toBe(30);
  });

  it("the playhead advances 0.5 bars per second at 120 BPM", () => {
    expect(cyclesPerSecond(120, 4)).toBe(0.5);
    expect(cyclesPerSecond(90, 3)).toBe(0.5);
  });

  it("converts bars to seconds", () => {
    expect(barsToSeconds(32, 120, 4)).toBe(64);
    expect(barsToSeconds(8, 60, 4)).toBe(32);
  });
});

describe("formatDuration", () => {
  it.each([
    [64, "1:04"],
    [0, "0:00"],
    [9, "0:09"],
    [59.6, "1:00"],
    [68, "1:08"],
    [3600, "1:00:00"],
    [3725, "1:02:05"],
    [-4, "0:00"],
    [Number.NaN, "0:00"],
  ])("%s s -> %s", (s, text) => {
    expect(formatDuration(s)).toBe(text);
  });

  it("matches the Export mock: whole song at 120 BPM is 1:04", () => {
    expect(formatDuration(barsToSeconds(32, 120, 4))).toBe("1:04");
  });
});

describe("sectionAtBar", () => {
  const project = createProject({
    sections: [
      createSection("Intro", 1, 8, "a"),
      createSection("Groove", 9, 16, "b"),
      createSection("Drop", 21, 32, "c"),
    ],
  });
  it("finds the containing section", () => {
    expect(sectionAtBar(project, 1)?.name).toBe("Intro");
    expect(sectionAtBar(project, 9)?.name).toBe("Groove");
    expect(sectionAtBar(project, 16.9)?.name).toBe("Groove");
    expect(sectionAtBar(project, 32)?.name).toBe("Drop");
  });
  it("returns undefined in gaps and outside the song", () => {
    expect(sectionAtBar(project, 18)).toBeUndefined();
    expect(sectionAtBar(project, 0)).toBeUndefined();
    expect(sectionAtBar(project, 33)).toBeUndefined();
  });
});

describe("isRecent", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  it("is true within 14 days and false beyond", () => {
    expect(isRecent("2026-10-21T11:59:00Z", now)).toBe(true);
    expect(isRecent("2026-10-07T12:00:00Z", now)).toBe(true); // exactly 14 days
    expect(isRecent("2026-10-07T11:59:59Z", now)).toBe(false);
    expect(isRecent("2026-01-01T00:00:00Z", now)).toBe(false);
  });
  it("accepts numeric/ISO now and a custom window", () => {
    expect(isRecent("2026-10-20T12:00:00Z", now.getTime(), 1)).toBe(true);
    expect(isRecent("2026-10-19T12:00:00Z", "2026-10-21T12:00:00Z", 1)).toBe(false);
  });
  it("treats never-opened and garbage as not recent", () => {
    expect(isRecent(null, now)).toBe(false);
    expect(isRecent(undefined, now)).toBe(false);
    expect(isRecent("nope", now)).toBe(false);
    expect(isRecent("2026-10-21T00:00:00Z", "nope")).toBe(false);
  });
});
