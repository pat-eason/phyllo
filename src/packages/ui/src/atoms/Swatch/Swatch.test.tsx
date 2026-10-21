import { fireEvent, render, screen } from "@testing-library/react";
import { createRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Swatch } from "./Swatch";

/** Parent that owns roving focus and arrow keys, as AccentPicker will. */
function Group() {
  const names = ["Green", "Red", "Blue"];
  const [value, setValue] = useState("Green");
  return (
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus -- the radios inside are the focusable parts
    <div
      role="radiogroup"
      aria-label="Accent"
      onKeyDown={(event) => {
        if (event.key !== "ArrowRight") return;
        const next = names[(names.indexOf(value) + 1) % names.length]!;
        setValue(next);
        screen.getByRole("radio", { name: next }).focus();
      }}
    >
      {names.map((name) => (
        <Swatch
          key={name}
          color={["#111111", "#eeeeee"]}
          label={name}
          selected={name === value}
          tabIndex={name === value ? 0 : -1}
          onSelect={() => setValue(name)}
        />
      ))}
    </div>
  );
}

describe("Swatch", () => {
  it("should be a radio named by its label", () => {
    // Arrange / Act
    render(<Swatch color="#ff0000" label="Red" selected={false} onSelect={() => {}} />);

    // Assert
    expect(screen.getByRole("radio", { name: "Red" })).toBeInTheDocument();
  });

  it("should reflect selected in aria-checked", () => {
    // Arrange / Act
    render(
      <>
        <Swatch color="#ff0000" label="Red" selected onSelect={() => {}} />
        <Swatch color="#00ff00" label="Green" selected={false} onSelect={() => {}} />
      </>,
    );

    // Assert
    expect(screen.getByRole("radio", { name: "Red" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Green" })).not.toBeChecked();
  });

  it("should call onSelect with no arguments when clicked", () => {
    // Arrange
    const onSelect = vi.fn();
    render(<Swatch color="#ff0000" label="Red" selected={false} onSelect={onSelect} />);

    // Act
    fireEvent.click(screen.getByRole("radio", { name: "Red" }));

    // Assert
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith();
  });

  it("should not call onSelect when disabled", () => {
    // Arrange
    const onSelect = vi.fn();
    render(<Swatch color="#ff0000" label="Red" selected={false} onSelect={onSelect} disabled />);

    // Act
    fireEvent.click(screen.getByRole("radio", { name: "Red" }));

    // Assert
    expect(screen.getByRole("radio", { name: "Red" })).toBeDisabled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("should still run a caller onClick and skip onSelect when it prevents default", () => {
    // Arrange
    const onSelect = vi.fn();
    const onClick = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(<Swatch color="#ff0000" label="Red" selected={false} onSelect={onSelect} onClick={onClick} />);

    // Act
    fireEvent.click(screen.getByRole("radio", { name: "Red" }));

    // Assert
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("should show the label as a caption and use it as the accessible name when showLabel is set", () => {
    // Arrange / Act
    render(<Swatch color="#ff0000" label="Red" selected={false} onSelect={() => {}} showLabel />);

    // Assert
    const radio = screen.getByRole("radio", { name: "Red" });
    expect(radio).toHaveTextContent("Red");
    expect(radio).not.toHaveAttribute("aria-label");
  });

  it("should keep the label out of the text when showLabel is off", () => {
    // Arrange / Act
    render(<Swatch color="#ff0000" label="Red" selected={false} onSelect={() => {}} />);

    // Assert
    expect(screen.getByRole("radio", { name: "Red" })).toHaveTextContent(/^$/);
  });

  it("should draw a two-shade color as a diagonal split", () => {
    // Arrange / Act
    render(<Swatch color={["#8FE388", "#1F7A2E"]} label="Green" selected={false} onSelect={() => {}} />);

    // Assert
    const disc = screen.getByRole("radio", { name: "Green" }).firstElementChild as HTMLElement;
    expect(disc.style.background).toContain("linear-gradient(135deg");
    expect(disc.style.background).toContain("50%");
  });

  it("should draw a single color flat", () => {
    // Arrange / Act
    render(<Swatch color="#F5C25B" label="Amber" selected={false} onSelect={() => {}} />);

    // Assert
    const disc = screen.getByRole("radio", { name: "Amber" }).firstElementChild as HTMLElement;
    expect(disc.style.background).toBe("rgb(245, 194, 91)");
  });

  it.each([30, 40] as const)("should expose size %s", (size) => {
    // Arrange / Act
    render(<Swatch color="#ff0000" label="Red" selected={false} onSelect={() => {}} size={size} />);

    // Assert
    expect(screen.getByRole("radio", { name: "Red" })).toHaveAttribute("data-size", String(size));
  });

  it("should work in a parent-managed radiogroup with roving tabIndex", () => {
    // Arrange
    render(<Group />);
    const green = screen.getByRole("radio", { name: "Green" });
    const red = screen.getByRole("radio", { name: "Red" });
    expect(screen.getByRole("radiogroup", { name: "Accent" })).toContainElement(green);
    expect(green).toHaveAttribute("tabindex", "0");
    expect(red).toHaveAttribute("tabindex", "-1");

    // Act
    green.focus();
    fireEvent.keyDown(green, { key: "ArrowRight" });

    // Assert
    expect(red).toBeChecked();
    expect(green).not.toBeChecked();
    expect(red).toHaveFocus();
    expect(red).toHaveAttribute("tabindex", "0");
    expect(green).toHaveAttribute("tabindex", "-1");
  });

  it("should forward ref, className and native props to the button", () => {
    // Arrange
    const ref = createRef<HTMLButtonElement>();

    // Act
    render(<Swatch ref={ref} color="#ff0000" label="Red" selected={false} onSelect={() => {}} className="extra" data-testid="s" />);

    // Assert
    const button = screen.getByTestId("s");
    expect(ref.current).toBe(button);
    expect(button).toHaveClass("extra");
    expect(button).toHaveAttribute("type", "button");
  });
});
