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
    expect(container.querySelectorAll("span")).toHaveLength(48);
  });

  it.each([0, 1, 2, 3])("should always draw 3 rows, padding %i given rows with empty ones", (given) => {
    // Arrange
    const rows = rowsFromPatterns(Array.from({ length: given }, () => "xxxxxxxxxxxxxxxx"));

    // Act
    const { container } = render(<Punchcard rows={rows} />);

    // Assert
    expect(container.firstElementChild?.children).toHaveLength(3);
    expect(container.querySelectorAll("[data-on]")).toHaveLength(given * 16);
  });

  it("should not drop rows beyond the minimum, and honour rowCount", () => {
    // Arrange
    const four = rowsFromPatterns(["x", "x", "x", "x"]);

    // Act
    const many = render(<Punchcard rows={four} />);
    const few = render(<Punchcard rows={[]} rowCount={2} />);

    // Assert
    expect(many.container.firstElementChild?.children).toHaveLength(4);
    expect(few.container.firstElementChild?.children).toHaveLength(2);
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
