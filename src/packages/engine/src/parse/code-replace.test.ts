// Code drawer / import path end to end: generate → (edit) → parse → `code/replace` → generate.
// Regression tests for the T1.V defects #2–#7, #13–#17.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Project, Track } from "@phyllo/model";
import { buildStarterProject, createProject, createSequentialIdGenerator, createTrack, projectReducer, setIdGenerator } from "@phyllo/model";
import { generate } from "../codegen/generate";
import { parse } from "./parse";

const song = (p: Project) => generate(p, { scope: "song" });

function replace(base: Project, code: string): Project {
  const r = parse(code, { inferBuses: true });
  if (!r.ok) throw new Error(r.error?.message);
  return projectReducer(base, {
    type: "code/replace",
    tracks: r.tracks,
    prelude: r.prelude,
    ...(r.tempo ? { tempo: r.tempo } : {}),
    ...(r.buses ? { buses: r.buses } : {}),
    ...(r.master ? { master: r.master } : {}),
    ...(r.lengthBars !== undefined ? { lengthBars: r.lengthBars } : {}),
  });
}

const spans = (t: Track | undefined) => (t?.clips ?? []).map((c) => [c.startBar, c.endBar]);
const identity = (t: Track) => [t.id, t.name, t.color, JSON.stringify(spans(t))];

beforeEach(() => setIdGenerator(createSequentialIdGenerator()));
afterEach(() => setIdGenerator(null));

