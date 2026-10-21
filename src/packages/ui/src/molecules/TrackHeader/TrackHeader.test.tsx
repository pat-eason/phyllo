import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { TrackHeader, type TrackHeaderProps } from "./TrackHeader";

function setup(overrides: Partial<TrackHeaderProps> = {}) {
  const handlers = { onSelect: vi.fn(), onMuteChange: vi.fn(), onSoloChange: vi.fn() };
  render(
    <TrackHeader
      name="Kick"
      sound='s("bd").bank("RolandTR909")'
      color="#7FD88A"
      selected={false}
      muted={false}
      soloed={false}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe("TrackHeader", () => {
  it("should show the name and sound code", () => {
    // Arrange / Act
    setup();

    // Assert
    expect(screen.getByText("Kick")).toBeInTheDocument();
    expect(screen.getByText('s("bd").bank("RolandTR909")')).toBeInTheDocument();
  });

  it("should expose the name area as a toggle button named by the track name and described by its sound", () => {
    // Arrange / Act
    setup({ selected: true });

    // Assert
    const select = screen.getByRole("button", { name: "Kick", pressed: true });
    expect(select).toHaveAccessibleDescription('s("bd").bank("RolandTR909")');
  });

  it("should call onSelect when the name area is clicked or activated by keyboard", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onSelect } = setup();

    // Act
    await user.click(screen.getByRole("button", { name: "Kick" }));
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    // Assert
    expect(onSelect).toHaveBeenCalledTimes(3);
  });

  it("should label Mute and Solo with the track name and reflect their state", () => {
    // Arrange / Act
    setup({ muted: true, soloed: false });

    // Assert
    expect(screen.getByRole("button", { name: "Mute Kick" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Solo Kick" })).toHaveAttribute("aria-pressed", "false");
  });

  it("should pass the next boolean to onMuteChange and onSoloChange", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onMuteChange, onSoloChange } = setup({ muted: true });

    // Act
    await user.click(screen.getByRole("button", { name: "Mute Kick" }));
    await user.click(screen.getByRole("button", { name: "Solo Kick" }));

    // Assert
    expect(onMuteChange).toHaveBeenCalledWith(false, expect.anything());
    expect(onSoloChange).toHaveBeenCalledWith(true, expect.anything());
  });

  it("should not select the track when Mute is clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onSelect } = setup();

    // Act
    await user.click(screen.getByRole("button", { name: "Mute Kick" }));

    // Assert
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("should show an error dot named by the message", () => {
    // Arrange / Act
    setup({ error: 'Unknown sound "bdd"' });

    // Assert
    expect(screen.getByRole("img", { name: 'Error: Unknown sound "bdd"' })).toBeInTheDocument();
  });

  it("should describe the name button with the error message", () => {
    // Arrange / Act
    setup({ error: 'Unknown sound "bdd"' });

    // Assert
    expect(screen.getByRole("button", { name: "Kick" })).toHaveAccessibleDescription(/Error: Unknown sound "bdd"/);
  });

  it("should keep the name button reachable by keyboard when there is an error", async () => {
    // Arrange
    const user = userEvent.setup();
    setup({ error: "Unexpected token )" });

    // Act
    await user.tab();

    // Assert
    expect(screen.getByRole("button", { name: "Kick" })).toHaveFocus();
  });

  it("should show no error dot without an error", () => {
    // Arrange / Act
    setup();

    // Assert
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("should show a code badge for code tracks", () => {
    // Arrange / Act
    setup({ codeTrack: true });

    // Assert
    expect(screen.getByRole("img", { name: "Code track" })).toBeInTheDocument();
  });

  it("should forward the ref and spread native props on the root", () => {
    // Arrange
    const ref = createRef<HTMLDivElement>();

    // Act
    render(
      <TrackHeader
        ref={ref}
        data-testid="header"
        className="extra"
        name="Kick"
        sound="s()"
        color="#fff"
        selected={false}
        muted={false}
        soloed={false}
        onSelect={() => {}}
        onMuteChange={() => {}}
        onSoloChange={() => {}}
      />,
    );

    // Assert
    expect(ref.current).toBe(screen.getByTestId("header"));
    expect(ref.current).toHaveClass("extra");
  });

  it("should rename on double-click and commit with Enter", async () => {
    // Arrange
    const user = userEvent.setup();
    const onRename = vi.fn();
    setup({ onRename });

    // Act
    await user.dblClick(screen.getByRole("button", { name: "Kick" }));
    await user.keyboard("{Control>}a{/Control}Snare{Enter}");

    // Assert
    expect(onRename).toHaveBeenCalledWith("Snare");
  });

  it("should cancel a rename with Escape", async () => {
    // Arrange
    const user = userEvent.setup();
    const onRename = vi.fn();
    setup({ onRename });

    // Act
    await user.dblClick(screen.getByRole("button", { name: "Kick" }));
    await user.keyboard("zzz{Escape}");

    // Assert
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Kick" })).toBeInTheDocument();
  });

  it("should not enter rename mode without onRename", async () => {
    // Arrange
    const user = userEvent.setup();
    setup();

    // Act
    await user.dblClick(screen.getByRole("button", { name: "Kick" }));

    // Assert
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
