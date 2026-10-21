import { describe, expect, it } from "vitest";
import { tokenize } from "./tokenize";

const kinds = (line: string) =>
  (tokenize(line)[0] ?? []).filter((t) => t.type !== "plain" && t.type !== "punct").map((t) => [t.type, t.text]);

describe("tokenize", () => {
  it("should color labels, calls, strings and numbers of a track line", () => {
    // Arrange / Act
    const tokens = kinds('$: s("bd*4").bank("RolandTR909").gain(.82)');

    // Assert
    expect(tokens).toEqual([
      ["label", "$:"],
      ["fn", "s"],
      ["string", '"bd*4"'],
      ["fn", "bank"],
      ["string", '"RolandTR909"'],
      ["fn", "gain"],
      ["number", ".82"],
    ]);
  });

  it("should treat a muted label and a trailing comment", () => {
    // Arrange / Act
    const tokens = kinds('_$: s("hh*8") // hats');

    // Assert
    expect(tokens).toEqual([
      ["label", "_$:"],
      ["fn", "s"],
      ["string", '"hh*8"'],
      ["comment", "// hats"],
    ]);
  });

  it("should color Strudel signals and JS keywords", () => {
    // Arrange / Act
    const tokens = kinds("const x = sine.range(400, 1400)");

    // Assert
    expect(tokens).toEqual([
      ["keyword", "const"],
      ["fn", "sine"],
      ["fn", "range"],
      ["number", "400"],
      ["number", "1400"],
    ]);
  });

  it("should carry a block comment across lines", () => {
    // Arrange / Act
    const lines = tokenize("/* intro\nstill comment */ silence");

    // Assert
    expect(lines[0]).toEqual([{ type: "comment", text: "/* intro", start: 0 }]);
    expect(lines[1]?.[0]).toEqual({ type: "comment", text: "still comment */", start: 0 });
    expect(lines[1]?.at(-1)).toEqual({ type: "fn", text: "silence", start: 17 });
  });

  it("should keep the offsets of every token so lines can be rebuilt", () => {
    // Arrange
    const line = '     .lpf(sine.range(400, 1400).slow(8)).lpq(10)';

    // Act
    const rebuilt = (tokenize(line)[0] ?? []).map((t) => t.text).join("");

    // Assert
    expect(rebuilt).toBe(line);
  });
});
