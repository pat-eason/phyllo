import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { TransportKey } from "./TransportKey";

describe("TransportKey", () => {
  it.each([
    ["play", "Play"],
    ["stop", "Stop"],
    ["record", "Record"],
    ["loop", "Loop"],
    ["to-start", "Back to start"],
  ] as const)("should derive the label for %s", (kind, name) => {
    // Arrange / Act
    render(<TransportKey kind={kind} />);

    // Assert
    expect(screen.getByRole("button", { name })).toBeInTheDocument();
  });

  it("should flip play to Pause when active", () => {
    // Arrange / Act
    render(<TransportKey kind="play" active />);

    // Assert
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Play" })).not.toBeInTheDocument();
  });

  it("should flip record to Stop recording when armed", () => {
    // Arrange / Act
    render(<TransportKey kind="record" active />);

    // Assert
    expect(screen.getByRole("button", { name: "Stop recording" })).toBeInTheDocument();
  });

  it("should expose loop as a toggle with aria-pressed", () => {
    // Arrange
    const { rerender } = render(<TransportKey kind="loop" />);

    // Assert
    expect(screen.getByRole("button", { name: "Loop" })).toHaveAttribute("aria-pressed", "false");

    // Act
    rerender(<TransportKey kind="loop" active />);

    // Assert
    expect(screen.getByRole("button", { name: "Loop" })).toHaveAttribute("aria-pressed", "true");
  });

  it.each(["play", "stop", "record", "to-start"] as const)("should not set aria-pressed on %s", (kind) => {
    // Arrange / Act
    render(<TransportKey kind={kind} active />);

    // Assert
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-pressed");
  });

  it("should ignore active on stop and to-start", () => {
    // Arrange / Act
    render(
      <>
        <TransportKey kind="stop" active data-testid="stop" />
        <TransportKey kind="to-start" active data-testid="start" />
      </>,
    );

    // Assert
    expect(screen.getByTestId("stop")).not.toHaveAttribute("data-active");
    expect(screen.getByTestId("start")).not.toHaveAttribute("data-active");
  });

  it("should call onClick on click and on Space or Enter", async () => {
    // Arrange
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<TransportKey kind="play" onClick={onClick} />);

    // Act
    await user.click(screen.getByRole("button"));
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    // Assert
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it("should not call onClick when disabled", async () => {
    // Arrange
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<TransportKey kind="stop" disabled onClick={onClick} />);

    // Act
    await user.click(screen.getByRole("button"));

    // Assert
    expect(onClick).not.toHaveBeenCalled();
  });

  it("should allow overriding the derived label", () => {
    // Arrange / Act
    render(<TransportKey kind="play" aria-label="Play pattern" />);

    // Assert
    expect(screen.getByRole("button", { name: "Play pattern" })).toBeInTheDocument();
  });

  it("should reflect size and forward className and the ref", () => {
    // Arrange
    const ref = createRef<HTMLButtonElement>();

    // Act
    render(<TransportKey ref={ref} kind="play" size="lg" className="extra" />);

    // Assert
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("data-size", "lg");
    expect(button).toHaveClass("extra");
    expect(ref.current).toBe(button);
  });
});
