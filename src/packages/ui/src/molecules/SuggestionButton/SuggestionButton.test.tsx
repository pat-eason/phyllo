import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { SuggestionButton, type SuggestionButtonProps } from "./SuggestionButton";

function renderButton(props: Partial<SuggestionButtonProps> = {}) {
  const onToggle = vi.fn();
  render(<SuggestionButton label="Bouncier" code=".swingBy(1/6, 4)" applied={false} onToggle={onToggle} {...props} />);
  return { onToggle, button: screen.getByRole("button") };
}

describe("SuggestionButton", () => {
  it("should be a toggle named by its idea and the code it adds", () => {
    // Arrange / Act
    const { button } = renderButton();

    // Assert
    expect(button).toHaveAccessibleName("Bouncier .swingBy(1/6, 4)");
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveAttribute("title", ".swingBy(1/6, 4)");
    expect(button).toHaveTextContent(".swingBy(1/6, 4)");
  });

  it("should show the applied state as pressed", () => {
    // Arrange / Act
    const { button } = renderButton({ applied: true });

    // Assert
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("should call onToggle with the next state on click", async () => {
    // Arrange
    const user = userEvent.setup();
    const { button, onToggle } = renderButton();

    // Act
    await user.click(button);

    // Assert
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("should remove an applied suggestion", async () => {
    // Arrange
    const user = userEvent.setup();
    const { button, onToggle } = renderButton({ applied: true });

    // Act
    await user.click(button);

    // Assert
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("should toggle from the keyboard", async () => {
    // Arrange
    const user = userEvent.setup();
    const { button, onToggle } = renderButton();
    button.focus();

    // Act
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    // Assert
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it("should not toggle when disabled", async () => {
    // Arrange
    const user = userEvent.setup();
    const { button, onToggle } = renderButton({ disabled: true });

    // Act
    await user.click(button);

    // Assert
    expect(button).toBeDisabled();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("should accept an aria-label override and forward its ref", () => {
    // Arrange
    const ref = createRef<HTMLButtonElement>();

    // Act
    render(<SuggestionButton ref={ref} label="Bouncier" code=".swingBy(1/6, 4)" applied={false} onToggle={() => {}} aria-label="Swing it" />);

    // Assert
    expect(screen.getByRole("button", { name: "Swing it" })).toBe(ref.current);
  });
});
