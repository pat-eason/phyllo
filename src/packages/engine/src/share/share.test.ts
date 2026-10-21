import { describe, expect, it } from "vitest";
import { code2hash, fromShareUrl, hash2code, toShareUrl } from "./share";

describe("share links", () => {
  it("should decode the documented strudel.cc hash", () => {
    // Act / Assert
    expect(hash2code("ImMzIGUzIg%3D%3D")).toBe('"c3 e3"');
    expect(code2hash('"c3 e3"')).toBe("ImMzIGUzIg%3D%3D");
  });

  it.each([
    ["ascii", 'setcpm(120/4)\n\n$: s("bd*4").bank("RolandTR909")'],
    ["unicode", '// Grüße · ~400–1.4k ♪\n$: note("c3").s("sine")'],
    ["emoji", "// 🌀🎛️ 𝄞\n$: s(\"bd\")"],
    ["empty", ""],
  ])("should round-trip %s code", (_label, code) => {
    // Act
    const hash = code2hash(code);

    // Assert
    expect(hash2code(hash)).toBe(code);
    expect(hash).toMatch(/^[A-Za-z0-9%]*$/);
  });

  it("should round-trip a 300 kB program", () => {
    // Arrange
    const line = '$: note("<c2 eb2 g2 bb1>*2").s("sawtooth").lpf(sine.range(400, 1400).slow(8)) // é\n';
    const code = line.repeat(Math.ceil(300_000 / line.length));

    // Act
    const url = toShareUrl(code);

    // Assert
    expect(code.length).toBeGreaterThanOrEqual(300_000);
    expect(fromShareUrl(url)).toEqual({ code });
  });

  it("should build strudel.cc URLs", () => {
    // Act / Assert
    expect(toShareUrl('"c3 e3"')).toBe("https://strudel.cc/#ImMzIGUzIg%3D%3D");
    expect(toShareUrl("x", "http://localhost:4321/")).toBe("http://localhost:4321/#eA%3D%3D");
  });

  it.each([
    ["https://strudel.cc/#ImMzIGUzIg%3D%3D", { code: '"c3 e3"' }],
    ["  https://strudel.cc/#ImMzIGUzIg%3D%3D  ", { code: '"c3 e3"' }],
    ["https://strudel.cc/?k3mJ9xPq", { shortId: "k3mJ9xPq" }],
    ["https://strudel.cc/?k3mJ9xPq&embed=1", { shortId: "k3mJ9xPq" }],
    ["https://strudel.cc/", null],
    ["https://strudel.cc/#", null],
    ["https://strudel.cc/#%%%not-base64", null],
    ["not a url", null],
  ])("should read %j", (url, expected) => {
    // Act / Assert
    expect(fromShareUrl(url)).toEqual(expected);
  });
});
