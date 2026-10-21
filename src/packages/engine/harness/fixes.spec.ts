/**
 * Regression specs for the T1.V runtime defects (F3): silencing logs become track errors (#10), stop/pause
 * release sound (#11), the limiter holds its ceiling live and offline (#12), offline renders don't flood
 * cross-context errors (#19), pattern errors carry columns (#20). Needs network for the starters' samples.
 */
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { EngineStatus, GeneratedProgram } from "@phyllo/model";
import type { PhylloEngine } from "../src/runtime";

interface Harness {
  engine: PhylloEngine;
  logs: { message: string; level: string }[];
  starterProgram(id: string): {
    program: GeneratedProgram;
    loop: { enabled: boolean; startBar: number; endBar: number };
    lengthBars: number;
  };
  initError: string | null;
}
declare global {
  interface Window {
    harness: Harness;
    errorEvents: string[];
  }
}

/** −0.3 dBFS (LIMITER.ceiling) plus float slack. */
const CEILING = 10 ** (-0.3 / 20) + 1e-4;

test.describe.configure({ mode: "serial" });

let page: Page;
const pageErrors: string[] = [];

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/\[mini\] parse error/.test(m.text())) pageErrors.push(`console.error: ${m.text()}`);
  });
  // sees every error event, whoever handles it later (the engine's own listener included)
  await page.addInitScript(() => {
    window.errorEvents = [];
    window.addEventListener("error", (e) => window.errorEvents.push(e.message), true);
  });
  await page.goto("/");
  await page.waitForFunction(() => !!window.harness);
  await page.click("#init");
  await page.waitForFunction(() => window.harness.engine.ready || !!window.harness.initError, null, { timeout: 60_000 });
  expect(await page.evaluate(() => window.harness.initError)).toBeNull();
});

test.afterAll(async () => {
  await page.evaluate(() => window.harness.engine.dispose());
  await page.close();
});

const evaluate = (program: GeneratedProgram): Promise<EngineStatus> =>
  page.evaluate((p) => window.harness.engine.evaluate(p), program);

const twoTracks = (keys: string): GeneratedProgram => ({
  code: ["setcpm(120/4)", `$: s("square*4").note("c2").decay(.05).analyze("drums")`, `$: ${keys}.analyze("keys")`].join("\n"),
  lines: { drums: { start: 2, end: 2 }, keys: { start: 3, end: 3 } },
  scope: "song",
});

test("#10 unknown chord: runtime error on its track (red dot), cleared by the next clean evaluation", async () => {
  const bad = await evaluate(twoTracks(`chord("<Fmaj7 Em7>").voicing().s("sawtooth")`));
  expect(bad.ok, JSON.stringify(bad)).toBe(false);
  expect(bad.evaluatedAt).not.toBeNull(); // it did evaluate: the rest of the song plays
  expect(bad.error).toMatchObject({ kind: "runtime", trackId: "keys", line: 3, message: 'unknown chord "Fmaj7"' });
  // points at the chord symbol: `$: chord("<` is 11 characters
  expect(bad.error?.column).toBe(12);

  // playing it neither floods errors nor reports it again
  await page.evaluate(async () => {
    const e = window.harness.engine;
    e.seek(0);
    e.play();
    await new Promise((r) => setTimeout(r, 2500));
    e.stop();
  });
  const warnings = await page.evaluate(
    () => window.harness.logs.filter((l) => l.level === "warn" && /unknown chord/.test(l.message)).length,
  );
  expect(warnings).toBe(1);

  const good = await evaluate(twoTracks(`chord("<F^7 Em7>").voicing().s("sawtooth")`));
  expect(good.ok, JSON.stringify(good)).toBe(true);
  expect(good.error).toBeUndefined();
});

