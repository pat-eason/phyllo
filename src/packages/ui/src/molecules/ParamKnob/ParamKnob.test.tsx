import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { ParamKnob, type ParamKnobProps } from "./ParamKnob";
import { FIXTURE_SPECS } from "./paramKnobFixtures";

function renderKnob(props: Partial<ParamKnobProps> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <ParamKnob param="lpf" spec={FIXTURE_SPECS.lpf} value={1577} mode="guided" onChange={onChange} {...props} />,
  );
  return { ...utils, onChange, knob: screen.getByRole("slider") };
}

describe("ParamKnob", () => {
  it("should label by the friendly name and show the code caption in Guided", () => {
    // Arrange / Act
    const { knob, container } = renderKnob();

    // Assert
    expect(knob).toHaveAccessibleName("Brightness");
    expect(knob).toHaveAttribute("aria-valuetext", "1.6k Hz");
    expect(container).toHaveTextContent("Brightness");
    expect(container).toHaveTextContent(".lpf()");
  });

  it("should lead with the code name and show the value in Pro", () => {
    // Arrange / Act
    const { knob, container } = renderKnob({ mode: "pro" });

    // Assert
    expect(knob).toHaveAccessibleName("lpf");
    expect(container).toHaveTextContent("1.6k Hz");
    expect(container).not.toHaveTextContent(".lpf()");
  });

  it("should map real units to the knob position", () => {
    // Arrange / Act
    const { knob } = renderKnob({ value: 200 + 0.25 * 7800 });

    // Assert: v² curve → 0.5
    expect(knob).toHaveAttribute("aria-valuenow", "50");
  });

  it("should call onChange with real units, not the knob position", async () => {
    // Arrange
    const user = userEvent.setup();
    const { knob, onChange } = renderKnob({ param: "gain", spec: FIXTURE_SPECS.gain, value: 0.5 });
    knob.focus();

    // Act
    await user.keyboard("{ArrowUp}");

    // Assert
    expect(onChange).toHaveBeenCalledWith(0.51);
  });

  it("should convert through the curve for lpf", async () => {
    // Arrange
    const user = userEvent.setup();
    const { knob, onChange } = renderKnob({ value: 200 + 0.25 * 7800 });
    knob.focus();

    // Act
    await user.keyboard("{End}");

    // Assert
    expect(onChange).toHaveBeenCalledWith(8000);
  });

  it("should show modulation text and the amber state when modulated", () => {
    // Arrange / Act
    const { knob, container } = renderKnob({ mode: "pro", modulated: true, modulationText: "~400–1.4k" });

    // Assert
    expect(knob).toHaveAttribute("aria-valuetext", "~400–1.4k");
    expect(knob).toHaveAttribute("data-modulated");
    expect(container).toHaveTextContent("~400–1.4k");
  });

  it("should treat a patterned string value as modulated with the pattern as its value", () => {
    // Arrange / Act
    const { knob, container } = renderKnob({ param: "gain", spec: FIXTURE_SPECS.gain, value: "[.45 .7]*4", mode: "pro" });

    // Assert
    expect(knob).toHaveAttribute("data-modulated");
    expect(knob).toHaveAttribute("aria-valuetext", "[.45 .7]*4");
    expect(container).toHaveTextContent("[.45 .7]*4");
  });

  it("should place an unset value at the spec's unset position", () => {
    // Arrange / Act
    const { knob } = renderKnob({ value: null, mode: "pro" });

    // Assert
    expect(knob).toHaveAttribute("aria-valuenow", "100");
    expect(knob).toHaveAttribute("aria-valuetext", "off");
  });

  it("should use the mode-specific value text (pan)", () => {
    // Arrange / Act
    const pro = renderKnob({ param: "pan", spec: FIXTURE_SPECS.pan, value: 0.42, mode: "pro" });
    const proText = pro.knob.getAttribute("aria-valuetext");
    pro.unmount();
    const guided = renderKnob({ param: "pan", spec: FIXTURE_SPECS.pan, value: 0.42, mode: "guided" });

    // Assert
    expect(proText).toBe("L16");
    expect(guided.knob).toHaveAttribute("aria-valuetext", "Left 16");
  });

  it("should reset to the spec default on double-click", async () => {
    // Arrange
    const user = userEvent.setup();
    const { knob, onChange } = renderKnob({ param: "gain", spec: FIXTURE_SPECS.gain, value: 0.3 });

    // Act
    await user.dblClick(knob);

    // Assert
    expect(onChange).toHaveBeenLastCalledWith(0.8);
  });

  it("should not change when disabled", async () => {
    // Arrange
    const user = userEvent.setup();
    const { knob, onChange } = renderKnob({ disabled: true });
    knob.focus();

    // Act
    await user.keyboard("{ArrowUp}");

    // Assert
    expect(onChange).not.toHaveBeenCalled();
    expect(knob).toHaveAttribute("aria-disabled", "true");
  });

  it("should forward its ref to the knob and className to the column", () => {
    // Arrange
    const ref = createRef<HTMLDivElement>();

    // Act
    const { container } = render(
      <ParamKnob ref={ref} className="extra" param="room" spec={FIXTURE_SPECS.room} value={0.2} mode="guided" onChange={() => {}} />,
    );

    // Assert
    expect(ref.current).toBe(screen.getByRole("slider"));
    expect(container.firstElementChild).toHaveClass("extra");
  });

  it("should let valueText override the formatted value text", () => {
    // Arrange / Act
    const { knob, container } = renderKnob({ mode: "pro", valueText: "open" });

    // Assert
    expect(knob).toHaveAttribute("aria-valuetext", "open");
    expect(container).toHaveTextContent("open");
  });

  it("should let aria-label override the knob's accessible name", () => {
    // Arrange / Act
    const { knob } = renderKnob({ "aria-label": "Kick filter cutoff" });

    // Assert
    expect(knob).toHaveAccessibleName("Kick filter cutoff");
  });

  it("should render the caption slot instead of the default caption", () => {
    // Arrange / Act
    const { container } = renderKnob({ caption: "auto" });

    // Assert
    expect(container).toHaveTextContent("auto");
    expect(container).not.toHaveTextContent(".lpf()");
  });
});
