import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClip, createModifier, createProject, createSection, createTrack } from "./factories";
import { createSequentialIdGenerator, setIdGenerator } from "./ids";
import { projectReducer } from "./reducer";
import { deepFreeze } from "./testUtils";
import { TRACK_COLORS } from "./types";
import type { Clip, ParamName, ParamValue, Project, ProjectAction, Track } from "./types";

const NOW = "2026-10-21T12:00:00.000Z";

function fixture(): Project {
  const kick = createTrack("drum", {
    id: "kick",
    name: "Kick",
    color: "#7FD98A",
    pattern: "bd*4",
    clips: [createClip(9, 16, "k1"), createClip(21, 32, "k2")],
  });
  const bass = createTrack("melodic", {
    id: "bass",
    name: "Bass",
    color: "#F5C25B",
    pattern: "<c2 eb2 g2 bb1>*2",
    params: { gain: 0.78, lpq: 10 },
    modifiers: [createModifier(".sometimes(x => x.ply(2))", { id: "m1" }), createModifier(".lastOf(4, rev)", { id: "m2" })],
    clips: [createClip(9, 16, "b1")],
  });
  const keys = createTrack("chord", { id: "keys", name: "Keys", color: "#B9A2FF", clips: [createClip(1, 32, "y1")] });
  return deepFreeze(
    createProject({
      id: "p1",
      now: NOW,
      tracks: [kick, bass, keys],
      sections: [
        createSection("Intro", 1, 8, "intro"),
        createSection("Groove", 9, 16, "groove"),
        createSection("Break", 17, 20, "break"),
        createSection("Drop", 21, 32, "drop"),
      ],
    }),
  );
}

const run = (p: Project, ...actions: ProjectAction[]): Project => actions.reduce(projectReducer, p);
const track = (p: Project, id: string): Track => {
  const t = p.tracks.find((x) => x.id === id);
  if (!t) throw new Error(`no track ${id}`);
  return t;
};
const spans = (clips: readonly Clip[]): [number, number][] => clips.map((c) => [c.startBar, c.endBar]);

beforeEach(() => {
  setIdGenerator(createSequentialIdGenerator());
});
afterEach(() => {
  setIdGenerator(null);
});

