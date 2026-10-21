import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Clip, type ClipProps } from "./Clip";

const base: ClipProps = {
  name: "Bass",
  startBar: 9,
  endBar: 16,
  color: "#F5C25B",
  label: "<c2 eb2 g2 bb1>*2",
  viz: { kind: "melodic", notes: [{ t: 0, d: 0.5, pitch: 0 }, { t: 0.5, d: 0.5, pitch: 1 }] },
};

function renderClip(props: Partial<ClipProps> = {}) {
  const utils = render(<Clip {...base} {...props} />);
  return { ...utils, clip: screen.getByRole("button") };
}

describe("Clip", () => {
  it("should be a button named by track, bars and pattern", () => {
    // Arrange / Act
    const { clip } = renderClip();

    // Assert
    expect(clip).toHaveAccessibleName("Bass, bars 9 to 16, <c2 eb2 g2 bb1>*2");
    expect(clip).toHaveAttribute("type", "button");
    expect(clip).toHaveTextContent("<c2 eb2 g2 bb1>*2");
  });

  it("should say muted in the name when not audible", () => {
    // Arrange / Act
    const { clip } = renderClip({ audible: false });

    // Assert
    expect(clip).toHaveAccessibleName("Bass, bars 9 to 16, <c2 eb2 g2 bb1>*2, muted");
    expect(clip).toHaveAttribute("data-inaudible");
  });

  it("should forward its ref to the button", () => {
    // Arrange
    const ref = createRef<HTMLButtonElement>();

    // Act
    render(<Clip {...base} ref={ref} />);

    // Assert
    expect(ref.current).toBe(screen.getByRole("button"));
  });

  it("should tile one cycle across every bar", () => {
    // Arrange / Act
    const { container } = renderClip({ viz: { kind: "drum", ticks: [0, 0.5] }, startBar: 1, endBar: 4 });

    // Assert
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("viewBox", "0 0 4 1");
    const d = container.querySelector("path")?.getAttribute("d") ?? "";
    expect(d.match(/M/g)).toHaveLength(8);
    expect(d).toContain("M3.5 0V1");
  });

  it("should cycle a per-bar viz list across the bars", () => {
    // Arrange
    const bar = (pitch: number) => ({ kind: "melodic" as const, notes: [{ t: 0, d: 1, pitch }] });

    // Act
    const { container } = renderClip({ viz: [bar(0), bar(1)], startBar: 1, endBar: 3 });

    // Assert: bars 1 and 3 share the low dash, bar 2 is high
    const d = container.querySelector("path")?.getAttribute("d") ?? "";
    expect(d).toBe("M0 0.88H0.85M1 0.12H1.85M2 0.88H2.85");
  });

  it("should draw stacked dashes for chords and a waveform for samples", () => {
    // Arrange / Act
    const chord = renderClip({ viz: { kind: "chord", chords: [{ t: 0, d: 1, pitches: [0, 0.5, 1] }] }, startBar: 1, endBar: 1 });
    const chordD = chord.container.querySelector("path")?.getAttribute("d") ?? "";
    chord.unmount();
    const sample = renderClip({ viz: { kind: "sample", peaks: [0.5, 1, 0.5] }, startBar: 1, endBar: 1 });

    // Assert
    expect(chordD.match(/M/g)).toHaveLength(3);
    expect(sample.container.querySelector("polygon")?.getAttribute("points")?.split(" ")).toHaveLength(6);
  });

  it("should draw a placeholder waveform without peaks and a badge for code", () => {
    // Arrange / Act
    const sample = renderClip({ viz: { kind: "sample" } });
    const hasWave = sample.container.querySelector("polygon") !== null;
    sample.unmount();
    const code = renderClip({ viz: { kind: "code" } });

    // Assert
    expect(hasWave).toBe(true);
    expect(code.container.querySelector("svg[data-viz]")).toBeNull();
    expect(code.clip).toHaveTextContent("code");
  });

  it("should reflect selected and dragging states", () => {
    // Arrange / Act
    const { clip } = renderClip({ selected: true, dragging: true });

    // Assert
    expect(clip).toHaveAttribute("data-selected");
    expect(clip).toHaveAttribute("data-dragging");
  });

  it("should report move and resize pointer-downs separately", async () => {
    // Arrange
    const user = userEvent.setup();
    const onMoveStart = vi.fn();
    const onResizeStart = vi.fn();
    const { clip, container } = renderClip({ onMoveStart, onResizeStart });
    const end = container.querySelector('[data-edge="end"]');
    const start = container.querySelector('[data-edge="start"]');
    if (!end || !start) throw new Error("handles missing");

    // Act
    await user.pointer({ keys: "[MouseLeft]", target: end });
    await user.pointer({ keys: "[MouseLeft]", target: start });
    await user.pointer({ keys: "[MouseLeft]", target: clip });

    // Assert
    expect(onResizeStart.mock.calls.map((c) => c[0])).toEqual(["end", "start"]);
    expect(onMoveStart).toHaveBeenCalledTimes(1);
  });

  it("should render no handles without onResizeStart", () => {
    // Arrange / Act
    const { container } = renderClip();

    // Assert
    expect(container.querySelector("[data-edge]")).toBeNull();
  });

  it("should pass clicks, double-clicks and keys through", async () => {
    // Arrange
    const user = userEvent.setup();
    const onDoubleClick = vi.fn();
    const onKeyDown = vi.fn();
    const { clip } = renderClip({ onDoubleClick, onKeyDown });

    // Act
    await user.dblClick(clip);
    await user.keyboard("{ArrowRight}");

    // Assert
    expect(onDoubleClick).toHaveBeenCalledTimes(1);
    expect(onKeyDown).toHaveBeenCalled();
    expect(clip).toHaveFocus();
  });
});
