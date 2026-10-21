import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./Checkbox";

describe("Checkbox", () => {
  it("should be a native checkbox named by its visible label", () => {
    // Arrange / Act
    render(<Checkbox checked={false} label="Normalize" onChange={() => {}} />);

    // Assert
    const box = screen.getByRole("checkbox", { name: "Normalize" });
    expect(box.tagName).toBe("INPUT");
    expect(box).toHaveAttribute("type", "checkbox");
  });

  it.each([true, false])("should reflect checked=%s", (checked) => {
    // Arrange / Act
    render(<Checkbox checked={checked} label="Normalize" onChange={() => {}} />);

    // Assert
    expect(screen.getByRole("checkbox")).toHaveProperty("checked", checked);
  });

  it("should call onChange with the next checked value, not the event", async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox checked={false} label="Normalize" onChange={onChange} />);

    // Act
    await user.click(screen.getByRole("checkbox"));

    // Assert
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("should call onChange with false when unchecking", async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox checked label="Normalize" onChange={onChange} />);

    // Act
    await user.click(screen.getByRole("checkbox"));

    // Assert
    expect(onChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("should treat the label text as a click target", async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox checked={false} label="Normalize" onChange={onChange} />);

    // Act
    await user.click(screen.getByText("Normalize"));

    // Assert
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("should toggle with Space", async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox checked={false} label="Normalize" onChange={onChange} />);

    // Act
    await user.tab();
    await user.keyboard(" ");

    // Assert
    expect(screen.getByRole("checkbox")).toHaveFocus();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("should not change when disabled", async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox checked={false} disabled label="Normalize" onChange={onChange} />);

    // Act
    await user.click(screen.getByText("Normalize"));

    // Assert
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("should set the native indeterminate property and update it", () => {
    // Arrange
    const { rerender } = render(<Checkbox checked={false} indeterminate label="Select all stems" onChange={() => {}} />);

    // Assert
    expect(screen.getByRole("checkbox")).toBePartiallyChecked();

    // Act
    rerender(<Checkbox checked={false} label="Select all stems" onChange={() => {}} />);

    // Assert
    expect(screen.getByRole("checkbox")).not.toBePartiallyChecked();
  });

  it("should accept rich label content", () => {
    // Arrange / Act
    render(<Checkbox checked={false} label={<span>Normalize <em>peak</em></span>} onChange={() => {}} />);

    // Assert
    expect(screen.getByRole("checkbox", { name: "Normalize peak" })).toBeInTheDocument();
  });

  it("should put className on the label, native props and the ref on the input", () => {
    // Arrange
    const ref = createRef<HTMLInputElement>();

    // Act
    render(<Checkbox ref={ref} checked label="Normalize" onChange={() => {}} className="extra" name="normalize" data-testid="c" />);

    // Assert
    const box = screen.getByTestId("c");
    expect(box).toHaveAttribute("name", "normalize");
    expect(box.closest("label")).toHaveClass("extra");
    expect(ref.current).toBe(box);
  });
});