describe("every action", () => {
  const samples: Record<ProjectAction["type"], () => ProjectAction> = {
    "project/load": () => ({ type: "project/load", project: createProject({ now: NOW }) }),
    "project/rename": () => ({ type: "project/rename", name: "New" }),
    "project/setTags": () => ({ type: "project/setTags", tags: ["house"] }),
    "project/setFavorite": () => ({ type: "project/setFavorite", favorite: true }),
    "project/setKey": () => ({ type: "project/setKey", key: "D dorian" }),
    "project/setLength": () => ({ type: "project/setLength", lengthBars: 16 }),
    "tempo/set": () => ({ type: "tempo/set", bpm: 100 }),
    "loop/set": () => ({ type: "loop/set", startBar: 2 }),
    "section/add": () => ({ type: "section/add", section: createSection("Outro", 33, 40, "outro") }),
    "section/update": () => ({ type: "section/update", sectionId: "intro", patch: { name: "Start" } }),
    "section/remove": () => ({ type: "section/remove", sectionId: "intro" }),
    "track/add": () => ({ type: "track/add", track: createTrack("sample", { id: "vox" }) }),
    "track/remove": () => ({ type: "track/remove", trackId: "kick" }),
    "track/update": () => ({ type: "track/update", trackId: "kick", patch: { name: "BD" } }),
    "track/move": () => ({ type: "track/move", trackId: "kick", toIndex: 2 }),
    "track/setParam": () => ({ type: "track/setParam", trackId: "kick", param: "gain", value: 0.5 }),
    "track/setPattern": () => ({ type: "track/setPattern", trackId: "kick", pattern: "bd*2" }),
    "track/setSource": () => ({ type: "track/setSource", trackId: "kick", source: { bank: "RolandTR808" } }),
    "track/setMute": () => ({ type: "track/setMute", trackId: "kick", mute: true }),
    "track/setSolo": () => ({ type: "track/setSolo", trackId: "kick", solo: true }),
    "track/setOrbit": () => ({ type: "track/setOrbit", trackId: "kick", orbit: 2 }),
    "modifier/add": () => ({ type: "modifier/add", trackId: "kick", modifier: createModifier(".rev()", { id: "mx" }) }),
    "modifier/remove": () => ({ type: "modifier/remove", trackId: "bass", modifierId: "m1" }),
    "modifier/update": () => ({ type: "modifier/update", trackId: "bass", modifierId: "m1", patch: { enabled: false } }),
    "modifier/move": () => ({ type: "modifier/move", trackId: "bass", modifierId: "m1", toIndex: 1 }),
    "clip/add": () => ({ type: "clip/add", trackId: "kick", clip: createClip(17, 20, "kx") }),
    "clip/update": () => ({ type: "clip/update", trackId: "kick", clipId: "k1", patch: { endBar: 14 } }),
    "clip/split": () => ({ type: "clip/split", trackId: "kick", clipId: "k1", atBar: 13, newClipId: "ks" }),
    "clip/remove": () => ({ type: "clip/remove", trackId: "kick", clipId: "k1" }),
    "bus/set": () => ({ type: "bus/set", orbit: 1, patch: { roomsize: 2 } }),
    "master/set": () => ({ type: "master/set", patch: { postgain: 0.9 } }),
    "code/replace": () => ({ type: "code/replace", tracks: [], prelude: ["// hi"] }),
    "ui/select": () => ({ type: "ui/select", trackId: "bass" }),
    "ui/setZoom": () => ({ type: "ui/setZoom", zoom: 2 }),
  };

  it.each(Object.entries(samples))("%s changes the project without mutating the frozen input", (_type, make) => {
    const before = fixture();
    const after = projectReducer(before, make());
    expect(after).not.toBe(before);
  });

  it("returns the same object for an unknown action", () => {
    const p = fixture();
    expect(projectReducer(p, { type: "nope/nothing" } as unknown as ProjectAction)).toBe(p);
  });

  it("returns the same object when a valid action changes nothing", () => {
    const p = fixture();
    const noops: ProjectAction[] = [
      { type: "project/rename", name: p.name },
      { type: "project/setTags", tags: [] },
      { type: "project/setFavorite", favorite: false },
      { type: "project/setKey", key: p.key },
      { type: "project/setLength", lengthBars: 32 },
      { type: "tempo/set", bpm: 120 },
      { type: "tempo/set" },
      { type: "loop/set", startBar: 1 },
      { type: "section/remove", sectionId: "ghost" },
      { type: "section/update", sectionId: "ghost", patch: { name: "x" } },
      { type: "track/remove", trackId: "ghost" },
      { type: "track/update", trackId: "ghost", patch: { name: "x" } },
      { type: "track/update", trackId: "kick", patch: { name: "Kick" } },
      { type: "track/move", trackId: "kick", toIndex: 0 },
      { type: "track/setParam", trackId: "kick", param: "gain", value: null },
      { type: "track/setParam", trackId: "kick", param: "gain", value: 0.8 },
      { type: "track/setParam", trackId: "bass", param: "gain", value: 0.78 },
      { type: "track/setParam", trackId: "kick", param: "gain", value: Number.NaN },
      { type: "track/setPattern", trackId: "kick", pattern: "bd*4" },
      { type: "track/setSource", trackId: "kick", source: { bank: "RolandTR909" } },
      { type: "track/setMute", trackId: "kick", mute: false },
      { type: "track/setSolo", trackId: "kick", solo: false },
      { type: "track/setOrbit", trackId: "kick", orbit: 1 },
      { type: "modifier/remove", trackId: "bass", modifierId: "ghost" },
      { type: "modifier/move", trackId: "bass", modifierId: "m1", toIndex: 0 },
      { type: "clip/remove", trackId: "kick", clipId: "ghost" },
      { type: "clip/split", trackId: "kick", clipId: "k1", atBar: 9, newClipId: "z" },
      { type: "ui/select", trackId: null },
      { type: "ui/select", trackId: "ghost" },
      { type: "ui/setZoom", zoom: 1 },
      { type: "master/set", patch: {} },
    ];
    for (const action of noops) expect(projectReducer(p, action), JSON.stringify(action)).toBe(p);
  });
});

