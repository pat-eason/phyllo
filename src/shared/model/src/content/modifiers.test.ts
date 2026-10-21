import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MODIFIER_CATEGORIES, MODIFIERS, findModifier, modifiersByCategory, searchModifiers } from "./modifiers";

/*
 * Verification table (T1.4, 2026-10-21): every catalog name exists in the pinned packages.
 * Paths are relative to node_modules/.pnpm/<pkg>/node_modules/<pkg>/ and cite the definition site.
 *
 *  name            source
 *  fast            @strudel/core/pattern.mjs:1925        slow            core/pattern.mjs:1958
 *  early           core/pattern.mjs:2061                 late            core/pattern.mjs:2081
 *  ply             core/pattern.mjs:1905                 hurry           core/pattern.mjs:1943
 *  swingBy         core/pattern.mjs:2184                 rev             core/pattern.mjs:2259
 *  palindrome      core/pattern.mjs:2340                 iter            core/pattern.mjs:2499
 *  linger          core/pattern.mjs:2151                 brak            core/pattern.mjs:2246
 *  echo            core/pattern.mjs:2413                 lastOf          core/pattern.mjs:1995
 *  firstOf, every  core/pattern.mjs:2022 (aliases)       chunk           core/pattern.mjs:2571
 *  off             core/pattern.mjs:2236                 struct, mask    core/pattern.mjs:1161, 1173
 *  sometimes       core/signal.mjs:800                   often           core/signal.mjs:853
 *  rarely          core/signal.mjs:867                   degradeBy       core/signal.mjs:699
 *  euclid          core/euclid.mjs:138                   euclidRot       core/euclid.mjs:150
 *  lpf             core/controls.mjs:1204                hpf             core/controls.mjs:1682
 *  crush           core/controls.mjs:858                 coarse          core/controls.mjs:868
 *  vowel           core/controls.mjs:2447                distort         core/controls.mjs:2323
 *  phaser          core/controls.mjs:1126-1128           attack          core/controls.mjs:453
 *  decay           core/controls.mjs:736                 sustain         core/controls.mjs:747
 *  release         core/controls.mjs:758                 fm              core/controls.mjs:498 (registerMultiControl, 'fm')
 *  room            core/controls.mjs:2196                roomsize        core/controls.mjs:2287
 *  delay           core/controls.mjs:1733                delaytime       core/controls.mjs:1769
 *  delayfeedback   core/controls.mjs:1745                pan             core/controls.mjs:2085
 *  speed           core/controls.mjs:2385                jux             core/pattern.mjs:2379
 *  chop            core/pattern.mjs:3291                 slice           core/pattern.mjs:3357
 *  striate         core/pattern.mjs:3316                 loopAt          core/pattern.mjs:3427
 *  add             core/pattern.mjs:1045 (composer)      arp             core/pattern.mjs:966
 *  transpose       @strudel/tonal/tonal.mjs:114          scale           tonal/tonal.mjs:268
 *  scaleTranspose  tonal/tonal.mjs:168                   voicing         tonal/voicings.mjs:196
 *  sine, range     core/signal.mjs:80, core/pattern.mjs:1771 (used inside templates; not catalog entries)
 *
 * Considered and dropped because they do not exist at the pinned versions: rolled, rot, arpMode, acidenv (lpenv exists
 * but takes an envelope, so it is not offered).
 */

const HELPER_NAMES = ["sine", "range", "rev", "note", "x"];

function loadStrudelSources(): string | null {
  const pnpmDir = fileURLToPath(new URL("../../../../../node_modules/.pnpm/", import.meta.url));
  if (!existsSync(pnpmDir)) return null;
  const entries = readdirSync(pnpmDir);
  const files: string[] = [];
  const pick = (prefix: string, rel: string[]) => {
    const dir = entries.find((e) => e.startsWith(prefix));
    if (!dir) return;
    const pkg = prefix.replace(/^@strudel\+/, "@strudel/").replace(/@$/, "");
    for (const f of rel) files.push(`${pnpmDir}${dir}/node_modules/${pkg}/${f}`);
  };
  pick("@strudel+core@", ["pattern.mjs", "signal.mjs", "controls.mjs", "euclid.mjs", "pick.mjs"]);
  pick("@strudel+tonal@", ["tonal.mjs", "voicings.mjs"]);
  pick("superdough@", ["superdough.mjs"]);
  const present = files.filter((f) => existsSync(f));
  return present.length >= 7 ? present.map((f) => readFileSync(f, "utf8")).join("\n") : null;
}

const sources = loadStrudelSources();

