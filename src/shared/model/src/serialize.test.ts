import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClip, createModifier, createProject, createSection, createTrack } from "./factories";
import { createSequentialIdGenerator, setIdGenerator } from "./ids";
import { migrate, parseProjectFile, serializeProject } from "./serialize";
import type { Project } from "./types";

const NOW = "2026-10-21T12:00:00.000Z";

function sampleProject(): Project {
  const kick = createTrack("drum", {
    id: "kick",
    name: "Kick",
    color: "#7FD98A",
    pattern: "bd*4",
    params: { shape: 0.15, gain: 0.82 }, // deliberately out of canonical order
    clips: [createClip(9, 16, "k1"), createClip(21, 32, "k2")],
  });
  const bass = createTrack("melodic", {
    id: "bass",
    name: "Bass",
    color: "#F5C25B",
    pattern: "<c2 eb2 g2 bb1>*2",
    params: { lpq: 10, shape: 0.3, room: 0.2, pan: 0.42, lpf: "sine.range(400, 1400)" },
    modifiers: [
      createModifier(".lpf(sine.range(400, 1400).slow(8))", { id: "m1", label: "Filter sweep", origin: "suggestion" }),
      createModifier(".sometimes(x => x.ply(2))", { id: "m2", enabled: false }),
    ],
    orbit: 2,
    clips: [createClip(9, 16, "b1")],
  });
  const code = createTrack("code", { id: "weird", name: "Weird", color: "#FF9C7A", rawCode: 's("bd").fast(2)', mute: true });
  return {
    ...createProject({
      id: "proj-1",
      name: "Late Night",
      tags: ["house", "sketch"],
      favorite: true,
      now: NOW,
      tracks: [kick, bass, code],
      sections: [createSection("Intro", 1, 8, "intro"), createSection("Groove", 9, 16, "groove")],
    }),
    buses: [{ orbit: 1, roomsize: 2, delaytime: 0.125, delayfeedback: 0.4 }],
    master: { postgain: 0.9, limiter: false },
    prelude: ["samples('github:tidalcycles/dirt-samples')"],
    ui: { selectedTrack: "bass", zoom: 1.5 },
  };
}

function parseOk(text: string): { project: Project; warnings: string[] } {
  const result = parseProjectFile(text);
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result;
}

beforeEach(() => {
  setIdGenerator(createSequentialIdGenerator());
});
afterEach(() => {
  setIdGenerator(null);
});

