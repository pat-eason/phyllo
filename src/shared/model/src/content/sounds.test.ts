import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ALL_SOUNDS,
  DRUM_BANKS,
  DRUM_SOUNDS,
  INSTRUMENTS,
  SYNTHS,
  drumSoundsFor,
  findSound,
  friendlySoundName,
  searchSounds,
} from "./sounds";

/** Keys of `@strudel/soundfonts/gm.mjs`, when the package is installed. */
function loadGmNames(): string[] | null {
  const pnpmDir = fileURLToPath(new URL("../../../../../node_modules/.pnpm/", import.meta.url));
  if (!existsSync(pnpmDir)) return null;
  const dir = readdirSync(pnpmDir).find((e) => e.startsWith("@strudel+soundfonts@"));
  if (!dir) return null;
  const file = `${pnpmDir}${dir}/node_modules/@strudel/soundfonts/gm.mjs`;
  if (!existsSync(file)) return null;
  return [...readFileSync(file, "utf8").matchAll(/^ {2}(gm_[a-z0-9_]+):/gm)].map((m) => m[1] ?? "");
}

const gmNames = loadGmNames();

describe("drum banks", () => {
  it("lists the four verified banks with friendly names", () => {
    expect(DRUM_BANKS.map((b) => [b.code, b.name])).toEqual([
      ["RolandTR909", "TR-909"],
      ["RolandTR808", "TR-808"],
      ["LinnDrum", "LinnDrum"],
      ["AkaiMPC60", "MPC60"],
    ]);
  });

  it("only lists sounds that exist in the sound catalog", () => {
    const known = DRUM_SOUNDS.map((d) => d.code);
    for (const bank of DRUM_BANKS) for (const s of bank.sounds) expect(known).toContain(s);
  });

  it("matches the contents of Strudel's tidal-drum-machines map", () => {
    // Fetched from the CDN map on 2026-10-21 (docs/strudel-verification covers the bank names).
    expect(DRUM_BANKS.find((b) => b.code === "RolandTR909")?.sounds).toEqual(["bd", "sd", "hh", "oh", "cp", "rim", "lt", "mt", "ht", "cr", "rd"]);
    expect(DRUM_BANKS.find((b) => b.code === "RolandTR808")?.sounds).not.toContain("rd");
    expect(DRUM_BANKS.find((b) => b.code === "RolandTR808")?.sounds).toContain("cb");
    expect(DRUM_BANKS.find((b) => b.code === "LinnDrum")?.sounds).toContain("tb");
    expect(DRUM_BANKS.find((b) => b.code === "AkaiMPC60")?.sounds).not.toContain("cb");
  });
});

