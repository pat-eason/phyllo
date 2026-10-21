import { describe, expect, it } from "vitest";
import { transpiler } from "@strudel/transpiler";
import type { Project, Track } from "@phyllo/model";
import { projectReducer } from "@phyllo/model";
import { generate } from "../codegen/generate";
import { isDefaultParam, modulatedParams } from "../codegen/params";
import { arrangeDemo, project, specExample, track } from "../codegen/fixtures.test-util";
import { code2hash, fromShareUrl, hash2code, toShareUrl } from "../share/share";
import { parse } from "./parse";
import type { ParseOutcome } from "./parse";
import { STARTERS } from "./starters.test-util";

const c = (startBar: number, endBar: number) => ({ id: `c${startBar}`, startBar, endBar });

/** A project exercising every source kind, code tracks, prelude, tempo, orbit and postgain. */
function kitchenSink(): Project {
  return project({
    tempo: { bpm: 93, beatsPerBar: 3 },
    lengthBars: 24,
    prelude: ["// kitchen sink", "const swing = 1/6;"],
    master: { postgain: 0.85, limiter: true },
    tracks: [
      track({ id: "d", source: { type: "s", sound: null, bank: "LinnDrum" }, pattern: "bd ~ [~ bd] ~, ~ sd", params: { gain: 0.9, hpf: 40 }, modifiers: [{ id: "a", code: ".swingBy(swing, 4)", enabled: true }], clips: [c(1, 24)] }),
      track({ id: "h", pattern: "hh*8", params: { gain: "[.45 .7]*4", pan: 0.3 }, clips: [c(5, 12), c(17, 24)] }),
      track({ id: "n", kind: "melodic", source: { type: "n", sound: "gm_marimba", bank: null }, pattern: "0 2 <4 5>", params: { room: 0.4, roomsize: 3 }, orbit: 2, clips: [c(1, 24)] }),
      track({ id: "s", kind: "melodic", source: { type: "s", sound: "supersaw", bank: null }, pattern: "supersaw", params: { lpf: 1200, lpq: 8 }, modifiers: [{ id: "b", code: '.note("<c3 g2>")', enabled: true }], clips: [c(9, 16)] }),
      track({ id: "q", kind: "melodic", source: { type: "note", sound: null, bank: null }, pattern: "c4 e4 g4", params: { shape: 0.2 }, mute: true, clips: [c(1, 24)] }),
      track({ id: "ch", kind: "chord", source: { type: "chord", sound: null, bank: null }, pattern: "<Am7 D9>", params: { delay: 0.25, delaytime: 0.375, delayfeedback: 0.45 }, clips: [c(1, 24)] }),
      track({ id: "v", kind: "sample", source: { type: "s", sound: "vox", bank: null }, pattern: "vox", modifiers: [{ id: "x", code: ".chop(8)", enabled: true }, { id: "y", code: ".loopAt(2)", enabled: true }], clips: [c(13, 20)] }),
      track({ id: "co", kind: "code", pattern: "", rawCode: 'stack(\n  s("rim*2"),\n  note("c5").s("sine").gain(.2)\n)', clips: [c(1, 24)] }),
      track({ id: "ca", kind: "code", pattern: "", rawCode: 'n(run(4)).scale("C:minor").s("piano")', clips: [c(1, 4), c(21, 24)], mute: true }),
    ],
  });
}

/** True when the clips are one clip over the whole song (codegen's plain, un-`arrange()`d form). */
const isFullSong = (t: Track, lengthBars: number) => t.clips.length === 1 && t.clips[0]?.startBar === 1 && t.clips[0]?.endBar === lengthBars;

/** What the generated code must carry for a track (ids, names, colors, disabled modifiers excluded). */
function expected(t: Track, lengthBars: number, { parsed }: { parsed: boolean }) {
  const modulated = modulatedParams(t);
  const params = Object.fromEntries(Object.entries(t.params).filter(([k, v]) => !modulated.has(k as never) && !isDefaultParam(k as never, v)));
  // Parse only sees clips through arrange(): a full-song clip is "no arrangement" (`[]`) until the reducer applies it.
  const clips = parsed && isFullSong(t, lengthBars) ? [] : t.clips.map((x) => [x.startBar, x.endBar]);
  return {
    kind: t.kind,
    source: t.kind === "drum" ? { ...t.source, sound: null } : t.source,
    pattern: t.pattern,
    params: t.kind === "code" ? {} : params,
    modifiers: t.kind === "code" ? [] : t.modifiers.filter((m) => m.enabled).map((m) => m.code.trim()),
    orbit: t.orbit,
    mute: t.mute,
    clips,
    rawCode: t.rawCode,
  };
}

function actual(t: Track) {
  return {
    kind: t.kind,
    source: t.source,
    pattern: t.pattern,
    params: t.params,
    modifiers: t.modifiers.map((m) => m.code),
    orbit: t.orbit,
    mute: t.mute,
    clips: t.clips.map((x) => [x.startBar, x.endBar]),
    rawCode: t.rawCode,
  };
}

/** The code drawer / import path: parse result → `code/replace` into `base`. */
function apply(base: Project, r: ParseOutcome): Project {
  return projectReducer(base, {
    type: "code/replace",
    tracks: r.tracks,
    prelude: r.prelude,
    ...(r.tempo ? { tempo: r.tempo } : {}),
    ...(r.master ? { master: r.master } : {}),
    ...(r.lengthBars !== undefined ? { lengthBars: r.lengthBars } : {}),
    ...(r.buses ? { buses: r.buses } : {}),
  });
}

/** An empty project of the same length (a fresh import). */
const blank = (p: Project) => project({ lengthBars: p.lengthBars, tempo: p.tempo });

