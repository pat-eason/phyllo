import { describe, expect, it } from "vitest";
import { TIPS, TIP_COUNT, TIP_TARGETS, nextTipStep, tipForStep } from "./tips";

describe("tips curriculum", () => {
  it("has five steps numbered 1 to 5 in order", () => {
    expect(TIPS.map((t) => t.step)).toEqual([1, 2, 3, 4, 5]);
    expect(TIP_COUNT).toBe(5);
  });

  it("follows the fixed Guided curriculum", () => {
    expect(TIPS.map((t) => t.id)).toEqual(["pick-a-starter", "mute-and-solo", "shape-a-sound", "edit-a-pattern", "export-or-share"]);
  });

  it("keeps the mockup title for step 3", () => {
    expect(tipForStep(3)?.title).toBe("Give the bass some movement");
    expect(tipForStep(3)?.target).toBe("inspector-knob-lpf");
  });

  it("gives every tip a title, a one-sentence body and a Show me action", () => {
    for (const tip of TIPS) {
      expect(tip.title.length).toBeGreaterThan(3);
      expect(tip.body.length).toBeGreaterThan(20);
      expect(tip.body.match(/[.!?](\s|$)/g)).toHaveLength(1);
      expect(tip.body.endsWith(".")).toBe(true);
      expect(tip.action).toBe("Show me");
    }
  });

  it("names real Guided controls in the body", () => {
    const body = (step: number) => tipForStep(step)?.body ?? "";
    expect(body(1)).toContain("Starters");
    expect(body(2)).toMatch(/Mute/);
    expect(body(2)).toMatch(/Solo/);
    expect(body(3)).toContain("Brightness");
    expect(body(3)).toContain("Try one");
    expect(body(4)).toContain("Pattern");
    expect(body(5)).toContain("Export");
  });

  it("points every tip at a published anchor id", () => {
    for (const tip of TIPS) expect(TIP_TARGETS).toContain(tip.target);
  });

  it("uses unique tip ids and kebab-case anchor ids", () => {
    expect(new Set(TIPS.map((t) => t.id)).size).toBe(TIPS.length);
    expect(new Set(TIP_TARGETS).size).toBe(TIP_TARGETS.length);
    for (const target of TIP_TARGETS) expect(target).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it("looks tips up by step", () => {
    expect(tipForStep(1)?.id).toBe("pick-a-starter");
    expect(tipForStep(0)).toBeUndefined();
    expect(tipForStep(6)).toBeUndefined();
  });

  it("advances one step and stops at the last tip", () => {
    expect(nextTipStep(1)).toBe(2);
    expect(nextTipStep(4)).toBe(5);
    expect(nextTipStep(5)).toBe(5);
    expect(nextTipStep(0)).toBe(1);
  });
});
