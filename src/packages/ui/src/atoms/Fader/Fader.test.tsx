import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Fader, type FaderProps } from "./Fader";

/** Frames never fire on their own; pointer-up flushes the pending value. */
function stubFrames() {
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
}

function renderFader(props: Partial<FaderProps> = {}) {
  const onChange = vi.fn();
  render(<Fader label="Kick volume" db={0} height={200} onChange={onChange} {...props} />);
  return { onChange, slider: screen.getByRole("slider", { name: props.label ?? "Kick volume" }) };
}

function drag(slider: HTMLElement, fromY: number, toY: number, shiftKey = false) {
  fireEvent.pointerDown(slider, { pointerId: 1, button: 0, clientY: fromY });
  fireEvent.pointerMove(slider, { pointerId: 1, clientY: toY, shiftKey });
  fireEvent.pointerUp(slider, { pointerId: 1, clientY: toY, shiftKey });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Fader", () => {
  it("should expose dB slider semantics", () => {
    // Arrange / Act
    const { slider } = renderFader({ db: -2.2 });

    // Assert
    expect(slider).toHaveAttribute("aria-valuemin", "-60");
    expect(slider).toHaveAttribute("aria-valuemax", "6");
    expect(slider).toHaveAttribute("aria-valuenow", "-2.2");
    expect(slider).toHaveAttribute("aria-valuetext", "−2.2 dB");
    expect(slider).toHaveAttribute("aria-orientation", "vertical");
  });

  it("should read −∞ at the bottom of the range", () => {
    // Arrange / Act
    const { slider } = renderFader({ db: -60 });

    // Assert
    expect(slider).toHaveAttribute("aria-valuetext", "−∞ dB");
  });

  it("should forward the ref to the slider", () => {
    // Arrange
    const ref = createRef<HTMLDivElement>();

    // Act
    render(<Fader ref={ref} label="Bass volume" db={0} onChange={() => {}} />);

    // Assert
    expect(ref.current).toBe(screen.getByRole("slider"));
  });

  it("should draw the default scale labels with typographic minus", () => {
    // Arrange / Act
    renderFader();

    // Assert
    ["+6", "0", "−6", "−12", "−24", "−48"].forEach((mark) => expect(screen.getByText(mark)).toBeInTheDocument());
  });

  it.each([
    ["{ArrowUp}", -1.7],
    ["{ArrowRight}", -1.7],
    ["{ArrowDown}", -2.7],
    ["{Shift>}{ArrowUp}{/Shift}", 0.8],
    ["{Shift>}{ArrowDown}{/Shift}", -5.2],
    ["{PageUp}", 0.8],
    ["{PageDown}", -5.2],
    ["{Home}", 6],
    ["{End}", -60],
  ])("should step with %s", async (keys, expected) => {
    // Arrange
    const user = userEvent.setup();
    const { onChange, slider } = renderFader({ db: -2.2 });
    slider.focus();

    // Act
    await user.keyboard(keys);

    // Assert
    expect(onChange).toHaveBeenLastCalledWith(expected);
  });

  it("should not report a change when already at the top", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onChange, slider } = renderFader({ db: 6 });
    slider.focus();

    // Act
    await user.keyboard("{ArrowUp}{Home}");

    // Assert
    expect(onChange).not.toHaveBeenCalled();
  });

  it("should reset to 0 dB on double-click, or to defaultDb", async () => {
    // Arrange
    const user = userEvent.setup();
    const first = renderFader({ db: -12, label: "A" });
    const second = renderFader({ db: -12, label: "B", defaultDb: -6 });

    // Act
    await user.dblClick(first.slider);
    await user.dblClick(second.slider);

    // Assert
    expect(first.onChange).toHaveBeenCalledWith(0);
    expect(second.onChange).toHaveBeenCalledWith(-6);
  });

  it("should track the pointer 1:1 down the piecewise scale", () => {
    // Arrange: 200 px throw, 0 dB sits at 40 px; −6 dB at 80 px
    stubFrames();
    const { onChange, slider } = renderFader({ db: 0 });

    // Act
    drag(slider, 100, 140);

    // Assert
    expect(onChange).toHaveBeenLastCalledWith(-6);
  });

  it("should stop at +6 dB when dragged past the top", () => {
    // Arrange
    stubFrames();
    const { onChange, slider } = renderFader({ db: 0 });

    // Act
    drag(slider, 300, 0);

    // Assert
    expect(onChange).toHaveBeenLastCalledWith(6);
  });

  it("should read −∞ when dragged to the bottom, even from −48 dB", () => {
    // Arrange
    stubFrames();
    const { onChange, slider } = renderFader({ db: -48 });

    // Act
    drag(slider, 100, 130);

    // Assert
    expect(onChange).toHaveBeenLastCalledWith(-60);
  });

  it("should move five times slower with Shift", () => {
    // Arrange: from 0 dB, 100 px × 0.2 = 20 px = 0.1 of the throw → −3 dB
    stubFrames();
    const { onChange, slider } = renderFader({ db: 0 });

    // Act
    fireEvent.pointerDown(slider, { pointerId: 1, button: 0, clientY: 100, shiftKey: true });
    fireEvent.pointerMove(slider, { pointerId: 1, clientY: 200, shiftKey: true });
    fireEvent.pointerUp(slider, { pointerId: 1, clientY: 200, shiftKey: true });

    // Assert
    expect(onChange).toHaveBeenLastCalledWith(-3);
  });

  it("should not change on a click without movement", () => {
    // Arrange
    stubFrames();
    const { onChange, slider } = renderFader({ db: -48 });

    // Act
    drag(slider, 100, 100);

    // Assert
    expect(onChange).not.toHaveBeenCalled();
  });

  it("should step ±0.5 dB per wheel notch and ±0.1 dB with Shift", () => {
    // Arrange
    const { onChange, slider } = renderFader({ db: -2.2 });

    // Act
    fireEvent.wheel(slider, { deltaY: -100 });
    fireEvent.wheel(slider, { deltaY: 100, shiftKey: true });

    // Assert
    expect(onChange.mock.calls.map(([db]) => db)).toEqual([-1.7, -2.3]);
  });

  it("should ignore input when disabled", async () => {
    // Arrange
    stubFrames();
    const user = userEvent.setup();
    const { onChange, slider } = renderFader({ db: -6, disabled: true });

    // Act
    slider.focus();
    await user.keyboard("{ArrowUp}");
    await user.dblClick(slider);
    fireEvent.wheel(slider, { deltaY: -100 });
    drag(slider, 100, 0);

    // Assert
    expect(onChange).not.toHaveBeenCalled();
    expect(slider).toHaveAttribute("aria-disabled", "true");
    expect(slider).toHaveAttribute("tabindex", "-1");
  });
});
