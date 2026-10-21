import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("should render the title and body", () => {
    // Arrange / Act
    render(<EmptyState title="No grooves match" body="Try a different word, or remove a tag filter." />);

    // Assert
    expect(screen.getByText("No grooves match")).toBeInTheDocument();
    expect(screen.getByText("Try a different word, or remove a tag filter.")).toBeInTheDocument();
  });

  it("should render no button without an action", () => {
    // Arrange / Act
    render(<EmptyState title="No grooves match" />);

    // Assert
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("should call the action when its button is activated", async () => {
    // Arrange
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<EmptyState title="No grooves match" action={{ label: "Clear filters", onClick }} />);

    // Act
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await user.keyboard("{Enter}");

    // Assert
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("should spread native props and forward the ref to the root", () => {
    // Arrange
    const ref = createRef<HTMLDivElement>();

    // Act
    render(<EmptyState ref={ref} title="x" data-testid="empty" className="extra" />);

    // Assert
    expect(ref.current).toBe(screen.getByTestId("empty"));
    expect(ref.current).toHaveClass("extra");
  });
});
