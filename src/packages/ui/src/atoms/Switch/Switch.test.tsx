import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "./Switch";

describe("Switch", () => {
  it("should be a switch named by label", () => {
    // Arrange / Act
    render(<Switch checked={false} label="Media keys" onChange={() => {}} />);

    // Assert
    const control = screen.getByRole("switch", { name: "Media keys" });
    expect(control.tagName).toBe("BUTTON");
    expect(control).toHaveAttribute("type", "button");
  });

  it.each([true, false])("should reflect checked=%s in aria-checked", (checked) => {
    // Arrange / Act
    render(<Switch checked={checked} label="Media keys" onChange={() => {}} />);

    // Assert
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", String(checked));
  });

  it("should call onChange with the next checked value, not the event", async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<Switch checked={false} label="Media keys" onChange={onChange} />);

    // Act
    await user.click(screen.getByRole("switch"));
    rerender(<Switch checked label="Media keys" onChange={onChange} />);
    await user.click(screen.getByRole("switch"));

    // Assert
    expect(onChange).toHaveBeenNthCalledWith(1, true);
    expect(onChange).toHaveBeenNthCalledWith(2, false);
  });

  it("should toggle with Space and Enter", async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch checked={false} label="Media keys" onChange={onChange} />);

    // Act
    await user.tab();
    await user.keyboard(" ");
    await user.keyboard("{Enter}");

    // Assert
    expect(screen.getByRole("switch")).toHaveFocus();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("should not change when disabled", async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch checked={false} disabled label="Media keys" onChange={onChange} />);

    // Act
    await user.click(screen.getByRole("switch"));

    // Assert
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("should prefer aria-labelledby over the label fallback", () => {
    // Arrange / Act
    render(
      <>
        <span id="text">Media keys control playback</span>
        <Switch checked={false} label="Fallback" aria-labelledby="text" onChange={() => {}} />
      </>,
    );

    // Assert
    const control = screen.getByRole("switch", { name: "Media keys control playback" });
    expect(control).not.toHaveAttribute("aria-label");
  });

  it("should default to md and reflect size", () => {
    // Arrange / Act
    render(
      <>
        <Switch checked label="Default" onChange={() => {}} />
        <Switch checked label="Small" size="sm" onChange={() => {}} />
      </>,
    );

    // Assert
    expect(screen.getByRole("switch", { name: "Default" })).toHaveAttribute("data-size", "md");
    expect(screen.getByRole("switch", { name: "Small" })).toHaveAttribute("data-size", "sm");
  });

  it("should forward className, native props and the ref", () => {
    // Arrange
    const ref = createRef<HTMLButtonElement>();

    // Act
    render(<Switch ref={ref} checked label="Media keys" onChange={() => {}} className="extra" data-testid="s" />);

    // Assert
    const control = screen.getByTestId("s");
    expect(control).toHaveClass("extra");
    expect(ref.current).toBe(control);
  });
});