describe("project-level actions", () => {
  it("loads, renames, tags (trimmed, deduped), favourites and sets the key", () => {
    const p = fixture();
    const other = createProject({ id: "other", now: NOW });
    expect(run(p, { type: "project/load", project: other })).toBe(other);
    expect(run(p, { type: "project/rename", name: "Late Night" }).name).toBe("Late Night");
    expect(run(p, { type: "project/setTags", tags: [" house ", "house", "", "sketch"] }).tags).toEqual(["house", "sketch"]);
    expect(run(p, { type: "project/setFavorite", favorite: true }).favorite).toBe(true);
    expect(run(p, { type: "project/setKey", key: "D dorian" }).key).toBe("D dorian");
  });

  it("clamps tempo and keeps untouched fields", () => {
    const p = fixture();
    expect(run(p, { type: "tempo/set", bpm: 140 }).tempo).toEqual({ bpm: 140, beatsPerBar: 4 });
    expect(run(p, { type: "tempo/set", beatsPerBar: 3 }).tempo).toEqual({ bpm: 120, beatsPerBar: 3 });
    expect(run(p, { type: "tempo/set", bpm: 1 }).tempo.bpm).toBe(20);
    expect(run(p, { type: "tempo/set", bpm: 9999 }).tempo.bpm).toBe(400);
    expect(run(p, { type: "tempo/set", beatsPerBar: 0 }).tempo.beatsPerBar).toBe(1);
    expect(run(p, { type: "tempo/set", beatsPerBar: 99 }).tempo.beatsPerBar).toBe(16);
    expect(run(p, { type: "tempo/set", bpm: Number.NaN })).toBe(p);
  });

  describe("project/setLength", () => {
    it("trims clips, sections and the loop to the new length", () => {
      const p = run(fixture(), { type: "loop/set", startBar: 9, endBar: 16 });
      const short = run(p, { type: "project/setLength", lengthBars: 12 });
      expect(short.lengthBars).toBe(12);
      expect(spans(track(short, "kick").clips)).toEqual([[9, 12]]); // second clip starts after bar 12
      expect(spans(track(short, "keys").clips)).toEqual([[1, 12]]);
      expect(short.sections.map((s) => [s.id, s.startBar, s.endBar])).toEqual([
        ["intro", 1, 8],
        ["groove", 9, 12],
      ]);
      expect(short.loop).toEqual({ enabled: true, startBar: 9, endBar: 12 });
    });

    it("keeps start <= end when the loop falls entirely outside", () => {
      const p = run(fixture(), { type: "loop/set", startBar: 20, endBar: 24 }, { type: "project/setLength", lengthBars: 8 });
      expect(p.loop).toEqual({ enabled: true, startBar: 8, endBar: 8 });
    });

    it("leaves clips alone when the song grows, and reuses untouched tracks", () => {
      const p = fixture();
      const longer = run(p, { type: "project/setLength", lengthBars: 64 });
      expect(longer.lengthBars).toBe(64);
      expect(longer.tracks).toBe(p.tracks);
      expect(longer.sections).toBe(p.sections);
    });

    it("clamps to 1..512 and rounds", () => {
      expect(run(fixture(), { type: "project/setLength", lengthBars: 0 }).lengthBars).toBe(1);
      expect(run(fixture(), { type: "project/setLength", lengthBars: 9999 }).lengthBars).toBe(512);
      expect(run(fixture(), { type: "project/setLength", lengthBars: 10.6 }).lengthBars).toBe(11);
      expect(run(fixture(), { type: "project/setLength", lengthBars: Number.NaN })).toEqual(fixture());
    });
  });

  describe("loop/set", () => {
    const loop = (...a: ProjectAction[]) => run(fixture(), ...a).loop;
    it("patches fields and clamps to the song", () => {
      expect(loop({ type: "loop/set", enabled: false })).toEqual({ enabled: false, startBar: 1, endBar: 8 });
      expect(loop({ type: "loop/set", startBar: 9, endBar: 16 })).toEqual({ enabled: true, startBar: 9, endBar: 16 });
      expect(loop({ type: "loop/set", startBar: -5, endBar: 99 })).toEqual({ enabled: true, startBar: 1, endBar: 32 });
    });
    it("keeps start <= end", () => {
      expect(loop({ type: "loop/set", startBar: 12 })).toEqual({ enabled: true, startBar: 12, endBar: 12 });
      expect(loop({ type: "loop/set", startBar: 9, endBar: 16 }, { type: "loop/set", endBar: 4 })).toEqual({
        enabled: true,
        startBar: 4,
        endBar: 4,
      });
      expect(loop({ type: "loop/set", startBar: 20, endBar: 10 })).toEqual({ enabled: true, startBar: 10, endBar: 20 });
    });
  });
});

describe("sections", () => {
  const sections = (p: Project) => p.sections.map((s) => [s.id, s.startBar, s.endBar]);

  it("adds a section, trimming whatever it overlaps, and keeps them sorted", () => {
    const p = run(fixture(), { type: "section/add", section: createSection("Fill", 7, 10, "fill") });
    expect(sections(p)).toEqual([
      ["intro", 1, 6],
      ["fill", 7, 10],
      ["groove", 11, 16],
      ["break", 17, 20],
      ["drop", 21, 32],
    ]);
  });

  it("removes a fully covered section and splits a containing one", () => {
    const covered = run(fixture(), { type: "section/add", section: createSection("Big", 8, 21, "big") });
    expect(sections(covered)).toEqual([
      ["intro", 1, 7],
      ["big", 8, 21],
      ["drop", 22, 32],
    ]);
    const split = run(fixture(), { type: "section/add", section: createSection("Hole", 12, 13, "hole") });
    expect(sections(split)).toEqual([
      ["intro", 1, 8],
      ["groove", 9, 11],
      ["hole", 12, 13],
      ["groove~2", 14, 16],
      ["break", 17, 20],
      ["drop", 21, 32],
    ]);
    expect(split.sections.find((s) => s.id === "groove~2")?.name).toBe("Groove");
  });

  it("allows adjacent sections and ignores a duplicate id", () => {
    const p = fixture();
    expect(run(p, { type: "section/add", section: createSection("Dup", 1, 2, "intro") })).toBe(p);
    const out = run(p, { type: "section/add", section: createSection("Outro", 33, 40, "outro") });
    expect(out.sections.at(-1)).toEqual({ id: "outro", name: "Outro", startBar: 32, endBar: 32 }); // clamped into the song
  });

  it("updates names and ranges; the edited section wins", () => {
    const renamed = run(fixture(), { type: "section/update", sectionId: "groove", patch: { name: "Verse" } });
    expect(renamed.sections[1]?.name).toBe("Verse");
    expect(renamed.sections[1]).toMatchObject({ startBar: 9, endBar: 16 });

    const grown = run(fixture(), { type: "section/update", sectionId: "groove", patch: { endBar: 18 } });
    expect(sections(grown)).toEqual([
      ["intro", 1, 8],
      ["groove", 9, 18],
      ["break", 19, 20],
      ["drop", 21, 32],
    ]);
  });

  it("clamps an update and never changes the id", () => {
    const p = run(fixture(), {
      type: "section/update",
      sectionId: "drop",
      patch: { startBar: 28, endBar: 99, id: "hacked" } as never,
    });
    expect(p.sections.at(-1)).toEqual({ id: "drop", name: "Drop", startBar: 28, endBar: 32 });
    expect(p.sections.find((s) => s.id === "break")).toMatchObject({ endBar: 20 });
  });

  it("removes a section", () => {
    expect(sections(run(fixture(), { type: "section/remove", sectionId: "break" }))).toEqual([
      ["intro", 1, 8],
      ["groove", 9, 16],
      ["drop", 21, 32],
    ]);
  });
});

