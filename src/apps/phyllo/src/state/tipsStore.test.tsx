import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProject, useTips, useUiMode } from "../hooks";
import type { MockStores } from "./mocks";
import { renderWithStores } from "./testUtils";

function Coach() {
  const { step, total, current, visible, next, hide, show, showMe, highlight } = useTips();
  const { dispatch } = useProject();
  const { setMode } = useUiMode();
  return (
    <div>
      {visible && (
        <section aria-label="Tip">
          <p>
            Step {step} of {total}: {current.title}
          </p>
          <button type="button" onClick={next}>
            Next tip
          </button>
          <button type="button" onClick={hide}>
            Hide tips
          </button>
          <button type="button" onClick={showMe}>
            Show me
          </button>
        </section>
      )}
      <output aria-label="Highlight">{highlight ?? "none"}</output>
      <button type="button" onClick={show}>
        Show tips
      </button>
      <button type="button" onClick={() => dispatch({ type: "track/setMute", trackId: "kick", mute: true })}>
        Mute kick
      </button>
      <button type="button" onClick={() => setMode("pro")}>
        Pro mode
      </button>
    </div>
  );
}

let stores: MockStores | undefined;
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  stores?.dispose();
  stores = undefined;
  vi.useRealTimers();
});

describe("tipsStore", () => {
  it("should advance when the current step's action happens", async () => {
    // Arrange
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    ({ stores } = renderWithStores(<Coach />, { initialSettings: { tips: { step: 2 } } }));

    // Act
    await user.click(screen.getByRole("button", { name: "Mute kick" }));

    // Assert
    expect(screen.getByText("Step 3 of 5: Give the bass some movement")).toBeInTheDocument();
    expect(stores.settings.getState().settings.tips.step).toBe(3);
  });

  it("should ignore actions that belong to a later step", async () => {
    // Arrange
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    ({ stores } = renderWithStores(<Coach />));

    // Act
    await user.click(screen.getByRole("button", { name: "Mute kick" }));

    // Assert
    expect(screen.getByText("Step 1 of 5: Start from a groove")).toBeInTheDocument();
  });

  it("should complete step 1 when a starter project is created", () => {
    // Arrange
    ({ stores } = renderWithStores(<Coach />));

    // Act
    act(() => void stores?.project.getState().newProject("house"));

    // Assert
    expect(screen.getByText("Step 2 of 5: Hear one part at a time")).toBeInTheDocument();
  });

  it("should hide for the session without turning tips off", async () => {
    // Arrange
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    ({ stores } = renderWithStores(<Coach />));

    // Act
    await user.click(screen.getByRole("button", { name: "Hide tips" }));

    // Assert
    expect(screen.queryByRole("region", { name: "Tip" })).not.toBeInTheDocument();
    expect(stores.settings.getState().settings.tips.hidden).toBe(false);
    await user.click(screen.getByRole("button", { name: "Show tips" }));
    expect(screen.getByRole("region", { name: "Tip" })).toBeInTheDocument();
  });

  it("should never show in Pro mode", async () => {
    // Arrange
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    ({ stores } = renderWithStores(<Coach />));

    // Act
    await user.click(screen.getByRole("button", { name: "Pro mode" }));

    // Assert
    expect(screen.queryByRole("region", { name: "Tip" })).not.toBeInTheDocument();
  });

  it("should highlight the tip's control for 4 s after Show me", async () => {
    // Arrange
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    ({ stores } = renderWithStores(<Coach />, { initialSettings: { tips: { step: 3 } } }));

    // Act
    await user.click(screen.getByRole("button", { name: "Show me" }));
    const during = screen.getByRole("status", { name: "Highlight" }).textContent;
    await act(() => vi.advanceTimersByTimeAsync(4000));

    // Assert
    expect(during).toBe("inspector-knob-lpf");
    expect(screen.getByRole("status", { name: "Highlight" })).toHaveTextContent("none");
  });

  it("should turn tips off after the last step", async () => {
    // Arrange
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    ({ stores } = renderWithStores(<Coach />, { initialSettings: { tips: { step: 5 } } }));

    // Act
    await user.click(screen.getByRole("button", { name: "Next tip" }));

    // Assert
    expect(screen.queryByRole("region", { name: "Tip" })).not.toBeInTheDocument();
    expect(stores.settings.getState().settings.tips.hidden).toBe(true);
  });
});
