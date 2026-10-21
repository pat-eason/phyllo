import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { StatusDot } from "./StatusDot";

describe("StatusDot", () => {
  it("should render the label as text", () => {
    // Arrange / Act
    render(<StatusDot status="ok" label="Live" />);

    // Assert
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it.each(["ok", "busy", "warn", "error", "off"] as const)("should expose status %s", (status) => {
    // Arrange / Act
    render(<StatusDot status={status} label="State" data-testid="s" />);

    // Assert
    expect(screen.getByTestId("s")).toHaveAttribute("data-status", status);
  });

  it("should keep the dot decorative", () => {
    // Arrange / Act
    render(<StatusDot status="ok" label="Live" data-testid="s" />);

    // Assert
    expect(screen.getByTestId("s").firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("should become a named image when there is no visible label but an aria-label", () => {
    // Arrange / Act
    render(<StatusDot status="error" aria-label="Engine error" />);

    // Assert
    expect(screen.getByRole("img", { name: "Engine error" })).toBeInTheDocument();
  });

  it("should not add a role when a visible label carries the meaning", () => {
    // Arrange / Act
    render(<StatusDot status="ok" label="Live" />);

    // Assert
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("should pulse a busy dot by default", () => {
    // Arrange / Act
    render(<StatusDot status="busy" label="Evaluating" data-testid="s" />);

    // Assert
    expect(screen.getByTestId("s").firstElementChild).toHaveAttribute("data-pulse");
  });

  it("should not pulse a busy dot when pulse is false", () => {
    // Arrange / Act
    render(<StatusDot status="busy" pulse={false} label="Evaluating" data-testid="s" />);

    // Assert
    expect(screen.getByTestId("s").firstElementChild).not.toHaveAttribute("data-pulse");
  });

  it("should never pulse statuses other than busy", () => {
    // Arrange / Act
    render(<StatusDot status="ok" pulse label="Live" data-testid="s" />);

    // Assert
    expect(screen.getByTestId("s").firstElementChild).not.toHaveAttribute("data-pulse");
  });

  it("should mark the pill form with badge", () => {
    // Arrange / Act
    render(
      <>
        <StatusDot status="ok" label="Live" badge data-testid="badge" />
        <StatusDot status="ok" label="Live" data-testid="plain" />
      </>,
    );

    // Assert
    expect(screen.getByTestId("badge")).toHaveAttribute("data-badge");
    expect(screen.getByTestId("plain")).not.toHaveAttribute("data-badge");
  });

  it("should forward ref, className and native props to the root", () => {
    // Arrange
    const ref = createRef<HTMLSpanElement>();

    // Act
    render(<StatusDot ref={ref} status="off" label="Idle" className="extra" data-testid="s" />);

    // Assert
    const el = screen.getByTestId("s");
    expect(ref.current).toBe(el);
    expect(el).toHaveClass("extra");
  });

  it("should default the label tone to default, and to accent for badges", () => {
    // Arrange / Act
    render(
      <>
        <StatusDot status="ok" label="Plain" />
        <StatusDot status="ok" label="Pill" badge />
        <StatusDot status="ok" label="Soft" badge labelTone="muted" />
      </>,
    );

    // Assert
    expect(screen.getByText("Plain")).toHaveAttribute("data-tone", "default");
    expect(screen.getByText("Pill")).toHaveAttribute("data-tone", "accent");
    expect(screen.getByText("Soft")).toHaveAttribute("data-tone", "muted");
  });

  it("should expose the accent label tone", () => {
    // Arrange / Act
    render(<StatusDot status="ok" label="Watching" labelTone="accent" />);

    // Assert
    expect(screen.getByText("Watching")).toHaveAttribute("data-tone", "accent");
  });
});