describe("serializeProject", () => {
  it("writes 2-space JSON with a trailing newline", () => {
    const text = serializeProject(createProject({ now: NOW }));
    expect(text.endsWith("}\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
    expect(text.split("\n")[1]).toBe('  "format": "phyllo/1",');
  });

  it("uses a stable key order regardless of object construction order", () => {
    const p = sampleProject();
    const shuffled = JSON.parse(JSON.stringify(p)) as Record<string, unknown>;
    const reversed = Object.fromEntries(Object.entries(shuffled).reverse()) as unknown as Project;
    expect(serializeProject(reversed)).toBe(serializeProject(p));
    const keys = Object.keys(JSON.parse(serializeProject(p)) as object);
    expect(keys).toEqual([
      "format", "id", "name", "tags", "favorite", "created", "modified", "tempo", "key", "lengthBars",
      "loop", "sections", "tracks", "buses", "master", "prelude", "ui",
    ]);
  });

  it("orders track keys and params canonically", () => {
    const json = JSON.parse(serializeProject(sampleProject())) as { tracks: Record<string, unknown>[] };
    const kick = json.tracks[0] as Record<string, unknown>;
    expect(Object.keys(kick)).toEqual([
      "id", "name", "color", "kind", "source", "pattern", "params", "modifiers", "orbit", "mute", "solo", "clips", "rawCode",
    ]);
    expect(Object.keys(kick.params as object)).toEqual(["gain", "shape"]);
    const bass = json.tracks[1] as { params: object; modifiers: object[] };
    expect(Object.keys(bass.params)).toEqual(["pan", "lpf", "lpq", "shape", "room"]);
    expect(Object.keys(bass.modifiers[0] as object)).toEqual(["id", "code", "label", "enabled", "origin"]);
    expect(Object.keys(bass.modifiers[1] as object)).toEqual(["id", "code", "enabled"]);
  });

  it("does not include fields the model doesn't own", () => {
    const p = { ...sampleProject(), extra: 1 } as Project;
    expect(serializeProject(p)).not.toContain("extra");
  });
});

describe("serialize -> parse round trip", () => {
  it("restores an identical project with no warnings", () => {
    const p = sampleProject();
    const { project, warnings } = parseOk(serializeProject(p));
    expect(project).toEqual(p);
    expect(warnings).toEqual([]);
  });

  it("is byte-stable (serialize(parse(serialize(p))) === serialize(p))", () => {
    const text = serializeProject(sampleProject());
    expect(serializeProject(parseOk(text).project)).toBe(text);
  });

  it("round-trips a blank project", () => {
    const p = createProject({ now: NOW });
    expect(parseOk(serializeProject(p)).project).toEqual(p);
  });

  it("round-trips non-ASCII names and code", () => {
    const p = { ...sampleProject(), name: "Café — 夜" };
    expect(parseOk(serializeProject(p)).project.name).toBe("Café — 夜");
  });

  it("accepts a leading BOM", () => {
    const bom = String.fromCharCode(0xfeff);
    expect(parseOk(`${bom}${serializeProject(sampleProject())}`).project.name).toBe("Late Night");
  });
});

describe("parseProjectFile: hard errors", () => {
  it.each([
    ["not JSON", "{nope", /not valid json/i],
    ["an array", "[]", /json object/i],
    ["null", "null", /json object/i],
    ["a number", "42", /json object/i],
    ["a missing format", "{}", /format/i],
    ["a non-string format", '{"format": 1}', /format/i],
    ["a wrong format", '{"format": "strudel/1"}', /unsupported format/i],
    ["a malformed version", '{"format": "phyllo/one"}', /unsupported format/i],
    ["a newer version", '{"format": "phyllo/2"}', /newer phyllo/i],
    ["non-array tracks", '{"format": "phyllo/1", "tracks": {}}', /tracks/i],
  ])("rejects %s", (_name, text, message) => {
    const result = parseProjectFile(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(message);
  });
});

describe("parseProjectFile: defaults and coercion", () => {
  it("fills every optional field of a minimal file", () => {
    const { project, warnings } = parseOk('{"format": "phyllo/1", "id": "x", "created": "2026-10-21T12:00:00Z"}');
    expect(project).toEqual({
      format: "phyllo/1",
      id: "x",
      name: "Untitled Groove",
      tags: [],
      favorite: false,
      created: "2026-10-21T12:00:00Z",
      modified: "2026-10-21T12:00:00Z",
      tempo: { bpm: 120, beatsPerBar: 4 },
      key: "C minor",
      lengthBars: 32,
      loop: { enabled: true, startBar: 1, endBar: 8 },
      sections: [{ id: "song", name: "Song", startBar: 1, endBar: 32 }],
      tracks: [],
      buses: [],
      master: { postgain: 1, limiter: true },
      prelude: [],
      ui: { selectedTrack: null, zoom: 1 },
    });
    expect(warnings).toEqual([]);
  });

  it("loads the SPEC §3 example: clips without ids get stable derived ids", () => {
    const spec = `{
      "format": "phyllo/1", "id": "uuid", "name": "Untitled Groove", "tags": ["house", "sketch"], "favorite": false,
      "created": "2026-10-21T12:00:00Z", "modified": "2026-10-21T12:41:00Z",
      "tempo": { "bpm": 120, "beatsPerBar": 4 }, "key": "C minor", "lengthBars": 32,
      "loop": { "enabled": true, "startBar": 9, "endBar": 16 },
      "sections": [
        { "id": "intro", "name": "Intro", "startBar": 1, "endBar": 8 },
        { "id": "groove", "name": "Groove", "startBar": 9, "endBar": 16 }
      ],
      "tracks": [{
        "id": "bass", "name": "Bass", "color": "#F5C25B", "kind": "melodic",
        "source": { "type": "note", "sound": "sawtooth", "bank": null },
        "pattern": "<c2 eb2 g2 bb1>*2",
        "params": { "gain": 0.78, "lpq": 10, "shape": 0.3, "room": 0.2, "pan": 0.5 },
        "modifiers": [
          { "code": ".lpf(sine.range(400, 1400).slow(8))", "label": "Filter sweep", "enabled": true },
          { "code": ".sometimes(x => x.ply(2))", "enabled": true }
        ],
        "orbit": 1, "mute": false, "solo": false,
        "clips": [ { "startBar": 9, "endBar": 16 }, { "startBar": 21, "endBar": 32 } ],
        "rawCode": null
      }],
      "buses": [ { "orbit": 1, "roomsize": 2, "delaytime": 0.125, "delayfeedback": 0.4 } ],
      "master": { "postgain": 0.9, "limiter": true },
      "ui": { "selectedTrack": "bass", "zoom": 1 }
    }`;
    const { project, warnings } = parseOk(spec);
    expect(warnings).toEqual([]);
    const bass = project.tracks[0];
    expect(bass?.clips).toEqual([
      { id: "bass:c1", startBar: 9, endBar: 16 },
      { id: "bass:c2", startBar: 21, endBar: 32 },
    ]);
    expect(bass?.modifiers.map((m) => m.id)).toEqual(["bass:m1", "bass:m2"]);
    expect(bass?.params).toEqual({ gain: 0.78, pan: 0.5, lpq: 10, shape: 0.3, room: 0.2 });
    expect(project.loop).toEqual({ enabled: true, startBar: 9, endBar: 16 });
    expect(project.prelude).toEqual([]);
    expect(project.ui.selectedTrack).toBe("bass");
  });

  it("gives a track without clips a full-song clip, and a track without a source its kind default", () => {
    const { project } = parseOk(
      JSON.stringify({ format: "phyllo/1", id: "x", lengthBars: 16, tracks: [{ id: "d", kind: "drum", color: "#7FD98A", pattern: "bd" }] }),
    );
    const d = project.tracks[0];
    expect(d?.clips).toEqual([{ id: "d:c1", startBar: 1, endBar: 16 }]);
    expect(d?.source).toEqual({ type: "s", sound: null, bank: "RolandTR909" });
    expect(d?.name).toBe("Drums");
    expect(d).toMatchObject({ orbit: 1, mute: false, solo: false, modifiers: [], params: {}, rawCode: null });
  });

  it("infers lengthBars from content when missing", () => {
    const { project } = parseOk(
      JSON.stringify({ format: "phyllo/1", id: "x", tracks: [{ id: "d", kind: "drum", color: "#7FD98A", clips: [{ startBar: 1, endBar: 12 }] }] }),
    );
    expect(project.lengthBars).toBe(12);
  });

  it("generates an id when missing and warns", () => {
    const { project, warnings } = parseOk('{"format": "phyllo/1"}');
    expect(project.id).toBe("prj_1");
    expect(warnings).toEqual(["Missing project id; generated a new one."]);
  });

  it("coerces bad values and reports each one", () => {
    const { project, warnings } = parseOk(
      JSON.stringify({
        format: "phyllo/1",
        id: "x",
        lengthBars: 16,
        tempo: { bpm: "fast", beatsPerBar: 4 },
        mystery: true,
        loop: { enabled: true, startBar: 12, endBar: 3 },
        sections: [{ id: "a", name: "A", startBar: 1, endBar: 12 }, { id: "b", name: "B", startBar: 8, endBar: 40 }, "junk"],
        buses: [{ orbit: 1 }, { orbit: 1 }, {}],
        prelude: ["ok", 3],
        tracks: [
          "junk",
          { id: "t0", kind: "banana", color: "#7FD98A" },
          {
            id: "t1",
            kind: "melodic",
            color: "red",
            params: { gain: 0.5, cutoff: 800, size: 3, mystery: 1, pan: true, room: null, delay: "" },
            modifiers: [{ code: ".rev()" }, { label: "no code" }],
            orbit: 400,
            clips: [{ startBar: 10, endBar: 30 }, { startBar: 1, endBar: 12 }, { startBar: 5 }],
          },
        ],
        ui: { selectedTrack: "ghost", zoom: -3 },
      }),
    );
    expect(project.tempo.bpm).toBe(120);
    expect(project.loop).toEqual({ enabled: true, startBar: 3, endBar: 12 });
    expect(project.sections.map((s) => [s.id, s.startBar, s.endBar])).toEqual([["a", 1, 12], ["b", 13, 16]]);
    expect(project.buses).toEqual([{ orbit: 1 }]);
    expect(project.prelude).toEqual(["ok"]);
    expect(project.ui).toEqual({ selectedTrack: null, zoom: 1 });
    expect(project.tracks).toHaveLength(1);
    const t = project.tracks[0];
    expect(t?.id).toBe("t1");
    expect(t?.color).toBe("#7FD98A"); // invalid colour replaced by the next palette colour
    expect(t?.params).toEqual({ gain: 0.5, lpf: 800, roomsize: 3 }); // aliases canonicalised, junk dropped
    expect(t?.modifiers).toEqual([{ id: "t1:m1", code: ".rev()", enabled: true }]);
    expect(t?.orbit).toBe(99);
    expect(t?.clips.map((c) => [c.startBar, c.endBar])).toEqual([[1, 12], [13, 16]]);
    expect(warnings).toEqual(
      expect.arrayContaining([
        'Ignored unknown field "mystery".',
        "Invalid tempo.bpm; using 120.",
        "Adjusted sections (clamped to the song, sorted, overlaps trimmed).",
        "Dropped invalid section #3.",
        "Dropped invalid bus #3.",
        "Dropped duplicate bus for orbit 1.",
        'Dropped non-string entries from "prelude".',
        "Dropped track #1: not an object.",
        'Dropped track #2: unknown kind "banana".',
        "track #3: missing or invalid color; picked one.",
        'track #3: dropped unknown param "mystery".',
        'track #3: dropped invalid value for param "pan".',
        "track #3: dropped invalid modifier #2.",
      ]),
    );
    expect(warnings.some((w) => w.startsWith("track #3: adjusted clips"))).toBe(true);
  });

  it("renames duplicate track ids and treats unknown kinds with rawCode as code tracks", () => {
    const { project, warnings } = parseOk(
      JSON.stringify({
        format: "phyllo/1",
        id: "x",
        tracks: [
          { id: "a", kind: "drum", color: "#7FD98A" },
          { id: "a", kind: "wat", rawCode: "silence", color: "#5ECFC8" },
        ],
      }),
    );
    expect(project.tracks.map((t) => [t.id, t.kind])).toEqual([["a", "drum"], ["a-2", "code"]]);
    expect(project.tracks[1]?.rawCode).toBe("silence");
    expect(warnings).toEqual(expect.arrayContaining(['track #2: duplicate id "a"; renamed.', "track #2: unknown kind; treated as a code track."]));
  });

  it("falls back to silence for a code track with no rawCode and drops rawCode on other kinds", () => {
    const { project } = parseOk(
      JSON.stringify({
        format: "phyllo/1",
        id: "x",
        tracks: [
          { id: "c", kind: "code", color: "#7FD98A" },
          { id: "d", kind: "drum", color: "#5ECFC8", rawCode: "oops" },
        ],
      }),
    );
    expect(project.tracks.map((t) => t.rawCode)).toEqual(["silence", null]);
  });

  it("keeps patterned param values as strings", () => {
    const { project } = parseOk(
      JSON.stringify({ format: "phyllo/1", id: "x", tracks: [{ id: "h", kind: "drum", color: "#8AB4FF", params: { gain: "[.45 .7]*4" } }] }),
    );
    expect(project.tracks[0]?.params).toEqual({ gain: "[.45 .7]*4" });
  });
});

describe("migrate", () => {
  it("passes the current format through", () => {
    const result = migrate({ format: "phyllo/1", a: 1 });
    expect(result).toEqual({ ok: true, raw: { format: "phyllo/1", a: 1 } });
  });

  it("walks registered migrations in order up to the target version", () => {
    const seen: number[] = [];
    const result = migrate(
      { format: "phyllo/1", legacyName: "Old" },
      {
        1: (raw) => {
          seen.push(1);
          const { legacyName, ...rest } = raw;
          return { ...rest, name: legacyName };
        },
        2: (raw) => {
          seen.push(2);
          return { ...raw, key: "A minor" };
        },
      },
      3,
    );
    expect(result).toEqual({ ok: true, raw: { format: "phyllo/3", name: "Old", key: "A minor" } });
    expect(seen).toEqual([1, 2]);
  });

  it("fails clearly when a step is missing or the file is newer", () => {
    const missing = migrate({ format: "phyllo/1" }, {}, 2);
    expect(missing).toEqual({ ok: false, error: 'No migration from format "phyllo/1".' });
    const newer = migrate({ format: "phyllo/9" });
    expect(newer.ok).toBe(false);
  });
});
