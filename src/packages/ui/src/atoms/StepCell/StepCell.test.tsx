import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { StepCell, type StepCellProps } from "./StepCell";

function renderCell(props: Partial<StepCellProps> = {}) {
  const onChange = vi.fn();
  render(<StepCell on={false} onChange={onChange} color="#7FD98A" index={4} rowLabel="Kick" {...props} />);
  return { onChange, cell: screen.getByRole("button", { name: `${props.rowLabel ?? "Kick"} step 5` }) };
}

describe("StepCell", () => {
  it("should be a toggle button named by row and 1-based step", () => {
    // Arrange / Act
    const { cell } = renderCell();

    // Assert
    expect(cell).toHaveAttribute("aria-pressed", "false");
    expect(cell).toHaveAttribute("type", "button");
  });

  it("should reflect on in aria-pressed", () => {
    // Arrange / Act
    const { cell } = renderCell({ on: true });

    // Assert
    expect(cell).toHaveAttribute("aria-pressed", "true");
  });

  it("should call onChange with the next state on click", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onChange } = renderCell({ rowLabel: "Clap" });

    // Act
    await user.click(screen.getByRole("button", { name: "Clap step 5" }));

    // Assert
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("should turn an on step off", async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StepCell on onChange={onChange} color="#7FD98A" index={0} rowLabel="Kick" />);

    // Act
    await user.click(screen.getByRole("button", { name: "Kick step 1" }));

    // Assert
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("should toggle with Space and Enter", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onChange, cell } = renderCell();
    cell.focus();

    // Act
    await user.keyboard(" ");
    await user.keyboard("{Enter}");

    // Assert
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenNthCalledWith(1, true);
  });

  it("should skip the toggle when onClick prevents default", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onChange, cell } = renderCell({ onClick: (event) => event.preventDefault() });

    // Act
    await user.click(cell);

    // Assert
    expect(onChange).not.toHaveBeenCalled();
  });

  it("should pass pointer handlers through for paint mode", async () => {
    // Arrange
    const user = userEvent.setup();
    const onPointerEnter = vi.fn();
    const { cell } = renderCell({ onPointerEnter });

    // Act
    await user.hover(cell);

    // Assert
    expect(onPointerEnter).toHaveBeenCalled();
  });

  it("should not toggle or take focus when read-only", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onChange, cell } = renderCell({ readOnly: true, on: true });

    // Act
    await user.click(cell);
    await user.tab();

    // Assert
    expect(onChange).not.toHaveBeenCalled();
    expect(cell).not.toHaveFocus();
    expect(cell).toHaveAttribute("aria-pressed", "true");
  });

  it("should not toggle when disabled", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onChange, cell } = renderCell({ disabled: true });

    // Act
    await user.click(cell);

    // Assert
    expect(onChange).not.toHaveBeenCalled();
    expect(cell).toBeDisabled();
  });

  it("should expose beat, playhead and selected-row states to styling", () => {
    // Arrange / Act
    const { cell } = renderCell({ beatStart: true, playing: true, rowSelected: true });

    // Assert
    expect(cell).toHaveAttribute("data-beat");
    expect(cell).toHaveAttribute("data-playing");
    expect(cell).toHaveAttribute("data-row-selected");
  });

  it("should map velocity to fill opacity 0.45 + 0.55·v", () => {
    // Arrange / Act
    const { cell } = renderCell({ on: true, velocity: 0.5, color: "var(--ph-track-3)" });

    // Assert
    expect(cell.style.getPropertyValue("--step-alpha")).toBe("0.725");
    expect(cell.style.getPropertyValue("--step-color")).toBe("var(--ph-track-3)");
  });

  it("should accept an explicit aria-label, className and ref", () => {
    // Arrange
    const ref = createRef<HTMLButtonElement>();

    // Act
    render(<StepCell ref={ref} aria-label="Kick, beat 2" className="extra" on={false} onChange={() => {}} color="red" index={4} rowLabel="Kick" />);

    // Assert
    const cell = screen.getByRole("button", { name: "Kick, beat 2" });
    expect(ref.current).toBe(cell);
    expect(cell).toHaveClass("cell", "extra");
  });
});