describe("drum sounds", () => {
  it("starts with the five mockup rows in order", () => {
    expect(DRUM_SOUNDS.slice(0, 5).map((d) => [d.code, d.name])).toEqual([
      ["bd", "Bass drum"],
      ["sd", "Snare"],
      ["hh", "Closed hat"],
      ["oh", "Open hat"],
      ["cp", "Clap"],
    ]);
  });

  it("includes the extended kit", () => {
    const codes = DRUM_SOUNDS.map((d) => d.code);
    for (const c of ["rim", "lt", "mt", "ht", "cr", "rd", "cb", "sh", "perc", "tb"]) expect(codes).toContain(c);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("records which banks have each sound", () => {
    expect(DRUM_SOUNDS.find((d) => d.code === "bd")?.banks).toEqual(["RolandTR909", "RolandTR808", "LinnDrum", "AkaiMPC60"]);
    expect(DRUM_SOUNDS.find((d) => d.code === "tb")?.banks).toEqual(["LinnDrum"]);
    expect(DRUM_SOUNDS.find((d) => d.code === "rd")?.banks).toEqual(["RolandTR909", "LinnDrum", "AkaiMPC60"]);
    for (const d of DRUM_SOUNDS) expect(d.banks.length).toBeGreaterThan(0);
  });

  it("filters by bank, case-insensitively, and falls back to everything", () => {
    expect(drumSoundsFor("RolandTR909").map((d) => d.code)).toEqual(["bd", "sd", "hh", "oh", "cp", "rim", "lt", "mt", "ht", "cr", "rd"]);
    expect(drumSoundsFor("rolandtr808").map((d) => d.code)).toContain("cb");
    expect(drumSoundsFor("SomeOtherBank")).toHaveLength(DRUM_SOUNDS.length);
    expect(drumSoundsFor(null)).toHaveLength(DRUM_SOUNDS.length);
  });
});

describe("synths and instruments", () => {
  it("lists the five synth waveforms with friendly names", () => {
    expect(SYNTHS.map((s) => [s.code, s.name])).toEqual([
      ["sawtooth", "Sawtooth synth"],
      ["square", "Square synth"],
      ["triangle", "Triangle synth"],
      ["sine", "Sine synth"],
      ["supersaw", "Supersaw synth"],
    ]);
  });

  it("offers about sixteen General MIDI instruments including the mockup four", () => {
    expect(INSTRUMENTS.length).toBeGreaterThanOrEqual(16);
    expect(INSTRUMENTS.length).toBeLessThanOrEqual(20);
    const names = INSTRUMENTS.map((i) => i.name);
    for (const n of ["Electric piano", "Upright bass", "Strings", "Marimba"]) expect(names).toContain(n);
    for (const i of INSTRUMENTS) expect(i.code).toMatch(/^gm_[a-z0-9_]+$/);
  });

  it.skipIf(gmNames === null)("only uses General MIDI names that exist in @strudel/soundfonts", () => {
    expect(gmNames?.length).toBeGreaterThan(100);
    for (const i of INSTRUMENTS) expect(gmNames).toContain(i.code);
  });

  it("gives every entry a description and keywords", () => {
    for (const s of ALL_SOUNDS) {
      expect(s.description.length).toBeGreaterThan(5);
      expect(s.keywords.length).toBeGreaterThan(0);
    }
    expect(new Set(ALL_SOUNDS.map((s) => s.code)).size).toBe(ALL_SOUNDS.length);
  });
});

describe("friendlySoundName", () => {
  it.each([
    [{ type: "note", sound: "sawtooth", bank: null }, "Sawtooth synth"],
    [{ type: "note", sound: "triangle", bank: null }, "Triangle synth"],
    [{ type: "note", sound: "supersaw", bank: null }, "Supersaw synth"],
    [{ type: "chord", sound: "gm_epiano1", bank: null }, "Electric piano"],
    [{ type: "note", sound: "gm_acoustic_bass", bank: null }, "Upright bass"],
    [{ type: "note", sound: "gm_pad_choir", bank: null }, "Pad choir"],
    [{ type: "s", sound: null, bank: "RolandTR909" }, "TR-909 drums"],
    [{ type: "s", sound: null, bank: "RolandTR808" }, "TR-808 drums"],
    [{ type: "s", sound: null, bank: "AkaiMPC60" }, "MPC60 drums"],
    [{ type: "s", sound: null, bank: "TheBestBank" }, "TheBestBank drums"],
    [{ type: "s", sound: "bd", bank: "RolandTR909" }, "Bass drum · TR-909"],
    [{ type: "s", sound: "cp", bank: null }, "Clap"],
    [{ type: "s", sound: "vox", bank: null }, "Your sample · vox"],
    [{ type: "s", sound: null, bank: null }, "Drums"],
  ] as const)("%j → %s", (source, expected) => {
    expect(friendlySoundName({ ...source })).toBe(expected);
  });

  it("describes a single drum sound inside a bank", () => {
    expect(friendlySoundName({ type: "s", sound: null, bank: "RolandTR909" }, { drumSound: "bd" })).toBe("Bass drum · TR-909");
    expect(friendlySoundName({ type: "s", sound: null, bank: "LinnDrum" }, { drumSound: "hh" })).toBe("Closed hat · LinnDrum");
    expect(friendlySoundName({ type: "s", sound: null, bank: null }, { drumSound: "sd" })).toBe("Snare");
  });

  it("accepts a bare code or bank id", () => {
    expect(friendlySoundName("sine")).toBe("Sine synth");
    expect(friendlySoundName("RolandTR808")).toBe("TR-808 drums");
    expect(friendlySoundName("gm_marimba")).toBe("Marimba");
  });
});

describe("findSound", () => {
  it("looks up any catalog entry by code, ignoring case", () => {
    expect(findSound("BD")?.name).toBe("Bass drum");
    expect(findSound("gm_epiano1")?.group).toBe("instrument");
    expect(findSound("linndrum")?.group).toBe("bank");
    expect(findSound("zzz")).toBeUndefined();
  });
});

describe("searchSounds", () => {
  const codes = (q: string, mode: "guided" | "pro" = "guided") => searchSounds(q, mode).map((s) => s.code);

  it("returns the whole catalog for an empty query", () => {
    expect(searchSounds("")).toHaveLength(ALL_SOUNDS.length);
    expect(searchSounds("  ", "pro")).toHaveLength(ALL_SOUNDS.length);
  });

  it("matches friendly names and code names, case-insensitively", () => {
    expect(codes("snare")[0]).toBe("sd");
    expect(codes("SNARE")[0]).toBe("sd");
    expect(codes("sd")[0]).toBe("sd");
    expect(codes("tr-909")).toContain("RolandTR909");
    expect(codes("gm_epiano", "pro")).toEqual(["gm_epiano1"]);
  });

  it("ranks exact code matches before partial ones", () => {
    expect(codes("sine", "pro")[0]).toBe("sine");
    expect(codes("hh", "pro")[0]).toBe("hh");
  });

  it('finds "warm bass" style searches through Guided keywords', () => {
    const found = codes("warm bass");
    expect(found).toContain("sawtooth");
    expect(found).toContain("gm_electric_bass_finger");
    expect(found).not.toContain("bd");
  });

  it("leaves keyword matching out of Pro mode", () => {
    expect(codes("warm bass", "pro")).toEqual([]);
    expect(codes("kick")).toContain("bd");
    expect(codes("kick", "pro")).toEqual([]);
  });

  it("requires every word to match", () => {
    expect(codes("electric piano")).toEqual(["gm_epiano1"]);
    expect(codes("electric banana")).toEqual([]);
  });

  it("finds drums by plain words", () => {
    expect(codes("hi-hat")).toEqual(expect.arrayContaining(["hh", "oh"]));
    expect(codes("cymbal")).toEqual(expect.arrayContaining(["cr", "rd", "hh"]));
  });
});
