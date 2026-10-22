import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cloneClip, cloneModifier, cloneTrack, copyName } from "./copies";
import { createClip, createModifier, createTrack } from "./factories";
import { createSequentialIdGenerator, setIdGenerator } from "./ids";

beforeEach(() => {
  setIdGenerator(createSequentialIdGenerator());
});
afterEach(() => {
  setIdGenerator(null);
});

function bassTrack() {
  return createTrack("melodic", {
    id: "trk_bass",
    name: "Bass",
    clips: [createClip(1, 8, "clip_a"), createClip(9, 16, "clip_b")],
    modifiers: [createModifier(".lpf(800)", { id: "mod_a" })],
    params: { gain: 0.6 },
  });
}

describe("copies", () => {
  it("should name a first copy `… copy`", () => {
    // Arrange / Act / Assert
    expect(copyName("Bass", ["Bass"])).toBe("Bass copy");
  });

  it("should number further copies and not stack `copy`", () => {
    // Arrange
    const existing = ["Bass", "Bass copy", "Bass copy 2"];

    // Act / Assert
    expect(copyName("Bass", existing)).toBe("Bass copy 3");
    expect(copyName("Bass copy", existing)).toBe("Bass copy 3");
  });

  it("should give a cloned track fresh track, clip and modifier ids", () => {
    // Arrange
    const track = bassTrack();

    // Act
    const copy = cloneTrack(track, { existing: [track] });

    // Assert
    expect(copy.id).not.toBe("trk_bass");
    expect(copy.clips.map((clip) => clip.id)).not.toContain("clip_a");
    expect(copy.modifiers[0]?.id).not.toBe("mod_a");
    expect(copy.name).toBe("Bass copy");
  });

  it("should keep a cloned track's content and not share objects with the original", () => {
    // Arrange
    const track = bassTrack();

    // Act
    const copy = cloneTrack(track);
    copy.params.gain = 0.1;

    // Assert
    expect(copy.clips.map(({ startBar, endBar }) => [startBar, endBar])).toEqual([
      [1, 8],
      [9, 16],
    ]);
    expect(copy.modifiers[0]?.code).toBe(".lpf(800)");
    expect(track.params.gain).toBe(0.6);
  });

  it("should move a cloned clip to a new start and keep its length", () => {
    // Arrange
    const clip = createClip(9, 16, "clip_a");

    // Act
    const copy = cloneClip(clip, 17);

    // Assert
    expect(copy).toMatchObject({ startBar: 17, endBar: 24 });
    expect(copy.id).not.toBe("clip_a");
  });

  it("should clone a modifier with a fresh id", () => {
    // Arrange
    const modifier = createModifier(".room(.4)", { id: "mod_a", label: "Space" });

    // Act
    const copy = cloneModifier(modifier);

    // Assert
    expect(copy).toMatchObject({ code: ".room(.4)", label: "Space", enabled: true });
    expect(copy.id).not.toBe("mod_a");
  });
});