describe("code → code/replace", () => {
  it("should keep ids, names, colours, clips and solo of tracks when a drawer edit changes one pattern", () => {
    // Arrange
    const house = buildStarterProject("house");
    const p = { ...house, tracks: house.tracks.map((t, i) => (i === 1 ? { ...t, solo: true } : t)) };
    const edited = song(p).code.replaceAll('"~ cp"', '"~ cp ~ [cp cp]"');

    // Act
    const next = replace(p, edited);

    // Assert
    expect(next.tracks.map(identity)).toEqual(p.tracks.map(identity));
    expect(next.tracks[1]?.pattern).toBe("~ cp ~ [cp cp]");
    expect(next.tracks.map((t) => [t.mute, t.solo])).toEqual(p.tracks.map((t) => [t.mute, t.solo]));
  });

  it("should take the arrangement from arrange() when importing into a fresh project (#2)", () => {
    // Arrange
    const code = song(buildStarterProject("house")).code;

    // Act
    const fresh = replace(createProject(), code);

    // Assert
    expect(spans(fresh.tracks[0])).toEqual([
      [5, 16],
      [21, 32],
    ]);
    expect(song(fresh).code).toBe(code);
  });

  it("should give unlabelled imported blocks default names and keep existing names on edits (#3)", () => {
    // Arrange
    const house = buildStarterProject("house");
    const code = song(house).code;

    // Act
    const fresh = replace(createProject(), code);
    const edited = replace(house, code);

    // Assert
    expect(fresh.tracks.map((t) => t.name)).toEqual(["Drums", "Drums 2", "Drums 3", "Melody"]);
    expect(edited.tracks.map((t) => t.name)).toEqual(house.tracks.map((t) => t.name));
  });

  it("should keep the identities of the remaining tracks when the first of two same-kind blocks is deleted (#4)", () => {
    // Arrange
    const p = buildStarterProject("house");
    const g = song(p);
    const kick = g.lines[p.tracks[0]?.id ?? ""];
    if (!kick) throw new Error("no kick block");
    const lines = g.code.split("\n");
    const edited = [...lines.slice(0, kick.start - 1), ...lines.slice(kick.end)].join("\n");

    // Act
    const next = replace(p, edited);

    // Assert
    expect(next.tracks.map(identity)).toEqual(p.tracks.slice(1).map(identity));
  });

  it("should keep a track's id, colour and arrangement when its kind changes in the code (#5)", () => {
    // Arrange
    const p = buildStarterProject("house");
    const edited = song(p).code.replace(/s\("~ cp"\)\.bank\("RolandTR909"\)/g, 'note("~ c4").s("square")');

    // Act
    const next = replace(p, edited);

    // Assert
    expect(next.tracks[1]?.kind).toBe("melodic");
    expect(identity(next.tracks[1] as Track)).toEqual(identity(p.tracks[1] as Track));
  });

  it.each([
    ["setcpm(120)", 120],
    ["setcpm(30)", 30],
    ["setcpm(33.3)", 33.3],
    ["setcps(1.25)", 75],
  ])("should keep the cycles per minute of %s through code/replace and codegen (#6)", (stmt, cpm) => {
    // Act
    const next = replace(createProject(), `${stmt}\n$: s("bd")`);
    const first = song(next).code.split("\n")[0] ?? "";
    const [bpm, beats] = /^setcpm\(([\d.]+)\/(\d+)\)$/.exec(first)?.slice(1).map(Number) ?? [];

    // Assert
    expect((bpm ?? 0) / (beats ?? 1)).toBeCloseTo(cpm, 9);
  });

  it("should not nest arrange() when a silent code track with partial clips round-trips (#7)", () => {
    // Arrange
    const t: Track = { ...createTrack("code", { lengthBars: 8 }), id: "c", clips: [{ id: "x", startBar: 3, endBar: 4 }] };
    let p: Project = { ...createProject({ lengthBars: 8 }), tracks: [t] };
    const g1 = song(p).code;

    // Act
    for (let i = 0; i < 3; i++) p = replace(p, song(p).code);

    // Assert
    expect(song(p).code).toBe(g1);
  });

  it("should not invent a full clip for a muted, clip-less block matched to an existing track", () => {
    // Arrange
    const house = buildStarterProject("house");
    const p = projectReducer(house, { type: "track/update", trackId: house.tracks[3]?.id ?? "", patch: { clips: [] } });

    // Act
    const next = replace(p, song(p).code);

    // Assert
    expect(next.tracks[3]?.clips).toEqual([]);
    expect(next.tracks[3]?.mute).toBe(false);
    expect(song(next).code).toBe(song(p).code);
  });

  it("should keep a user's .analyze() call through the round trip (#14)", () => {
    // Arrange
    const code = 'setcpm(120/4)\n\n$: s("bd*4").analyze("kick")';

    // Act
    const next = replace(createProject(), code);

    // Assert
    expect(song(next).code).toBe(code);
  });

  it("should regenerate blocks above a top-level hush() as muted, without the hush() call (#15)", () => {
    // Act
    const next = replace(createProject(), 'setcpm(120/4)\n$: s("bd*4")\nhush()\n$: s("hh*8")');

    // Assert
    expect(song(next).code).toBe('setcpm(120/4)\n\n_$: s("bd*4")\n$: s("hh*8")');
  });

  it("should keep a program without tracks a fixed point through its silence body (#16)", () => {
    // Arrange
    const p = { ...createProject(), prelude: ["const lead = 'c4'"] };
    const code = song(p).code;

    // Act
    const next = replace(p, code);

    // Assert
    expect(code).toBe("setcpm(120/4)\nconst lead = 'c4'\n\nsilence");
    expect(next.tracks).toEqual([]);
    expect(song(next).code).toBe(code);
  });

  it("should change the code when a sample or s-type melodic track's sound changes (#17)", () => {
    // Arrange
    const mel = createTrack("melodic", { id: "a", source: { type: "s", sound: "sawtooth" }, pattern: "sawtooth" });
    const smp = createTrack("sample", { id: "b", source: { sound: "vox" }, pattern: "vox*2" });
    const p = { ...createProject(), tracks: [mel, smp] };

    // Act
    const next = [
      { type: "track/setSource", trackId: "a", source: { sound: "square" } },
      { type: "track/setSource", trackId: "b", source: { sound: "breaks" } },
    ].reduce((acc, a) => projectReducer(acc, a as Parameters<typeof projectReducer>[1]), p);

    // Assert
    expect(song(next).code.split("\n").slice(2)).toEqual(['$: s("square")', '$: s("breaks*2")']);
  });

  it("should reach a fixed point on the second iteration although static param modifiers are absorbed (#13)", () => {
    // Arrange: `.gain(.5)` typed as a modifier becomes the gain knob, moving behind `.sometimes(...)`.
    const t = createTrack("drum", { id: "a", pattern: "bd*4", modifiers: [{ id: "m", code: ".gain(.5)", enabled: true }, { id: "n", code: ".sometimes(x => x.ply(2))", enabled: true }] });
    const p = { ...createProject(), tracks: [t] };
    const g1 = song(p).code;

    // Act
    const p2 = replace(p, g1);
    const g2 = song(p2).code;
    const g3 = song(replace(p2, g2)).code;

    // Assert
    expect(g2).not.toBe(g1);
    expect(g3).toBe(g2);
  });
});
