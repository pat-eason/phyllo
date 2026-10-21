import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("should render a native button of type button named by its text", () => {
    // Arrange / Act
    render(<Button>Edit pattern</Button>);

    // Assert
    const button = screen.getByRole("button", { name: "Edit pattern" });
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "button");
  });

  it("should default to the secondary variant and md size", () => {
    // Arrange / Act
    render(<Button>Go</Button>);

    // Assert
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("data-variant", "secondary");
    expect(button).toHaveAttribute("data-size", "md");
  });

  it.each(["primary", "secondary", "ghost", "dashed"] as const)("should expose the %s variant", (variant) => {
    // Arrange / Act
    render(<Button variant={variant}>Go</Button>);

    // Assert
    expect(screen.getByRole("button")).toHaveAttribute("data-variant", variant);
  });

  it("should only mark the tone on primary buttons", () => {
    // Arrange / Act
    render(
      <>
        <Button variant="primary" tone="inverse">Export</Button>
        <Button variant="secondary" tone="inverse">Other</Button>
      </>,
    );

    // Assert
    expect(screen.getByRole("button", { name: "Export" })).toHaveAttribute("data-tone", "inverse");
    expect(screen.getByRole("button", { name: "Other" })).not.toHaveAttribute("data-tone");
  });

  it("should call onClick when clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Apply</Button>);

    // Act
    await user.click(screen.getByRole("button", { name: "Apply" }));

    // Assert
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("should be operable from the keyboard", async () => {
    // Arrange
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Apply</Button>);

    // Act
    await user.tab();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    // Assert
    expect(screen.getByRole("button")).toHaveFocus();
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("should not call onClick when disabled", async () => {
    // Arrange
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Apply</Button>);

    // Act
    await user.click(screen.getByRole("button"));

    // Assert
    expect(screen.getByRole("button")).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("should set aria-busy, keep the label and ignore clicks while loading", async () => {
    // Arrange
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Exporting</Button>);

    // Act
    await user.click(screen.getByRole("button"));

    // Assert
    const button = screen.getByRole("button", { name: "Exporting" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(onClick).not.toHaveBeenCalled();
  });

  it("should not set aria-busy when not loading", () => {
    // Arrange / Act
    render(<Button>Go</Button>);

    // Assert
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy");
  });

  it("should keep start and end icons out of the accessible name", () => {
    // Arrange / Act
    render(<Button iconStart="plus" iconEnd="arrow-right">Add track</Button>);

    // Assert
    expect(screen.getByRole("button", { name: "Add track" })).toBeInTheDocument();
  });

  it("should render a link with href when as is a", () => {
    // Arrange / Act
    render(<Button as="a" href="/export">Export</Button>);

    // Assert
    const link = screen.getByRole("link", { name: "Export" });
    expect(link).toHaveAttribute("href", "/export");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("should take a disabled link out of the tab order and block its click", async () => {
    // Arrange
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button as="a" href="/export" disabled onClick={onClick}>Export</Button>);

    // Act
    await user.click(screen.getByRole("link"));

    // Assert
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("aria-disabled", "true");
    expect(link).toHaveAttribute("tabindex", "-1");
    expect(onClick).not.toHaveBeenCalled();
  });

  it("should forward className, native props and the ref", () => {
    // Arrange
    const ref = createRef<HTMLButtonElement | HTMLAnchorElement>();

    // Act
    render(<Button ref={ref} className="extra" data-testid="b" type="submit">Save</Button>);

    // Assert
    const button = screen.getByTestId("b");
    expect(button).toHaveClass("extra");
    expect(button).toHaveAttribute("type", "submit");
    expect(ref.current).toBe(button);
  });
});
