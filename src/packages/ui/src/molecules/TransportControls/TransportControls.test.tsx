import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TransportControls, type TransportControlsProps } from "./TransportControls";

function setup(overrides: Partial<TransportControlsProps> = {}) {
  const handlers = {
    onToStart: vi.fn(),
    onPlayPause: vi.fn(),
    onStop: vi.fn(),
    onRecord: vi.fn(),
    onLoopChange: vi.fn(),
  };
  render(<TransportControls playing={false} recording={false} loop={false} {...handlers} {...overrides} />);
  return handlers;
}

describe("TransportControls", () => {
  it("should be a labelled group", () => {
    // Arrange / Act
    setup();

    // Assert
    expect(screen.getByRole("group", { name: "Transport" })).toBeInTheDocument();
  });

  it("should render the keys in the fixed order", () => {
    // Arrange / Act
    setup();

    // Assert
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Back to start",
      "Play",
      "Stop",
      "Record",
      "Loop",
    ]);
  });

  it("should show Pause while playing and Stop recording while recording", () => {
    // Arrange / Act
    setup({ playing: true, recording: true });

    // Assert
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop recording" })).toBeInTheDocument();
  });

  it("should expose the loop state with aria-pressed", () => {
    // Arrange / Act
    setup({ loop: true });

    // Assert
    expect(screen.getByRole("button", { name: "Loop" })).toHaveAttribute("aria-pressed", "true");
  });

  it("should call the matching callback for each key", async () => {
    // Arrange
    const user = userEvent.setup();
    const h = setup();

    // Act
    await user.click(screen.getByRole("button", { name: "Back to start" }));
    await user.click(screen.getByRole("button", { name: "Play" }));
    await user.click(screen.getByRole("button", { name: "Stop" }));
    await user.click(screen.getByRole("button", { name: "Record" }));

    // Assert
    expect(h.onToStart).toHaveBeenCalledTimes(1);
    expect(h.onPlayPause).toHaveBeenCalledTimes(1);
    expect(h.onStop).toHaveBeenCalledTimes(1);
    expect(h.onRecord).toHaveBeenCalledTimes(1);
  });

  it("should pass the next loop value, not the event", async () => {
    // Arrange
    const user = userEvent.setup();
    const h = setup({ loop: false });

    // Act
    await user.click(screen.getByRole("button", { name: "Loop" }));

    // Assert
    expect(h.onLoopChange).toHaveBeenCalledWith(true);
  });

  it("should pass false when loop is on", async () => {
    // Arrange
    const user = userEvent.setup();
    const h = setup({ loop: true });

    // Act
    await user.click(screen.getByRole("button", { name: "Loop" }));

    // Assert
    expect(h.onLoopChange).toHaveBeenCalledWith(false);
  });

  it("should hide the record key when showRecord is false", () => {
    // Arrange / Act
    setup({ showRecord: false });

    // Assert
    expect(screen.queryByRole("button", { name: "Record" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(4);
  });

  it("should be keyboard operable", async () => {
    // Arrange
    const user = userEvent.setup();
    const h = setup();

    // Act
    await user.tab();
    await user.tab();
    await user.keyboard("{Enter}");

    // Assert
    expect(h.onPlayPause).toHaveBeenCalledTimes(1);
  });
});
