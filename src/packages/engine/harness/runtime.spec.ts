/**
 * Browser verification of the Strudel runtime (T1.5) in Chromium.
 * Needs network for the TR-909 samples (Strudel CDN); set PHYLLO_OFFLINE=1 to use synth-only code.
 */
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import process from "node:process";
import type { EngineStatus, GeneratedProgram } from "@phyllo/model";
import type { MeterSnapshot, MidiOutMessage, PhylloEngine } from "../src/runtime";

interface Harness {
  engine: PhylloEngine;
  logs: { message: string; level: string }[];
  midi: { port: string | null; messages: MidiOutMessage[] }[];
  initError: string | null;
}
declare global {
  interface Window {
    harness: Harness;
  }
}

const offline = !!process.env["PHYLLO_OFFLINE"];
const drums = offline ? `$: s("square*4").note("c1").decay(.05).analyze("drums")` : `$: s("bd*4").bank("RolandTR909").analyze("drums")`;

const prog = (lines: string[]): GeneratedProgram => ({
  code: lines.join("\n"),
  lines: { drums: { start: 2, end: 2 }, bass: { start: 3, end: 3 } },
  scope: "song",
});

const SONG = prog(["setcpm(120/4)", drums, `$: note("<c2 eb2>*2").s("sawtooth").lpf(800).analyze("bass")`]);
const SWAPPED = prog(["setcpm(120/4)", drums, `$: note("<c2 g2>*4").s("sawtooth").lpf(1200).analyze("bass")`]);

async function evaluate(page: Page, program: GeneratedProgram): Promise<EngineStatus> {
  return page.evaluate((p) => window.harness.engine.evaluate(p), program);
}
const cycle = (page: Page) => page.evaluate(() => window.harness.engine.getCycle());
const meters = (page: Page) => page.evaluate(() => window.harness.engine.getMeters());

/** Max master/track peaks over `ms`. */
async function peakOver(page: Page, ms: number): Promise<{ master: number; tracks: Record<string, number> }> {
  return page.evaluate(async (dur) => {
    const out = { master: 0, tracks: {} as Record<string, number> };
    const end = performance.now() + dur;
    while (performance.now() < end) {
      const m: MeterSnapshot = window.harness.engine.getMeters();
      out.master = Math.max(out.master, m.master[0], m.master[1]);
      for (const [id, lvl] of Object.entries(m.tracks)) out.tracks[id] = Math.max(out.tracks[id] ?? 0, lvl[0]);
      await new Promise((r) => setTimeout(r, 16));
    }
    return out;
  }, ms);
}

test.describe.configure({ mode: "serial" });

let page: Page;
const pageErrors: string[] = [];

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  await page.goto("/");
  await page.waitForFunction(() => !!window.harness);
  await page.click("#init");
  await page.waitForFunction(() => window.harness.engine.ready || !!window.harness.initError, null, { timeout: 45_000 });
  expect(await page.evaluate(() => window.harness.initError)).toBeNull();
});

test.afterAll(async () => {
  await page.evaluate(() => window.harness.engine.dispose());
  await page.close();
});

test("init: running context, ready, meters silent while stopped", async () => {
  const info = await page.evaluate(() => ({ ready: window.harness.engine.ready, rate: window.harness.engine.sampleRate }));
  expect(info.ready).toBe(true);
  expect(info.rate).toBeGreaterThan(0);
  const status = await evaluate(page, SONG);
  expect(status.ok, JSON.stringify(status)).toBe(true);
  expect(status.evaluatedAt).not.toBeNull();
  const m = await meters(page);
  expect(m.master).toEqual([0, 0]);
  expect(Object.keys(m.tracks).sort()).toEqual(["bass", "drums"]);
});

