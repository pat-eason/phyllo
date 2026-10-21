import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createClip,
  createModifier,
  createProject,
  createSection,
  createTrack,
  defaultTrackName,
  isGenericTrackName,
  nextTrackColor,
} from "./factories";
import { createSequentialIdGenerator, newId, setIdGenerator } from "./ids";
import { TRACK_COLORS } from "./types";

beforeEach(() => {
  setIdGenerator(createSequentialIdGenerator());
});
afterEach(() => {
  setIdGenerator(null);
});

describe("ids", () => {
  it("produces unique, prefixed random ids by default", () => {
    setIdGenerator(null);
    const ids = new Set(Array.from({ length: 200 }, () => newId("trk_")));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^trk_[0-9a-z]{12}$/);
    expect(newId()).toMatch(/^[0-9a-z]{12}$/);
  });

  it("can be made deterministic", () => {
    expect(newId("a_")).toBe("a_1");
    expect(newId("a_")).toBe("a_2");
    expect(newId("b_")).toBe("b_1");
    setIdGenerator((p) => `${p}fixed`);
    expect(newId("x_")).toBe("x_fixed");
  });
});

describe("nextTrackColor", () => {
  it("starts with green and takes the first unused palette colour", () => {
    expect(nextTrackColor([])).toBe("#7FD98A");
    expect(nextTrackColor([{ color: "#7FD98A" }])).toBe("#5ECFC8");
    expect(nextTrackColor([{ color: "#7FD98A" }, { color: "#8AB4FF" }])).toBe("#5ECFC8");
  });

  it("matches case-insensitively and skips custom colours", () => {
    expect(nextTrackColor([{ color: "#7fd98a" }])).toBe("#5ECFC8");
    expect(nextTrackColor([{ color: "#123456" }])).toBe("#7FD98A");
  });

  it("round-robins once all seven are in use", () => {
    const all = TRACK_COLORS.map((color) => ({ color }));
    expect(nextTrackColor(all)).toBe(TRACK_COLORS[0]);
    expect(nextTrackColor([...all, { color: "#7FD98A" }])).toBe(TRACK_COLORS[1]);
    expect(nextTrackColor([...all, ...all.slice(0, 3)])).toBe(TRACK_COLORS[3]);
  });
});

describe("createProject", () => {
  const now = "2026-10-21T12:00:00.000Z";

  it("creates a blank phyllo/1 project with the SPEC defaults", () => {
    expect(createProject({ now })).toEqual({
      format: "phyllo/1",
      id: "prj_1",
      name: "Untitled Groove",
      tags: [],
      favorite: false,
      created: now,
      modified: now,
      tempo: { bpm: 120, beatsPerBar: 4 },
      key: "C minor",
      lengthBars: 32,
      loop: { enabled: true, startBar: 1, endBar: 8 },
      sections: [{ id: "sec_1", name: "Song", startBar: 1, endBar: 32 }],
      tracks: [],
      buses: [],
      master: { postgain: 1, limiter: true },
      prelude: [],
      ui: { selectedTrack: null, zoom: 1 },
    });
  });

  it("applies options and keeps the loop and default section inside a short song", () => {
    const p = createProject({ now: new Date(now), name: "Short", bpm: 90, beatsPerBar: 3, key: "D dorian", lengthBars: 4 });
    expect(p.created).toBe(now);
    expect(p.tempo).toEqual({ bpm: 90, beatsPerBar: 3 });
    expect(p.loop).toEqual({ enabled: true, startBar: 1, endBar: 4 });
    expect(p.sections).toEqual([{ id: "sec_1", name: "Song", startBar: 1, endBar: 4 }]);
  });

  it("does not share mutable defaults between projects", () => {
    const a = createProject({ now });
    const b = createProject({ now });
    a.master.postgain = 0.5;
    expect(b.master.postgain).toBe(1);
  });
});

