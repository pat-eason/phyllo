import { describe, expect, it } from "vitest";
import { CHEAT_SHEET } from "./cheatsheet";

describe("mini-notation cheat sheet", () => {
  it("has the eight entries from the spec in order", () => {
    expect(CHEAT_SHEET.map((e) => e.token)).toEqual(["~", "bd*4", "[a b]", "<a b>", "a, b", "bd?", "bd(3,8)", "a@3"]);
  });

  it("explains each entry in a plain sentence", () => {
    for (const entry of CHEAT_SHEET) {
      expect(entry.meaning.length).toBeGreaterThan(10);
      expect(entry.meaning.endsWith(".")).toBe(true);
    }
    const byId = Object.fromEntries(CHEAT_SHEET.map((e) => [e.id, e.meaning]));
    expect(byId.rest).toMatch(/silent/);
    expect(byId.euclid).toBe("Spread 3 hits evenly over 8 steps.");
    expect(byId.maybe).toMatch(/50%/);
  });

  it("gives each entry a runnable example that uses its operator", () => {
    const operator: Record<string, string> = { rest: "~", repeat: "*", group: "[", alternate: "<", layer: ",", maybe: "?", euclid: "(", stretch: "@" };
    for (const entry of CHEAT_SHEET) {
      expect(entry.example).toContain(operator[entry.id] ?? "!");
      let depth = 0;
      for (const ch of entry.example) {
        if ("[<(".includes(ch)) depth++;
        if ("]>)".includes(ch)) depth--;
      }
      expect(depth).toBe(0);
    }
  });

  it("has unique ids", () => {
    expect(new Set(CHEAT_SHEET.map((e) => e.id)).size).toBe(CHEAT_SHEET.length);
  });
});