test("play: heard cycle advances ~1 cycle in 2 s at 120 BPM and the master meter moves", async () => {
  await page.evaluate(() => window.harness.engine.play());
  expect(await page.evaluate(() => window.harness.engine.playing)).toBe(true);
  expect(await page.evaluate(() => window.harness.engine.getCps())).toBeCloseTo(0.5, 5);
  const r = await page.evaluate(async () => {
    const e = window.harness.engine;
    const t0 = performance.now();
    while (e.getCycle() <= 0 && performance.now() - t0 < 2000) await new Promise((res) => setTimeout(res, 5));
    const c1 = e.getCycle();
    const t1 = performance.now();
    await new Promise((res) => setTimeout(res, 2000));
    return { c1, c2: e.getCycle(), dt: (performance.now() - t1) / 1000, startDelay: (t1 - t0) / 1000 };
  });
  expect(r.startDelay).toBeLessThan(0.5);
  expect(r.c2 - r.c1).toBeGreaterThan(0.9);
  expect(r.c2 - r.c1).toBeLessThan(1.1);
  expect(Math.abs(r.c2 - r.c1 - r.dt * 0.5)).toBeLessThan(0.05);
  const peaks = await peakOver(page, 800);
  expect(peaks.master).toBeGreaterThan(0.01);
  expect(peaks.tracks["drums"] ?? 0).toBeGreaterThan(0.01);
  expect(peaks.tracks["bass"] ?? 0).toBeGreaterThan(0.01);
});

test("hot-swap: new code takes over without stopping or resetting the clock", async () => {
  const before = await cycle(page);
  const status = await evaluate(page, SWAPPED);
  expect(status.ok, JSON.stringify(status)).toBe(true);
  const after = await cycle(page);
  expect(after).toBeGreaterThanOrEqual(before);
  expect(await page.evaluate(() => window.harness.engine.playing)).toBe(true);
  expect((await peakOver(page, 500)).master).toBeGreaterThan(0.01);
});

test("errors: last good program keeps playing and the error names the track", async () => {
  const cases: { program: GeneratedProgram; kind: string; line: number }[] = [
    // mini-notation parse error
    { program: prog(["setcpm(120/4)", drums, `$: note("<c2 eb2").s("sawtooth")`]), kind: "pattern", line: 3 },
    // JS syntax error
    { program: prog(["setcpm(120/4)", `$: s("bd*4").bank("RolandTR909").gain(`, `$: note("c2").s("sawtooth")`]), kind: "eval", line: 3 },
    // runtime error while evaluating (unknown method)
    { program: prog(["setcpm(120/4)", drums, `$: note("c2").s("sawtooth").lpff(800)`]), kind: "eval", line: 3 },
    // query-time error (evaluates fine, throws when queried)
    {
      program: prog([
        "setcpm(120/4)",
        drums,
        `$: note("c2").s("sawtooth").fmap(v => { if (v.note) throw new Error("boom"); return v; })`,
      ]),
      kind: "query",
      line: 3,
    },
  ];
  for (const c of cases) {
    const status = await evaluate(page, c.program);
    expect(status.ok, c.program.code).toBe(false);
    expect(status.error?.kind, c.program.code).toBe(c.kind);
    expect(status.error?.line, `${c.program.code}\n${JSON.stringify(status.error)}`).toBe(c.line);
    const expected = c.line === 2 ? "drums" : "bass";
    expect(status.error?.trackId, JSON.stringify(status.error)).toBe(expected);
    expect(await page.evaluate(() => window.harness.engine.playing)).toBe(true);
    expect((await peakOver(page, 400)).master, `still sounding after: ${c.program.code}`).toBeGreaterThan(0.01);
  }
  // JS syntax error column is reported
  const syntax = await evaluate(page, prog(["setcpm(120/4)", drums, `$: note("c2").s("sawtooth"))`]));
  expect(syntax.error?.trackId).toBe("bass");
  expect(syntax.error?.column).toBeGreaterThan(1);
  // recovering clears the error
  const ok = await evaluate(page, SONG);
  expect(ok.ok).toBe(true);
  expect(ok.error).toBeUndefined();
});

