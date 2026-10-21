import { describe, expect, it } from "vitest";
import { PARAM_ORDER, TRACK_COLORS } from "../types";
import type { Project, Track } from "../types";
import { anySolo, findTrack, isAudible } from "../selectors";
import { buildStarterProject, clampBpm, getStarter, STARTERS } from "./starters";
import type { StarterId } from "./starters";

const NOW = new Date("2026-10-21T12:00:00.000Z");
const IDS: StarterId[] = ["house", "lofi", "breaks", "stage", "ambient", "euclid", "blank"];

function build(id: StarterId, options: Parameters<typeof buildStarterProject>[1] = {}): Project {
  return buildStarterProject(id, { now: NOW, ...options });
}

/** Bars (1-based) in which at least one clip of the track covers the bar. */
function barsOf(track: Track): Set<number> {
  const bars = new Set<number>();
  for (const clip of track.clips) for (let b = clip.startBar; b <= clip.endBar; b++) bars.add(b);
  return bars;
}

function balanced(code: string): boolean {
  let depth = 0;
  for (const ch of code) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

describe("STARTERS", () => {
  it("lists the seven cards in order with the mockup tempo and key", () => {
    const summary = STARTERS.map((s) => [s.id, s.name, s.bpm, s.key]);
    expect(summary).toEqual([
      ["house", "House groove", 124, "A minor"],
      ["lofi", "Lo-fi keys", 82, "F major"],
      ["breaks", "Breakbeat", 170, "E minor"],
      ["stage", "16-bit stage", 150, "C minor"],
      ["ambient", "Ambient drift", 70, "C minor"],
      ["euclid", "Euclid rhythms", 110, "D dorian"],
      ["blank", "Blank project", 120, "C minor"],
    ]);
  });

  it("gives every card a one-line description and three colors", () => {
    for (const s of STARTERS) {
      expect(s.description.length).toBeGreaterThan(10);
      expect(s.description).not.toContain("\n");
      expect(s.colors).toHaveLength(3);
      for (const c of s.colors) expect(TRACK_COLORS as readonly string[]).toContain(c);
    }
  });

  it("previews are 3 rows of 16 steps taken from the mockup", () => {
    for (const s of STARTERS) {
      expect(s.preview).toHaveLength(3);
      for (const row of s.preview) expect(row).toHaveLength(16);
    }
    const asText = (id: string) => getStarter(id)?.preview.map((row) => row.map((on) => (on ? "x" : ".")).join(""));
    expect(asText("house")).toEqual(["x...x...x...x...", "....x.......x...", "xxxxxxxxxxxxxxxx"]);
    expect(asText("lofi")).toEqual(["x.....x...x.....", "....x.......x...", "x...x...x...x..."]);
    expect(asText("breaks")).toEqual(["x.....x...x.....", "....x.......x..x", "x.x.x.x.x.x.x.x."]);
    expect(asText("stage")).toEqual(["x.........x.....", "....x.......x...", "x.x.x.x.x.x.x.x."]);
    expect(asText("ambient")).toEqual(["x...............", "........x.......", "....x.......x..."]);
    expect(asText("euclid")).toEqual(["x..x..x.x..x..x.", "..x...x...x...x.", "x.xx.xx.x.xx.xx."]);
    expect(asText("blank")).toEqual(["................", "................", "................"]);
  });

  it("reports track counts that match the built project", () => {
    expect(STARTERS.map((s) => s.tracksLabel)).toEqual(["4 tracks", "3 tracks", "3 tracks", "4 tracks", "2 tracks", "3 tracks", "Empty"]);
    for (const s of STARTERS) expect(build(s.id).tracks).toHaveLength(s.trackCount);
  });

  it("finds starters by id", () => {
    expect(getStarter("lofi")?.name).toBe("Lo-fi keys");
    expect(getStarter("nope")).toBeUndefined();
  });
});

describe("buildStarterProject: a valid project for every starter", () => {
  it.each(IDS)("%s", (id) => {
    const p = build(id);
    expect(p.format).toBe("phyllo/1");
    expect(p.id.length).toBeGreaterThan(0);
    expect(p.name).toBe("Untitled Groove");
    expect(p.favorite).toBe(false);
    expect(p.created).toBe("2026-10-21T12:00:00.000Z");
    expect(p.modified).toBe(p.created);
    expect(p.tempo.beatsPerBar).toBe(4);
    expect(p.lengthBars).toBe(32);
    expect(p.prelude).toEqual([]);
    expect(p.master).toEqual({ postgain: 1, limiter: true });
    expect(p.buses.map((b) => b.orbit)).toEqual([1]);
    expect(p.ui.zoom).toBe(1);

    // sections tile the song with no gaps or overlaps
    let next = 1;
    for (const s of p.sections) {
      expect(s.startBar).toBe(next);
      expect(s.endBar).toBeGreaterThanOrEqual(s.startBar);
      next = s.endBar + 1;
    }
    expect(next).toBe(p.lengthBars + 1);
    expect(p.sections).toHaveLength(4);
    expect(new Set(p.sections.map((s) => s.id)).size).toBe(4);

    // loop sits inside one section
    expect(p.loop.enabled).toBe(true);
    const loopSection = p.sections.find((s) => s.startBar <= p.loop.startBar && p.loop.endBar <= s.endBar);
    expect(loopSection).toBeDefined();

    // selection points at a real track (or nothing for the blank project)
    if (p.tracks.length === 0) expect(p.ui.selectedTrack).toBeNull();
    else expect(findTrack(p, p.ui.selectedTrack)).toBeDefined();
  });

  it.each(IDS)("%s tracks are well-formed model data", (id) => {
    const p = build(id);
    expect(new Set(p.tracks.map((t) => t.id)).size).toBe(p.tracks.length);
    expect(new Set(p.tracks.map((t) => t.name)).size).toBe(p.tracks.length);
    for (const t of p.tracks) {
      expect(TRACK_COLORS as readonly string[]).toContain(t.color);
      expect(t.pattern.trim()).not.toBe("");
      expect(t.rawCode).toBeNull();
      expect(t.orbit).toBe(1);
      expect(t.mute).toBe(false);
      expect(t.solo).toBe(false);
      for (const key of Object.keys(t.params)) expect(PARAM_ORDER as readonly string[]).toContain(key);
      if (t.kind === "drum") {
        expect(t.source.type).toBe("s");
        expect(t.source.sound).toBeNull();
      }
      for (const m of t.modifiers) {
        expect(m.code.startsWith(".")).toBe(true);
        expect(balanced(m.code)).toBe(true);
        expect(m.enabled).toBe(true);
        expect(m.label).toBeTruthy();
      }
      for (const c of t.clips) {
        expect(c.startBar).toBeGreaterThanOrEqual(1);
        expect(c.endBar).toBeLessThanOrEqual(p.lengthBars);
        expect(c.endBar).toBeGreaterThanOrEqual(c.startBar);
      }
    }
  });

  it("uses the expected source mapping per track kind", () => {
    const house = build("house");
    const bass = house.tracks.find((t) => t.name === "Bass");
    expect(bass).toMatchObject({ kind: "melodic", source: { type: "note", sound: "sawtooth", bank: null }, pattern: "<a1 a1 c2 g1>*2", params: { lpf: 900 } });
    const kick = house.tracks.find((t) => t.name === "Kick");
    expect(kick).toMatchObject({ kind: "drum", source: { type: "s", sound: null, bank: "RolandTR909" }, pattern: "bd*4" });
    const keys = build("lofi").tracks.find((t) => t.name === "Keys");
    expect(keys).toMatchObject({ kind: "chord", source: { type: "chord", sound: "gm_epiano1", bank: null }, pattern: "<F^7 Em7 Dm7 C^7>", params: { room: 0.6 } });
  });

  it("maps mockup chains onto patterned params and modifiers", () => {
    const hats = build("house").tracks.find((t) => t.name === "Hats");
    expect(hats?.params.gain).toBe("[.4 .7]*4");
    const lofiHats = build("lofi").tracks.find((t) => t.name === "Hats");
    expect(lofiHats?.params.gain).toBe(0.3);
    expect(lofiHats?.modifiers.map((m) => m.code)).toEqual([".degradeBy(.3)"]);
    const bass = build("stage").tracks.find((t) => t.name === "Bass");
    expect(bass?.modifiers.map((m) => m.code).join("")).toBe(".fmi(3).fmh(2).decay(.15).sustain(0)");
    const pad = build("ambient").tracks.find((t) => t.name === "Pad");
    expect(pad?.modifiers.map((m) => m.code).join("")).toBe(".attack(2).release(4).slow(2)");
    expect(pad?.params.room).toBe(0.9);
    const lead = build("ambient").tracks.find((t) => t.name === "Lead");
    expect(lead?.params).toEqual({ gain: 0.3, delay: 0.6 });
    const euclid = build("euclid");
    expect(euclid.tracks.map((t) => t.pattern)).toEqual(["bd(3,8)", "cp(2,8,2)", "hh(5,8)"]);
    expect(euclid.tracks.every((t) => t.source.bank === "RolandTR808")).toBe(true);
  });
});

describe("buildStarterProject: arrangement", () => {
  const withTracks = IDS.filter((id) => id !== "blank");

  it.each(withTracks)("%s builds up and breaks down instead of playing everything everywhere", (id) => {
    const p = build(id);
    const tracks = p.tracks.map(barsOf);
    // every track sounds somewhere
    for (const bars of tracks) expect(bars.size).toBeGreaterThan(0);
    // not every track plays every bar
    for (let bar = 1; bar <= p.lengthBars; bar++) {
      const playing = tracks.filter((bars) => bars.has(bar)).length;
      expect(playing).toBeLessThanOrEqual(tracks.length);
    }
    const allEverywhere = tracks.every((bars) => bars.size === p.lengthBars);
    expect(allEverywhere).toBe(false);
    // the first bar is sparser than the last section, the last section is the fullest
    const countAt = (bar: number) => tracks.filter((bars) => bars.has(bar)).length;
    const last = p.sections[p.sections.length - 1];
    expect(last).toBeDefined();
    const fullest = Math.max(...Array.from({ length: p.lengthBars }, (_, i) => countAt(i + 1)));
    expect(countAt(last?.startBar ?? 1)).toBe(fullest);
    expect(countAt(1)).toBeLessThan(fullest);
  });

  it.each(withTracks)("%s never leaves bars silent and keeps clips from overlapping", (id) => {
    const p = build(id);
    for (const t of p.tracks) {
      const sorted = [...t.clips].sort((a, b) => a.startBar - b.startBar);
      sorted.forEach((c, i) => {
        const prev = sorted[i - 1];
        if (prev) expect(c.startBar).toBeGreaterThan(prev.endBar);
      });
    }
    const covered = new Set<number>();
    for (const t of p.tracks) for (const b of barsOf(t)) covered.add(b);
    expect(covered.size).toBe(p.lengthBars);
  });

  it.each(withTracks)("%s plays at least one track in the loop region", (id) => {
    const p = build(id);
    const playing = p.tracks.filter((t) => t.clips.some((c) => c.startBar <= p.loop.startBar && c.endBar >= p.loop.endBar));
    expect(playing.length).toBeGreaterThan(0);
    expect(p.tracks.every((t) => isAudible(t, p.tracks))).toBe(true);
    expect(anySolo(p.tracks)).toBe(false);
  });

  it("the blank project has sections but no tracks", () => {
    const p = build("blank");
    expect(p.tracks).toEqual([]);
    expect(p.sections.map((s) => s.name)).toEqual(["Intro", "Groove", "Break", "Drop"]);
    expect(p.loop).toEqual({ enabled: true, startBar: 1, endBar: 8 });
  });
});

describe("buildStarterProject: options", () => {
  it("overrides and clamps tempo", () => {
    expect(build("house", { bpm: 132 }).tempo.bpm).toBe(132);
    expect(build("house", { bpm: 10 }).tempo.bpm).toBe(40);
    expect(build("house", { bpm: 999 }).tempo.bpm).toBe(240);
    expect(build("house", { bpm: 127.6 }).tempo.bpm).toBe(128);
    expect(clampBpm(Number.NaN)).toBe(120);
  });

  it("transposes the bass when the key changes, leaving drums alone", () => {
    const p = build("house", { key: "C minor" });
    expect(p.key).toBe("C minor");
    expect(p.tracks.find((t) => t.name === "Bass")?.pattern).toBe("<c2 c2 eb2 bb1>*2");
    expect(p.tracks.find((t) => t.name === "Kick")?.pattern).toBe("bd*4");
    expect(p.tracks.find((t) => t.name === "Clap")?.pattern).toBe("~ cp");
  });

  it("transposes chords by their root and spells for the new key", () => {
    const inG = build("lofi", { key: "G major" });
    expect(inG.tracks.find((t) => t.name === "Keys")?.pattern).toBe("<G^7 F#m7 Em7 D^7>");
    const inEb = build("lofi", { key: "Eb major" });
    expect(inEb.tracks.find((t) => t.name === "Keys")?.pattern).toBe("<Eb^7 Dm7 Cm7 Bb^7>");
  });

  it("transposes every melodic track including leads", () => {
    const p = build("stage", { key: "D minor" });
    expect(p.tracks.find((t) => t.name === "Lead")?.pattern).toBe("d5 f5 a5 [c6 a5] g5 ~ f5 e5");
    expect(p.tracks.find((t) => t.name === "Bass")?.pattern).toBe("<[d2 d3]*4 [bb1 bb2]*4 [c2 c3]*4 [a1 a2]*4>");
  });

  it("changes nothing when the key is the starter's own", () => {
    const same = build("house", { key: "A minor" });
    const plain = build("house");
    expect(same.tracks).toEqual(plain.tracks);
  });

  it("does not touch the starter definitions when transposing", () => {
    build("house", { key: "F# minor" });
    expect(build("house").tracks.find((t) => t.name === "Bass")?.pattern).toBe("<a1 a1 c2 g1>*2");
  });

  it("uses the supplied id factory for every id", () => {
    let n = 0;
    const calls: string[] = [];
    const p = build("lofi", {
      newId: (kind) => {
        calls.push(kind);
        return `${kind}-${++n}`;
      },
    });
    expect(p.id).toMatch(/^project-/);
    expect(p.tracks.map((t) => t.id).every((id) => id.startsWith("track-"))).toBe(true);
    expect(p.sections.map((s) => s.id).every((id) => id.startsWith("section-"))).toBe(true);
    expect(new Set(calls)).toEqual(new Set(["project", "track", "modifier", "clip", "section"]));
    const ids = [p.id, ...p.sections.map((s) => s.id), ...p.tracks.flatMap((t) => [t.id, ...t.modifiers.map((m) => m.id), ...t.clips.map((c) => c.id)])];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps readable, unique ids by default", () => {
    const p = build("house");
    expect(p.tracks.map((t) => t.id)).toEqual(["kick", "clap", "hats", "bass"]);
    expect(p.tracks[0]?.clips[0]?.id).toBe("kick-clip-1");
    expect(p.sections.map((s) => s.id)).toEqual(["intro", "groove", "break", "drop"]);
    expect(build("house").id).not.toBe(build("house").id);
  });

  it("applies a custom name and timestamp", () => {
    const p = buildStarterProject("euclid", { name: "Euclid study", now: "2026-01-02T03:04:05.000Z" });
    expect(p.name).toBe("Euclid study");
    expect(p.created).toBe("2026-01-02T03:04:05.000Z");
    expect(p.tags).toEqual(["euclid"]);
  });

  it("throws on unknown starters", () => {
    expect(() => buildStarterProject("nope")).toThrow(/Unknown starter/);
  });

  it("survives a JSON round trip unchanged", () => {
    for (const id of IDS) {
      const p = build(id);
      expect(JSON.parse(JSON.stringify(p)) as Project).toEqual(p);
    }
  });

  it("returns fresh objects on every call", () => {
    const a = build("house");
    const b = build("house");
    a.tracks[0]?.clips.push({ id: "x", startBar: 1, endBar: 1 });
    expect(b.tracks[0]?.clips).toHaveLength(2);
  });
});
