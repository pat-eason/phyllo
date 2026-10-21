import { describe, expect, it } from "vitest";
import { chord, type Pattern } from "@strudel/core";
import { mini } from "@strudel/mini";
import "@strudel/tonal";
import { STARTERS, buildStarterProject, transposePattern } from "@phyllo/model";

// Every chord symbol a starter can produce (in any key) must be in tonal's voicing dictionary,
// otherwise Strudel logs "unknown chord" and the track is silent for that cycle (T1.V #1).
describe("starter chord tracks voice in every key", () => {
  const chordTracks = STARTERS.flatMap((s) =>
    buildStarterProject(s.id).tracks.filter((t) => t.kind === "chord").map((t) => ({ starter: s.id, pattern: t.pattern })),
  );

  it("should have at least one chord track to check", () => {
    expect(chordTracks.length).toBeGreaterThan(0);
  });

  it.each(chordTracks)("should voice every cycle of $starter's chords in all 12 transpositions", ({ pattern }) => {
    for (let semitones = 0; semitones < 12; semitones++) {
      const transposed = transposePattern(pattern, semitones, { kind: "chord" });
      const voiced = (chord(mini(transposed)).voicing as () => Pattern).call(chord(mini(transposed)));
      for (let cycle = 0; cycle < 4; cycle++) {
        const haps = voiced.queryArc(cycle, cycle + 1);
        expect(haps.length, `${transposed} cycle ${cycle}`).toBeGreaterThan(0);
      }
    }
  });
});
