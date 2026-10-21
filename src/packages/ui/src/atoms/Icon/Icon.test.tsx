import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { Icon } from "./Icon";
import { ICON_NAMES } from "./icons";

describe("Icon", () => {
  it("should be hidden from assistive tech by default", () => {
    // Arrange
    render(<Icon name="play" data-testid="icon" />);

    // Assert
    const svg = screen.getByTestId("icon");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).not.toHaveAttribute("role");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("should expose an accessible image named by title when title is set", () => {
    // Arrange
    render(<Icon name="tip" title="Tip" />);

    // Assert
    const img = screen.getByRole("img", { name: "Tip" });
    expect(img).not.toHaveAttribute("aria-hidden");
    expect(img).toHaveTextContent("Tip");
  });

  it("should draw on a 24 grid with a 16 px, 1.9 round currentColor stroke by default", () => {
    // Arrange
    render(<Icon name="loop" data-testid="icon" />);

    // Assert
    const svg = screen.getByTestId("icon");
    expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
    expect(svg).toHaveAttribute("width", "16");
    expect(svg).toHaveAttribute("height", "16");
    expect(svg).toHaveAttribute("fill", "none");
    expect(svg).toHaveAttribute("stroke", "currentColor");
    expect(svg).toHaveAttribute("stroke-width", "1.9");
    expect(svg).toHaveAttribute("stroke-linecap", "round");
    expect(svg).toHaveAttribute("stroke-linejoin", "round");
  });

  it.each([
    [12, "2"],
    [14, "2"],
    [16, "1.9"],
    [18, "1.9"],
    [20, "1.9"],
  ] as const)("should use stroke width %s px -> %s", (size, strokeWidth) => {
    // Arrange
    render(<Icon name="plus" size={size} data-testid="icon" />);

    // Assert
    expect(screen.getByTestId("icon")).toHaveAttribute("stroke-width", strokeWidth);
    expect(screen.getByTestId("icon")).toHaveAttribute("width", String(size));
  });

  it.each(["play", "pause", "stop", "record", "drag"] as const)("should always draw %s as a solid fill", (name) => {
    // Arrange
    render(<Icon name={name} data-testid="icon" />);

    // Assert
    const svg = screen.getByTestId("icon");
    expect(svg).toHaveAttribute("fill", "currentColor");
    expect(svg).toHaveAttribute("stroke", "none");
  });

  it("should fill the star only when filled", () => {
    // Arrange
    const { rerender } = render(<Icon name="star" data-testid="icon" />);
    expect(screen.getByTestId("icon")).toHaveAttribute("fill", "none");

    // Act
    rerender(<Icon name="star" filled data-testid="icon" />);

    // Assert
    expect(screen.getByTestId("icon")).toHaveAttribute("fill", "currentColor");
    expect(screen.getByTestId("icon")).toHaveAttribute("stroke", "currentColor");
  });

  it("should render the documented 29 icons, each with a path", () => {
    // Arrange / Act
    const paths = ICON_NAMES.map((name) => {
      const { unmount } = render(<Icon name={name} data-testid="icon" />);
      const d = screen.getByTestId("icon").firstElementChild?.getAttribute("d");
      unmount();
      return d;
    });

    // Assert
    expect(ICON_NAMES).toHaveLength(29);
    for (const d of paths) {
      expect(d).toMatch(/^M/);
    }
  });

  it("should copy the Kit path data exactly", () => {
    // Arrange
    render(<Icon name="play" data-testid="icon" />);

    // Assert
    expect(screen.getByTestId("icon").firstElementChild).toHaveAttribute("d", "M7 4.5l13 7.5-13 7.5z");
  });

  it("should forward ref, className and native props to the svg", () => {
    // Arrange
    const ref = createRef<SVGSVGElement>();

    // Act
    render(<Icon ref={ref} name="check" className="extra" data-testid="icon" style={{ color: "red" }} />);

    // Assert
    const svg = screen.getByTestId("icon");
    expect(ref.current).toBe(svg);
    expect(svg).toHaveClass("extra");
    expect(svg).toHaveStyle({ color: "rgb(255, 0, 0)" });
  });
});
