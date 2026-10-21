import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { Surface } from "./Surface";

describe("Surface", () => {
  it("should render a div with its children by default", () => {
    // Arrange / Act
    render(
      <Surface material="card" data-testid="s">
        Hello
      </Surface>,
    );

    // Assert
    const el = screen.getByTestId("s");
    expect(el.tagName).toBe("DIV");
    expect(el).toHaveTextContent("Hello");
    expect(el).toHaveAttribute("data-material", "card");
  });

  it("should render the element given by as and keep its landmark role", () => {
    // Arrange / Act
    render(<Surface as="aside" material="panel" aria-label="Track inspector" />);

    // Assert
    expect(screen.getByRole("complementary", { name: "Track inspector" })).toBeInTheDocument();
  });

  it.each([
    ["panel", false],
    ["raised", false],
    ["inset", false],
    ["chrome", false],
    ["card", true],
    ["plate", true],
    ["dialog", true],
  ] as const)("should default %s padded to %s", (material, padded) => {
    // Arrange / Act
    render(<Surface material={material} data-testid="s" />);

    // Assert
    if (padded) {
      expect(screen.getByTestId("s")).toHaveAttribute("data-padded");
    } else {
      expect(screen.getByTestId("s")).not.toHaveAttribute("data-padded");
    }
  });

  it("should let padded override the material default", () => {
    // Arrange / Act
    render(
      <>
        <Surface material="card" padded={false} data-testid="off" />
        <Surface material="panel" padded data-testid="on" />
      </>,
    );

    // Assert
    expect(screen.getByTestId("off")).not.toHaveAttribute("data-padded");
    expect(screen.getByTestId("on")).toHaveAttribute("data-padded");
  });

  it.each(["left", "right"] as const)("should add an aria-hidden wood cheek on the %s edge of a panel", (cheek) => {
    // Arrange / Act
    render(<Surface material="panel" cheek={cheek} data-testid="s" />);

    // Assert
    const panel = screen.getByTestId("s");
    expect(panel).toHaveAttribute("data-cheek", cheek);
    expect(panel.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(panel.firstElementChild).toHaveClass("cheek");
  });

  it("should ignore cheek on materials other than panel", () => {
    // Arrange / Act
    render(<Surface material="card" cheek="left" data-testid="s" />);

    // Assert
    const card = screen.getByTestId("s");
    expect(card).not.toHaveAttribute("data-cheek");
    expect(card).toBeEmptyDOMElement();
  });

  it("should not render a cheek without the prop", () => {
    // Arrange / Act
    render(<Surface material="panel" data-testid="s" />);

    // Assert
    expect(screen.getByTestId("s")).toBeEmptyDOMElement();
  });

  it("should expose radius, floating and edge only where they apply", () => {
    // Arrange / Act
    render(
      <>
        <Surface material="raised" radius="2xl" data-testid="r" />
        <Surface material="card" floating data-testid="f" />
        <Surface material="panel" floating data-testid="nf" />
        <Surface material="chrome" edge="top" data-testid="e" />
        <Surface material="chrome" data-testid="e-default" />
        <Surface material="card" edge="top" data-testid="ne" />
      </>,
    );

    // Assert
    expect(screen.getByTestId("r")).toHaveAttribute("data-radius", "2xl");
    expect(screen.getByTestId("f")).toHaveAttribute("data-floating");
    expect(screen.getByTestId("nf")).not.toHaveAttribute("data-floating");
    expect(screen.getByTestId("e")).toHaveAttribute("data-edge", "top");
    expect(screen.getByTestId("e-default")).toHaveAttribute("data-edge", "bottom");
    expect(screen.getByTestId("ne")).not.toHaveAttribute("data-edge");
  });

  it("should forward ref, className and native props to the root", () => {
    // Arrange
    const ref = createRef<HTMLElement>();

    // Act
    render(<Surface ref={ref} material="inset" className="extra" data-testid="s" id="well" />);

    // Assert
    const el = screen.getByTestId("s");
    expect(ref.current).toBe(el);
    expect(el).toHaveClass("extra");
    expect(el).toHaveAttribute("id", "well");
  });
});
