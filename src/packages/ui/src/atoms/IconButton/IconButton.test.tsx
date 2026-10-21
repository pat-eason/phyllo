import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { IconButton } from "./IconButton";

describe("IconButton", () => {
  it("should be a button named by label", () => {
    // Arrange / Act
    render(<IconButton icon="settings" label="Settings" />);

    // Assert
    const button = screen.getByRole("button", { name: "Settings" });
    expect(button).toHaveAttribute("aria-label", "Settings");
    expect(button).toHaveAttribute("type", "button");
  });

  it("should default to a 32 px square outline button", () => {
    // Arrange / Act
    render(<IconButton icon="plus" label="Zoom in" />);

    // Assert
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("data-size", "32");
    expect(button).toHaveAttribute("data-shape", "square");
    expect(button).toHaveAttribute("data-variant", "outline");
  });

  it("should call onClick when clicked and when activated by keyboard", async () => {
    // Arrange
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<IconButton icon="plus" label="Zoom in" onClick={onClick} />);

    // Act
    await user.click(screen.getByRole("button"));
    await user.keyboard("{Enter}");

    // Assert
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("should not set aria-pressed unless pressed is given", () => {
    // Arrange / Act
    render(<IconButton icon="plus" label="Zoom in" />);

    // Assert
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-pressed");
  });

  it.each([true, false])("should reflect pressed=%s in aria-pressed", (pressed) => {
    // Arrange / Act
    render(<IconButton icon="metronome" label="Metronome" pressed={pressed} />);

    // Assert
    expect(screen.getByRole("button", { name: "Metronome" })).toHaveAttribute("aria-pressed", String(pressed));
  });

  it("should not call onClick when disabled", async () => {
    // Arrange
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<IconButton icon="plus" label="Zoom in" disabled onClick={onClick} />);

    // Act
    await user.click(screen.getByRole("button"));

    // Assert
    expect(screen.getByRole("button")).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("should forward className, native props and the ref", () => {
    // Arrange
    const ref = createRef<HTMLButtonElement>();

    // Act
    render(<IconButton ref={ref} icon="star" label="Favorite" className="extra" data-testid="b" />);

    // Assert
    const button = screen.getByTestId("b");
    expect(button).toHaveClass("extra");
    expect(ref.current).toBe(button);
  });

  it("should support the 40 px size used by the mockups", () => {
    // Arrange / Act
    render(<IconButton icon="settings" label="Settings" size={40} />);

    // Assert
    expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute("data-size", "40");
  });

  it("should draw the 26 px preview glyph at 10 px", () => {
    // Arrange / Act
    render(<IconButton icon="play" label="Preview" size={26} shape="circle" />);

    // Assert
    expect(screen.getByRole("button", { name: "Preview" }).firstElementChild).toHaveAttribute("width", "10");
  });
});
