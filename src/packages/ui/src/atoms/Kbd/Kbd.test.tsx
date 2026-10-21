import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { Kbd } from "./Kbd";

describe("Kbd", () => {
  it("should render the keys as one glyph group in a native kbd", () => {
    // Arrange / Act
    render(<Kbd keys={["⌘", "K"]} data-testid="k" />);

    // Assert
    const el = screen.getByTestId("k");
    expect(el.tagName).toBe("KBD");
    expect(el).toHaveTextContent("⌘K");
  });

  it("should speak glyph keys in full", () => {
    // Arrange / Act
    render(<Kbd keys={["⌘", "⇧", "K"]} />);

    // Assert
    expect(screen.getByLabelText("Command Shift K")).toHaveTextContent("⌘⇧K");
  });

  it("should not add an aria-label when every key is plain text", () => {
    // Arrange / Act
    render(<Kbd keys={["Ctrl", "K"]} data-testid="k" />);

    // Assert
    expect(screen.getByTestId("k")).not.toHaveAttribute("aria-label");
  });

  it("should separate word keys with a plus so they stay readable", () => {
    // Arrange / Act
    render(<Kbd keys={["Ctrl", "Shift", "P"]} data-testid="k" />);

    // Assert
    expect(screen.getByTestId("k")).toHaveTextContent("Ctrl+Shift+P");
  });

  it("should let an explicit aria-label win over the spoken form", () => {
    // Arrange / Act
    render(<Kbd keys={["⌘", "K"]} aria-label="Open search" />);

    // Assert
    expect(screen.getByLabelText("Open search")).toHaveTextContent("⌘K");
  });

  it("should render a single key", () => {
    // Arrange / Act
    render(<Kbd keys={["Space"]} data-testid="k" />);

    // Assert
    expect(screen.getByTestId("k")).toHaveTextContent("Space");
  });

  it("should forward ref, className and native props to the kbd", () => {
    // Arrange
    const ref = createRef<HTMLElement>();

    // Act
    render(<Kbd ref={ref} keys={["Esc"]} className="extra" data-testid="k" />);

    // Assert
    const el = screen.getByTestId("k");
    expect(ref.current).toBe(el);
    expect(el).toHaveClass("extra");
  });
});