describe("tracks", () => {
  it("adds at the end or at an index (clamped) and ignores duplicate ids", () => {
    const p = fixture();
    const vox = createTrack("sample", { id: "vox" });
    expect(run(p, { type: "track/add", track: vox }).tracks.map((t) => t.id)).toEqual(["kick", "bass", "keys", "vox"]);
    expect(run(p, { type: "track/add", track: vox, index: 1 }).tracks.map((t) => t.id)).toEqual(["kick", "vox", "bass", "keys"]);
    expect(run(p, { type: "track/add", track: vox, index: -4 }).tracks[0]?.id).toBe("vox");
    expect(run(p, { type: "track/add", track: vox, index: 99 }).tracks.at(-1)?.id).toBe("vox");
    expect(run(p, { type: "track/add", track: createTrack("drum", { id: "kick" }) })).toBe(p);
  });

  it("sanitises the clips of an added track", () => {
    const messy = createTrack("drum", {
      id: "messy",
      clips: [createClip(20, 40, "a"), createClip(1, 6, "b"), createClip(5, 9, "c")],
    });
    const p = run(fixture(), { type: "track/add", track: messy });
    expect(spans(track(p, "messy").clips)).toEqual([
      [1, 6],
      [7, 9],
      [20, 32],
    ]);
  });

  it("clears the selection only when the removed track was selected", () => {
    const selected = run(fixture(), { type: "ui/select", trackId: "bass" });
    expect(run(selected, { type: "track/remove", trackId: "bass" }).ui.selectedTrack).toBeNull();
    expect(run(selected, { type: "track/remove", trackId: "kick" }).ui.selectedTrack).toBe("bass");
    expect(run(selected, { type: "track/remove", trackId: "bass" }).tracks.map((t) => t.id)).toEqual(["kick", "keys"]);
  });

  it("updates fields shallowly, keeps the id, and fixes clips and orbit", () => {
    const p = run(fixture(), {
      type: "track/update",
      trackId: "kick",
      patch: { name: "BD", color: "#FF9C7A", orbit: 500, clips: [createClip(30, 99, "z")], id: "hacked" } as never,
    });
    expect(track(p, "kick")).toMatchObject({ id: "kick", name: "BD", color: "#FF9C7A", orbit: 99 });
    expect(spans(track(p, "kick").clips)).toEqual([[30, 32]]);
    expect(track(p, "kick").pattern).toBe("bd*4");
  });

  it("moves tracks, clamping the target index", () => {
    const ids = (p: Project) => p.tracks.map((t) => t.id);
    expect(ids(run(fixture(), { type: "track/move", trackId: "keys", toIndex: 0 }))).toEqual(["keys", "kick", "bass"]);
    expect(ids(run(fixture(), { type: "track/move", trackId: "kick", toIndex: 99 }))).toEqual(["bass", "keys", "kick"]);
    expect(ids(run(fixture(), { type: "track/move", trackId: "bass", toIndex: -9 }))).toEqual(["bass", "kick", "keys"]);
  });

  it("sets pattern, source (partial), mute, solo and orbit", () => {
    const p = run(
      fixture(),
      { type: "track/setPattern", trackId: "kick", pattern: "bd(3,8)" },
      { type: "track/setSource", trackId: "kick", source: { bank: "RolandTR808" } },
      { type: "track/setMute", trackId: "kick", mute: true },
      { type: "track/setSolo", trackId: "kick", solo: true },
      { type: "track/setOrbit", trackId: "kick", orbit: 3 },
    );
    expect(track(p, "kick")).toMatchObject({
      pattern: "bd(3,8)",
      source: { type: "s", sound: null, bank: "RolandTR808" },
      mute: true,
      solo: true,
      orbit: 3,
    });
    expect(run(p, { type: "track/setOrbit", trackId: "kick", orbit: -2 }).tracks[0]?.orbit).toBe(0);
    expect(run(p, { type: "track/setOrbit", trackId: "kick", orbit: 2.6 }).tracks[0]?.orbit).toBe(3);
  });

  it("touches only the addressed track", () => {
    const p = fixture();
    const out = run(p, { type: "track/setMute", trackId: "bass", mute: true });
    expect(out.tracks[0]).toBe(p.tracks[0]);
    expect(out.tracks[2]).toBe(p.tracks[2]);
  });
});

