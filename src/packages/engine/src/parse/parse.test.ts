import { describe, expect, it } from "vitest";
import type { Track } from "@phyllo/model";
import { parse } from "./parse";
import type { ParseOutcome } from "./parse";
import { STARTERS } from "./starters.test-util";

/** The fields a track's code determines (ids, colors, clips ids excluded). */
function shape(t: Track) {
  return {
    name: t.name,
    kind: t.kind,
    source: t.source,
    pattern: t.pattern,
    params: t.params,
    modifiers: t.modifiers.map((m) => m.code),
    orbit: t.orbit,
    mute: t.mute,
    solo: t.solo,
    clips: t.clips.map((c) => [c.startBar, c.endBar]),
    rawCode: t.rawCode,
  };
}

// Unlabelled blocks parse with `name: ""` and, without `arrange()`, `clips: []` (the reducer decides both).
const drum = (pattern: string, bank: string | null, extra: Partial<ReturnType<typeof shape>> = {}) => ({
  name: "",
  kind: "drum",
  source: { type: "s", sound: null, bank },
  pattern,
  params: {},
  modifiers: [],
  orbit: 1,
  mute: false,
  solo: false,
  clips: [],
  rawCode: null,
  ...extra,
});

const melodic = (sound: string | null, pattern: string, extra: Partial<ReturnType<typeof shape>> = {}) => ({
  name: "",
  kind: "melodic",
  source: { type: "note", sound, bank: null },
  pattern,
  params: {},
  modifiers: [],
  orbit: 1,
  mute: false,
  solo: false,
  clips: [],
  rawCode: null,
  ...extra,
});

const run = (lines: string[] | string, opts: Parameters<typeof parse>[1] = {}): ParseOutcome =>
  parse(Array.isArray(lines) ? lines.join("\n") : lines, opts);
const only = (r: ParseOutcome) => {
  expect(r.tracks).toHaveLength(1);
  return r.tracks[0] as Track;
};