test("#10 unknown chord reached only while playing (beyond the evaluation scan) is reported live", async () => {
  // cycle 65 is past the 64-cycle preload scan done at evaluation
  const st = await evaluate(twoTracks(`chord("<C!65 Fmaj7>").voicing().s("sawtooth")`));
  expect(st.ok, JSON.stringify(st)).toBe(true);
  await page.evaluate(() => {
    const e = window.harness.engine;
    e.seek(64.6);
    e.play();
  });
  await page.waitForFunction(() => !window.harness.engine.status.ok, null, { timeout: 4000 });
  const status = await page.evaluate(() => window.harness.engine.status);
  expect(status.error).toMatchObject({ kind: "runtime", trackId: "keys", message: 'unknown chord "Fmaj7"' });
  await page.evaluate(() => window.harness.engine.stop());
  expect((await evaluate(twoTracks(`chord("<C Em7>").voicing().s("sawtooth")`))).ok).toBe(true);
});

test("#20 mini-notation errors carry the absolute column and the column within the pattern", async () => {
  const st = await evaluate(twoTracks(`note("<c2 eb2").s("sawtooth")`));
  expect(st.ok).toBe(false);
  // `$: note("` is 9 characters; the pattern `<c2 eb2` ends at its 8th column, the closing quote
  expect(st.error).toMatchObject({ kind: "pattern", trackId: "keys", line: 3, column: 17, patternColumn: 8 });
});

/**
 * Plays a starter, captures the master for a while, stops (or pauses) and keeps capturing. Returns the peak
 * before the stop and the peak from `settleSec` after it (allowing for the capture tap's chunk latency).
 */
async function releaseAfter(starter: string, how: "stop" | "pause") {
  return page.evaluate(
    async ({ id, method }) => {
      const h = window.harness;
      const s = h.starterProgram(id);
      const st = await h.engine.evaluate(s.program);
      h.engine.setLoop(s.loop);
      h.engine.seek(8);
      h.engine.play();
      await new Promise((r) => setTimeout(r, 800));
      const samples: number[] = [];
      let rate = 48000;
      const stopCapture = h.engine.startCapture((pcm, sr) => {
        rate = sr;
        const l = pcm[0] ?? new Float32Array();
        const r = pcm[1] ?? l;
        for (let i = 0; i < l.length; i++) samples.push(Math.max(Math.abs(l[i] ?? 0), Math.abs(r[i] ?? 0)));
      });
      await new Promise((r) => setTimeout(r, 1500));
      const atStop = samples.length;
      h.engine[method]();
      await new Promise((r) => setTimeout(r, 2500));
      stopCapture();
      await new Promise((r) => setTimeout(r, 100));
      // frames not yet posted when stop() ran: ≤ 1 chunk in the worklet + 1 in flight; then the 20 ms ramp
      const settle = atStop + 2 * 4096 + Math.round(0.05 * rate);
      let before = 0;
      let after = 0;
      let lastLoud = -1;
      samples.forEach((v, i) => {
        if (i < atStop) before = Math.max(before, v);
        else if (i >= settle) after = Math.max(after, v);
        if (v > 0.001) lastLoud = i;
      });
      h.engine.stop();
      return { ok: st.ok, before, after, total: samples.length, settle, tailMs: ((lastLoud - atStop) / rate) * 1000 };
    },
    { id: starter, method: how },
  );
}

for (const starter of ["house", "ambient"]) {
  test(`#11 stop() silences ${starter} at once, release and reverb tails included`, async () => {
    const r = await releaseAfter(starter, "stop");
    expect(r.ok).toBe(true);
    expect(r.before, JSON.stringify(r)).toBeGreaterThan(0.02);
    expect(r.total, JSON.stringify(r)).toBeGreaterThan(r.settle + 48000); // ≥ ~2 s captured after the stop
    expect(r.after, JSON.stringify(r)).toBeLessThan(0.001);
  });
}