const FIXTURES: [string, () => Project][] = [
  ["SPEC §4.1 example", specExample],
  ["mockup arrangement with buses", arrangeDemo],
  ["kitchen sink", kitchenSink],
];

describe("round-trips", () => {
  it.each(FIXTURES)("should reproduce the tracks of the %s from its song code", (_name, make) => {
    // Arrange
    const p = make();
    const { code } = generate(p, { scope: "song" });

    // Act
    const r = parse(code, { inferBuses: p.buses.length > 0 });
    const imported = apply(blank(p), r);

    // Assert
    expect(r.ok).toBe(true);
    expect(r.tracks.map(actual)).toEqual(p.tracks.map((t) => expected(t, p.lengthBars, { parsed: true })));
    expect(imported.tracks.map(actual)).toEqual(p.tracks.map((t) => expected(t, p.lengthBars, { parsed: false })));
    expect(r.tempo).toEqual(p.tempo);
    expect(r.prelude).toEqual(p.prelude);
    expect(r.master?.postgain ?? 1).toBe(p.master.postgain);
    expect(r.buses ?? []).toEqual(p.buses);
  });

  it.each(FIXTURES)("should make generated code of the %s a fixed point of parse → code/replace → generate", (_name, make) => {
    // Arrange
    const p = make();
    const song = generate(p, { scope: "song" }).code;
    const section = generate(p, { scope: "section", atBar: 12 }).code;

    // Act
    const intoOriginal = generate(apply(p, parse(song, { inferBuses: true })), { scope: "song" }).code;
    const intoBlank = generate(apply(blank(p), parse(song, { inferBuses: true })), { scope: "song" }).code;
    const sectionIntoBlank = generate(apply(blank(p), parse(section, { inferBuses: true })), { scope: "song" }).code;

    // Assert
    expect(intoOriginal).toBe(song);
    expect(intoBlank).toBe(song);
    expect(sectionIntoBlank).toBe(section);
  });

  it("should stay a fixed point without bus inference (bus values become track params)", () => {
    // Arrange
    const p = arrangeDemo();
    const code = generate(p, { scope: "song" }).code;

    // Act
    const r = parse(code);
    const again = generate(apply({ ...p, buses: [] }, r), { scope: "song" }).code;

    // Assert
    expect(r.tracks[1]?.params).toEqual({ gain: 0.7, room: 0.25, roomsize: 2 });
    expect(again).toBe(code);
  });

  it("should keep solo and clip-less tracks in the project but flatten them on a fresh import (documented loss)", () => {
    // Arrange
    const p = project({ tracks: [track({ id: "a", solo: true }), track({ id: "b" }), track({ id: "c", clips: [] })] });
    const r = parse(generate(p, { scope: "song" }).code);

    // Act
    const intoOriginal = apply(p, r);
    const intoBlank = apply(blank(p), r);

    // Assert
    expect(r.tracks.map((t) => [t.mute, t.solo, t.clips.length])).toEqual([
      [false, false, 0],
      [true, false, 0],
      [true, false, 0],
    ]);
    expect(intoOriginal.tracks.map((t) => [t.id, t.mute, t.solo, t.clips.length])).toEqual([
      ["a", false, true, 1],
      ["b", false, false, 1],
      ["c", false, false, 0],
    ]);
    expect(intoBlank.tracks.map((t) => [t.mute, t.solo, t.clips.length])).toEqual([
      [false, false, 1],
      [true, false, 1],
      [true, false, 1],
    ]);
  });

  it("should reach a fixed point on the second iteration when static param calls written as modifiers are absorbed", () => {
    // Arrange: `.gain(.5)` and `.lpf(800)` typed as modifiers become knobs and move to their canonical slots.
    const p = project({
      lengthBars: 8,
      tracks: [
        track({ id: "a", pattern: "bd*4", modifiers: [{ id: "m1", code: ".gain(.5)", enabled: true }, { id: "m2", code: ".fast(2)", enabled: true }], params: { pan: 0.25 }, clips: [c(3, 8)] }),
        track({ id: "b", kind: "melodic", source: { type: "note", sound: "sine", bank: null }, pattern: "c3 e3", modifiers: [{ id: "m3", code: ".lpf(800)", enabled: true }, { id: "m4", code: ".rev()", enabled: true }], params: { gain: 0.6 } }),
      ],
    });
    const g1 = generate(p, { scope: "song" }).code;

    // Act
    const p2 = apply(p, parse(g1));
    const g2 = generate(p2, { scope: "song" }).code;
    const g3 = generate(apply(p2, parse(g2)), { scope: "song" }).code;

    // Assert
    expect(g1).toContain(".gain(.5).fast(2).pan(.25)");
    expect(g2).toContain(".fast(2).gain(.5).pan(.25)");
    expect(g3).toBe(g2);
  });

  it.each(Object.entries(STARTERS))("should regenerate the %s starter stably and equivalently", (_name, lines) => {
    // Arrange
    const base = project({ lengthBars: 8 });
    const first = parse(lines.join("\n"));

    // Act
    const p1 = apply(base, first);
    const code1 = generate(p1, { scope: "song" }).code;
    const second = parse(code1);
    const code2 = generate(apply(p1, second), { scope: "song" }).code;

    // Assert
    expect(second.tracks.map(actual)).toEqual(first.tracks.map(actual));
    expect(second.tempo).toEqual(first.tempo);
    expect(code2).toBe(code1);
    expect(() => transpiler(code1)).not.toThrow();
  });

  it("should round-trip generated code through a strudel.cc link", () => {
    // Arrange
    const code = generate(kitchenSink(), { scope: "song" }).code;

    // Act
    const link = fromShareUrl(toShareUrl(code));

    // Assert
    expect(link).toEqual({ code });
    expect(hash2code(code2hash(code))).toBe(code);
  });
});
