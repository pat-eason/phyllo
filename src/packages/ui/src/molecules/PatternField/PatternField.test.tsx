import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { PatternField, type PatternFieldProps } from "./PatternField";

const HINT = '"*2" makes that happen twice per cycle.';

function renderField(props: Partial<PatternFieldProps> = {}) {
  const onChange = vi.fn();
  const onCommit = vi.fn();
  const utils = render(
    <PatternField label="Pattern" value="bd*4" mode="guided" hint={HINT} onChange={onChange} onCommit={onCommit} {...props} />,
  );
  return { ...utils, onChange, onCommit, input: screen.getByRole("textbox") };
}

describe("PatternField", () => {
  it("should be labelled by the visible label and described by the Guided hint", () => {
    // Arrange / Act
    const { input } = renderField({ trailingLabel: "mini-notation" });

    // Assert
    expect(input).toHaveAccessibleName("Pattern");
    expect(input).toHaveAccessibleDescription(HINT);
    expect(screen.getByText("mini-notation")).toBeInTheDocument();
  });

  it("should hide the hint in Pro", () => {
    // Arrange / Act
    const { input } = renderField({ mode: "pro" });

    // Assert
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("should replace the hint with the error and mark the field invalid", () => {
    // Arrange / Act
    const { input } = renderField({ error: "Unexpected ]" });

    // Assert
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Unexpected ]");
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });

  it("should announce errors politely from a region that is always mounted", () => {
    // Arrange
    const { rerender } = renderField();
    const region = screen.getByText((_, el) => el?.getAttribute("aria-live") === "polite");

    // Act
    rerender(<PatternField label="Pattern" value="bd*4" mode="guided" onCommit={() => {}} error="Unexpected ]" />);

    // Assert
    expect(region).toHaveTextContent("Unexpected ]");
  });

  it("should report every keystroke through onChange without committing", async () => {
    // Arrange
    const user = userEvent.setup();
    const { input, onChange, onCommit } = renderField();

    // Act
    await user.type(input, "!");

    // Assert
    expect(onChange).toHaveBeenLastCalledWith("bd*4!");
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue("bd*4!");
  });

  it("should commit on Enter", async () => {
    // Arrange
    const user = userEvent.setup();
    const { input, onCommit } = renderField();

    // Act
    await user.clear(input);
    await user.type(input, "bd*8{Enter}");

    // Assert
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("bd*8");
  });

  it("should commit on blur", async () => {
    // Arrange
    const user = userEvent.setup();
    const { input, onCommit } = renderField();

    // Act
    await user.type(input, " ~");
    await user.tab();

    // Assert
    expect(onCommit).toHaveBeenCalledWith("bd*4 ~");
  });

  it("should not commit unchanged text", async () => {
    // Arrange
    const user = userEvent.setup();
    const { input, onCommit } = renderField();

    // Act
    await user.click(input);
    await user.keyboard("{Enter}");
    await user.tab();

    // Assert
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("should revert to the committed value on Escape", async () => {
    // Arrange
    const user = userEvent.setup();
    const { input, onChange, onCommit } = renderField();

    // Act
    await user.type(input, " cp{Escape}");
    await user.tab();

    // Assert
    expect(input).toHaveValue("bd*4");
    expect(onChange).toHaveBeenLastCalledWith("bd*4");
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("should follow a new value from outside unless the user is mid-edit", async () => {
    // Arrange
    const user = userEvent.setup();
    const props = { label: "Pattern", mode: "pro" as const, onCommit: () => {} };
    const { input, rerender } = renderField(props);

    // Act
    rerender(<PatternField {...props} value="hh*8" />);
    const synced = (input as HTMLInputElement).value;
    await user.type(input, "!");
    rerender(<PatternField {...props} value="cp" />);

    // Assert
    expect(synced).toBe("hh*8");
    expect(input).toHaveValue("hh*8!");
  });

  it("should not accept input when disabled", async () => {
    // Arrange
    const user = userEvent.setup();
    const { input, onChange } = renderField({ disabled: true });

    // Act
    await user.type(input, "x");

    // Assert
    expect(input).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("should show the synced note and forward its ref to the input", () => {
    // Arrange
    const ref = createRef<HTMLInputElement>();

    // Act
    render(
      <PatternField ref={ref} label="Live code" variant="live" value='s("bd*4")' mode="pro" onCommit={() => {}} syncedNote="Synced both ways" />,
    );

    // Assert
    expect(screen.getByText("Synced both ways")).toBeInTheDocument();
    expect(ref.current).toBe(screen.getByRole("textbox", { name: "Live code" }));
  });
});