describe("track/setParam", () => {
  const set = (param: Parameters<typeof paramAction>[0], value: Parameters<typeof paramAction>[1]) =>
    track(run(fixture(), paramAction(param, value)), "bass").params;
  function paramAction(param: ParamName, value: ParamValue | null): ProjectAction {
    return { type: "track/setParam", trackId: "bass", param, value };
  }

  it("sets a value, rounded to the spec precision", () => {
    expect(set("lpf", 1575.92)).toEqual({ gain: 0.78, lpq: 10, lpf: 1576 });
    expect(set("shape", 0.3333)).toEqual({ gain: 0.78, lpq: 10, shape: 0.33 });
  });

  it("removes the key for null, empty, and the Strudel default", () => {
    expect(set("gain", null)).toEqual({ lpq: 10 });
    expect(set("lpq", "")).toEqual({ gain: 0.78 });
    expect(set("gain", 0.8)).toEqual({ lpq: 10 });
    expect(set("pan", 0.5)).toEqual({ gain: 0.78, lpq: 10 });
    expect(set("room", 0)).toEqual({ gain: 0.78, lpq: 10 });
    expect(set("delayfeedback", 0.5)).toEqual({ gain: 0.78, lpq: 10 });
  });

  it("clamps to the spec range", () => {
    expect(set("gain", 9).gain).toBe(2);
    expect(set("gain", -1).gain).toBe(0);
    expect(set("lpf", 5).lpf).toBe(20);
    expect(set("lpf", 99999).lpf).toBe(20000);
    expect(set("pan", 3).pan).toBe(1);
    expect(set("delayfeedback", 1).delayfeedback).toBe(0.98);
    expect(set("lpq", 120).lpq).toBe(50);
    expect(set("roomsize", 40).roomsize).toBe(10);
  });

  it("keeps patterned (mini-notation) values verbatim", () => {
    expect(set("gain", "[.45 .7]*4").gain).toBe("[.45 .7]*4");
  });

  it("ignores NaN and unknown tracks", () => {
    const p = fixture();
    expect(run(p, paramAction("gain", Number.NaN))).toBe(p);
    expect(run(p, { type: "track/setParam", trackId: "ghost", param: "gain", value: 0.1 })).toBe(p);
  });

  it("does not mutate the params object it replaces", () => {
    const p = fixture();
    const before = track(p, "bass").params;
    run(p, paramAction("gain", null), paramAction("lpf", 800));
    expect(before).toEqual({ gain: 0.78, lpq: 10 });
  });
});

describe("modifiers", () => {
  const codes = (p: Project) => track(p, "bass").modifiers.map((m) => m.id);

  it("adds at the end or an index, and ignores duplicate ids", () => {
    const m = createModifier(".rev()", { id: "m3" });
    expect(codes(run(fixture(), { type: "modifier/add", trackId: "bass", modifier: m }))).toEqual(["m1", "m2", "m3"]);
    expect(codes(run(fixture(), { type: "modifier/add", trackId: "bass", modifier: m, index: 0 }))).toEqual(["m3", "m1", "m2"]);
    const p = fixture();
    expect(run(p, { type: "modifier/add", trackId: "bass", modifier: createModifier(".x()", { id: "m1" }) })).toBe(p);
  });

  it("removes, updates (id preserved) and moves", () => {
    expect(codes(run(fixture(), { type: "modifier/remove", trackId: "bass", modifierId: "m1" }))).toEqual(["m2"]);
    const updated = run(fixture(), {
      type: "modifier/update",
      trackId: "bass",
      modifierId: "m2",
      patch: { enabled: false, label: "Flip", id: "hacked" } as never,
    });
    expect(track(updated, "bass").modifiers[1]).toMatchObject({ id: "m2", enabled: false, label: "Flip", code: ".lastOf(4, rev)" });
    expect(codes(run(fixture(), { type: "modifier/move", trackId: "bass", modifierId: "m1", toIndex: 5 }))).toEqual(["m2", "m1"]);
  });
});

