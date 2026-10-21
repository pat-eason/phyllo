import { render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { Punchcard } from "./Punchcard";
import { rowsFromPatterns } from "./punchcardFixtures";

describe("Punchcard", () => {
  it("should render rows x 16 cells and mark on steps", () => {
    // Arrange
    const rows = rowsFromPatterns(["x...............", "................", "xxxxxxxxxxxxxxxx"]);

    // Act
    const { container } = render(<Punchcard rows={rows} />);

    // Assert
    expect(container.querySelectorAll("span")).toHaveLength(48);
    expect(container.querySelectorAll("[data-on]")).toHaveLength(17);
  });

  it("should be hidden from assistive tech", () => {
    // Arrange / Act
    const { container } = render(<Punchcard rows={rowsFromPatterns(["x"])} />);

    // Assert
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("should treat missing steps as off", () => {
    // Arrange / Act
    const { container } = render(<Punchcard rows={[{ color: "red", steps: [true] }]} />);

    // Assert
    expect(container.querySelectorAll("[data-on]")).toHaveLength(1);
    expect(container.querySelectorAll("span")).toHaveLength(16);
  });

  it("should apply size, className and forward the ref", () => {
    // Arrange
    const ref = createRef<HTMLDivElement>();

    // Act
    render(<Punchcard ref={ref} rows={[]} size="xl" className="extra" />);

    // Assert
    expect(ref.current).toHaveAttribute("data-size", "xl");
    expect(ref.current).toHaveClass("extra");
  });
});
