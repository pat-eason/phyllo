import { describe, expect, it } from "vitest";
import { transpiler } from "@strudel/transpiler";
import type { LineMap } from "@phyllo/model";
import {
  attributeEvalError,
  attributeHapError,
  attributeQueryError,
  findIdentifierLine,
  identifierFromMessage,
  labelLines,
  lineAtOffset,
  trackAtLine,
} from "./errors";

const LINES: LineMap = {
  drums: { start: 3, end: 3 },
  bass: { start: 4, end: 5 },
  keys: { start: 6, end: 6 },
};
const program = (bassLine: string, bassCont = `  .lpf(800)`) =>
  [
    "setcpm(120/4)",
    "",
    `$: s("bd*4").bank("RolandTR909")`,
    `$: ${bassLine}`,
    bassCont,
    `_$: chord("<Cm7 Fm7>").voicing().s("gm_epiano1")`,
  ].join("\n");

/** The real error the transpiler throws for `code`. */
function transpileError(code: string): unknown {
  try {
    transpiler(code);
  } catch (err) {
    return err;
  }
  throw new Error("expected the transpiler to throw");
}

describe("trackAtLine", () => {
  it.each([
    [1, undefined],
    [3, "drums"],
    [4, "bass"],
    [5, "bass"],
    [6, "keys"],
    [7, undefined],
    [undefined, undefined],
  ])("line %s → %s", (line, id) => {
    expect(trackAtLine(LINES, line)).toBe(id);
  });
});

describe("lineAtOffset", () => {
  it("counts newlines before the offset", () => {
    expect(lineAtOffset("a\nbb\nccc", 0)).toBe(1);
    expect(lineAtOffset("a\nbb\nccc", 2)).toBe(2);
    expect(lineAtOffset("a\nbb\nccc", 6)).toBe(3);
  });
});

describe("labelLines", () => {
  it("lists top-level labelled statements in order, muted ones included", () => {
    expect(labelLines(program(`note("c2").s("sawtooth")`))).toEqual([3, 4, 6]);
  });

  it("is empty for code that doesn't parse", () => {
    expect(labelLines("$: s(")).toEqual([]);
  });
});

describe("identifierFromMessage", () => {
  it.each([
    ["foo is not defined", { name: "foo", asMethod: false }],
    ["ReferenceError: sawtoothh is not defined", { name: "sawtoothh", asMethod: false }],
    ["note(...).s(...).lpff is not a function", { name: "lpff", asMethod: true }],
    ["voicingz is not a function", { name: "voicingz", asMethod: false }],
    ["Cannot read properties of undefined (reading 'x')", undefined],
  ])("%s", (message, expected) => {
    expect(identifierFromMessage(message)).toEqual(expected);
  });
});

describe("findIdentifierLine", () => {
  it("finds method calls and bare identifiers, ignoring comments", () => {
    const code = `// .lpff here is a comment\n$: s("bd")\n$: note("c").lpff(3)\nfoo(1)`;
    expect(findIdentifierLine(code, "lpff", true)).toBe(3);
    expect(findIdentifierLine(code, "foo", false)).toBe(4);
    expect(findIdentifierLine(code, "nope", false)).toBeUndefined();
  });
});

describe("attributeEvalError", () => {
  it("attributes an acorn syntax error by line and 1-based column", () => {
    const code = program(`note("c2").s("sawtooth"))`);
    const err = transpileError(code);
    expect(attributeEvalError(err, { code, lines: LINES })).toEqual({
      kind: "eval",
      message: "Unexpected token",
      line: 4,
      column: 28, // the stray ")" after `$: note("c2").s("sawtooth")`
      trackId: "bass",
    });
  });

  it("attributes a syntax error on a continuation line to its track", () => {
    const code = program(`note("c2").s("sawtooth")`, `  .lpf(800))`);
    const e = attributeEvalError(transpileError(code), { code, lines: LINES });
    expect(e.line).toBe(5);
    expect(e.trackId).toBe("bass");
  });

  it("attributes a mini-notation parse error to the line it is on", () => {
    const code = program(`note("<c2 eb2").s("sawtooth")`);
    const e = attributeEvalError(transpileError(code), { code, lines: LINES });
    expect(e.kind).toBe("pattern");
    expect(e.line).toBe(4);
    expect(e.trackId).toBe("bass");
    expect(e.message).not.toContain("[mini]");
  });

  it("attributes a runtime 'not a function' error by the method name", () => {
    const code = program(`note("c2").s("sawtooth").lpff(800)`);
    const e = attributeEvalError(new TypeError("note(...).s(...).lpff is not a function"), { code, lines: LINES });
    expect(e).toMatchObject({ kind: "eval", line: 4, trackId: "bass" });
  });

  it("attributes a 'not defined' error by the identifier", () => {
    const code = program(`note("c2").s(sawtoothh)`);
    const e = attributeEvalError(new ReferenceError("sawtoothh is not defined"), { code, lines: LINES });
    expect(e).toMatchObject({ line: 4, trackId: "bass" });
  });

  it("falls back to the first block that didn't finish evaluating", () => {
    const code = program(`note("c2").s("sawtooth")`);
    const e = attributeEvalError(new Error("Cannot read properties of undefined"), { code, lines: LINES, evaluatedBlocks: 1 });
    expect(e).toMatchObject({ kind: "eval", line: 4, trackId: "bass" });
  });

  it("leaves the track unset when nothing points at one", () => {
    const code = program(`note("c2").s("sawtooth")`);
    const e = attributeEvalError(new Error("something odd"), { code, lines: LINES });
    expect(e).toEqual({ kind: "eval", message: "something odd" });
  });
});

describe("attributeQueryError", () => {
  it("maps the failing block index to its label line and track", () => {
    const code = program(`note("c2").s("sawtooth")`);
    expect(attributeQueryError(new Error("boom"), { code, lines: LINES }, 2)).toEqual({
      kind: "query",
      message: "boom",
      line: 6,
      trackId: "keys",
    });
  });

  it("strips Strudel's log prefix", () => {
    const code = program(`note("c2")`);
    expect(attributeQueryError(new Error("[query] error: boom"), { code, lines: LINES }, undefined)).toEqual({
      kind: "query",
      message: "boom",
    });
  });
});

describe("attributeHapError", () => {
  it("uses the hap's first source location", () => {
    const code = program(`note("c2").s("nosuchsound")`);
    const offset = code.indexOf("nosuchsound");
    const e = attributeHapError(new Error("sound nosuchsound not found! Is it loaded?"), { code, lines: LINES }, [
      { start: offset },
    ]);
    expect(e).toEqual({ kind: "query", message: "sound nosuchsound not found! Is it loaded?", line: 4, trackId: "bass" });
  });
});
