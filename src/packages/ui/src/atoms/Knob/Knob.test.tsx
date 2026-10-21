import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Knob, type KnobProps } from "./Knob";

/** Manual rAF so tests decide when a frame happens. */
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
    flush(time = 0) {
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach((cb) => cb(time));
    },
    get pending() {
      return callbacks.size;
    },
  };
}

function renderKnob(props: Partial<KnobProps> = {}) {
  const onChange = vi.fn();
  render(<Knob label="Brightness" valueText="1.6k Hz" value={0.5} onChange={onChange} {...props} />);
  return { onChange, slider: screen.getByRole("slider", { name: "Brightness" }) };
}

/** Controlled parent so repeated keyboard steps accumulate. */
function Controlled({ initial = 0.5, onValue }: { initial?: number; onValue: (v: number) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <Knob
      label="Space"
      valueText={value.toFixed(2)}
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue(v);
      }}
    />
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Knob", () => {
  it("should expose slider semantics with a 0–100 range and the passed value text", () => {
    // Arrange / Act
    const { slider } = renderKnob({ value: 0.78 });

    // Assert
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "100");
    expect(slider).toHaveAttribute("aria-valuenow", "78");
    expect(slider).toHaveAttribute("aria-valuetext", "1.6k Hz");
    expect(slider).toHaveAttribute("tabindex", "0");
    expect(slider.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("should forward the ref to the slider element", () => {
    // Arrange
    const ref = createRef<HTMLDivElement>();

    // Act
    render(<Knob ref={ref} label="Pan" valueText="C" value={0.5} onChange={() => {}} />);

    // Assert
    expect(ref.current).toBe(screen.getByRole("slider"));
  });

  it.each([
    ["{ArrowUp}", 0.51],
    ["{ArrowRight}", 0.51],
    ["{ArrowDown}", 0.49],
    ["{ArrowLeft}", 0.49],
    ["{Shift>}{ArrowUp}{/Shift}", 0.6],
    ["{Shift>}{ArrowDown}{/Shift}", 0.4],
    ["{PageUp}", 0.6],
    ["{PageDown}", 0.4],
    ["{Home}", 0],
    ["{End}", 1],
  ])("should step with %s", async (keys, expected) => {
    // Arrange
    const user = userEvent.setup();
    const { onChange, slider } = renderKnob();
    slider.focus();

    // Act
    await user.keyboard(keys);

    // Assert
    expect(onChange).toHaveBeenLastCalledWith(expected);
  });

  it("should accumulate keyboard steps without float noise and clamp at the top", async () => {
    // Arrange
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Controlled initial={0.97} onValue={onValue} />);
    screen.getByRole("slider").focus();

    // Act
    await user.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}");

    // Assert
    expect(onValue.mock.calls.map(([v]) => v)).toEqual([0.98, 0.99, 1]);
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "100");
  });

  it("should reset to defaultValue on double-click", async () => {
    // Arrange
    const user = userEvent.setup();
    const withDefault = renderKnob({ value: 0.2, defaultValue: 0.75 });

    // Act
    await user.dblClick(withDefault.slider);

    // Assert
    expect(withDefault.onChange).toHaveBeenCalledWith(0.75);
  });

  it("should not change on double-click without a defaultValue", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onChange, slider } = renderKnob({ value: 0.2 });

    // Act
    await user.dblClick(slider);

    // Assert
    expect(onChange).not.toHaveBeenCalled();
  });

  it("should request a typed value on Alt-click and on Enter", async () => {
    // Arrange
    const user = userEvent.setup();
    const onRequestEdit = vi.fn();
    const { onChange, slider } = renderKnob({ onRequestEdit });

    // Act
    await user.keyboard("{Alt>}");
    await user.click(slider);
    await user.keyboard("{/Alt}");
    slider.focus();
    await user.keyboard("{Enter}");

    // Assert
    expect(onRequestEdit).toHaveBeenCalledTimes(2);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("should map vertical drag to value: 200 px is the full range", () => {
    // Arrange
    const frames = stubFrames();
    const onChangeStart = vi.fn();
    const onChangeEnd = vi.fn();
    const { onChange, slider } = renderKnob({ value: 0.5, onChangeStart, onChangeEnd });

    // Act
    fireEvent.pointerDown(slider, { pointerId: 1, button: 0, clientX: 10, clientY: 300 });
    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 10, clientY: 250 });
    frames.flush();
    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 10, clientY: 200 });
    fireEvent.pointerUp(slider, { pointerId: 1, clientX: 10, clientY: 200 });

    // Assert
    expect(onChange.mock.calls.map(([v]) => v)).toEqual([0.75, 1]);
    expect(onChangeStart).toHaveBeenCalledTimes(1);
    expect(onChangeEnd).toHaveBeenCalledTimes(1);
    expect(slider).toHaveFocus();
  });

  it("should throttle drag updates to one per animation frame", () => {
    // Arrange
    const frames = stubFrames();
    const { onChange, slider } = renderKnob({ value: 0.5 });
    fireEvent.pointerDown(slider, { pointerId: 1, button: 0, clientY: 300 });

    // Act
    for (let y = 299; y >= 280; y--) fireEvent.pointerMove(slider, { pointerId: 1, clientY: y });

    // Assert
    expect(onChange).not.toHaveBeenCalled();
    expect(frames.pending).toBe(1);
    frames.flush();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(0.6);
  });

  it("should use fine steps (×0.2) while Shift is held, without jumping when Shift toggles", () => {
    // Arrange
    stubFrames();
    const { onChange, slider } = renderKnob({ value: 0.5 });

    // Act
    fireEvent.pointerDown(slider, { pointerId: 1, button: 0, clientY: 300 });
    fireEvent.pointerMove(slider, { pointerId: 1, clientY: 250, shiftKey: true });
    fireEvent.pointerMove(slider, { pointerId: 1, clientY: 200, shiftKey: true });
    fireEvent.pointerUp(slider, { pointerId: 1, clientY: 200, shiftKey: true });

    // Assert: 100 px × 0.2 = 0.1 (the first shifted move only re-anchors)
    expect(onChange).toHaveBeenLastCalledWith(0.55);
  });

  it("should ignore horizontal movement", () => {
    // Arrange
    stubFrames();
    const { onChange, slider } = renderKnob();

    // Act
    fireEvent.pointerDown(slider, { pointerId: 1, button: 0, clientX: 0, clientY: 100 });
    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 150, clientY: 100 });
    fireEvent.pointerUp(slider, { pointerId: 1, clientX: 150, clientY: 100 });

    // Assert
    expect(onChange).not.toHaveBeenCalled();
  });

  it("should respond immediately when reversing after overshooting a bound", () => {
    // Arrange
    stubFrames();
    const { onChange, slider } = renderKnob({ value: 0.9 });

    // Act: 300 px up pins at 1, then 20 px down
    fireEvent.pointerDown(slider, { pointerId: 1, button: 0, clientY: 400 });
    fireEvent.pointerMove(slider, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(slider, { pointerId: 1, clientY: 120 });
    fireEvent.pointerUp(slider, { pointerId: 1, clientY: 120 });

    // Assert
    expect(onChange).toHaveBeenLastCalledWith(0.9);
  });

  it("should drag with user-event pointer input", async () => {
    // Arrange
    stubFrames();
    const user = userEvent.setup();
    const { onChange, slider } = renderKnob({ value: 0 });

    // Act
    await user.pointer([
      { keys: "[MouseLeft>]", target: slider, coords: { clientX: 20, clientY: 200 } },
      { target: slider, coords: { clientX: 20, clientY: 160 } },
      { keys: "[/MouseLeft]", target: slider, coords: { clientX: 20, clientY: 160 } },
    ]);

    // Assert
    expect(onChange).toHaveBeenLastCalledWith(0.2);
  });

  it("should step ±1% per wheel notch and ±0.2% with Shift", () => {
    // Arrange
    const { onChange, slider } = renderKnob({ value: 0.5 });

    // Act
    fireEvent.wheel(slider, { deltaY: -100 });
    fireEvent.wheel(slider, { deltaY: 100, shiftKey: true });
    fireEvent.wheel(slider, { deltaX: -100, shiftKey: true });

    // Assert
    expect(onChange.mock.calls.map(([v]) => v)).toEqual([0.51, 0.498, 0.502]);
  });

  it("should ignore every input when disabled", async () => {
    // Arrange
    stubFrames();
    const user = userEvent.setup();
    const { onChange, slider } = renderKnob({ disabled: true, defaultValue: 0 });

    // Act
    slider.focus();
    await user.keyboard("{ArrowUp}{Home}");
    await user.dblClick(slider);
    fireEvent.wheel(slider, { deltaY: -100 });
    fireEvent.pointerDown(slider, { pointerId: 1, button: 0, clientY: 100 });
    fireEvent.pointerMove(slider, { pointerId: 1, clientY: 0 });
    fireEvent.pointerUp(slider, { pointerId: 1, clientY: 0 });

    // Assert
    expect(onChange).not.toHaveBeenCalled();
    expect(slider).toHaveAttribute("aria-disabled", "true");
    expect(slider).toHaveAttribute("tabindex", "-1");
  });

  it("should rotate the pointer from −135° to +135°", () => {
    // Arrange / Act
    const { container, rerender } = render(<Knob label="Gain" valueText="0" value={0} onChange={() => {}} />);
    const pointer = () => container.querySelector('[data-part="pointer"]');
    const atMin = pointer()?.getAttribute("transform");
    rerender(<Knob label="Gain" valueText="1" value={1} onChange={() => {}} />);

    // Assert
    expect(atMin).toBe("rotate(-135.0 28 28)");
    expect(pointer()?.getAttribute("transform")).toBe("rotate(135.0 28 28)");
  });

  it("should draw a bipolar ring from 12 o'clock", () => {
    // Arrange / Act
    const { container } = render(<Knob label="Pan" valueText="L50" value={0.25} bipolar onChange={() => {}} />);
    const ring = container.querySelector('[data-part="ring"]');

    // Assert: a quarter of the 98.96 arc, starting a quarter in
    expect(ring).toHaveAttribute("stroke-dasharray", "24.74 400");
    expect(ring).toHaveAttribute("stroke-dashoffset", "-24.74");
  });

  it("should flag modulated and draw the flat 34 px variant without a pointer", () => {
    // Arrange / Act
    const { container } = render(<Knob label="Space" valueText="0.2" value={0.2} size={34} modulated color="#7FD98A" onChange={() => {}} />);
    const slider = screen.getByRole("slider");

    // Assert
    expect(slider).toHaveAttribute("data-modulated");
    expect(slider.style.getPropertyValue("--knob-color")).toBe("#7FD98A");
    expect(container.querySelector("svg")).toHaveAttribute("viewBox", "0 0 34 34");
    expect(container.querySelector('[data-part="pointer"]')).toBeNull();
  });

  describe("modulated with onBlockedChange", () => {
    it("should still call onChange for keys when no interceptor is given", async () => {
      // Arrange
      const user = userEvent.setup();
      const { onChange, slider } = renderKnob({ modulated: true, value: 0.5 });
      slider.focus();

      // Act
      await user.keyboard("{ArrowUp}");

      // Assert
      expect(onChange).toHaveBeenCalledWith(0.51);
    });

    it.each([
      ["{ArrowUp}", 1, 0.51],
      ["{ArrowRight}", 1, 0.51],
      ["{ArrowDown}", -1, 0.49],
      ["{PageUp}", 1, 0.6],
      ["{PageDown}", -1, 0.4],
      ["{Shift>}{ArrowUp}{/Shift}", 1, 0.6],
      ["{Home}", -1, 0],
      ["{End}", 1, 1],
    ])("should report %s to onBlockedChange instead of onChange", async (keys, direction, value) => {
      // Arrange
      const user = userEvent.setup();
      const onBlockedChange = vi.fn();
      const { onChange, slider } = renderKnob({ modulated: true, value: 0.5, onBlockedChange });
      slider.focus();

      // Act
      await user.keyboard(keys);

      // Assert
      expect(onBlockedChange).toHaveBeenCalledWith(direction, value);
      expect(onChange).not.toHaveBeenCalled();
    });

    it("should intercept the wheel and a double-click reset too", async () => {
      // Arrange
      const user = userEvent.setup();
      const onBlockedChange = vi.fn();
      const { onChange, slider } = renderKnob({ modulated: true, value: 0.5, defaultValue: 0.2, onBlockedChange });

      // Act
      fireEvent.wheel(slider, { deltaY: -100 });
      await user.dblClick(slider);

      // Assert
      expect(onBlockedChange).toHaveBeenNthCalledWith(1, 1, 0.51);
      expect(onBlockedChange).toHaveBeenNthCalledWith(2, -1, 0.2);
      expect(onChange).not.toHaveBeenCalled();
    });

    it("should report a key that cannot move the knob at a bound", async () => {
      // Arrange
      const user = userEvent.setup();
      const onBlockedChange = vi.fn();
      const { onChange, slider } = renderKnob({ modulated: true, value: 1, onBlockedChange });
      slider.focus();

      // Act
      await user.keyboard("{ArrowUp}{End}{PageUp}");

      // Assert
      expect(onBlockedChange).toHaveBeenCalledTimes(3);
      expect(onBlockedChange).toHaveBeenNthCalledWith(1, 1, 1);
      expect(onBlockedChange).toHaveBeenNthCalledWith(3, 1, 1);
      expect(onChange).not.toHaveBeenCalled();
    });

    it("should report a downward key at the bottom bound with direction -1", async () => {
      // Arrange
      const user = userEvent.setup();
      const onBlockedChange = vi.fn();
      const { slider } = renderKnob({ modulated: true, value: 0, onBlockedChange });
      slider.focus();

      // Act
      await user.keyboard("{ArrowDown}{Home}");

      // Assert
      expect(onBlockedChange).toHaveBeenNthCalledWith(1, -1, 0);
      expect(onBlockedChange).toHaveBeenNthCalledWith(2, -1, 0);
    });

    it("should stay quiet for a wheel notch at a bound", () => {
      // Arrange
      const onBlockedChange = vi.fn();
      const { slider } = renderKnob({ modulated: true, value: 1, onBlockedChange });

      // Act
      fireEvent.wheel(slider, { deltaY: -100 });

      // Assert
      expect(onBlockedChange).not.toHaveBeenCalled();
    });

    it("should not intercept when the knob is not modulated", async () => {
      // Arrange
      const user = userEvent.setup();
      const onBlockedChange = vi.fn();
      const { onChange, slider } = renderKnob({ value: 0.5, onBlockedChange });
      slider.focus();

      // Act
      await user.keyboard("{ArrowUp}");

      // Assert
      expect(onChange).toHaveBeenCalledWith(0.51);
      expect(onBlockedChange).not.toHaveBeenCalled();
    });

    it("should not intercept drags", () => {
      // Arrange
      stubFrames();
      const onBlockedChange = vi.fn();
      const onChangeStart = vi.fn();
      const { onChange, slider } = renderKnob({ modulated: true, value: 0.5, onBlockedChange, onChangeStart });

      // Act
      fireEvent.pointerDown(slider, { pointerId: 1, button: 0, clientY: 200 });
      fireEvent.pointerMove(slider, { pointerId: 1, clientY: 100 });
      fireEvent.pointerUp(slider, { pointerId: 1, clientY: 100 });

      // Assert
      expect(onChangeStart).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenLastCalledWith(1);
      expect(onBlockedChange).not.toHaveBeenCalled();
    });
  });

  it("should accept className and native props on the root", () => {
    // Arrange / Act
    renderKnob({ className: "extra", id: "k1" });

    // Assert
    const slider = screen.getByRole("slider");
    expect(slider).toHaveClass("knob", "extra");
    expect(slider).toHaveAttribute("id", "k1");
  });
});