test("loop: playback wraps from the end of bars 2–3 to its start; stop returns to loop start", async () => {
  await page.evaluate(() => {
    const e = window.harness.engine;
    e.setLoop({ enabled: true, startBar: 2, endBar: 3 });
    e.seek(2.6);
  });
  const samples = await page.evaluate(async () => {
    const out: number[] = [];
    const end = performance.now() + 2200;
    while (performance.now() < end) {
      out.push(window.harness.engine.getCycle());
      await new Promise((r) => setTimeout(r, 25));
    }
    return out;
  });
  // the seek lands near 2.6 (held until the audio reaches it), then advances and wraps to 1.x
  expect(samples[0]).toBeCloseTo(2.6, 1);
  const settled = samples.slice(2);
  for (const s of settled) {
    expect(s).toBeGreaterThanOrEqual(1);
    expect(s).toBeLessThan(3);
  }
  const wrapIdx = settled.findIndex((s, i) => i > 0 && s < (settled[i - 1] ?? 0) - 0.5);
  expect(wrapIdx, JSON.stringify(samples.map((s) => s.toFixed(2)))).toBeGreaterThan(0);
  expect(settled[wrapIdx]).toBeLessThan(1.2);
  expect(settled[settled.length - 1] ?? 0).toBeGreaterThan(1.3);

  await page.evaluate(() => window.harness.engine.stop());
  expect(await page.evaluate(() => window.harness.engine.playing)).toBe(false);
  expect(await cycle(page)).toBe(1);
  expect((await meters(page)).master).toEqual([0, 0]);

  // pause keeps the position; play resumes from it
  await page.evaluate(() => window.harness.engine.play());
  await page.waitForTimeout(700);
  await page.evaluate(() => window.harness.engine.pause());
  const paused = await cycle(page);
  expect(paused).toBeGreaterThan(1.1);
  expect(paused).toBeLessThan(1.5);
  await page.waitForTimeout(300);
  expect(await cycle(page)).toBe(paused);

  await page.evaluate(() => {
    const e = window.harness.engine;
    e.setLoop({ enabled: false, startBar: 2, endBar: 3 });
    e.stop();
  });
  expect(await cycle(page)).toBe(0);
});

test("song end: with loop off playback stops at the song length", async () => {
  await page.evaluate(() => {
    const e = window.harness.engine;
    e.setSongLength(4);
    e.seek(3.6);
    e.play();
  });
  await page.waitForFunction(() => !window.harness.engine.playing, null, { timeout: 3000 });
  expect(await cycle(page)).toBe(0);
  await page.evaluate(() => window.harness.engine.setSongLength(0));
});

test("seek while playing moves the playhead without stopping", async () => {
  await page.evaluate(() => window.harness.engine.play());
  await page.waitForTimeout(300);
  await page.evaluate(() => window.harness.engine.seek(8));
  const c = await cycle(page);
  expect(c).toBeGreaterThanOrEqual(8);
  expect(c).toBeLessThan(8.2);
  await page.waitForTimeout(600);
  const later = await cycle(page);
  expect(later).toBeGreaterThan(8.1);
  expect(later).toBeLessThan(8.5);
  expect(await page.evaluate(() => window.harness.engine.playing)).toBe(true);
});

test("look-ahead is configurable and the clock stays consistent", async () => {
  const before = await cycle(page);
  await page.evaluate(() => window.harness.engine.setLookahead(50));
  expect(await page.evaluate(() => window.harness.engine.getLookahead())).toBe(50);
  expect(await page.evaluate(() => window.harness.engine.playing)).toBe(true);
  await page.waitForTimeout(1000);
  const after = await cycle(page);
  expect(after - before).toBeGreaterThan(0.4);
  expect(after - before).toBeLessThan(0.65);
  expect((await peakOver(page, 400)).master).toBeGreaterThan(0.01);
  await page.evaluate(() => window.harness.engine.setLookahead(100));
});