describe("clips", () => {
  const clips = (p: Project, id = "kick") => spans(track(p, id).clips);

  describe("clip/add", () => {
    it("adds in sorted order", () => {
      const p = run(fixture(), { type: "clip/add", trackId: "kick", clip: createClip(1, 4, "k0") });
      expect(clips(p)).toEqual([
        [1, 4],
        [9, 16],
        [21, 32],
      ]);
    });

    it("clamps into the song and fixes end < start", () => {
      const p = run(fixture(), { type: "clip/add", trackId: "bass", clip: createClip(18, 99, "bx") });
      expect(clips(p, "bass")).toEqual([
        [9, 16],
        [18, 32],
      ]);
      const inverted = run(fixture(), { type: "clip/add", trackId: "bass", clip: createClip(20, 10, "iv") });
      expect(clips(inverted, "bass")).toEqual([
        [9, 16],
        [20, 20],
      ]);
      const early = run(fixture(), { type: "clip/add", trackId: "bass", clip: createClip(-3, 0, "ea") });
      expect(clips(early, "bass")).toEqual([
        [1, 1],
        [9, 16],
      ]);
    });

    it("trims overlapped neighbours (the new clip wins)", () => {
      const p = run(fixture(), { type: "clip/add", trackId: "kick", clip: createClip(14, 22, "kn") });
      expect(clips(p)).toEqual([
        [9, 13],
        [14, 22],
        [23, 32],
      ]);
    });

    it("removes fully covered clips", () => {
      const p = run(fixture(), { type: "clip/add", trackId: "kick", clip: createClip(1, 32, "all") });
      expect(clips(p)).toEqual([[1, 32]]);
    });

    it("splits a clip that strictly contains the new one, keeping the left id", () => {
      const p = run(fixture(), { type: "clip/add", trackId: "keys", clip: createClip(10, 12, "hole") });
      expect(track(p, "keys").clips).toEqual([
        { id: "y1", startBar: 1, endBar: 9 },
        { id: "hole", startBar: 10, endBar: 12 },
        { id: "y1~2", startBar: 13, endBar: 32 },
      ]);
    });

    it("allows adjacent clips and ignores a duplicate clip id", () => {
      const p = run(fixture(), { type: "clip/add", trackId: "kick", clip: createClip(17, 20, "kb") });
      expect(clips(p)).toEqual([
        [9, 16],
        [17, 20],
        [21, 32],
      ]);
      const dup = fixture();
      expect(run(dup, { type: "clip/add", trackId: "kick", clip: createClip(1, 2, "k1") })).toBe(dup);
    });
  });

  describe("clip/update", () => {
    it("resizes within free space", () => {
      const p = run(fixture(), { type: "clip/update", trackId: "kick", clipId: "k1", patch: { endBar: 12 } });
      expect(clips(p)).toEqual([
        [9, 12],
        [21, 32],
      ]);
    });

    it("moves a clip, trimming the clip it lands on", () => {
      const p = run(fixture(), { type: "clip/update", trackId: "kick", clipId: "k1", patch: { startBar: 17, endBar: 24 } });
      expect(clips(p)).toEqual([
        [17, 24],
        [25, 32],
      ]);
      expect(track(p, "kick").clips.map((c) => c.id)).toEqual(["k1", "k2"]);
    });

    it("keeps endBar >= startBar when only the start moves past the end", () => {
      // k1 (9-16) -> start 24 => [24,24], which lands inside k2 (21-32) and splits it.
      const p = run(fixture(), { type: "clip/update", trackId: "kick", clipId: "k1", patch: { startBar: 24 } });
      expect(track(p, "kick").clips).toEqual([
        { id: "k2", startBar: 21, endBar: 23 },
        { id: "k1", startBar: 24, endBar: 24 },
        { id: "k2~2", startBar: 25, endBar: 32 },
      ]);
    });

    it("clamps and never changes the id", () => {
      const p = run(fixture(), {
        type: "clip/update",
        trackId: "bass",
        clipId: "b1",
        patch: { startBar: 0, endBar: 50, id: "hacked" } as never,
      });
      expect(track(p, "bass").clips).toEqual([{ id: "b1", startBar: 1, endBar: 32 }]);
    });
  });

  describe("clip/split", () => {
    it("splits so the right clip starts at atBar", () => {
      const p = run(fixture(), { type: "clip/split", trackId: "kick", clipId: "k1", atBar: 13, newClipId: "ks" });
      expect(track(p, "kick").clips).toEqual([
        { id: "k1", startBar: 9, endBar: 12 },
        { id: "ks", startBar: 13, endBar: 16 },
        { id: "k2", startBar: 21, endBar: 32 },
      ]);
    });

    it("accepts the last bar and rejects the first bar and anything outside", () => {
      const last = run(fixture(), { type: "clip/split", trackId: "kick", clipId: "k1", atBar: 16, newClipId: "ks" });
      expect(clips(last)).toEqual([
        [9, 15],
        [16, 16],
        [21, 32],
      ]);
      const p = fixture();
      for (const atBar of [9, 8, 17, 0, 100]) {
        expect(run(p, { type: "clip/split", trackId: "kick", clipId: "k1", atBar, newClipId: "ks" })).toBe(p);
      }
      expect(run(p, { type: "clip/split", trackId: "kick", clipId: "ghost", atBar: 12, newClipId: "ks" })).toBe(p);
      expect(run(p, { type: "clip/split", trackId: "kick", clipId: "k1", atBar: 12, newClipId: "k2" })).toBe(p);
    });
  });

  it("removes a clip", () => {
    expect(clips(run(fixture(), { type: "clip/remove", trackId: "kick", clipId: "k1" }))).toEqual([[21, 32]]);
  });

  it("keeps clips sorted, in range and non-overlapping under random edits", () => {
    // Deterministic LCG so a failure is reproducible.
    let seed = 12345;
    const rnd = (n: number) => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed % n;
    };
    let p = fixture();
    let nextId = 0;
    for (let i = 0; i < 400; i++) {
      const t = ["kick", "bass", "keys"][rnd(3)] as string;
      const existing = track(p, t).clips;
      const pick = existing[rnd(Math.max(1, existing.length))];
      const a = rnd(40) - 3;
      const b = rnd(40) - 3;
      const action: ProjectAction[] = [
        { type: "clip/add", trackId: t, clip: createClip(a, b, `r${nextId++}`) },
        { type: "clip/update", trackId: t, clipId: pick?.id ?? "x", patch: { startBar: a, endBar: b } },
        { type: "clip/split", trackId: t, clipId: pick?.id ?? "x", atBar: a, newClipId: `r${nextId++}` },
        { type: "clip/remove", trackId: t, clipId: pick?.id ?? "x" },
        { type: "project/setLength", lengthBars: 8 + rnd(40) },
      ];
      p = projectReducer(p, action[rnd(action.length)] as ProjectAction);
      for (const tr of p.tracks) {
        const ids = new Set<string>();
        let prevEnd = 0;
        for (const c of tr.clips) {
          expect(c.startBar).toBeGreaterThanOrEqual(1);
          expect(c.endBar).toBeLessThanOrEqual(p.lengthBars);
          expect(c.endBar).toBeGreaterThanOrEqual(c.startBar);
          expect(c.startBar).toBeGreaterThan(prevEnd);
          expect(ids.has(c.id)).toBe(false);
          ids.add(c.id);
          prevEnd = c.endBar;
        }
      }
    }
  });
});

