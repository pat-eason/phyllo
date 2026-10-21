import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { Logo } from "./Logo";

/** The mark is aria-hidden, so it is found through its wrapper rather than by role. */
function getMark(root: HTMLElement) {
  return root.firstElementChild as SVGSVGElement;
}

describe("Logo", () => {
  it("should render the wordmark as real text by default", () => {
    // Arrange / Act
    render(<Logo data-testid="logo" />);

    // Assert
    expect(screen.getByText("Phyllo")).toBeInTheDocument();
    expect(getMark(screen.getByTestId("logo"))).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("should name the wrapper when it stands alone without a wordmark", () => {
    // Arrange / Act
    render(<Logo wordmark={false} />);

    // Assert
    expect(screen.getByRole("img", { name: "Phyllo" })).toBeInTheDocument();
    expect(screen.queryByText("Phyllo")).not.toBeInTheDocument();
  });

  it("should draw 40 dots, each as a pair of arcs, in one path", () => {
    // Arrange / Act
    render(<Logo data-testid="logo" />);

    // Assert
    const path = getMark(screen.getByTestId("logo")).querySelector("path");
    const d = path?.getAttribute("d") ?? "";
    expect(d.match(/M/g)).toHaveLength(40);
    expect(d.match(/a/g)).toHaveLength(80);
  });

  it("should place the first dot at the golden angle", () => {
    // Arrange / Act
    render(<Logo data-testid="logo" />);

    // Assert: i=1 -> angle 137.508deg, radius 1.72, dot radius 0.47; matches the Kit generator output
    const d = getMark(screen.getByTestId("logo")).querySelector("path")?.getAttribute("d") ?? "";
    expect(d.startsWith("M10.26 13.16a0.47 0.47 0 1 0 0.95 0a0.47 0.47 0 1 0 -0.95 0")).toBe(true);
  });

  it("should size the mark in px on a 24 box", () => {
    // Arrange / Act
    render(<Logo size={48} data-testid="logo" />);

    // Assert
    const mark = getMark(screen.getByTestId("logo"));
    expect(mark).toHaveAttribute("width", "48");
    expect(mark).toHaveAttribute("height", "48");
    expect(mark).toHaveAttribute("viewBox", "0 0 24 24");
  });

  it("should draw a rounded tile with the mark scaled to 75% when tile is set", () => {
    // Arrange / Act
    render(<Logo tile wordmark={false} data-testid="logo" />);

    // Assert
    const mark = getMark(screen.getByTestId("logo"));
    const rect = mark.querySelector("rect");
    expect(rect).toHaveAttribute("rx", "6");
    expect(rect).toHaveAttribute("width", "24");
    expect(mark.querySelector("path")?.getAttribute("transform")).toContain("scale(0.75)");
  });

  it("should not draw a tile by default", () => {
    // Arrange / Act
    render(<Logo data-testid="logo" />);

    // Assert
    expect(getMark(screen.getByTestId("logo")).querySelector("rect")).toBeNull();
  });

  it("should expose tone on the mark", () => {
    // Arrange / Act
    render(<Logo tone="text" data-testid="logo" />);

    // Assert
    expect(getMark(screen.getByTestId("logo"))).toHaveAttribute("data-tone", "text");
  });

  it("should forward ref, className and native props to the root", () => {
    // Arrange
    const ref = createRef<HTMLSpanElement>();

    // Act
    render(<Logo ref={ref} className="extra" data-testid="logo" />);

    // Assert
    const root = screen.getByTestId("logo");
    expect(ref.current).toBe(root);
    expect(root).toHaveClass("extra");
  });
});
