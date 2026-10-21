import { describe, expect, it } from "vitest";
import type { GeneratedProgram } from "@phyllo/model";
import { setLabelMuted, soloTracks } from "./stems";

const PROGRAM: GeneratedProgram = {
  code: [
    "setcpm(120/4)",
    `$: s("bd*4").bank("RolandTR909")`,
    `$: note("<c2 eb2>*2").s("sawtooth")`,
    `     .lpf(800)`,
    `_$: chord("<Cm7 Fm7>").voicing().s("gm_epiano1")`,
    `all(x => x.postgain(.9))`,
  ].join("\n"),
  lines: { drums: { start: 2, end: 2 }, bass: { start: 3, end: 4 }, keys: { start: 5, end: 5 } },
  scope: "song",
};

describe("setLabelMuted", () => {
  it.each([
    [`$: s("bd")`, true, `_$: s("bd")`],
    [`_$: s("bd")`, true, `_$: s("bd")`],
    [`_$: s("bd")`, false, `$: s("bd")`],
    [`  $: s("bd")`, true, `  _$: s("bd")`],
    [`lead: n("0")`, true, `_lead: n("0")`],
    [`lead_: n("0")`, false, `lead: n("0")`],
    [`  .lpf(800)`, true, `  .lpf(800)`],
  ])("%s (muted=%s) → %s", (line, muted, expected) => {
    expect(setLabelMuted(line, muted)).toBe(expected);
  });
});

describe("soloTracks", () => {
  it("mutes every other track and keeps the line count", () => {
    const out = soloTracks(PROGRAM, ["bass"]);
    expect(out.code.split("\n")).toEqual([
      "setcpm(120/4)",
      `_$: s("bd*4").bank("RolandTR909")`,
      `$: note("<c2 eb2>*2").s("sawtooth")`,
      `     .lpf(800)`,
      `_$: chord("<Cm7 Fm7>").voicing().s("gm_epiano1")`,
      `all(x => x.postgain(.9))`,
    ]);
    expect(out.lines).toEqual(PROGRAM.lines);
  });

  it("unmutes a soloed track that was muted in the program", () => {
    const out = soloTracks(PROGRAM, ["keys"]);
    expect(out.code.split("\n")[4]).toBe(`$: chord("<Cm7 Fm7>").voicing().s("gm_epiano1")`);
    expect(out.code.split("\n")[1]).toBe(`_$: s("bd*4").bank("RolandTR909")`);
  });

  it("leaves the prelude and master lines untouched", () => {
    const out = soloTracks(PROGRAM, []);
    expect(out.code.split("\n")[0]).toBe("setcpm(120/4)");
    expect(out.code.split("\n")[5]).toBe("all(x => x.postgain(.9))");
  });
});