describe("buses and master", () => {
  it("creates a bus, patches it, keeps buses sorted, clamps and drops cleared fields", () => {
    let p = run(fixture(), { type: "bus/set", orbit: 2, patch: { roomsize: 4 } }, { type: "bus/set", orbit: 1, patch: { delaytime: 0.125, delayfeedback: 0.4 } });
    expect(p.buses).toEqual([
      { orbit: 1, delaytime: 0.125, delayfeedback: 0.4 },
      { orbit: 2, roomsize: 4 },
    ]);
    p = run(p, { type: "bus/set", orbit: 1, patch: { delayfeedback: 5, delaytime: undefined } });
    expect(p.buses[0]).toEqual({ orbit: 1, delayfeedback: 0.98 });
    p = run(p, { type: "bus/set", orbit: 2, patch: { roomsize: 99 } });
    expect(p.buses[1]).toEqual({ orbit: 2, roomsize: 10 });
  });

  it("patches the master and clamps postgain", () => {
    expect(run(fixture(), { type: "master/set", patch: { postgain: 0.9 } }).master).toEqual({ postgain: 0.9, limiter: true });
    expect(run(fixture(), { type: "master/set", patch: { limiter: false } }).master).toEqual({ postgain: 1, limiter: false });
    expect(run(fixture(), { type: "master/set", patch: { postgain: 7 } }).master.postgain).toBe(2);
    expect(run(fixture(), { type: "master/set", patch: { postgain: -1 } }).master.postgain).toBe(0);
  });
});

describe("ui", () => {
  it("selects existing tracks, null for unknown, and clamps zoom", () => {
    expect(run(fixture(), { type: "ui/select", trackId: "keys" }).ui.selectedTrack).toBe("keys");
    expect(run(fixture(), { type: "ui/select", trackId: "keys" }, { type: "ui/select", trackId: "ghost" }).ui.selectedTrack).toBeNull();
    expect(run(fixture(), { type: "ui/setZoom", zoom: 2 }).ui.zoom).toBe(2);
    expect(run(fixture(), { type: "ui/setZoom", zoom: 100 }).ui.zoom).toBe(8);
    expect(run(fixture(), { type: "ui/setZoom", zoom: 0 }).ui.zoom).toBe(0.25);
  });
});

