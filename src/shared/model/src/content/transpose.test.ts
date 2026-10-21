import { describe, expect, it } from "vitest";
import { formatKey, keyPrefersFlats, parseKey, semitonesBetween, transposePattern } from "./transpose";

describe("parseKey", () => {
  it.each([
    ["A minor", "A", 9, "minor"],
    ["F major", "F", 5, "major"],
    ["D dorian", "D", 2, "dorian"],
    ["Eb minor", "Eb", 3, "minor"],
    ["f# major", "F#", 6, "major"],
    ["C", "C", 0, ""],
  ])("%s", (key, root, pitchClass, mode) => {
    expect(parseKey(key)).toEqual({ root, pitchClass, mode });
  });

  it("rejects non-keys", () => {
    expect(parseKey("")).toBeNull();
    expect(parseKey("H minor")).toBeNull();
    expect(parseKey("minor")).toBeNull();
  });

  it("formats keys", () => {
    expect(formatKey("Eb", "minor")).toBe("Eb minor");
    expect(formatKey("C", "")).toBe("C");
  });
});

describe("semitonesBetween", () => {
  it.each([
    ["A minor", "A minor", 0],
    ["A minor", "C minor", 3],
    ["A minor", "F major", -4],
    ["A minor", "F# minor", -3],
    ["C minor", "D dorian", 2],
    ["C minor", "F# minor", 6],
    ["C minor", "Gb minor", 6],
    ["D dorian", "C minor", -2],
    ["E minor", "C minor", -4],
    ["C minor", "B minor", -1],
    ["B minor", "C minor", 1],
  ])("%s → %s = %i", (from, to, expected) => {
    expect(semitonesBetween(from, to)).toBe(expected);
  });

  it("stays within -5..+6 for every pair of roots", () => {
    const roots = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
    for (const a of roots) {
      for (const b of roots) {
        const s = semitonesBetween(`${a} minor`, `${b} minor`);
        expect(s).toBeGreaterThanOrEqual(-5);
        expect(s).toBeLessThanOrEqual(6);
        expect((((s + semitonesBetween(`${b} minor`, `${a} minor`)) % 12) + 12) % 12).toBe(0);
      }
    }
  });

  it("treats unknown keys as no move", () => {
    expect(semitonesBetween("nonsense", "C minor")).toBe(0);
  });
});

describe("keyPrefersFlats", () => {
  it.each([
    ["F major", true],
    ["Bb major", true],
    ["C minor", true],
    ["G minor", true],
    ["C major", false],
    ["G major", false],
    ["A minor", false],
    ["E minor", false],
    ["D dorian", false],
  ])("%s → %s", (key, expected) => {
    expect(keyPrefersFlats(key)).toBe(expected);
  });
});

describe("transposePattern: note names", () => {
  it.each([
    ["c2", 3, "eb2"],
    ["eb2", -3, "c2"],
    ["bb1", 2, "c2"],
    ["g1", 5, "c2"],
    ["b1", 1, "c2"],
    ["c2", -1, "b1"],
    ["f#3", 1, "g3"],
    ["f#3", 2, "g#3"],
    ["a1", 0, "a1"],
    ["c2", 12, "c3"],
    ["c2", -12, "c1"],
  ])("%s %+i → %s", (input, semitones, expected) => {
    expect(transposePattern(input, semitones)).toBe(expected);
  });

  it("keeps rhythm and operators intact", () => {
    expect(transposePattern("<c2 eb2 g2 bb1>*2", 2)).toBe("<d2 f2 a2 c2>*2");
    expect(transposePattern("<[c2 c3]*4 [ab1 ab2]*4 [bb1 bb2]*4 [g1 g2]*4>", 2)).toBe("<[d2 d3]*4 [bb1 bb2]*4 [c2 c3]*4 [a1 a2]*4>");
    expect(transposePattern("c5 eb5 g5 [bb5 g5] f5 ~ eb5 d5", -3)).toBe("a4 c5 e5 [g5 e5] d5 ~ c5 b4");
    expect(transposePattern("c4 e4@3 ~ g4?", 2)).toBe("d4 gb4@3 ~ a4?");
    expect(transposePattern("c2(3,8,2), e2!2 g2/2", 7)).toBe("g2(3,8,2), b2!2 d3/2");
  });

  it("keeps spellings consistent with the pattern's own accidentals", () => {
    // Natural-only pattern defaults to flats; a sharp in the pattern switches to sharps.
    expect(transposePattern("c2 e2", 1)).toBe("db2 f2");
    expect(transposePattern("c#2 e2", 1)).toBe("d2 f2");
    expect(transposePattern("c#2 e2", 3)).toBe("e2 g2");
    expect(transposePattern("a2 f#2", 1)).toBe("a#2 g2");
    expect(transposePattern("c2 e2", 1, { flats: false })).toBe("c#2 f2");
  });

  it("leaves sample names alone", () => {
    expect(transposePattern("bd*4 sd cp hh oh vox", 5, { kind: "note" })).toBe("bd*4 sd cp hh oh vox");
  });

  it("round-trips", () => {
    const p = "<[c2 c3]*4 [ab1 ab2]*4 [bb1 bb2]*4 [g1 g2]*4>";
    for (const s of [-7, -3, 1, 4, 6]) {
      expect(transposePattern(transposePattern(p, s), -s)).toBe(p);
    }
  });

  it("treats a missing octave as octave 3", () => {
    expect(transposePattern("c e g", 2)).toBe("d gb a");
    expect(transposePattern("a", 3)).toBe("c4");
  });
});

describe("transposePattern: chord symbols", () => {
  it.each([
    ["<Fmaj7 Em7 Dm7 C^7>", 2, false, "<Gmaj7 F#m7 Em7 D^7>"],
    ["<Cm7 Fm7 Ab^7 G7>", 2, true, "<Dm7 Gm7 Bb^7 A7>"],
    ["<Cm7 Fm7 Ab^7 G7>", -2, true, "<Bbm7 Ebm7 Gb^7 F7>"],
    ["Em7", 3, true, "Gm7"],
    ["C^7", 1, true, "Db^7"],
    ["Bbm", 2, true, "Cm"],
  ])("%s %+i (flats: %s)", (input, semitones, flats, expected) => {
    expect(transposePattern(input, semitones, { kind: "chord", flats })).toBe(expected);
  });

  it("uses auto-detection: capitals are chords, lowercase are notes", () => {
    expect(transposePattern("Cm7 c2", 2)).toBe("Dm7 d2");
  });

  it("does not add octaves to chord roots", () => {
    expect(transposePattern("Bb", 3, { kind: "chord" })).toBe("Db");
    expect(transposePattern("<Am7 D7>", 5, { kind: "chord" })).toBe("<Dm7 G7>");
  });

  it("keeps capitals and octaves when told the tokens are notes", () => {
    expect(transposePattern("C2 B2", 3, { kind: "note" })).toBe("Eb2 D3");
  });
});
