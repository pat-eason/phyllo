import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Slider, type SliderProps } from "./Slider";

function Harness(props: Partial<SliderProps> & { onValue?: (value: number) => void }) {
  const { onValue, value: initial = 0.5, onChange: _ignored, ...rest } = props;
  const [value, setValue] = useState(initial);
  return (
    <Slider
      label="Amount"
      {...rest}
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

const TILE = { label: "Tile size", min: 1, max: 5, step: 1, value: 3 } as const;

describe("Slider", () => {
  it("should expose native range semantics named by its label", () => {
    // Arrange / Act
    render(<Harness {...TILE} />);

    // Assert
    const slider = screen.getByRole("slider", { name: "Tile size" });
    expect(slider).toHaveAttribute("type", "range");
    expect(slider).toHaveAttribute("min", "1");
    expect(slider).toHaveAttribute("max", "5");
    expect(slider).toHaveValue("3");
  });

  it("should default to 0 to 1 in 0.01 steps", () => {
    // Arrange / Act
    render(<Harness />);

    // Assert
    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", "1");
    expect(slider).toHaveAttribute("step", "0.01");
  });

  it("should speak the value text when provided", () => {
    // Arrange / Act
    render(<Harness {...TILE} valueText={(v) => ["Smallest", "Small", "Medium", "Large", "Largest"][v - 1] ?? ""} />);

    // Assert
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", "Medium");
  });

  it("should accept a plain string as the spoken value", () => {
    // Arrange / Act
    render(<Harness {...TILE} valueText="Roughly a third" />);

    // Assert
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", "Roughly a third");
  });

  it("should leave aria-valuetext off without valueText", () => {
    // Arrange / Act
    render(<Harness />);

    // Assert
    expect(screen.getByRole("slider")).not.toHaveAttribute("aria-valuetext");
  });

  it("should format a feel value through the function form", () => {
    // Arrange / Act
    render(<Harness value={1 / 6} valueText={(v) => `${Math.round(v * 100)}%`} />);

    // Assert
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", "17%");
  });

  it("should pass a number, not the event, on every input event", () => {
    // Arrange
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);

    // Act
    fireEvent.change(screen.getByRole("slider"), { target: { value: "0.8" } });

    // Assert
    expect(onValue).toHaveBeenCalledWith(0.8);
  });

  it("should step with the arrow keys", async () => {
    // Arrange
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness {...TILE} onValue={onValue} />);
    await user.tab();

    // Act
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowLeft}");

    // Assert
    expect(onValue).toHaveBeenNthCalledWith(1, 4);
    expect(onValue).toHaveBeenNthCalledWith(2, 5);
    expect(onValue).toHaveBeenNthCalledWith(3, 4);
  });

  it("should avoid floating point drift when stepping by 0.01", async () => {
    // Arrange
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness value={0.1} onValue={onValue} />);
    await user.tab();

    // Act
    await user.keyboard("{ArrowRight}{ArrowRight}");

    // Assert
    expect(onValue).toHaveBeenNthCalledWith(1, 0.11);
    expect(onValue).toHaveBeenNthCalledWith(2, 0.12);
  });

  it("should move 10 percent of the range with PageUp and PageDown", async () => {
    // Arrange
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness label="Amount" min={0} max={100} step={1} value={50} onValue={onValue} />);
    await user.tab();

    // Act
    await user.keyboard("{PageUp}{PageDown}{PageDown}");

    // Assert
    expect(onValue).toHaveBeenNthCalledWith(1, 60);
    expect(onValue).toHaveBeenNthCalledWith(2, 50);
    expect(onValue).toHaveBeenNthCalledWith(3, 40);
  });

  it("should jump to the ends with Home and End", async () => {
    // Arrange
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness {...TILE} onValue={onValue} />);
    await user.tab();

    // Act
    await user.keyboard("{End}{Home}");

    // Assert
    expect(onValue).toHaveBeenNthCalledWith(1, 5);
    expect(onValue).toHaveBeenNthCalledWith(2, 1);
  });

  it("should not emit when a key would leave the range", async () => {
    // Arrange
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness {...TILE} value={5} onValue={onValue} />);
    await user.tab();

    // Act
    await user.keyboard("{ArrowRight}{End}");

    // Assert
    expect(onValue).not.toHaveBeenCalled();
  });

  it("should keep marks decorative so the slider stays the only control", () => {
    // Arrange / Act
    render(<Harness {...TILE} marks={[1, 2, 3, 4, 5]} />);

    // Assert
    expect(screen.getAllByRole("slider")).toHaveLength(1);
    expect(screen.getByRole("slider")).toHaveAttribute("step", "1");
  });

  it("should render start and end glyphs around the track", () => {
    // Arrange / Act
    render(<Harness {...TILE} startGlyph={<span>small</span>} endGlyph={<span>large</span>} />);

    // Assert
    expect(screen.getByText("small")).toBeInTheDocument();
    expect(screen.getByText("large")).toBeInTheDocument();
  });

  it("should size the track from the width prop", () => {
    // Arrange / Act
    render(<Harness width={200} />);

    // Assert
    expect(screen.getByRole("slider").parentElement).toHaveStyle({ width: "200px" });
  });

  it("should ignore keys and refuse focus when disabled", async () => {
    // Arrange
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness disabled onValue={onValue} />);

    // Act
    await user.tab();
    await user.keyboard("{ArrowRight}");

    // Assert
    expect(screen.getByRole("slider")).toBeDisabled();
    expect(onValue).not.toHaveBeenCalled();
  });

  it("should stretch to its parent with width fill", () => {
    // Arrange / Act
    render(<Slider label="Amount" value={0.5} onChange={() => undefined} width="fill" data-testid="sl" />);

    // Assert
    const wrapper = screen.getByTestId("sl").closest("[data-fill]");
    expect(wrapper).not.toBeNull();
    expect(screen.getByTestId("sl").parentElement).not.toHaveStyle({ width: "120px" });
  });

  it("should forward ref to the input and className to the wrapper", () => {
    // Arrange
    const ref = createRef<HTMLInputElement>();

    // Act
    render(<Slider ref={ref} label="Amount" value={0.5} onChange={() => undefined} className="extra" data-testid="sl" />);

    // Assert
    expect(ref.current).toBe(screen.getByTestId("sl"));
    expect(screen.getByTestId("sl").closest(".extra")).not.toBeNull();
  });
});