describe("parse", () => {
  it("should parse the House groove starter", () => {
    // Act
    const r = run(STARTERS.house ?? []);

    // Assert
    expect(r.ok).toBe(true);
    expect(r.tempo).toEqual({ bpm: 124, beatsPerBar: 4 });
    expect(r.prelude).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.tracks.map(shape)).toEqual([
      drum("bd*4", "RolandTR909"),
      drum("~ cp", "RolandTR909", { params: { room: 0.2 } }),
      drum("hh*8", "RolandTR909", { params: { gain: "[.4 .7]*4" } }),
      melodic("sawtooth", "<a1 a1 c2 g1>*2", { params: { lpf: 900 } }),
    ]);
  });

  it("should parse the Lo-fi keys starter including a continuation line", () => {
    // Act
    const r = run(STARTERS.lofi ?? []);

    // Assert
    expect(r.tempo).toEqual({ bpm: 82, beatsPerBar: 4 });
    expect(r.tracks.map(shape)).toEqual([
      drum("bd ~ ~ bd, ~ sd", "LinnDrum", { params: { lpf: 3000 } }),
      {
        name: "",
        kind: "chord",
        source: { type: "chord", sound: "gm_epiano1", bank: null },
        pattern: "<Fmaj7 Em7 Dm7 C^7>",
        params: { room: 0.6 },
        modifiers: [],
        orbit: 1,
        mute: false,
        solo: false,
        clips: [],
        rawCode: null,
      },
      drum("hh*8", null, { params: { gain: 0.3 }, modifiers: [".degradeBy(.3)"] }),
    ]);
  });

  it("should parse the Breakbeat starter", () => {
    // Act
    const r = run(STARTERS.breaks ?? []);

    // Assert
    expect(r.tracks.map(shape)).toEqual([
      drum("bd ~ ~ bd ~ ~ bd ~, ~ sd ~ [~ sd]", "AkaiMPC60"),
      drum("hh*8", null, { params: { gain: "[.5 .3]*4" } }),
      melodic("sine", "<e1 g1>", { params: { shape: 0.4 } }),
    ]);
  });

  it("should parse the 16-bit stage starter keeping unknown calls as modifiers", () => {
    // Act
    const r = run(STARTERS.stage ?? []);

    // Assert
    expect(r.tracks.map(shape)).toEqual([
      drum("bd ~ [~ bd] ~, ~ sd ~ sd, hh*8", "RolandTR909"),
      melodic("sine", "<[c2 c3]*4 [ab1 ab2]*4 [bb1 bb2]*4 [g1 g2]*4>", { modifiers: [".fmi(3)", ".fmh(2)", ".decay(.15)", ".sustain(0)"] }),
      melodic("square", "c5 eb5 g5 [bb5 g5] f5 ~ eb5 d5", { params: { lpf: 3500, delay: 0.2 } }),
    ]);
  });

  it("should parse the Ambient drift starter with params mixed between modifiers", () => {
    // Act
    const r = run(STARTERS.ambient ?? []);

    // Assert
    expect(r.tracks.map(shape)).toEqual([
      melodic("sine", "<c3 g3 eb4 bb3>", { params: { room: 0.9 }, modifiers: [".attack(2)", ".release(4)", ".slow(2)"] }),
      melodic("triangle", "c5 ~ g5 ~", { params: { delay: 0.6, gain: 0.3 } }),
    ]);
  });

  it("should parse the Euclid rhythms starter", () => {
    // Act
    const r = run(STARTERS.euclid ?? []);

    // Assert
    expect(r.tempo).toEqual({ bpm: 110, beatsPerBar: 4 });
    expect(r.tracks.map(shape)).toEqual([
      drum("bd(3,8)", "RolandTR808"),
      drum("cp(2,8,2)", "RolandTR808"),
      drum("hh(5,8)", "RolandTR808"),
    ]);
  });

  it("should parse the Blank project starter into a comment-only prelude", () => {
    // Act
    const r = run(STARTERS.blank ?? []);

    // Assert
    expect(r).toMatchObject({ ok: true, tracks: [], tempo: { bpm: 120, beatsPerBar: 4 }, prelude: ["// add a track from the library to begin"] });
  });

  it("should map control aliases to canonical params and orbit", () => {
    // Act
    const t = only(run('$: sound("bd*2").cutoff(800).resonance(5).hcutoff(100).size(2).delayfb(.3).dt(.25).delay(.5).o(2)'));

    // Assert
    expect(t.params).toEqual({ lpf: 800, lpq: 5, hpf: 100, roomsize: 2, delayfeedback: 0.3, delaytime: 0.25, delay: 0.5 });
    expect(t.orbit).toBe(2);
    expect(t.modifiers).toEqual([]);
  });

  it("should read n(), negative numbers and template-literal patterns", () => {
    // Act
    const t = only(run("$: n(`0 2 4`).s('gm_marimba').pan(-0.5)"));

    // Assert
    expect(shape(t)).toMatchObject({ kind: "melodic", source: { type: "n", sound: "gm_marimba", bank: null }, pattern: "0 2 4", params: { pan: -0.5 } });
  });

  it.each([
    ['s("sawtooth")', "melodic", { type: "s", sound: "sawtooth", bank: null }],
    ['s("<sawtooth square>*2")', "melodic", { type: "s", sound: "sawtooth", bank: null }],
    ['s("gm_acoustic_bass")', "melodic", { type: "s", sound: "gm_acoustic_bass", bank: null }],
    ['s("vox")', "sample", { type: "s", sound: "vox", bank: null }],
    ['s("vox:2 ~ vox:3")', "sample", { type: "s", sound: "vox", bank: null }],
    ['s("breaks165").loopAt(2)', "sample", { type: "s", sound: "breaks165", bank: null }],
    ['s("bd:3 hh:1")', "drum", { type: "s", sound: null, bank: null }],
    ['s("arpy feel")', "drum", { type: "s", sound: null, bank: null }],
    ['s("sawtooth").bank("RolandTR909")', "drum", { type: "s", sound: null, bank: "RolandTR909" }],
    ['s("~")', "drum", { type: "s", sound: null, bank: null }],
  ])("should infer the kind of %s", (code, kind, source) => {
    // Act
    const t = only(run(`$: ${code}`));

    // Assert
    expect(t.kind).toBe(kind);
    expect(t.source).toEqual(source);
  });

  it("should turn arrange() into clips and the song length, leaving unarranged tracks without clips", () => {
    // Act
    const r = run([
      "setcpm(120/4)",
      '$: arrange([8, silence], [8, s("bd*4").gain(.5)], [4, silence], [12, s("bd*4").gain(.5)])',
      '$: s("hh*8")',
    ]);

    // Assert
    expect(r.lengthBars).toBe(32);
    expect(r.tracks.map(shape)).toEqual([
      drum("bd*4", null, { params: { gain: 0.5 }, clips: [[9, 16], [21, 32]] }),
      drum("hh*8", null, { clips: [] }),
    ]);
  });

  it("should keep arrange() with different patterns, fractional lengths or spreads as a Code track", () => {
    // Act
    const r = run([
      '$: arrange([4, s("bd")], [4, s("hh")])',
      '$: arrange([1.5, s("bd")], [2, silence])',
      '$: arrange(...parts)',
    ]);

    // Assert
    expect(r.tracks.map((t) => [t.kind, t.rawCode, t.clips.map((c) => [c.startBar, c.endBar])])).toEqual([
      ["code", 'arrange([4, s("bd")], [4, s("hh")])', []],
      ["code", 'arrange([1.5, s("bd")], [2, silence])', []],
      ["code", "arrange(...parts)", []],
    ]);
    expect(r.warnings).toHaveLength(3);
  });

  it("should unwrap an arrange() of silence only into a silence Code track with one clip per entry", () => {
    // Act
    const t = only(run("$: arrange([2, silence], [2, silence], [4, silence])"));

    // Assert
    expect(shape(t)).toMatchObject({ kind: "code", rawCode: "silence", clips: [[1, 2], [3, 4], [5, 8]] });
  });

  it("should keep an arranged unrecognized pattern as a Code track with clips", () => {
    // Act
    const t = only(run('$: arrange([2, silence], [2, stack(s("bd"), s("hh"))])'));

    // Assert
    expect(shape(t)).toMatchObject({ kind: "code", rawCode: 'stack(s("bd"), s("hh"))', clips: [[3, 4]] });
  });

  it("should warn when arrange() totals differ", () => {
    // Act
    const r = run(['$: arrange([4, s("bd")], [4, silence])', '$: arrange([16, s("hh")])']);

    // Assert
    expect(r.lengthBars).toBe(16);
    expect(r.warnings.map((w) => w.message)).toEqual([expect.stringContaining("arrange() totals differ")]);
  });

  it("should give tracks without arrange() no clips even when a song length is passed", () => {
    // Act
    const r = run(['$: s("bd")', '_$: s("hh")'], { lengthBars: 24 });

    // Assert
    expect(r.tracks.map((t) => t.clips)).toEqual([[], []]);
    expect(r.lengthBars).toBeUndefined();
  });

  it("should preserve unknown top-level statements and comments verbatim and in order", () => {
    // Arrange
    const code = [
      "// my set",
      'await samples("github:someone/drums")',
      "setcpm(90/4)",
      "const lfo = sine.range(200, 2000).slow(4) // sweep",
      '$: s("bd*4")',
      "/* between */",
      "function twice(p) {\n  return p.fast(2)\n}",
      '$: s("hh*8") // hats',
    ].join("\n");

    // Act
    const r = parse(code);

    // Assert
    expect(r.prelude).toEqual([
      "// my set",
      'await samples("github:someone/drums")',
      "const lfo = sine.range(200, 2000).slow(4)",
      "// sweep",
      "/* between */",
      "function twice(p) {\n  return p.fast(2)\n}",
      "// hats",
    ]);
    expect(r.tracks.map((t) => t.pattern)).toEqual(["bd*4", "hh*8"]);
    expect(r.tempo).toEqual({ bpm: 90, beatsPerBar: 4 });
  });

  it("should keep a bare expression beside $: blocks in the prelude with a warning", () => {
    // Act
    const r = run(['note("c3")', '$: s("bd")']);

    // Assert
    expect(r.prelude).toEqual(['note("c3")']);
    expect(r.tracks).toHaveLength(1);
    expect(r.warnings).toEqual([{ message: expect.stringContaining("Unlabelled expression"), line: 1 }]);
  });

  it("should make the final expression the track when there are no labels", () => {
    // Act
    const r = run(['note("c3")', "let x = 1", 'note("e3").s("sine")']);

    // Assert
    expect(r.prelude).toEqual(['note("c3")', "let x = 1"]);
    expect(r.tracks.map(shape)).toEqual([melodic("sine", "e3")]);
  });

  it("should not invent a track when an unlabelled program ends in a directive", () => {
    // Act
    const r = run(['note("c3")', "setcpm(30)"]);

    // Assert
    expect(r.tracks).toEqual([]);
    expect(r.prelude).toEqual(['note("c3")']);
  });

  it.each([
    ["setcpm(120/4)", { bpm: 120, beatsPerBar: 4 }],
    ["setcpm(140/3)", { bpm: 140, beatsPerBar: 3 }],
    ["setcpm(30)", { bpm: 120, beatsPerBar: 4 }],
    ["setCpm(32.5)", { bpm: 130, beatsPerBar: 4 }],
    ["setcps(0.5)", { bpm: 120, beatsPerBar: 4 }],
    ["setCps(.55)", { bpm: 132, beatsPerBar: 4 }],
  ])("should read the tempo from %s", (stmt, tempo) => {
    // Act / Assert
    expect(run(stmt).tempo).toEqual(tempo);
  });

  it("should keep a computed setcpm in the prelude with a warning", () => {
    // Act
    const r = run(["const bpm = 128", "setcpm(bpm/4)"]);

    // Assert
    expect(r.tempo).toBeUndefined();
    expect(r.prelude).toEqual(["const bpm = 128", "setcpm(bpm/4)"]);
    expect(r.warnings).toEqual([{ message: expect.stringContaining("computed"), line: 2 }]);
  });

  it.each([
    ["setcpm(120)", { bpm: 360, beatsPerBar: 3 }],
    ["setcpm(150)", { bpm: 300, beatsPerBar: 2 }],
    ["setcpm(300)", { bpm: 300, beatsPerBar: 1 }],
    ["setcps(2)", { bpm: 360, beatsPerBar: 3 }],
    ["setcpm(400/3)", { bpm: 400, beatsPerBar: 3 }],
    ["setcpm(500/4)", { bpm: 375, beatsPerBar: 3 }],
    ["setcpm(120/2.5)", { bpm: 192, beatsPerBar: 4 }],
  ])("should pick beats per bar so %s regenerates as the same cycles per minute", (stmt, tempo) => {
    // Act / Assert
    expect(run(stmt).tempo).toEqual(tempo);
  });

  it.each(["setcpm(1000)", "setcpm(3)", "setcps(0)", "setcpm(-30)"])("should keep %s, which no BPM in range can show, in the prelude", (stmt) => {
    // Act
    const r = run(stmt);

    // Assert
    expect(r.tempo).toBeUndefined();
    expect(r.prelude).toEqual([stmt]);
    expect(r.warnings).toEqual([{ message: expect.stringContaining("outside the BPM range"), line: 1 }]);
  });

  it("should read the master postgain and keep other all() calls verbatim", () => {
    // Act
    const r = run(['$: s("bd")', "all(x => x.postgain(.9))", 'all(x => x.fast("<1 2>"))']);

    // Assert
    expect(r.master).toEqual({ postgain: 0.9 });
    expect(r.prelude).toEqual(['all(x => x.fast("<1 2>"))']);
    expect(r.warnings).toEqual([]);
  });

  it("should read names, mute and solo from labels", () => {
    // Act
    const r = run(['bass: note("c2")', '_lead: note("c4")', 'pad_: note("c3")', 'S$: s("bd")', '_$: s("hh")', '$: s("cp")']);

    // Assert
    expect(r.tracks.map((t) => [t.name, t.mute, t.solo])).toEqual([
      ["bass", false, false],
      ["lead", true, false],
      ["pad", true, false],
      ["", false, true],
      ["", true, false],
      ["", false, false],
    ]);
  });

  it("should mute earlier blocks that share a name because only the last one plays", () => {
    // Act
    const r = run(['bass: note("c2")', 'bass: note("e2")']);

    // Assert
    expect(r.tracks.map((t) => [t.name, t.mute])).toEqual([
      ["bass", true],
      ["bass 2", false],
    ]);
    expect(r.warnings).toEqual([{ message: expect.stringContaining("Duplicate block name"), line: 1 }]);
  });

  it("should leave unlabelled blocks unnamed and keep label names unique", () => {
    // Act
    const r = run(['$: s("bd")', "drums: s(\"bd sd\")", '$: chord("C").voicing()', 'drums: s("hh")', "$: stack()"]);

    // Assert
    expect(r.tracks.map((t) => t.name)).toEqual(["", "drums", "", "drums 2", ""]);
  });

  it("should mute the blocks above a top-level hush() and drop the call", () => {
    // Act
    const r = run(['$: s("bd")', '_$: s("cp")', "hush()", '$: s("hh")']);

    // Assert
    expect(r.tracks.map((t) => [t.pattern, t.mute])).toEqual([
      ["bd", true],
      ["cp", true],
      ["hh", false],
    ]);
    expect(r.prelude).toEqual([]);
    expect(r.warnings).toEqual([{ message: expect.stringContaining("hush()"), line: 3 }]);
  });

  it("should drop a bare silence statement, which plays nothing", () => {
    // Act
    const r = run(["setcpm(120/4)", "const lead = 'c4'", "", "silence"]);

    // Assert
    expect(r.tracks).toEqual([]);
    expect(r.prelude).toEqual(["const lead = 'c4'"]);
    expect(r.warnings).toEqual([]);
  });

  it("should keep a user's .analyze() call as a modifier", () => {
    // Act
    const t = only(run('$: s("bd*4").gain(.5).analyze("kick")'));

    // Assert
    expect(t.modifiers.map((m) => m.code)).toEqual(['.analyze("kick")']);
    expect(t.params).toEqual({ gain: 0.5 });
  });

  it.each([
    ["stack()", '$: stack(s("bd"), s("hh*8"))', 'stack(s("bd"), s("hh*8"))'],
    ["a variable", "$: drums", "drums"],
    ["a method on a non-source root", "$: drums.fast(2).gain(.5)", "drums.fast(2).gain(.5)"],
    ["an interpolated template", "$: s(`bd ${extra}`)", "s(`bd ${extra}`)"],
    ["a non-literal source argument", "$: note(melody).s(\"sine\")", 'note(melody).s("sine")'],
    ["two source arguments", '$: s("bd", "hh")', 's("bd", "hh")'],
    ["a computed member call", '$: s("bd")["fast"](2)', 's("bd")["fast"](2)'],
    ["optional chaining", '$: s("bd")?.fast(2)', 's("bd")?.fast(2)'],
    ["chord() without voicing()", '$: chord("<C Am>").s("piano")', 'chord("<C Am>").s("piano")'],
    ["a comment inside the block", '$: s("bd") /* kick */ .gain(.5)', 's("bd") /* kick */ .gain(.5)'],
    ["a non-expression body", "$: { s(\"bd\") }", '{ s("bd") }'],
  ])("should keep %s as a Code track verbatim", (_label, code, raw) => {
    // Act
    const r = run(code);
    const t = only(r);

    // Assert
    expect(t.kind).toBe("code");
    expect(t.rawCode).toBe(raw);
    expect(t.pattern).toBe("");
    expect(r.warnings).toEqual([{ message: expect.stringContaining("Code track"), line: 1 }]);
  });

  it("should keep the muted state of a Code track", () => {
    // Act
    const t = only(run("_$: stack(a, b)"));

    // Assert
    expect([t.kind, t.mute, t.rawCode]).toEqual(["code", true, "stack(a, b)"]);
  });

  it("should keep .layer() and other unknown calls verbatim as modifiers", () => {
    // Act
    const t = only(run('$: s("bd*2").layer(x => x.fast(2), x => x.speed(2)).room(.3)'));

    // Assert
    expect(t.modifiers.map((m) => [m.code, m.enabled, m.origin])).toEqual([[".layer(x => x.fast(2), x => x.speed(2))", true, "parsed"]]);
    expect(t.params).toEqual({ room: 0.3 });
  });

  it.each([
    ["a patterned value before a modifier", '$: s("hh*8").gain("[.4 .7]*4").fast(2)', [".gain(\"[.4 .7]*4\")", ".fast(2)"], {}],
    ["a patterned value after a modifier", '$: s("hh*8").fast(2).gain("[.4 .7]*4")', [".fast(2)"], { gain: "[.4 .7]*4" }],
    ["a param set twice", '$: s("bd").gain(.5).gain(.7)', [".gain(.5)", ".gain(.7)"], {}],
    ["a param a modifier also sets", '$: s("bd").lpf(800).sometimes(x => x.cutoff(200))', [".lpf(800)", ".sometimes(x => x.cutoff(200))"], {}],
    ["pan beside jux", '$: s("bd").pan(.2).jux(rev)', [".pan(.2)", ".jux(rev)"], {}],
    ["a value with more than 3 decimals", '$: s("bd").gain(0.0625)', [".gain(0.0625)"], {}],
    ["a colon value", '$: s("bd").lpf("800:10")', ['.lpf("800:10")'], {}],
    ["a non-literal value", '$: s("bd").lpf(sine.range(200, 900))', [".lpf(sine.range(200, 900))"], {}],
    ["a non-integer orbit", '$: s("bd").orbit(1.5)', [".orbit(1.5)"], {}],
    ["analyze() in the middle", '$: s("bd").analyze("x").gain(.5)', ['.analyze("x")'], { gain: 0.5 }],
  ])("should keep %s as a verbatim modifier", (_label, code, modifiers, params) => {
    // Act
    const t = only(run(code));

    // Assert
    expect(t.modifiers.map((m) => m.code)).toEqual(modifiers);
    expect(t.params).toEqual(params);
  });

  it("should only take bank/sound/voicing as source parts before the first modifier", () => {
    // Act
    const r = run(['$: s("bd").fast(2).bank("RolandTR808")', '$: note("c3").fast(2).s("sine")', '$: s("bd").s("hh")']);

    // Assert
    expect(r.tracks.map((t) => [t.source.bank, t.source.sound, t.modifiers.map((m) => m.code)])).toEqual([
      [null, null, [".fast(2)", '.bank("RolandTR808")']],
      [null, null, [".fast(2)", '.s("sine")']],
      [null, null, ['.s("hh")']],
    ]);
  });

  it("should report a syntax error with its location and no tracks", () => {
    // Act
    const r = run(['setcpm(120/4)', '$: s("bd").gain(.5', '$: s("hh")']);

    // Assert
    expect(r.ok).toBe(false);
    expect(r.tracks).toEqual([]);
    expect(r.prelude).toEqual([]);
    expect(r.error).toEqual({ message: "Unexpected token", line: 3, column: 1 });
    expect(r.warnings).toEqual([{ message: "Unexpected token", line: 3 }]);
  });

  it("should report an unterminated string at its start", () => {
    // Act
    const r = run('$: s("bd');

    // Assert
    expect(r.error).toEqual({ message: "Unterminated string constant", line: 1, column: 6 });
  });

  it("should accept an empty program", () => {
    // Act / Assert
    expect(run("")).toEqual({ ok: true, tracks: [], prelude: [], warnings: [] });
  });

  it("should use the injected id function and palette", () => {
    // Arrange
    let n = 0;
    const newId = () => `id-${++n}`;

    // Act
    const r = run(['$: arrange([2, s("bd").fast(2)], [2, silence])', '$: s("hh")', '$: s("cp")'], { newId, palette: ["#111111", "#222222"] });

    // Assert
    expect(r.tracks.map((t) => [t.id, t.color, t.clips.map((c) => c.id), t.modifiers.map((m) => m.id)])).toEqual([
      ["id-1", "#111111", ["id-2"], ["id-3"]],
      ["id-4", "#222222", [], []],
      ["id-5", "#111111", [], []],
    ]);
  });

  it("should leave colors empty without a palette and number ids per call", () => {
    // Act
    const a = run('$: s("bd")');
    const b = run('$: s("bd")');

    // Assert
    expect(a.tracks[0]?.color).toBe("");
    expect(a.tracks[0]?.id).toBe(b.tracks[0]?.id);
  });

  it("should fold shared orbit FX into buses only when every sender agrees", () => {
    // Arrange
    const code = [
      '$: s("bd").room(.3).roomsize(2).delay(.2).delaytime(.25).delayfeedback(.4)',
      '$: s("hh").room(.5).roomsize(2).delay(.1).delaytime(.25).delayfeedback(.5)',
      '$: s("cp").roomsize(9)',
      '$: s("rim").room(.2).roomsize(4).orbit(2)',
    ];

    // Act
    const r = run(code, { inferBuses: true });

    // Assert
    expect(r.buses).toEqual([
      { orbit: 1, roomsize: 2, delaytime: 0.25 },
      { orbit: 2, roomsize: 4 },
    ]);
    expect(r.tracks.map((t) => t.params)).toEqual([
      { room: 0.3, delay: 0.2, delayfeedback: 0.4 },
      { room: 0.5, delay: 0.1, delayfeedback: 0.5 },
      { roomsize: 9 },
      { room: 0.2 },
    ]);
  });

  it("should leave a track with a modulated orbit out of bus inference", () => {
    // Act
    const r = run(['$: s("bd").room(.3).roomsize(2)', '$: s("hh").orbit("<1 2>").room(.5).roomsize(4)'], { inferBuses: true });

    // Assert
    expect(r.buses).toEqual([{ orbit: 1, roomsize: 2 }]);
    expect(r.tracks.map((t) => t.params)).toEqual([{ room: 0.3 }, { room: 0.5, roomsize: 4 }]);
  });

  it("should leave bus params on tracks by default", () => {
    // Act
    const r = run('$: s("bd").room(.3).roomsize(2)');

    // Assert
    expect(r.buses).toBeUndefined();
    expect(r.tracks[0]?.params).toEqual({ room: 0.3, roomsize: 2 });
  });
});

