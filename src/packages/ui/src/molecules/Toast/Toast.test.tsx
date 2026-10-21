import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toast, type ToastProps } from "./Toast";

function setup(overrides: Partial<ToastProps> = {}) {
  const onDismiss = vi.fn();
  const onAction = vi.fn();
  const user = userEvent.setup({ delay: null });
  render(
    <Toast
      title="Export finished"
      detail="Untitled Groove.wav · 1:08 · 24-bit"
      action={{ label: "Reveal", onClick: onAction }}
      onDismiss={onDismiss}
      {...overrides}
    />,
  );
  return { onDismiss, onAction, user };
}

describe("Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Testing Library only drains its async queue under fake timers when it sees a `jest` global.
    vi.stubGlobal("jest", { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("should be a status region showing title and detail", () => {
    // Arrange / Act
    setup();

    // Assert
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Export finished");
    expect(status).toHaveTextContent("Untitled Groove.wav · 1:08 · 24-bit");
  });

  it("should be an alert for the error tone", () => {
    // Arrange / Act
    setup({ tone: "error" });

    // Assert
    expect(screen.getByRole("alert")).toHaveTextContent("Export finished");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("should call the action when its button is clicked", async () => {
    // Arrange
    const { user, onAction } = setup();

    // Act
    await user.click(screen.getByRole("button", { name: "Reveal" }));

    // Assert
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("should dismiss after the default 6000 ms", () => {
    // Arrange
    const { onDismiss } = setup();

    // Act
    act(() => vi.advanceTimersByTime(5999));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));

    // Assert
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("should honour a custom duration", () => {
    // Arrange
    const { onDismiss } = setup({ duration: 1000 });

    // Act
    act(() => vi.advanceTimersByTime(1000));

    // Assert
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("should stay up when duration is 0 and offer a close button", async () => {
    // Arrange
    const { onDismiss, user } = setup({ duration: 0 });

    // Act
    act(() => vi.advanceTimersByTime(60_000));
    expect(onDismiss).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    // Assert
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("should not show a close button for timed toasts", () => {
    // Arrange / Act
    setup();

    // Assert
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
  });

  it("should pause the timer while hovered and resume with the remaining time", async () => {
    // Arrange
    const { onDismiss, user } = setup({ duration: 1000 });
    const toast = screen.getByRole("status");
    act(() => vi.advanceTimersByTime(600));

    // Act
    await user.hover(toast);
    act(() => vi.advanceTimersByTime(5000));
    expect(onDismiss).not.toHaveBeenCalled();
    await user.unhover(toast);
    act(() => vi.advanceTimersByTime(399));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));

    // Assert
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("should pause the timer while focus is inside", async () => {
    // Arrange
    const { onDismiss, user } = setup({ duration: 1000 });

    // Act
    await user.tab();
    expect(screen.getByRole("button", { name: "Reveal" })).toHaveFocus();
    act(() => vi.advanceTimersByTime(5000));

    // Assert
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("should dismiss with Escape while focus is inside", async () => {
    // Arrange
    const { onDismiss, user } = setup();
    await user.tab();

    // Act
    await user.keyboard("{Escape}");

    // Assert
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("should omit the action button when no action is given", () => {
    // Arrange / Act
    setup({ action: undefined });

    // Assert
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
