import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithStores } from "../../../state/testUtils";
import { TipCoach } from "./TipCoach";

const atStep = (step: number) => ({ initialSettings: { tips: { hidden: false, step } } });

describe("TipCoach", () => {
  it("should show the current step with its progress and control names in bold", () => {
    // Arrange / Act
    renderWithStores(<TipCoach />, atStep(3));

    // Assert
    expect(screen.getByRole("region", { name: "Tip" })).toHaveTextContent("Give the bass some movement");
    expect(screen.getByRole("progressbar", { name: "Step 3 of 5" })).toHaveAttribute("aria-valuenow", "3");
    expect(screen.getByText("Brightness").tagName).toBe("STRONG");
    expect(screen.getByText("Try one").tagName).toBe("STRONG");
  });

  it("should render nothing in Pro mode", () => {
    // Arrange / Act
    renderWithStores(<TipCoach />, { initialSettings: { uiMode: "pro", tips: { hidden: false, step: 1 } } });

    // Assert
    expect(screen.queryByRole("region", { name: "Tip" })).not.toBeInTheDocument();
  });

  it("should hide for the session on Hide tips", async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithStores(<TipCoach />, atStep(1));

    // Act
    await user.click(screen.getByRole("button", { name: "Hide tips" }));

    // Assert
    expect(screen.queryByRole("region", { name: "Tip" })).not.toBeInTheDocument();
  });

  it("should highlight the tip's target on Show me and clear it on the next pointer press", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(
      <>
        <TipCoach />
        <button type="button" data-tip-target="inspector-knob-lpf">
          Brightness knob
        </button>
      </>,
      atStep(3),
    );

    // Act
    await user.click(screen.getByRole("button", { name: "Show me" }));

    // Assert
    expect(stores.tips.getState().highlight).toBe("inspector-knob-lpf");
    await user.click(screen.getByRole("button", { name: "Brightness knob" }));
    expect(stores.tips.getState().highlight).toBeNull();
  });

  it("should advance to the next tip when the step is completed", () => {
    // Arrange
    const { stores } = renderWithStores(<TipCoach />, atStep(2));
    expect(screen.getByText("Hear one part at a time")).toBeInTheDocument();

    // Act
    act(() => stores.project.getState().dispatch({ type: "track/setMute", trackId: "kick", mute: true }));

    // Assert
    expect(screen.getByText("Give the bass some movement")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Step 3 of 5" })).toBeInTheDocument();
  });
});
