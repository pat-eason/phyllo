import { describe, expect, it } from "vitest";
import { formatRoute, parseHash } from "./router";

describe("router", () => {
  it.each([
    ["#/start", { screen: "start" }],
    ["#/library", { screen: "library" }],
    ["#/arrange", { screen: "arrange" }],
    ["#/arrange/", { screen: "arrange" }],
    ["#/pattern", { screen: "pattern", trackId: null }],
    ["#/pattern/kick", { screen: "pattern", trackId: "kick" }],
    ["#/pattern/t%3A1", { screen: "pattern", trackId: "t:1" }],
    ["#/mixer", { screen: "mixer" }],
    ["#/settings", { screen: "settings" }],
  ])("should parse %s", (hash, route) => {
    // Arrange / Act / Assert
    expect(parseHash(hash)).toEqual(route);
  });

  it.each(["", "#", "#/", "#/nope", "#/mixer/extra"])("should not route %j", (hash) => {
    // Arrange / Act / Assert
    expect(parseHash(hash)).toBeNull();
  });

  it("should format routes back to hashes", () => {
    // Arrange / Act / Assert
    expect(formatRoute({ screen: "pattern", trackId: "t:1" })).toBe("#/pattern/t%3A1");
    expect(formatRoute({ screen: "pattern", trackId: null })).toBe("#/pattern");
    expect(formatRoute({ screen: "library" })).toBe("#/library");
  });
});