describe("code/replace", () => {
  let incomingCount = 0;
  const incoming = (kind: Track["kind"], over: Partial<Track> = {}): Track => ({
    ...createTrack(kind, { id: `inc_${++incomingCount}`, clips: [] }),
    ...over,
  });

  it("matches by id and keeps identity, colour, clips and solo; takes incoming content", () => {
    const p = run(fixture(), { type: "track/setSolo", trackId: "bass", solo: true });
    const inc = incoming("melodic", {
      id: "bass",
      name: "Track 2",
      pattern: "c3*4",
      params: { gain: 0.5 },
      mute: true,
      color: "#000000",
      clips: [createClip(1, 2, "other")],
    });
    const out = run(p, { type: "code/replace", tracks: [inc], prelude: ["samples('x')"] });
    expect(out.tracks).toHaveLength(1);
    expect(out.tracks[0]).toMatchObject({
      id: "bass",
      name: "Bass", // generic incoming name -> existing one kept
      color: "#F5C25B",
      pattern: "c3*4",
      params: { gain: 0.5 },
      mute: true,
      solo: true,
      clips: [{ id: "b1", startBar: 9, endBar: 16 }],
    });
    expect(out.prelude).toEqual(["samples('x')"]);
  });

  it("uses a non-generic incoming name", () => {
    const out = run(fixture(), {
      type: "code/replace",
      tracks: [incoming("drum", { id: "kick", name: "Four on the floor" })],
      prelude: [],
    });
    expect(out.tracks[0]?.name).toBe("Four on the floor");
  });

  it("falls back to position + same kind when ids don't match", () => {
    const out = run(fixture(), {
      type: "code/replace",
      tracks: [incoming("drum", { id: "zzz1", pattern: "hh*8" }), incoming("chord", { id: "zzz2" }), incoming("chord", { id: "zzz3" })],
      prelude: [],
    });
    // 0: drum<->kick (same kind at same index), 1: chord vs bass (melodic) -> new, 2: chord<->keys
    expect(out.tracks.map((t) => t.id)).toEqual(["kick", "trk_1", "keys"]);
    expect(out.tracks[0]?.pattern).toBe("hh*8");
    expect(spans(out.tracks[0]?.clips ?? [])).toEqual([
      [9, 16],
      [21, 32],
    ]);
  });

  it("gives unmatched tracks fresh ids, the next unused colours and a full-song clip", () => {
    const out = run(fixture(), {
      type: "code/replace",
      tracks: [incoming("drum", { id: "kick" }), incoming("sample", { id: "new1" }), incoming("code", { id: "new2", color: "#123456" })],
      prelude: [],
    });
    expect(out.tracks.map((t) => t.id)).toEqual(["kick", "trk_1", "trk_2"]);
    // kick keeps green; the next free palette colours are teal then blue.
    expect(out.tracks.map((t) => t.color)).toEqual(["#7FD98A", "#5ECFC8", "#8AB4FF"]);
    expect(out.tracks[1]?.clips).toEqual([{ id: "clip_1", startBar: 1, endBar: 32 }]);
    expect(out.tracks[2]?.clips).toEqual([{ id: "clip_2", startBar: 1, endBar: 32 }]);
  });

  it("matches each existing track at most once", () => {
    const out = run(fixture(), {
      type: "code/replace",
      tracks: [incoming("drum", { id: "kick" }), incoming("drum", { id: "kick" })],
      prelude: [],
    });
    expect(out.tracks[0]?.id).toBe("kick");
    expect(out.tracks[1]?.id).not.toBe("kick");
    expect(new Set(out.tracks.map((t) => t.id)).size).toBe(2);
  });

  it("keeps the existing orbit unless the incoming code set one", () => {
    const p = run(fixture(), { type: "track/setOrbit", trackId: "kick", orbit: 4 });
    const kept = run(p, { type: "code/replace", tracks: [incoming("drum", { id: "kick", orbit: 1 })], prelude: [] });
    expect(kept.tracks[0]?.orbit).toBe(4);
    const set = run(p, { type: "code/replace", tracks: [incoming("drum", { id: "kick", orbit: 2 })], prelude: [] });
    expect(set.tracks[0]?.orbit).toBe(2);
  });

  it("applies tempo when given, leaves it alone otherwise", () => {
    const base: ProjectAction = { type: "code/replace", tracks: [], prelude: [] };
    expect(run(fixture(), { ...base, tempo: { bpm: 150, beatsPerBar: 4 } }).tempo).toEqual({ bpm: 150, beatsPerBar: 4 });
    expect(run(fixture(), base).tempo).toEqual({ bpm: 120, beatsPerBar: 4 });
  });

  it("drops the selection of a track that disappeared and keeps one that survived", () => {
    const sel = run(fixture(), { type: "ui/select", trackId: "bass" });
    const gone = run(sel, { type: "code/replace", tracks: [incoming("drum", { id: "kick" })], prelude: [] });
    expect(gone.ui.selectedTrack).toBeNull();
    const kept = run(sel, { type: "code/replace", tracks: [incoming("drum", { id: "kick" }), incoming("melodic", { id: "bass" })], prelude: [] });
    expect(kept.ui.selectedTrack).toBe("bass");
  });

  it("replaces everything with nothing", () => {
    const out = run(fixture(), { type: "code/replace", tracks: [], prelude: [] });
    expect(out.tracks).toEqual([]);
    expect(out.sections).toEqual(fixture().sections);
  });

  it("uses the palette when it runs out of unused colours", () => {
    const many = Array.from({ length: 9 }, (_, i) => incoming("melodic", { id: `n${i}` }));
    const out = run(createProject({ id: "empty", now: NOW }), { type: "code/replace", tracks: many, prelude: [] });
    expect(out.tracks.slice(0, 7).map((t) => t.color)).toEqual([...TRACK_COLORS]);
    expect(out.tracks.slice(7).map((t) => t.color)).toEqual([TRACK_COLORS[0], TRACK_COLORS[1]]);
  });
});

describe("code/replace with buses, master and length", () => {
  it("applies parsed buses, merges master and resizes the song", () => {
    const project = deepFreeze(createProject());
    const next = projectReducer(project, {
      type: "code/replace",
      tracks: [],
      prelude: [],
      buses: [{ orbit: 1, roomsize: 4 }],
      master: { postgain: 0.9 },
      lengthBars: 16,
    });
    expect(next.buses).toEqual([{ orbit: 1, roomsize: 4 }]);
    expect(next.master).toEqual({ ...project.master, postgain: 0.9 });
    expect(next.lengthBars).toBe(16);
  });
});