test("#11 pause() silences too, and play() after a stop sounds again", async () => {
  const r = await releaseAfter("ambient", "pause");
  expect(r.before, JSON.stringify(r)).toBeGreaterThan(0.02);
  expect(r.after, JSON.stringify(r)).toBeLessThan(0.001);
  const peak = await page.evaluate(async () => {
    const e = window.harness.engine;
    e.play();
    let p = 0;
    const end = performance.now() + 2000;
    while (performance.now() < end) {
      const m = e.getMeters().master;
      p = Math.max(p, m[0], m[1]);
      await new Promise((res) => setTimeout(res, 16));
    }
    e.stop();
    return p;
  });
  expect(peak).toBeGreaterThan(0.02);
});

test("#12 limiter is on by default and holds −0.3 dBFS on the house and 16-bit stage starters (capture tap)", async () => {
  for (const id of ["house", "stage"]) {
    const r = await page.evaluate(async (sid) => {
      const h = window.harness;
      const s = h.starterProgram(sid);
      await h.engine.evaluate(s.program);
      h.engine.setLoop(s.loop);
      h.engine.seek(8);
      h.engine.play();
      await new Promise((res) => setTimeout(res, 500));
      let peak = 0;
      const stop = h.engine.startCapture((pcm) => {
        for (const ch of pcm) for (const v of ch) peak = Math.max(peak, Math.abs(v));
      });
      await new Promise((res) => setTimeout(res, 3000));
      stop();
      h.engine.stop();
      await new Promise((res) => setTimeout(res, 200));
      return peak;
    }, id);
    expect(r, id).toBeGreaterThan(0.1);
    expect(r, id).toBeLessThanOrEqual(CEILING);
  }
});

test("#12 #19 B19 renderOffline goes through the limiter, doesn't flood cross-context errors or drop haps", async () => {
  const r = await page.evaluate(async () => {
    const h = window.harness;
    const s = h.starterProgram("stage");
    await h.engine.evaluate(s.program);
    h.engine.setLoop(s.loop);
    h.engine.seek(8);
    h.engine.play(); // live voices end while superdough is on the offline context
    await new Promise((res) => setTimeout(res, 600));
    const before = window.errorEvents.length;
    const logsBefore = h.logs.length;
    const hot: GeneratedProgram = {
      code: `setcpm(120/4)\n$: note("c2 g2").s("sawtooth").gain(4)`,
      lines: { hot: { start: 2, end: 2 } },
      scope: "song",
    };
    const hotBuf = await h.engine.renderOffline(hot, { fromCycle: 0, toCycle: 2, tailSec: 0.5, sampleRate: 48000 });
    const songBuf = await h.engine.renderOffline(s.program, { fromCycle: 8, toCycle: 10, tailSec: 1, sampleRate: 48000 });
    await new Promise((res) => setTimeout(res, 2500)); // offline voices end during/after rendering
    h.engine.stop();
    const peak = (b: AudioBuffer) => {
      let p = 0;
      for (let ch = 0; ch < b.numberOfChannels; ch++) for (const v of b.getChannelData(ch)) p = Math.max(p, Math.abs(v));
      return p;
    };
    return {
      hot: peak(hotBuf),
      song: peak(songBuf),
      errors: window.errorEvents.slice(before),
      renderWarnings: h.logs.slice(logsBefore).filter((l) => l.level !== "debug" && /offline render|audio context/i.test(l.message)),
      status: h.engine.status,
    };
  });
  expect(r.hot).toBeGreaterThan(0.5);
  expect(r.hot).toBeLessThanOrEqual(CEILING);
  expect(r.song).toBeGreaterThan(0.05);
  expect(r.song).toBeLessThanOrEqual(CEILING);
  expect(r.errors).toEqual([]);
  // B19: no hap fails to build offline because superdough handed it a node of the live context
  expect(r.renderWarnings).toEqual([]);
  expect(r.status.ok, JSON.stringify(r.status)).toBe(true);
});

test("no uncaught page errors or console errors during the run", () => {
  expect(pageErrors).toEqual([]);
});