test("limiter and capture tap", async () => {
  await page.evaluate(() => window.harness.engine.setLimiter(true));
  expect((await peakOver(page, 400)).master).toBeGreaterThan(0.01);
  const cap = await page.evaluate(async () => {
    let frames = 0;
    let peak = 0;
    let rate = 0;
    const stop = window.harness.engine.startCapture((pcm, sr) => {
      rate = sr;
      frames += pcm[0]?.length ?? 0;
      for (const ch of pcm) for (const v of ch) peak = Math.max(peak, Math.abs(v));
    });
    await new Promise((r) => setTimeout(r, 1000));
    stop();
    return { frames, peak, rate };
  });
  expect(cap.rate).toBeGreaterThan(0);
  expect(cap.frames).toBeGreaterThan(cap.rate * 0.5);
  expect(cap.peak).toBeGreaterThan(0.01);
  expect(cap.peak).toBeLessThanOrEqual(1);
  await page.evaluate(() => window.harness.engine.setLimiter(false));
});

test("renderOffline: 2 cycles incl. a .room(.5) track are non-silent, with a reverb tail; stems solo", async () => {
  const program: GeneratedProgram = {
    code: [
      "setcpm(120/4)",
      `$: note("c3 e3 g3 c4").s("triangle").room(.5).roomsize(4)`,
      `$: note("c2").s("sawtooth").lpf(600).gain(.5)`,
      drums.replace(`.analyze("drums")`, ""),
    ].join("\n"),
    lines: { keys: { start: 2, end: 2 }, bass: { start: 3, end: 3 }, drums: { start: 4, end: 4 } },
    scope: "song",
  };
  const r = await page.evaluate(async (p) => {
    const e = window.harness.engine;
    const rms = (b: AudioBuffer, from: number, to: number) => {
      let sum = 0;
      let n = 0;
      for (let ch = 0; ch < b.numberOfChannels; ch++) {
        const d = b.getChannelData(ch);
        for (let i = Math.floor(from * b.sampleRate); i < Math.min(d.length, to * b.sampleRate); i++) {
          sum += (d[i] ?? 0) ** 2;
          n++;
        }
      }
      return Math.sqrt(sum / Math.max(1, n));
    };
    const t0 = performance.now();
    const full = await e.renderOffline(p, { fromCycle: 0, toCycle: 2, tailSec: 2, sampleRate: 44100 });
    const ms = performance.now() - t0;
    const keys = await e.renderOffline(p, { fromCycle: 0, toCycle: 2, tailSec: 2, sampleRate: 44100, soloTrackIds: ["keys"] });
    const bass = await e.renderOffline(p, { fromCycle: 0, toCycle: 2, tailSec: 0, sampleRate: 44100, soloTrackIds: ["bass"] });
    const drumStem = await e.renderOffline(p, { fromCycle: 0, toCycle: 2, tailSec: 0, sampleRate: 48000, soloTrackIds: ["drums"] });
    return {
      ms,
      duration: full.duration,
      channels: full.numberOfChannels,
      body: rms(full, 0, 4),
      // last note ends at 4 s; a dry triangle with release .01 is silent by 4.3 s, reverb is not
      tail: rms(full, 4.3, 5.5),
      keysBody: rms(keys, 0, 4),
      keysTail: rms(keys, 4.3, 5.5),
      bassBody: rms(bass, 0, 4),
      bassDuration: bass.duration,
      drumsBody: rms(drumStem, 0, 4),
      drumsRate: drumStem.sampleRate,
      stillPlaying: e.playing,
    };
  }, program);
  expect(r.duration).toBeCloseTo(6, 2);
  expect(r.channels).toBe(2);
  expect(r.body).toBeGreaterThan(0.005);
  expect(r.tail).toBeGreaterThan(0.0005);
  expect(r.keysBody).toBeGreaterThan(0.005);
  expect(r.keysTail).toBeGreaterThan(0.0005);
  expect(r.bassBody).toBeGreaterThan(0.005);
  expect(r.bassDuration).toBeCloseTo(4, 2);
  expect(r.drumsBody).toBeGreaterThan(0.005); // TR-909 samples (or the offline synth stand-in)
  expect(r.drumsRate).toBe(48000);
  expect(r.ms).toBeLessThan(6000);
  // the live transport survives the render, and live voices still build (superdough's node pool is
  // shared across contexts; offline nodes must not leak into it)
  expect(r.stillPlaying).toBe(true);
  expect((await peakOver(page, 1500)).master).toBeGreaterThan(0.01);
  const status = await page.evaluate(() => window.harness.engine.status);
  expect(status.ok, JSON.stringify(status)).toBe(true);
});

