// Engine behaviour that needs no audio device (Node). Audio paths are covered by harness/runtime.spec.ts.
import { describe, expect, it } from "vitest";
import type { GeneratedProgram } from "@phyllo/model";
import { createEngine, DEFAULT_LOOKAHEAD_MS } from "./engine";
import type { LogLevel } from "./types";

const PROGRAM: GeneratedProgram = {
  code: `setcpm(120/4)\n$: s("bd*4")`,
  lines: { drums: { start: 2, end: 2 } },
  scope: "song",
};

function engineWithLog() {
  const logs: { message: string; level: LogLevel }[] = [];
  const engine = createEngine({ logger: (message, level) => logs.push({ message, level }) });
  return { engine, logs };
}

describe("createEngine before init", () => {
  it("is not ready and reports a clean status", () => {
    const { engine } = engineWithLog();
    expect(engine.ready).toBe(false);
    expect(engine.status).toEqual({ ok: true, evaluatedAt: null });
    expect(engine.sampleRate).toBe(0);
  });

  it("keeps an evaluated program for init instead of failing", async () => {
    const { engine } = engineWithLog();
    await expect(engine.evaluate(PROGRAM)).resolves.toEqual({ ok: true, evaluatedAt: null });
  });

  it("ignores play with a warning and stays stopped", () => {
    const { engine, logs } = engineWithLog();
    engine.play();
    expect(engine.playing).toBe(false);
    expect(logs.some((l) => l.level === "warn" && /before init/.test(l.message))).toBe(true);
  });

  it("returns silent meters", () => {
    const { engine } = engineWithLog();
    expect(engine.getMeters()).toEqual({ tracks: {}, orbits: {}, master: [0, 0] });
  });

  it("cannot pick an output device or capture without an AudioContext", async () => {
    const { engine } = engineWithLog();
    await expect(engine.setOutputDevice("x")).resolves.toBe(false);
    expect(() => engine.startCapture(() => undefined)).toThrow(/before init/);
    await expect(engine.renderOffline(PROGRAM, { fromCycle: 0, toCycle: 1, tailSec: 0, sampleRate: 44100 })).rejects.toThrow(
      /before init/,
    );
  });
});

describe("transport while stopped", () => {
  it("seek moves the position; toStart returns to 0", () => {
    const { engine } = engineWithLog();
    engine.seek(12.25);
    expect(engine.getCycle()).toBe(12.25);
    engine.toStart();
    expect(engine.getCycle()).toBe(0);
  });

  it("clamps negative and non-finite seeks to 0", () => {
    const { engine } = engineWithLog();
    engine.seek(-3);
    expect(engine.getCycle()).toBe(0);
    engine.seek(Number.NaN);
    expect(engine.getCycle()).toBe(0);
  });

  it("stop returns to the loop start when the loop is on, else to 0", () => {
    const { engine } = engineWithLog();
    engine.setLoop({ enabled: true, startBar: 9, endBar: 16 });
    engine.seek(13);
    engine.stop();
    expect(engine.getCycle()).toBe(8);
    engine.setLoop({ enabled: false, startBar: 9, endBar: 16 });
    engine.seek(13);
    engine.stop();
    expect(engine.getCycle()).toBe(0);
  });

  it("notifies transport subscribers on stop and unsubscribes", () => {
    const { engine } = engineWithLog();
    const seen: boolean[] = [];
    const off = engine.onTransport((s) => seen.push(s.playing));
    engine.stop();
    off();
    engine.stop();
    expect(seen).toEqual([false]);
  });
});

describe("look-ahead", () => {
  it("defaults to Strudel's 100 ms and clamps to 20–1000 ms", () => {
    const { engine } = engineWithLog();
    expect(engine.getLookahead()).toBe(DEFAULT_LOOKAHEAD_MS);
    engine.setLookahead(5);
    expect(engine.getLookahead()).toBe(20);
    engine.setLookahead(5000);
    expect(engine.getLookahead()).toBe(1000);
    engine.setLookahead(60);
    expect(engine.getLookahead()).toBe(60);
  });
});
