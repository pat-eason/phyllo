import { describe, expect, it } from "vitest";
import { explainPattern } from "./explain";

describe("explainPattern: the mockup examples", () => {
  it.each([
    ["<c2 eb2 g2 bb1>*2", '"< >" picks the next note each time; "*2" makes that happen twice per cycle.'],
    ["bd*4", '"*4" plays it four times per cycle.'],
    ["~ cp", '"~" is a rest, so that step stays silent.'],
    ["hh*8", '"*8" plays it eight times per cycle.'],
    ["<Cm7 Fm7 Ab^7 G7>", '"< >" picks the next chord each time.'],
    ["c4 [eb4 g4] ~ bb4", '"[ ]" squeezes everything inside into one step; "~" is a rest, so that step stays silent.'],
  ])("%s", (pattern, expected) => {
    expect(explainPattern(pattern)).toBe(expected);
  });
});

describe("explainPattern: each operator", () => {
  it.each([
    ["bd ~ sd ~", '"~" is a rest, so that step stays silent.'],
    ["bd*2 sd", '"*2" plays it twice in the time of one step.'],
    ["bd*3", '"*3" plays it three times per cycle.'],
    ["bd*1.5", '"*1.5" plays it 1.5 times per cycle.'],
    ["c2/2", '"/2" stretches it over two cycles.'],
    ["<c2 e2>/4", '"< >" picks the next note each time; "/4" stretches it over four cycles.'],
    ["[bd sd]", '"[ ]" squeezes everything inside into one step.'],
    ["<bd sd>", '"< >" picks the next sound each time.'],
    ["<c2 Cm7>", '"< >" picks the next sound each time.'],
    ["bd, hh", '"," plays the parts together, as layers.'],
    ["bd?", '"?" gives that step a 50% chance of playing.'],
    ["bd?0.3", '"?0.3" leaves that step out about 30% of the time.'],
    ["bd(3,8)", '"(3,8)" spreads 3 hits evenly over 8 steps.'],
    ["bd(1,4)", '"(1,4)" spreads 1 hit evenly over 4 steps.'],
    ["cp(2,8,2)", '"(2,8,2)" spreads 2 hits evenly over 8 steps, starting 2 steps in.'],
    ["bd(<3 5>,8)", '"(<3 5>,8)" spreads hits evenly over a number of steps.'],
    ["bd@3 sd", '"@3" makes that step three times as long.'],
    ["bd!2 sd", '"!2" plays that step twice in a row.'],
    ["bd! sd", '"!" repeats the previous step.'],
  ])("%s", (pattern, expected) => {
    expect(explainPattern(pattern)).toBe(expected);
  });
});

describe("explainPattern: combinations and limits", () => {
  it("describes operators in the order they first appear", () => {
    expect(explainPattern("bd*4, [~ cp]*2, hh*8")).toBe(
      '"*4" plays it four times per cycle; "," plays the parts together, as layers; "[ ]" squeezes everything inside into one step.',
    );
  });

  it("mentions each kind of operator only once", () => {
    const text = explainPattern("bd*2 sd*2 hh*2");
    expect(text.match(/\*2/g)).toHaveLength(1);
  });

  it("stops after three phrases to stay a single line", () => {
    const text = explainPattern("[bd ~ sd?]*2 <a b>@3, hh(3,8)");
    expect(text.split("; ")).toHaveLength(3);
    expect(text.endsWith(".")).toBe(true);
    expect(text).not.toContain("\n");
  });

  it("does not count the comma inside euclid arguments as a layer", () => {
    expect(explainPattern("bd(3,8)")).not.toContain("layers");
  });

  it("says 'makes that happen' for groups and 'plays it' for single steps", () => {
    expect(explainPattern("[bd sd]*2")).toBe('"[ ]" squeezes everything inside into one step; "*2" makes that happen twice per cycle.');
    expect(explainPattern("bd*2")).toBe('"*2" plays it twice per cycle.');
  });

  it("falls back to a plain description when there are no operators", () => {
    expect(explainPattern("c4 e4 g4")).toBe("Each word is a step. The 3 steps share one cycle equally.");
    expect(explainPattern("bd")).toBe("One step, played once per cycle.");
  });

  it("handles empty and whitespace-only patterns", () => {
    expect(explainPattern("")).toBe("Nothing to play yet. Type a note or a sound name.");
    expect(explainPattern("   ")).toBe("Nothing to play yet. Type a note or a sound name.");
  });

  it("copes with unbalanced input without throwing", () => {
    for (const bad of ["[bd sd", "bd(3,", "<a b", "*", "bd??", "(", "@", "bd*", "!!"]) {
      expect(() => explainPattern(bad)).not.toThrow();
      expect(explainPattern(bad).endsWith(".")).toBe(true);
    }
  });

  it("trims surrounding whitespace", () => {
    expect(explainPattern("  bd*4  ")).toBe(explainPattern("bd*4"));
  });
});