test("MIDI out goes to the bridge with note on/off bytes; previews play", async () => {
  const status = await evaluate(page, {
    code: ["setcpm(120/4)", `$: note("c3 e3").gain(.5).midi('IAC Bus 1')`, `$: note("g3").midi("Other Port")`].join("\n"),
    lines: { synth: { start: 2, end: 2 }, other: { start: 3, end: 3 } },
    scope: "song",
  });
  expect(status.ok, JSON.stringify(status)).toBe(true);
  await page.waitForTimeout(1500);
  const midi = await page.evaluate(() => window.harness.midi);
  expect(midi.length).toBeGreaterThan(0);
  // double-quoted port names arrive as mini patterns; the runtime joins the words back
  expect(new Set(midi.map((m) => m.port))).toEqual(new Set(["IAC Bus 1", "Other Port"]));
  const first = midi.find((m) => m.port === "IAC Bus 1");
  const on = first?.messages.find((m) => (m.bytes[0] ?? 0) >> 4 === 0x9);
  const off = first?.messages.find((m) => (m.bytes[0] ?? 0) >> 4 === 0x8);
  expect([48, 52]).toContain(on?.bytes[1]);
  expect(on?.bytes[2]).toBe(Math.round(0.45 * 127));
  expect((off?.atMs ?? 0) - (on?.atMs ?? 0)).toBeGreaterThan(900);
  await page.evaluate(() => window.harness.engine.stop());

  await page.evaluate(() => window.harness.engine.preview({ s: "sawtooth", note: "c3" }, 0.2));
  if (!offline) await page.evaluate(() => window.harness.engine.preview({ s: "bd", bank: "RolandTR909" }));
  const errors = await page.evaluate(() => window.harness.logs.filter((l) => l.level === "error").map((l) => l.message));
  expect(errors.filter((m) => /not found/.test(m))).toEqual([]);
});

test("metronome: clicks over a silent song while on, never as a mixer bus, silent again when off", async () => {
  const status = await evaluate(page, {
    code: ["setcpm(120/4)", `$: s("~").analyze("quiet")`].join("\n"),
    lines: { quiet: { start: 2, end: 2 } },
    scope: "song",
  });
  expect(status.ok, JSON.stringify(status)).toBe(true);
  await page.evaluate(() => window.harness.engine.play());

  await page.evaluate(() => window.harness.engine.setMetronome({ on: true, beatsPerBar: 4 }));
  expect((await peakOver(page, 1200)).master).toBeGreaterThan(0.01);
  expect(Object.keys((await meters(page)).orbits)).not.toContain("-2");

  await page.evaluate(() => window.harness.engine.setMetronome({ on: false, beatsPerBar: 4 }));
  await page.waitForTimeout(400); // clicks already scheduled inside the look-ahead still sound
  expect((await peakOver(page, 800)).master).toBeLessThan(0.001);
  await page.evaluate(() => window.harness.engine.stop());
});

test("no uncaught page errors during the run", () => {
  expect(pageErrors).toEqual([]);
});