/** Balanced (), [] and "" check: a cheap stand-in for parsing the template as JavaScript. */
function wellFormed(code: string): boolean {
  const stack: string[] = [];
  const pairs: Record<string, string> = { ")": "(", "]": "[" };
  let quote: string | null = null;
  for (const ch of code) {
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[") stack.push(ch);
    else if (ch === ")" || ch === "]") {
      if (stack.pop() !== pairs[ch]) return false;
    }
  }
  return stack.length === 0 && quote === null;
}

describe("modifier catalog", () => {
  it("has roughly forty to fifty entries with unique names", () => {
    expect(MODIFIERS.length).toBeGreaterThanOrEqual(40);
    expect(MODIFIERS.length).toBeLessThanOrEqual(55);
    expect(new Set(MODIFIERS.map((m) => m.name)).size).toBe(MODIFIERS.length);
  });

  it("covers every category", () => {
    for (const { id } of MODIFIER_CATEGORIES) expect(modifiersByCategory(id).length).toBeGreaterThan(0);
    expect(MODIFIERS.every((m) => MODIFIER_CATEGORIES.some((c) => c.id === m.category))).toBe(true);
  });

  it("includes the functions the spec names", () => {
    const names = MODIFIERS.map((m) => m.name);
    for (const n of ["fast", "slow", "early", "late", "ply", "swingBy", "hurry", "rev", "palindrome", "iter", "lastOf", "firstOf", "every", "sometimes", "often", "rarely", "degradeBy", "chunk", "euclid", "lpf", "hpf", "crush", "coarse", "vowel", "distort", "phaser", "attack", "release", "decay", "sustain", "room", "delay", "jux", "pan", "chop", "slice", "striate", "loopAt", "speed", "add", "scale", "transpose", "arp", "voicing"]) {
      expect(names).toContain(n);
    }
  });

  it("writes templates as chained calls that start with the function name", () => {
    for (const m of MODIFIERS) {
      expect(m.template.startsWith(`.${m.name}(`)).toBe(true);
      expect(wellFormed(m.template)).toBe(true);
      expect(m.template.endsWith(")")).toBe(true);
    }
  });

  it("describes each function in plain words", () => {
    for (const m of MODIFIERS) {
      expect(m.description.length).toBeGreaterThan(8);
      expect(m.description.endsWith(".")).toBe(false);
      expect(m.description).not.toContain("=>");
    }
  });

  it("finds entries by name", () => {
    expect(findModifier("swingBy")?.template).toBe(".swingBy(1/6, 4)");
    expect(findModifier("nope")).toBeUndefined();
  });

  it("keeps the mockup suggestion templates", () => {
    expect(findModifier("lastOf")?.template).toBe(".lastOf(4, rev)");
    expect(findModifier("sometimes")?.template).toBe(".sometimes(x => x.ply(2))");
    expect(findModifier("lpf")?.template).toBe(".lpf(sine.range(400, 1400).slow(8))");
  });
});

describe("well-formedness check", () => {
  it.each([
    [".lpf(sine.range(400, 1400).slow(8))", true],
    ['.slice(4, "0 2 1 3")', true],
    ['.vowel("<a e i o>")', true],
    [".fast(2", false],
    [".fast(2))", false],
    ['.struct("x ~ x', false],
    [".arp([0 1)", false],
  ])("%s → %s", (code, expected) => {
    expect(wellFormed(code)).toBe(expected);
  });
});

describe("searchModifiers", () => {
  it("returns everything for an empty query", () => {
    expect(searchModifiers("")).toHaveLength(MODIFIERS.length);
    expect(searchModifiers("   ")).toHaveLength(MODIFIERS.length);
  });

  it("ranks exact and prefix name matches first", () => {
    expect(searchModifiers("lpf")[0]?.name).toBe("lpf");
    expect(searchModifiers("sw")[0]?.name).toBe("swingBy");
    expect(searchModifiers("DELAY")[0]?.name).toBe("delay");
  });

  it("matches descriptions with every word required", () => {
    const names = searchModifiers("reverse").map((m) => m.name);
    expect(names).toContain("lastOf");
    expect(searchModifiers("reverse copy right").map((m) => m.name)).toEqual(["jux"]);
  });

  it("matches templates and categories", () => {
    expect(searchModifiers("sine").map((m) => m.name)).toEqual(expect.arrayContaining(["lpf", "pan"]));
    expect(searchModifiers("stereo").map((m) => m.name)).toEqual(["jux", "pan"]);
  });

  it("returns nothing when no entry matches", () => {
    expect(searchModifiers("zzzz")).toEqual([]);
  });
});

describe.skipIf(sources === null)("verification against the installed Strudel packages", () => {
  const defined = (name: string): boolean => {
    const text = sources ?? "";
    const quoted = new RegExp(`['"\`]${name}['"\`]`);
    const exported = new RegExp(`export (?:const|function)[^=\\n(]*\\b${name}\\b`);
    return quoted.test(text) || exported.test(text);
  };

  it.each(MODIFIERS.map((m) => m.name))("%s exists", (name) => {
    expect(defined(name)).toBe(true);
  });

  it("finds the helpers used inside templates", () => {
    for (const name of HELPER_NAMES.filter((n) => n !== "x" && n !== "note")) expect(defined(name)).toBe(true);
    expect(defined("note")).toBe(true);
  });

  it("does not find names we deliberately dropped", () => {
    for (const name of ["rolled", "arpMode", "acidenv"]) expect(defined(name)).toBe(false);
  });
});
