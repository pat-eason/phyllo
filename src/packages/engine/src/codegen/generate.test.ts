import { describe, expect, it } from "vitest";
import { transpiler } from "@strudel/transpiler";
import type { Track } from "@phyllo/model";
import { generate } from "./generate";
import { arrangeDemo, project, specExample, track } from "./fixtures.test-util";

const c = (startBar: number, endBar: number, id = `c${startBar}-${endBar}`) => ({ id, startBar, endBar });
const song = (tracks: Track[], extra: Parameters<typeof project>[0] = {}) => generate(project({ tracks, ...extra }), { scope: "song" }).code;
const body = (code: string) => code.split("\n").slice(2).join("\n");

describe("generate", () => {
  it("should reproduce the SPEC §4.1 example program", () => {
    // Arrange
    const p = specExample();

    // Act
    const { code, lines } = generate(p, { scope: "song" });

    // Assert
    expect(code).toBe(
      [
        "setcpm(120/4)",
        "",
        '$: s("bd*4").bank("RolandTR909").gain(.82).shape(.15)',
        '$: note("<c2 eb2 g2 bb1>*2").s("sawtooth")',
        "     .lpf(sine.range(400, 1400).slow(8)).lpq(10).shape(.3).room(.2)",
        '$: chord("<Cm7 Fm7 Ab^7 G7>").voicing().s("gm_epiano1").room(.5).delay(.15)',
      ].join("\n"),
    );
    expect(lines).toEqual({ kick: { start: 3, end: 3 }, bass: { start: 4, end: 5 }, keys: { start: 6, end: 6 } });
  });

  it("should emit params in canonical order regardless of insertion order", () => {
    // Arrange
    const t = track({
      id: "t",
      params: { delayfeedback: 0.3, delaytime: 0.25, delay: 0.4, roomsize: 4, room: 0.3, shape: 0.2, hpf: 200, lpq: 5, lpf: 1600, pan: 0.3, gain: 0.9 },
    });

    // Act
    const code = song([t]);

    // Assert
    expect(body(code)).toBe(
      '$: s("bd*4")\n     .gain(.9).pan(.3).lpf(1600).lpq(5).hpf(200).shape(.2).room(.3).roomsize(4)\n     .delay(.4).delaytime(.25).delayfeedback(.3)',
    );
  });

  it.each([
    ["gain .8", { gain: 0.8 }],
    ["pan .5", { pan: 0.5 }],
    ["shape 0", { shape: 0 }],
    ["room 0", { room: 0 }],
    ["delay 0", { delay: 0 }],
  ])("should omit %s because it is Strudel's default", (_label, params) => {
    // Arrange
    const t = track({ id: "t", params });

    // Act
    const code = song([t]);

    // Assert
    expect(body(code)).toBe('$: s("bd*4")');
  });

  it("should keep params that differ from the default and those without a default", () => {
    // Arrange
    const t = track({ id: "t", params: { gain: 0, lpq: 0, pan: 0 } });

    // Act / Assert
    expect(body(song([t]))).toBe('$: s("bd*4").gain(0).pan(0).lpq(0)');
  });

  it.each([
    ["lpf", ".lpf(sine.range(400, 1400).slow(8))", { lpf: 900, lpq: 10 }, ".lpf(sine.range(400, 1400).slow(8)).lpq(10)"],
    ["cutoff alias", ".cutoff(perlin.range(300, 900))", { lpf: 900, lpq: 10 }, ".cutoff(perlin.range(300, 900)).lpq(10)"],
    ["nested gain", ".sometimes(x => x.gain(1.2))", { gain: 0.5, pan: 0.2 }, ".sometimes(x => x.gain(1.2)).pan(.2)"],
    ["jux pan", ".jux(rev)", { pan: 0.2, room: 0.3 }, ".jux(rev).room(.3)"],
    ["room colon", '.room(".4:6")', { room: 0.2, roomsize: 2, shape: 0.1 }, '.room(".4:6").shape(.1)'],
  ])("should skip the static value of a param modulated via %s", (_label, code, params, expected) => {
    // Arrange
    const t = track({ id: "t", params, modifiers: [{ id: "m", code, enabled: true }] });

    // Act / Assert
    expect(body(song([t]))).toBe(`$: s("bd*4")${expected}`);
  });

  it("should ignore disabled modifiers for both emission and modulation", () => {
    // Arrange
    const t = track({ id: "t", params: { lpf: 800 }, modifiers: [{ id: "m", code: ".lpf(sine.range(1, 2))", enabled: false }] });

    // Act / Assert
    expect(body(song([t]))).toBe('$: s("bd*4").lpf(800)');
  });

  it("should emit enabled modifiers verbatim in list order before params", () => {
    // Arrange
    const t = track({
      id: "t",
      params: { gain: 0.5 },
      modifiers: [
        { id: "a", code: ".swingBy(1/6, 4)", enabled: true },
        { id: "b", code: "  .lastOf(4, rev)  ", enabled: true },
        { id: "c", code: "ply(2)", enabled: true },
      ],
    });

    // Act / Assert
    expect(body(song([t]))).toBe('$: s("bd*4").swingBy(1/6, 4).lastOf(4, rev).ply(2).gain(.5)');
  });

  it("should write each source kind as SPEC §4.1 describes", () => {
    // Arrange
    const tracks = [
      track({ id: "d1", source: { type: "s", sound: null, bank: "RolandTR808" }, pattern: "bd(3,8)" }),
      track({ id: "d2", pattern: "hh*8" }),
      track({ id: "m1", kind: "melodic", source: { type: "note", sound: "sawtooth", bank: null }, pattern: "c2 eb2" }),
      track({ id: "m2", kind: "melodic", source: { type: "n", sound: "gm_marimba", bank: null }, pattern: "0 2 4" }),
      track({ id: "m3", kind: "melodic", source: { type: "note", sound: null, bank: null }, pattern: "c4" }),
      track({ id: "m4", kind: "melodic", source: { type: "s", sound: "supersaw", bank: null }, pattern: "supersaw" }),
      track({ id: "ch", kind: "chord", source: { type: "chord", sound: "gm_epiano1", bank: null }, pattern: "<Cm7 Fm7>" }),
      track({ id: "sa", kind: "sample", source: { type: "s", sound: "vox", bank: null }, pattern: "", modifiers: [{ id: "x", code: ".chop(8)", enabled: true }] }),
      track({ id: "co", kind: "code", pattern: "", rawCode: 'stack(s("bd"), s("hh*2"))' }),
    ];

    // Act / Assert
    expect(body(song(tracks))).toBe(
      [
        '$: s("bd(3,8)").bank("RolandTR808")',
        '$: s("hh*8")',
        '$: note("c2 eb2").s("sawtooth")',
        '$: n("0 2 4").s("gm_marimba")',
        '$: note("c4")',
        '$: s("supersaw")',
        '$: chord("<Cm7 Fm7>").voicing().s("gm_epiano1")',
        '$: s("vox").chop(8)',
        '$: stack(s("bd"), s("hh*2"))',
      ].join("\n"),
    );
  });

  it("should keep multi-line code tracks verbatim and count their lines", () => {
    // Arrange
    const raw = 'stack(\n  s("bd*2"),\n  s("hh*4")\n)';
    const p = project({ tracks: [track({ id: "co", kind: "code", rawCode: raw }), track({ id: "k" })] });

    // Act
    const { code, lines } = generate(p, { scope: "song" });

    // Assert
    expect(body(code)).toBe(`$: ${raw}\n$: s("bd*4")`);
    expect(lines).toEqual({ co: { start: 3, end: 6 }, k: { start: 7, end: 7 } });
  });

  it("should escape quotes in patterns and sound names", () => {
    // Arrange
    const t = track({ id: "t", kind: "melodic", source: { type: "note", sound: 'my "synth"', bank: null }, pattern: "c4" });

    // Act / Assert
    expect(body(song([t]))).toBe('$: note("c4").s("my \\"synth\\"")');
  });

  it.each([
    ["no mute, no solo", [false, false, false], [false, false, false], ["$:", "$:", "$:"]],
    ["one muted", [false, true, false], [false, false, false], ["$:", "_$:", "$:"]],
    ["one soloed", [false, false, false], [false, true, false], ["_$:", "$:", "_$:"]],
    ["two soloed", [false, false, false], [true, false, true], ["$:", "_$:", "$:"]],
    ["soloed and muted", [false, true, false], [false, true, false], ["_$:", "_$:", "_$:"]],
    ["muted non-soloed beside a solo", [true, false, false], [false, false, true], ["_$:", "_$:", "$:"]],
  ])("should apply mute/solo (%s) within one generate call", (_label, mutes, solos, prefixes) => {
    // Arrange
    const tracks = mutes.map((mute, i) => track({ id: `t${i}`, mute, solo: solos[i] ?? false }));

    // Act
    const out = body(song(tracks)).split("\n").map((l) => l.split(" ")[0]);

    // Assert
    expect(out).toEqual(prefixes);
  });

  it("should wrap partial clips in arrange() with leading, inner and trailing silence", () => {
    // Arrange
    const t = track({ id: "t", pattern: "hh*8", clips: [c(9, 16), c(21, 28)] });

    // Act / Assert
    expect(body(song([t]))).toBe('$: arrange([8, silence], [8, s("hh*8")], [4, silence], [8, s("hh*8")], [4, silence])');
  });

  it("should emit the plain pattern when one clip covers the whole song", () => {
    // Arrange
    const t = track({ id: "t", clips: [c(1, 32)] });

    // Act / Assert
    expect(body(song([t]))).toBe('$: s("bd*4")');
  });

  it("should keep adjacent clips as separate entries because clip time is clip-local", () => {
    // Arrange
    const t = track({ id: "t", pattern: "<bd sd>", clips: [c(1, 16), c(17, 32)] });

    // Act / Assert
    expect(body(song([t]))).toBe('$: arrange([16, s("<bd sd>")], [16, s("<bd sd>")])');
  });

  it("should clamp clips to the song and resolve overlaps", () => {
    // Arrange
    const t = track({ id: "t", clips: [c(30, 40), c(0, 4), c(3, 6)] });

    // Act / Assert
    expect(body(song([t]))).toBe('$: arrange([4, s("bd*4")], [2, s("bd*4")], [23, silence], [3, s("bd*4")])');
  });

  it("should emit a track without clips muted with its plain pattern", () => {
    // Arrange
    const t = track({ id: "t", clips: [] });

    // Act / Assert
    expect(body(song([t]))).toBe('_$: s("bd*4")');
  });

  it("should mute an arranged track with the _$: prefix", () => {
    // Arrange
    const t = track({ id: "t", mute: true, clips: [c(1, 8)] });

    // Act / Assert
    expect(body(song([t]))).toBe('_$: arrange([8, s("bd*4")], [24, silence])');
  });

  it("should break a long arrange() into one entry per line", () => {
    // Arrange
    const p = arrangeDemo();

    // Act
    const { code, lines } = generate(p, { scope: "song" });

    // Assert
    const split = code.split("\n");
    expect(split.slice(lines.kick?.start !== undefined ? lines.kick.start - 1 : 0, lines.kick?.end).join("\n")).toBe(
      [
        "$: arrange(",
        "     [8, silence],",
        '     [8, s("bd*4").bank("RolandTR909").gain(.82).shape(.15)],',
        "     [4, silence],",
        '     [12, s("bd*4").bank("RolandTR909").gain(.82).shape(.15)])',
      ].join("\n"),
    );
    expect(split.slice((lines.bass?.start ?? 1) - 1, lines.bass?.end).join("\n")).toBe(
      [
        "$: arrange(",
        "     [8, silence],",
        '     [8, note("<c2 eb2 g2 bb1>*2").s("sawtooth")',
        "         .lpf(sine.range(400, 1400).slow(8)).sometimes(x => x.ply(2)).lpq(10).shape(.3)",
        "         .room(.2).roomsize(2)],",
        "     [4, silence],",
        '     [12, note("<c2 eb2 g2 bb1>*2").s("sawtooth")',
        "         .lpf(sine.range(400, 1400).slow(8)).sometimes(x => x.ply(2)).lpq(10).shape(.3)",
        "         .room(.2).roomsize(2)])",
      ].join("\n"),
    );
  });

  it("should keep every generated line within the width unless a single token is longer", () => {
    // Arrange
    const p = arrangeDemo();

    // Act
    const song = generate(p, { scope: "song" }).code.split("\n");
    const section = generate(p, { scope: "section" }).code.split("\n");

    // Assert
    expect([...song, ...section].filter((l) => l.length > 88)).toEqual([]);
  });

  it("should give LineMap ranges that are contiguous, ordered and cover each block exactly", () => {
    // Arrange
    const p = arrangeDemo();

    // Act
    const { code, lines } = generate(p, { scope: "song" });

    // Assert
    const all = code.split("\n");
    const ranges = p.tracks.map((t) => lines[t.id]);
    expect(ranges.every((r) => r !== undefined)).toBe(true);
    expect(ranges[0]?.start).toBe(3);
    ranges.forEach((r, i) => {
      const next = ranges[i + 1];
      if (r && next) expect(next.start).toBe(r.end + 1);
      if (r) expect(all[r.start - 1]).toMatch(/^_?\$: /);
    });
    expect(ranges.at(-1)?.end).toBe(all.length);
  });

  it("should pack continuation calls greedily and keep the source head on the first line", () => {
    // Arrange
    const t = track({
      id: "t",
      kind: "melodic",
      source: { type: "note", sound: "square", bank: null },
      pattern: "c5 eb5 g5 [bb5 g5] f5 ~ eb5 d5",
      params: { lpf: 3500, delay: 0.2, gain: 0.7, pan: 0.4, room: 0.3, shape: 0.25, hpf: 120 },
      modifiers: [{ id: "m", code: ".fmi(3).fmh(2)", enabled: true }],
    });

    // Act
    const { code, lines } = generate(project({ tracks: [t] }), { scope: "song" });

    // Assert
    expect(body(code)).toBe(
      '$: note("c5 eb5 g5 [bb5 g5] f5 ~ eb5 d5").s("square")\n     .fmi(3).fmh(2).gain(.7).pan(.4).lpf(3500).hpf(120).shape(.25).room(.3).delay(.2)',
    );
    expect(lines.t).toEqual({ start: 3, end: 4 });
  });

  it("should render the section at the loop start by default with only overlapping tracks, unwrapped", () => {
    // Arrange
    const p = arrangeDemo();

    // Act
    const { code, lines, scope } = generate(p, { scope: "section" });

    // Assert
    expect(scope).toBe("section");
    expect(Object.keys(lines)).toEqual(["kick", "clap", "hats", "bass", "keys"]);
    expect(code).not.toContain("arrange(");
    expect(code.split("\n")[2]).toBe('$: s("bd*4").bank("RolandTR909").gain(.82).shape(.15)');
  });

  it.each([
    [1, ["hats", "keys"]],
    [12, ["kick", "clap", "hats", "bass", "keys"]],
    [18, ["keys", "vox"]],
    [25, ["kick", "clap", "hats", "bass", "keys", "lead", "vox"]],
  ])("should pick the section containing bar %i", (atBar, ids) => {
    // Arrange
    const p = arrangeDemo();

    // Act
    const { lines } = generate(p, { scope: "section", atBar });

    // Assert
    expect(Object.keys(lines)).toEqual(ids);
  });

  it("should fall back to bar 1 when the loop is off and to the whole song outside any section", () => {
    // Arrange
    const p = { ...arrangeDemo(), loop: { enabled: false, startBar: 9, endBar: 16 } };
    const noSections = { ...arrangeDemo(), sections: [] };

    // Act
    const atStart = generate(p, { scope: "section" });
    const whole = generate(noSections, { scope: "section", atBar: 12 });

    // Assert
    expect(Object.keys(atStart.lines)).toEqual(["hats", "keys"]);
    expect(Object.keys(whole.lines)).toHaveLength(7);
    expect(whole.code).not.toContain("arrange(");
  });

  it("should keep mute and solo in section scope", () => {
    // Arrange
    const p = arrangeDemo();
    p.tracks = p.tracks.map((t) => (t.id === "hats" ? { ...t, solo: true } : t));

    // Act
    const out = body(generate(p, { scope: "section", atBar: 1 }).code)
      .split("\n")
      .filter((l) => !l.startsWith(" "))
      .map((l) => l.split(" ")[0]);

    // Assert
    expect(out).toEqual(["$:", "_$:"]);
  });

  it("should append .analyze(id) to each block's last line without changing the line count", () => {
    // Arrange
    const p = arrangeDemo();

    // Act
    const plain = generate(p, { scope: "song" });
    const inst = generate(p, { scope: "song", instrument: true });

    // Assert
    expect(inst.lines).toEqual(plain.lines);
    const a = plain.code.split("\n");
    const b = inst.code.split("\n");
    expect(b).toHaveLength(a.length);
    for (const t of p.tracks) {
      const end = (plain.lines[t.id]?.end ?? 0) - 1;
      expect(b[end]).toBe(`${a[end]}.analyze("${t.id}")`);
    }
  });

  it("should parenthesize a non-chainable code track before .analyze()", () => {
    // Arrange
    const p = project({ tracks: [track({ id: "co", kind: "code", rawCode: 'cond ? s("bd") : s("hh")' })] });

    // Act
    const out = body(generate(p, { scope: "song", instrument: true }).code);

    // Assert
    expect(out).toBe('$: (cond ? s("bd") : s("hh")).analyze("co")');
  });

  it("should write orbit-shared bus settings onto the tracks that send to that bus", () => {
    // Arrange
    const buses = [{ orbit: 2, roomsize: 4, delaytime: 0.25, delayfeedback: 0.5 }];
    const tracks = [
      track({ id: "wet", orbit: 2, params: { room: 0.4, delay: 0.3 } }),
      track({ id: "own", orbit: 2, params: { room: 0.4, roomsize: 1 } }),
      track({ id: "dry", orbit: 2, params: { gain: 0.5 } }),
      track({ id: "other", orbit: 1, params: { room: 0.4 } }),
      track({ id: "mod", orbit: 2, modifiers: [{ id: "m", code: ".delay(sine.range(0, .5))", enabled: true }] }),
    ];

    // Act / Assert
    expect(body(song(tracks, { buses }))).toBe(
      [
        '$: s("bd*4").room(.4).roomsize(4).delay(.3).delaytime(.25).delayfeedback(.5).orbit(2)',
        '$: s("bd*4").room(.4).roomsize(1).orbit(2)',
        '$: s("bd*4").gain(.5).orbit(2)',
        '$: s("bd*4").room(.4)',
        '$: s("bd*4").delay(sine.range(0, .5)).delaytime(.25).delayfeedback(.5).orbit(2)',
      ].join("\n"),
    );
  });

  it("should omit .orbit(1) and emit other orbits last", () => {
    // Arrange
    const tracks = [track({ id: "a", orbit: 1 }), track({ id: "b", orbit: 3, params: { gain: 0.5 } })];

    // Act / Assert
    expect(body(song(tracks))).toBe('$: s("bd*4")\n$: s("bd*4").gain(.5).orbit(3)');
  });

  it("should add all(x => x.postgain(v)) only when the master postgain isn't 1", () => {
    // Arrange
    const tracks = [track({ id: "a" })];

    // Act
    const unity = song(tracks);
    const quieter = song(tracks, { master: { postgain: 0.9, limiter: true } });
    const empty = song([], { master: { postgain: 1.25, limiter: false } });

    // Assert
    expect(unity).toBe('setcpm(120/4)\n\n$: s("bd*4")');
    expect(quieter).toBe('setcpm(120/4)\n\n$: s("bd*4")\n\nall(x => x.postgain(.9))');
    expect(empty).toBe("setcpm(120/4)\n\nall(x => x.postgain(1.25))");
  });

  it("should write setcpm from tempo and the prelude verbatim before the tracks", () => {
    // Arrange
    const p = project({
      tempo: { bpm: 174.5, beatsPerBar: 3 },
      prelude: ["// my set", 'await samples("github:someone/drums")', "const x = 2;\nconst y = x * 2;"],
      tracks: [track({ id: "a" })],
    });

    // Act
    const { code, lines } = generate(p, { scope: "song" });

    // Assert
    expect(code).toBe(
      'setcpm(174.5/3)\n// my set\nawait samples("github:someone/drums")\nconst x = 2;\nconst y = x * 2;\n\n$: s("bd*4")',
    );
    expect(lines.a).toEqual({ start: 7, end: 7 });
  });

  it("should emit only setcpm and the prelude for a project without tracks", () => {
    // Arrange
    const p = project({ prelude: ["// add a track from the library to begin"] });

    // Act / Assert
    expect(generate(p, { scope: "song" }).code).toBe("setcpm(120/4)\n// add a track from the library to begin");
  });

  it("should be deterministic", () => {
    // Arrange
    const p = arrangeDemo();

    // Act
    const a = generate(p, { scope: "song", instrument: true });
    const b = generate(structuredClone(p), { scope: "song", instrument: true });

    // Assert
    expect(a).toEqual(b);
  });

  it.each([
    ["song", false],
    ["song", true],
    ["section", false],
    ["section", true],
  ] as const)("should produce code Strudel's transpiler accepts (scope %s, instrument %s)", (scope, instrument) => {
    // Arrange
    const p = arrangeDemo();
    p.master.postgain = 0.8;
    p.prelude = ["// intro"];
    p.tracks.push(track({ id: "co", kind: "code", rawCode: 'stack(\n  s("bd"),\n  note("c3").s("sine")\n)', clips: [c(5, 12)] }));
    p.tracks.push(track({ id: "muted", mute: true }));

    // Act
    const { code } = generate(p, { scope, instrument });
    const out = transpiler(code).output;

    // Assert
    expect(out).toContain(".p('$')");
    expect(out).toContain(".p('_$')");
  });
});
