import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_CONSOLE_ENTRIES, advancedCycles, createRecorder, expectedWavBytes, near, summarize, withTimeout } from "./report";

function fakeClock() {
  let t = 0;
  return { clock: () => t, advance: (ms: number) => (t += ms) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("self-test report", () => {
  it("should time a passing step and keep its detail", async () => {
    // Arrange
    const { clock, advance } = fakeClock();
    const rec = createRecorder({ clock });

    // Act
    const result = await rec.step("a", ({ detail, check }) => {
      advance(12);
      detail["x"] = 1;
      check(true, "never");
    });

    // Assert
    expect(result).toEqual({ step: "a", ok: true, ms: 12, detail: { x: 1 } });
  });

  it("should fail a step on failed checks or a throw and carry on with the next step", async () => {
    // Arrange
    const rec = createRecorder({ isoNow: () => "2026-10-21T00:00:00.000Z" });

    // Act
    await rec.step("checks", ({ check }) => {
      check(false, "meter silent");
      check(false, "cycle drift");
    });
    await rec.step("throws", () => {
      throw new Error("boom");
    });
    await rec.step("passes", () => {});
    const report = rec.finish();

    // Assert
    expect(report.steps.map((s) => [s.step, s.ok])).toEqual([
      ["checks", false],
      ["throws", false],
      ["passes", true],
    ]);
    expect(report.steps[0]?.detail["failures"]).toEqual(["meter silent", "cycle drift"]);
    expect(report.steps[1]?.detail["error"]).toBe("Error: boom");
    expect(report).toMatchObject({ ok: false, complete: true, finishedAt: "2026-10-21T00:00:00.000Z" });
  });

  it("should summarize one line per step plus a total", async () => {
    // Arrange
    const rec = createRecorder();
    await rec.step("good", () => {});
    await rec.step("bad", ({ check }) => {
      check(false, "meter silent");
    });

    // Act
    const lines = rec.finish().summary.split("\n");

    // Assert
    expect(lines[0]).toMatch(/^PASS {2}good /);
    expect(lines[1]).toMatch(/^FAIL {2}bad .* meter silent$/);
    expect(lines[2]).toMatch(/^FAIL {2}1\/2 steps in \d+ ms$/);
  });

  it("should hand the report to onUpdate after every step", async () => {
    // Arrange
    const seen: number[] = [];
    const rec = createRecorder({ onUpdate: (r) => void seen.push(r.steps.length) });

    // Act
    await rec.step("a", () => {});
    await rec.step("b", () => {});

    // Assert
    expect(seen).toEqual([1, 2]);
  });

  it("should not fail a step when writing the report fails", async () => {
    // Arrange
    const rec = createRecorder({ onUpdate: () => Promise.reject(new Error("ipc closed")) });

    // Act
    const result = await rec.step("a", () => {});

    // Assert
    expect(result.ok).toBe(true);
  });

  it("should fail a step that exceeds its timeout", async () => {
    // Arrange
    vi.useFakeTimers();
    const rec = createRecorder();

    // Act
    const pending = rec.step("slow", () => new Promise<void>(() => {}), 100);
    await vi.advanceTimersByTimeAsync(101);
    const result = await pending;

    // Assert
    expect(result.ok).toBe(false);
    expect(result.detail["error"]).toBe("StepTimeoutError: slow timed out after 100 ms");
  });

  it("should cap console entries and count the dropped ones", () => {
    // Arrange
    const rec = createRecorder();

    // Act
    for (let i = 0; i < MAX_CONSOLE_ENTRIES + 5; i++) rec.log({ level: "warn", message: `w${i}` });

    // Assert
    expect(rec.report.console).toHaveLength(MAX_CONSOLE_ENTRIES);
    expect(rec.findings["consoleDropped"]).toBe(5);
  });

  it("should count cycle advance while ignoring loop wraps and seeks", () => {
    // Arrange
    const steady = [8, 8.1, 8.3, 8.6];
    const wrap = [15.9, 16, 8.05, 8.2];
    const seek = [0, 8, 8.1];

    // Act
    const results = [steady, wrap, seek].map((samples) => advancedCycles(samples));

    // Assert
    expect(results[0]).toBeCloseTo(0.6);
    expect(results[1]).toBeCloseTo(0.25);
    expect(results[2]).toBeCloseTo(0.1);
  });

  it("should size a WAV as header plus interleaved PCM", () => {
    // Arrange / Act
    const extensible = expectedWavBytes(48000, 2, 24);
    const plain = expectedWavBytes(10, 1, 16, 44);

    // Assert
    expect(extensible).toBe(288068);
    expect(plain).toBe(64);
  });

  it("should compare within a relative tolerance", () => {
    // Arrange / Act / Assert
    expect(near(101, 100, 0.01)).toBe(true);
    expect(near(102, 100, 0.01)).toBe(false);
  });

  it("should pass values through withTimeout", async () => {
    // Arrange / Act / Assert
    await expect(withTimeout(Promise.resolve(3), 50, "x")).resolves.toBe(3);
  });

  it("should mark a run with only passing steps as PASS", () => {
    // Arrange
    const rec = createRecorder();
    rec.report.steps.push({ step: "a", ok: true, ms: 5, detail: {} });

    // Act
    const summary = summarize(rec.report);

    // Assert
    expect(summary).toMatch(/PASS {2}a .*\nPASS {2}1\/1 steps/);
  });
});
