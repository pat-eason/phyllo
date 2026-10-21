import { render } from "@testing-library/react";
import { act, createRef, Profiler } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Meter, type MeterHandle, type MeterSubscribe } from "./Meter";

/**
 * The meter is decorative (aria-hidden) and its whole output is a CSS variable per bar, so these tests
 * read bars by their data-part hook and the level from the variable.
 */
function bars(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-part="bar"]'));
}
const levelOf = (bar: HTMLElement | undefined) => Number(bar?.style.getPropertyValue("--meter-level") || 0);
const peakOf = (bar: HTMLElement | undefined) => Number(bar?.style.getPropertyValue("--meter-peak") || 0);

/** Manual frames with explicit timestamps. */
function stubFrames() {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    callbacks.set(++nextId, cb);
    return nextId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    callbacks.delete(id);
  });
  return {
    frame(time: number) {
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach((cb) => cb(time));
    },
    get pending() {
      return callbacks.size;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Meter", () => {
  it("should be hidden from assistive tech", () => {
    // Arrange / Act
    const { container } = render(<Meter level={0.5} />);

    // Assert
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("should draw one bar for a mono level and two for a stereo pair", () => {
    // Arrange / Act
    const mono = render(<Meter level={0.5} />);
    const stereo = render(<Meter level={[0.7, 0.6]} />);

    // Assert
    expect(bars(mono.container)).toHaveLength(1);
    expect(bars(stereo.container).map(levelOf)).toEqual([0.7, 0.6]);
  });

  it("should size bars from length and thickness", () => {
    // Arrange / Act
    const { container } = render(<Meter level={0} length={120} thickness={6} />);
    const root = container.firstElementChild as HTMLElement;

    // Assert
    expect(root.style.getPropertyValue("--meter-length")).toBe("120px");
    expect(root.style.getPropertyValue("--meter-thickness")).toBe("6px");
  });

  it("should write levels through the ref handle without re-rendering", () => {
    // Arrange
    const ref = createRef<MeterHandle>();
    const onRender = vi.fn();
    const { container } = render(
      <Profiler id="meter" onRender={onRender}>
        <Meter ref={ref} stereo release={0} />
      </Profiler>,
    );
    onRender.mockClear();

    // Act
    for (let i = 0; i < 30; i++) ref.current?.set(i / 40, i / 80);

    // Assert
    expect(onRender).not.toHaveBeenCalled();
    expect(bars(container).map(levelOf)).toEqual([0.725, 0.3625]);
  });

  it("should write levels pushed through subscribe and unsubscribe on unmount", () => {
    // Arrange
    let write: ((l: number, r?: number) => void) | undefined;
    const unsubscribe = vi.fn();
    const subscribe: MeterSubscribe = (w) => {
      write = w;
      return unsubscribe;
    };
    const { container, unmount } = render(<Meter subscribe={subscribe} />);

    // Act
    write?.(0.42);
    const level = levelOf(bars(container)[0]);
    unmount();

    // Assert
    expect(level).toBe(0.42);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("should rise instantly and fall at 20 dB/s", () => {
    // Arrange
    const frames = stubFrames();
    const ref = createRef<MeterHandle>();
    const { container } = render(<Meter ref={ref} />);
    const bar = bars(container)[0];

    // Act
    ref.current?.set(1);
    ref.current?.set(0);
    const afterDrop = levelOf(bar);
    frames.frame(0);
    frames.frame(500);
    const halfSecond = levelOf(bar);
    frames.frame(1000);

    // Assert: −10 dB after 0.5 s, −20 dB after 1 s
    expect(afterDrop).toBe(1);
    expect(halfSecond).toBeCloseTo(0.3162, 3);
    expect(levelOf(bar)).toBeCloseTo(0.1, 3);
  });

  it("should stop animating once the level has settled", () => {
    // Arrange
    const frames = stubFrames();
    const ref = createRef<MeterHandle>();
    const { container } = render(<Meter ref={ref} />);

    // Act
    ref.current?.set(0.5);
    ref.current?.set(0.4);
    frames.frame(0);
    frames.frame(1000);

    // Assert
    expect(levelOf(bars(container)[0])).toBe(0.4);
    expect(frames.pending).toBe(0);
  });

  it("should show each level as-is when release is 0", () => {
    // Arrange
    const ref = createRef<MeterHandle>();
    const { container } = render(<Meter ref={ref} release={0} />);

    // Act
    ref.current?.set(0.9);
    ref.current?.set(0.2);

    // Assert
    expect(levelOf(bars(container)[0])).toBe(0.2);
  });

  it("should clamp out-of-range and non-finite input", () => {
    // Arrange
    const ref = createRef<MeterHandle>();
    const { container } = render(<Meter ref={ref} stereo release={0} />);

    // Act
    ref.current?.set(3, Number.NaN);

    // Assert
    expect(bars(container).map(levelOf)).toEqual([1, 0]);
  });

  it("should read 0 and ignore levels while stopped", () => {
    // Arrange
    const ref = createRef<MeterHandle>();
    const { container, rerender } = render(<Meter ref={ref} level={0.8} />);

    // Act
    rerender(<Meter ref={ref} level={0.8} stopped />);
    ref.current?.set(0.9);

    // Assert
    expect(levelOf(bars(container)[0])).toBe(0);
  });

  it("should zero immediately on reset()", () => {
    // Arrange
    stubFrames();
    const ref = createRef<MeterHandle>();
    const { container } = render(<Meter ref={ref} level={[0.8, 0.7]} />);

    // Act
    act(() => ref.current?.reset());

    // Assert
    expect(bars(container).map(levelOf)).toEqual([0, 0]);
  });

  it("should hold the peak for a second before it falls", () => {
    // Arrange
    const frames = stubFrames();
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    const ref = createRef<MeterHandle>();
    const { container } = render(<Meter ref={ref} hold release={0} />);
    const bar = bars(container)[0];

    // Act
    ref.current?.set(0.9);
    ref.current?.set(0.3);
    clock.mockReturnValue(500);
    frames.frame(500);
    const held = peakOf(bar);
    clock.mockReturnValue(1500);
    frames.frame(1500);

    // Assert
    expect(held).toBe(0.9);
    expect(peakOf(bar)).toBeLessThan(0.9);
    expect(peakOf(bar)).toBeGreaterThanOrEqual(0.3);
  });
});
