// stopPreview (T6.5): previews play on a reserved orbit that can be faded and dropped without touching the song.
import { describe, expect, it } from "vitest";
import { createEngine, PREVIEW_ORBIT, releasePreviewOrbit } from "./engine";
import type { PreviewOrbitHost } from "./engine";

interface FakeNode {
  disconnected: boolean;
  disconnect(): void;
}

interface FakeGainNode extends FakeNode {
  gain: {
    value: number;
    events: string[];
    cancelScheduledValues(t: number): void;
    setValueAtTime(v: number, t: number): void;
    linearRampToValueAtTime(v: number, t: number): void;
  };
}

function fakeNode(): FakeNode {
  return {
    disconnected: false,
    disconnect() {
      this.disconnected = true;
    },
  };
}

function fakeGainNode(value: number): FakeGainNode {
  const events: string[] = [];
  return {
    ...fakeNode(),
    gain: {
      value,
      events,
      cancelScheduledValues: (t) => events.push(`cancel@${t}`),
      setValueAtTime: (v, t) => events.push(`set ${v}@${t}`),
      linearRampToValueAtTime: (v, t) => events.push(`ramp ${v}@${t}`),
    },
  };
}

function orbit(gain = 1) {
  return { output: fakeGainNode(gain), summingNode: fakeNode() };
}

function host(nodes: Record<number, ReturnType<typeof orbit>>): PreviewOrbitHost {
  return { nodes: nodes as unknown as PreviewOrbitHost["nodes"] };
}

describe("stopPreview", () => {
  it("should be a no-op before init", () => {
    // Arrange
    const engine = createEngine({ logger: () => undefined });

    // Act
    const act = () => engine.stopPreview();

    // Assert
    expect(act).not.toThrow();
    expect(engine.playing).toBe(false);
  });

  it("should fade the preview orbit to silence from its current level over the ramp", () => {
    // Arrange
    const preview = orbit(0.8);
    const controller = host({ [PREVIEW_ORBIT]: preview });

    // Act
    releasePreviewOrbit(controller, 10, 0.02);

    // Assert
    expect(preview.output.gain.events).toEqual(["cancel@10", "set 0.8@10", "ramp 0@10.02"]);
  });

  it("should detach the preview orbit at once and leave the song's orbits alone", () => {
    // Arrange
    const song = orbit();
    const controller = host({ 1: song, [PREVIEW_ORBIT]: orbit() });

    // Act
    releasePreviewOrbit(controller, 0, 0.02);

    // Assert
    expect(Object.keys(controller.nodes)).toEqual(["1"]);
    expect(song.output.gain.events).toEqual([]);
    expect(song.output.disconnected).toBe(false);
  });

  it("should disconnect the faded orbit only when the returned cleanup runs", () => {
    // Arrange
    const preview = orbit();
    const controller = host({ [PREVIEW_ORBIT]: preview });

    // Act
    const disconnect = releasePreviewOrbit(controller, 0, 0.02);
    const before = preview.output.disconnected;
    disconnect?.();

    // Assert
    expect(before).toBe(false);
    expect(preview.output.disconnected).toBe(true);
    expect(preview.summingNode.disconnected).toBe(true);
  });

  it("should return null when nothing has previewed", () => {
    // Arrange
    const controller = host({ 1: orbit() });

    // Act
    const result = releasePreviewOrbit(controller, 0, 0.02);

    // Assert
    expect(result).toBeNull();
    expect(Object.keys(controller.nodes)).toEqual(["1"]);
  });
});
