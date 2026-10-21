import { describe, expect, it } from "vitest";
import { mini } from "@strudel/mini";
import type { Pattern } from "@strudel/core";
import {
  heardSchedulerCycle,
  loopToCycles,
  mapCycle,
  planQuery,
  positionFromCycle,
  songCycleAt,
  transportPattern,
} from "./transport";
import type { LoopCycles, Segment } from "./transport";

const NO_LOOP: LoopCycles = { enabled: false, start: 0, end: 0 };
const seg = (over: Partial<Segment> = {}): Segment => ({
  fromS: -Infinity,
  anchorS: 0,
  anchorU: 0,
  loop: NO_LOOP,
  length: Infinity,
  seek: false,
  ...over,
});

/** `pat.fmap(fn)` (not in the ambient types). */
const fmap = (pat: Pattern, fn: (v: unknown) => unknown) => (pat as Pattern & { fmap(f: typeof fn): Pattern }).fmap(fn);

/** One value per song cycle: cycle n plays n. */
const counter = () => mini("<0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15>") as Pattern;

/** Onset values per scheduler cycle 0..n-1 through the transport pattern. */
function playedPerCycle(segments: Segment[], cycles: number, song: Pattern = counter()): unknown[][] {
  const pat = transportPattern({ get: () => song, onQueryError: () => undefined }, () => segments);
  const out: unknown[][] = [];
  for (let c = 0; c < cycles; c++) {
    out.push(
      pat
        .queryArc(c, c + 1)
        .filter((h) => h.hasOnset())
        .map((h) => h.value),
    );
  }
  return out;
}

describe("loopToCycles", () => {
  it.each([
    [{ enabled: true, startBar: 1, endBar: 4 }, { enabled: true, start: 0, end: 4 }],
    [{ enabled: true, startBar: 9, endBar: 16 }, { enabled: true, start: 8, end: 16 }],
    [{ enabled: true, startBar: 2, endBar: 3 }, { enabled: true, start: 1, end: 3 }],
    [{ enabled: false, startBar: 2, endBar: 3 }, { enabled: false, start: 1, end: 3 }],
    // degenerate region never loops
    [{ enabled: true, startBar: 5, endBar: 3 }, { enabled: false, start: 4, end: 4 }],
  ])("converts 1-based inclusive bars %j to [start, end) cycles", (bars, cycles) => {
    expect(loopToCycles(bars)).toEqual(cycles);
  });
});

describe("mapCycle", () => {
  it("maps linearly from the anchor without a loop", () => {
    expect(mapCycle(seg({ anchorS: 2, anchorU: 10 }), 3.5)).toEqual({ u: 11.5, silent: false, boundary: Infinity });
  });

  it("wraps from the loop end to the loop start", () => {
    const s = seg({ anchorU: 1, loop: { enabled: true, start: 1, end: 3 } });
    expect(mapCycle(s, 0).u).toBe(1);
    expect(mapCycle(s, 1.5).u).toBe(2.5);
    expect(mapCycle(s, 2).u).toBe(1);
    expect(mapCycle(s, 3.25).u).toBe(2.25);
    expect(mapCycle(s, 4).u).toBe(1);
  });

  it("plays into the loop from before it, then wraps", () => {
    const s = seg({ anchorU: 0, loop: { enabled: true, start: 1, end: 3 } });
    expect([0, 0.5, 1, 2, 2.5, 3, 4, 5].map((x) => mapCycle(s, x).u)).toEqual([0, 0.5, 1, 2, 2.5, 1, 2, 1]);
  });

  it("does not wrap a playhead that is already past the loop end", () => {
    const s = seg({ anchorU: 5, loop: { enabled: true, start: 1, end: 3 } });
    expect(mapCycle(s, 2).u).toBe(7);
    expect(mapCycle(s, 2).boundary).toBe(Infinity);
  });

  it("reports the next wrap as a boundary", () => {
    const s = seg({ anchorU: 2.5, loop: { enabled: true, start: 1, end: 3 } });
    expect(mapCycle(s, 0).boundary).toBe(0.5);
    expect(mapCycle(s, 0.5).boundary).toBe(2.5);
  });

  it("is silent past the song end and reports the end as a boundary", () => {
    const s = seg({ anchorU: 2, length: 4 });
    expect(mapCycle(s, 1)).toEqual({ u: 3, silent: false, boundary: 2 });
    expect(mapCycle(s, 2).silent).toBe(true);
  });
});

describe("songCycleAt", () => {
  it("uses the segment in effect at the heard scheduler cycle", () => {
    const segments = [seg({ anchorU: 0 }), seg({ fromS: 4, anchorS: 4, anchorU: 20 })];
    expect(songCycleAt(segments, 3.9)).toBeCloseTo(3.9);
    expect(songCycleAt(segments, 5)).toBe(21);
  });

  it("holds at the seek target until the audio reaches the seek point", () => {
    const segments = [seg({ anchorU: 0 }), seg({ fromS: 4, anchorS: 4, anchorU: 12, seek: true })];
    expect(songCycleAt(segments, 3.8)).toBe(12);
    expect(songCycleAt(segments, 4.25)).toBe(12.25);
  });
});

