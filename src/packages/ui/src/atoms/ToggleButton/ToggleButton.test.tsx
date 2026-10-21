import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { ToggleButton } from "./ToggleButton";

describe("ToggleButton", () => {
  it("should be a button named by label with aria-pressed", () => {
    // Arrange / Act
    render(<ToggleButton kind="mute" label="Mute Kick" pressed={false} onChange={() => {}} />);

    // Assert
    expect(screen.getByRole("button", { name: "Mute Kick" })).toHaveAttribute("aria-pressed", "false");
  });

  it.each([
    ["mute", "M"],
    ["solo", "S"],
  ] as const)("should show the default glyph for %s", (kind, glyph) => {
    // Arrange / Act
    render(<ToggleButton kind={kind} label="x" pressed={false} onChange={() => {}} />);

    // Assert
    expect(screen.getByRole("button")).toHaveTextContent(glyph);
  });

  it("should show children as the glyph", () => {
    // Arrange / Act
    render(<ToggleButton kind="custom" label="Arm" pressed={false} onChange={() => {}}>R</ToggleButton>);

    // Assert
    expect(screen.getByRole("button", { name: "Arm" })).toHaveTextContent("R");
  });

  it("should follow the pressed prop, not local state", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<ToggleButton kind="mute" label="Mute Kick" pressed={false} onChange={() => {}} />);

    // Act
    await user.click(screen.getByRole("button"));

    // Assert
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  });

  it("should call onChange with the next pressed value, not the event", async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<ToggleButton kind="solo" label="Solo Kick" pressed={false} onChange={onChange} />);

    // Act
    await user.click(screen.getByRole("button"));
    rerender(<ToggleButton kind="solo" label="Solo Kick" pressed onChange={onChange} />);
    await user.click(screen.getByRole("button"));

    // Assert
    expect(onChange).toHaveBeenNthCalledWith(1, true, expect.anything());
    expect(onChange).toHaveBeenNthCalledWith(2, false, expect.anything());
  });

  it("should pass the click event second so modifier clicks can be handled", async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ToggleButton kind="solo" label="Solo Kick" pressed={false} onChange={onChange} />);

    // Act
    await user.keyboard("{Alt>}");
    await user.click(screen.getByRole("button"));
    await user.keyboard("{/Alt}");

    // Assert
    expect(onChange.mock.calls[0]?.[1]).toMatchObject({ altKey: true });
  });

  it("should toggle from the keyboard", async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ToggleButton kind="mute" label="Mute Kick" pressed={false} onChange={onChange} />);

    // Act
    await user.tab();
    await user.keyboard(" ");

    // Assert
    expect(onChange).toHaveBeenCalledWith(true, expect.anything());
  });

  it("should not call onChange when disabled", async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ToggleButton kind="mute" label="Mute Kick" pressed={false} disabled onChange={onChange} />);

    // Act
    await user.click(screen.getByRole("button"));

    // Assert
    expect(onChange).not.toHaveBeenCalled();
  });

  it("should still run a consumer onClick and let it veto the change", async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onClick = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(<ToggleButton kind="mute" label="Mute Kick" pressed={false} onChange={onChange} onClick={onClick} />);

    // Act
    await user.click(screen.getByRole("button"));

    // Assert
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("should reflect size and forward className and the ref", () => {
    // Arrange
    const ref = createRef<HTMLButtonElement>();

    // Act
    render(<ToggleButton ref={ref} kind="mute" label="Mute" pressed={false} onChange={() => {}} size={30} fullWidth className="extra" />);

    // Assert
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("data-size", "30");
    expect(button).toHaveAttribute("data-full-width");
    expect(button).toHaveClass("extra");
    expect(ref.current).toBe(button);
  });
});