describe("createTrack", () => {
  it("drum: s + RolandTR909 bank, full-song clip, orbit 1", () => {
    const t = createTrack("drum");
    expect(t).toEqual({
      id: "trk_1",
      name: "Drums",
      color: "#7FD98A",
      kind: "drum",
      source: { type: "s", sound: null, bank: "RolandTR909" },
      pattern: "bd*4",
      params: {},
      modifiers: [],
      orbit: 1,
      mute: false,
      solo: false,
      clips: [{ id: "clip_1", startBar: 1, endBar: 32 }],
      rawCode: null,
    });
  });

  it.each([
    ["melodic", { type: "note", sound: "sawtooth", bank: null }, "Melody"],
    ["chord", { type: "chord", sound: "gm_epiano1", bank: null }, "Chords"],
    ["sample", { type: "s", sound: null, bank: null }, "Sample"],
    ["code", { type: "s", sound: null, bank: null }, "Code"],
  ] as const)("%s has the right source and name", (kind, source, name) => {
    const t = createTrack(kind);
    expect(t.source).toEqual(source);
    expect(t.name).toBe(name);
    expect(t.kind).toBe(kind);
  });

  it("code tracks carry rawCode; other kinds never do", () => {
    expect(createTrack("code").rawCode).toBe("silence");
    expect(createTrack("code", { rawCode: 's("bd").fast(2)' }).rawCode).toBe('s("bd").fast(2)');
    expect(createTrack("drum", { rawCode: "x" }).rawCode).toBeNull();
  });

  it("uses existing tracks for the next colour and a unique name", () => {
    const first = createTrack("drum");
    const second = createTrack("drum", { existing: [first] });
    expect(second.name).toBe("Drums 2");
    expect(second.color).toBe("#5ECFC8");
    expect(createTrack("drum", { existing: [first, second] }).name).toBe("Drums 3");
  });

  it("honours overrides and the song length", () => {
    const t = createTrack("melodic", {
      id: "bass",
      name: "Bass",
      color: "#F5C25B",
      lengthBars: 16,
      pattern: "<c2 eb2>*2",
      source: { sound: "square" },
      params: { gain: 0.7 },
      orbit: 2,
      mute: true,
    });
    expect(t).toMatchObject({
      id: "bass",
      name: "Bass",
      color: "#F5C25B",
      pattern: "<c2 eb2>*2",
      source: { type: "note", sound: "square", bank: null },
      params: { gain: 0.7 },
      orbit: 2,
      mute: true,
      clips: [{ startBar: 1, endBar: 16 }],
    });
  });
});

describe("defaultTrackName / isGenericTrackName", () => {
  it("numbers duplicates", () => {
    expect(defaultTrackName("chord", [{ name: "Chords" }, { name: "Chords 2" }])).toBe("Chords 3");
    expect(defaultTrackName("drum", [{ name: "Kick" }])).toBe("Drums");
  });

  it.each([
    ["", true],
    ["Track 3", true],
    ["track", true],
    ["Drums 2", true],
    ["Code", true],
    ["$", true],
    ["$2", true],
    ["_$1", true],
    ["Kick", false],
    ["Bass", false],
    ["Vox chop", false],
    ["Lead 2", false],
  ])("%j generic: %s", (name, expected) => {
    expect(isGenericTrackName(name)).toBe(expected);
  });
});

describe("createModifier / createClip / createSection", () => {
  it("creates enabled modifiers and normalises the leading dot", () => {
    expect(createModifier(".lpf(sine.range(400, 1400).slow(8))", { label: "Filter sweep", origin: "suggestion" })).toEqual({
      id: "mod_1",
      code: ".lpf(sine.range(400, 1400).slow(8))",
      enabled: true,
      label: "Filter sweep",
      origin: "suggestion",
    });
    expect(createModifier("  sometimes(x => x.ply(2)) ", { enabled: false })).toEqual({
      id: "mod_2",
      code: ".sometimes(x => x.ply(2))",
      enabled: false,
    });
  });

  it("creates clips and sections with ids", () => {
    expect(createClip(9, 16)).toEqual({ id: "clip_1", startBar: 9, endBar: 16 });
    expect(createClip(1, 2, "x")).toEqual({ id: "x", startBar: 1, endBar: 2 });
    expect(createSection("Intro", 1, 8)).toEqual({ id: "sec_1", name: "Intro", startBar: 1, endBar: 8 });
  });
});