describe("planQuery", () => {
  it("splits a query at the loop wrap", () => {
    const s = [seg({ anchorU: 2.5, loop: { enabled: true, start: 1, end: 3 } })];
    expect(planQuery(s, 0, 1)).toEqual([
      { b: 0, e: 0.5, shift: 2.5 },
      { b: 0.5, e: 1, shift: 0.5 },
    ]);
  });

  it("splits at a segment boundary and drops silent pieces", () => {
    const s = [seg({ anchorU: 3, length: 4 }), seg({ fromS: 2, anchorS: 2, anchorU: 0, length: 4 })];
    expect(planQuery(s, 0, 3)).toEqual([
      { b: 0, e: 1, shift: 3 },
      { b: 2, e: 3, shift: -2 },
    ]);
  });
});

describe("transportPattern", () => {
  it("plays the song from the anchor (seek = early)", () => {
    expect(playedPerCycle([seg({ anchorU: 5 })], 3)).toEqual([[5], [6], [7]]);
  });

  it("loops bars 2–3 (cycles 1..3) after playing into them", () => {
    const loop = loopToCycles({ enabled: true, startBar: 2, endBar: 3 });
    expect(playedPerCycle([seg({ anchorU: 0, loop })], 6)).toEqual([[0], [1], [2], [1], [2], [1]]);
  });

  it("wraps mid-cycle when started inside the loop", () => {
    const loop = { enabled: true, start: 1, end: 3 };
    const song = mini("[a b]") as Pattern; // two onsets per cycle at 0 and .5
    const pat = transportPattern({ get: () => song, onQueryError: () => undefined }, () => [seg({ anchorU: 2.5, loop })]);
    const onsets = pat
      .queryArc(0, 1)
      .filter((h) => h.hasOnset())
      .map((h) => [h.whole?.begin.valueOf(), h.value]);
    // u 2.5 → b at s0; wrap to u 1 at s .5 → a
    expect(onsets).toEqual([
      [0, "b"],
      [0.5, "a"],
    ]);
  });

  it("is silent past the song end", () => {
    expect(playedPerCycle([seg({ anchorU: 2, length: 4 })], 4)).toEqual([[2], [3], [], []]);
  });

  it("switches to a seek segment at its scheduler cycle", () => {
    const segments = [seg({ anchorU: 0 }), seg({ fromS: 2, anchorS: 2, anchorU: 9, seek: true })];
    expect(playedPerCycle(segments, 4)).toEqual([[0], [1], [9], [10]]);
  });

  it("follows hot-swapped song patterns", () => {
    let song = mini("a") as Pattern;
    const pat = transportPattern({ get: () => song, onQueryError: () => undefined }, () => [seg()]);
    expect(pat.queryArc(0, 1).map((h) => h.value)).toEqual(["a"]);
    song = mini("b") as Pattern;
    expect(pat.queryArc(1, 2).map((h) => h.value)).toEqual(["b"]);
  });

  it("falls back to the replacement pattern when the song throws while queried", () => {
    const bad = fmap(mini("a") as Pattern, () => {
      throw new Error("boom");
    });
    const good = mini("g") as Pattern;
    const errors: unknown[] = [];
    const pat = transportPattern(
      {
        get: () => bad,
        onQueryError: (err) => {
          errors.push(err);
          return good;
        },
      },
      () => [seg()],
    );
    expect(pat.queryArc(0, 1).map((h) => h.value)).toEqual(["g"]);
    expect(String(errors[0])).toContain("boom");
  });

  it("is silent when the song throws and there is no fallback", () => {
    const bad = fmap(mini("a") as Pattern, () => {
      throw new Error("boom");
    });
    const pat = transportPattern({ get: () => bad, onQueryError: () => undefined }, () => [seg()]);
    expect(pat.queryArc(0, 1)).toEqual([]);
  });
});

describe("positionFromCycle", () => {
  it.each([
    [0, 4, { bar: 1, beat: 1, sixteenth: 1 }],
    [12.25, 4, { bar: 13, beat: 2, sixteenth: 1 }],
    [12.3125, 4, { bar: 13, beat: 2, sixteenth: 2 }],
    [0.9999, 4, { bar: 1, beat: 4, sixteenth: 4 }],
    [3.5, 3, { bar: 4, beat: 2, sixteenth: 3 }],
    [-1, 4, { bar: 1, beat: 1, sixteenth: 1 }],
  ])("cycle %d in %d/4 → %j", (cycle, beatsPerBar, expected) => {
    expect(positionFromCycle(cycle, beatsPerBar)).toMatchObject(expected);
  });
});

describe("heardSchedulerCycle", () => {
  it("subtracts the scheduler latency at the output time", () => {
    const anchors = { numCyclesAtCpsChange: 4, secondsAtCpsChange: 10, cps: 0.5, latency: 0.1 };
    expect(heardSchedulerCycle(anchors, 10.1)).toBe(4);
    expect(heardSchedulerCycle(anchors, 12.1)).toBe(5);
  });

  it("is undefined before the first scheduler tick", () => {
    expect(heardSchedulerCycle({ numCyclesAtCpsChange: 0, secondsAtCpsChange: undefined, cps: 0.5, latency: 0.1 }, 1)).toBeUndefined();
  });
});
