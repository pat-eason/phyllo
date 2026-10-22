import { findTrack } from "@phyllo/model";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { MockStores } from "../../../state/mocks";
import { renderWithStores } from "../../../state/testUtils";
import { PatternTools } from "../PatternTools";
import { drumsTrack, editorProject } from "./fixtures";
import { PatternEditorProvider } from "./PatternEditorProvider";
import { StepSequencer } from "./StepSequencer";

const KICK_PATTERN = "bd*4, [~ cp]*2, hh*8, [~ oh]*4";

function drumsOf(stores: MockStores) {
  return findTrack(stores.project.getState().project, "drums");
}

/** The sixteen cells of a row as 0/1 (pressed or not). */
function stepsOf(label: string): number[] {
  return Array.from({ length: 16 }, (_, i) => (screen.getByRole("button", { name: `${label} step ${i + 1}` }).getAttribute("aria-pressed") === "true" ? 1 : 0));
}

function setup(withTools = false, pattern = KICK_PATTERN) {
  const user = userEvent.setup();
  const rendered = renderWithStores(
    <PatternEditorProvider>
      <StepSequencer />
      {withTools ? <PatternTools /> : null}
    </PatternEditorProvider>,
    { initialProject: editorProject("drums", [drumsTrack({ pattern })]) },
  );
  return { user, ...rendered };
}

async function rightClick(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("button", { name }) });
  await screen.findByRole("menu");
}

describe("step row context menu", () => {
  it("should select the row and open its menu on right-click of the label", async () => {
    // Arrange
    const { user } = setup();

    // Act
    await rightClick(user, "Clap cp");

    // Assert
    expect(screen.getByRole("menu", { name: "Clap row" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clap cp" })).toHaveAttribute("aria-pressed", "true");
  });

  it("should open the menu with Shift+F10 on a focused cell", async () => {
    // Arrange
    const { user } = setup();
    screen.getByRole("button", { name: "Kick step 3" }).focus();

    // Act
    await user.keyboard("{Shift>}{F10}{/Shift}");

    // Assert
    expect(await screen.findByRole("menu", { name: "Kick row" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Turn step on" })).toBeInTheDocument();
  });

  it("should keep the arrow keys moving between cells", async () => {
    // Arrange
    const { user } = setup();
    screen.getByRole("button", { name: "Kick step 1" }).focus();

    // Act
    await user.keyboard("{ArrowRight}");

    // Assert
    expect(screen.getByRole("button", { name: "Kick step 2" })).toHaveFocus();
  });

  it("should turn a step on from the cell's menu", async () => {
    // Arrange
    const { user } = setup();
    await rightClick(user, "Kick step 2");

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Turn step on" }));

    // Assert
    expect(stepsOf("Kick")).toEqual([1, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
  });

  it("should turn a step off from the cell's menu", async () => {
    // Arrange
    const { user } = setup();
    await rightClick(user, "Kick step 5");

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Turn step off" }));

    // Assert
    expect(stepsOf("Kick")).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
  });

  it("should offer no step item from the row label", async () => {
    // Arrange
    const { user } = setup();

    // Act
    await rightClick(user, "Kick bd");

    // Assert
    expect(screen.queryByRole("menuitem", { name: /^Turn step/ })).not.toBeInTheDocument();
  });

  it("should audition the row's sound from Preview sound", async () => {
    // Arrange
    const { user, stores } = setup();
    await rightClick(user, "Clap cp");

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Preview sound" }));

    // Assert
    await waitFor(() => expect(stores.fakeEngine.previews).toHaveLength(1));
    expect(stores.fakeEngine.previews[0]).toMatchObject({ s: "cp" });
  });

  it("should fill every step of the row", async () => {
    // Arrange
    const { user } = setup();
    await rightClick(user, "Kick bd");
    await user.click(screen.getByRole("menuitem", { name: "Fill" }));

    // Act
    await user.click(await screen.findByRole("menuitem", { name: "Every step" }));

    // Assert
    expect(stepsOf("Kick")).toEqual(new Array<number>(16).fill(1));
  });

  it("should fill every 2nd step of the row", async () => {
    // Arrange
    const { user } = setup();
    await rightClick(user, "Clap cp");
    await user.click(screen.getByRole("menuitem", { name: "Fill" }));

    // Act
    await user.click(await screen.findByRole("menuitem", { name: "Every 2nd step" }));

    // Assert
    expect(stepsOf("Clap")).toEqual([1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]);
  });

  it("should fill every 4th step of the row", async () => {
    // Arrange
    const { user } = setup();
    await rightClick(user, "Clap cp");
    await user.click(screen.getByRole("menuitem", { name: "Fill" }));

    // Act
    await user.click(await screen.findByRole("menuitem", { name: "Every 4th step" }));

    // Assert
    expect(stepsOf("Clap")).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
  });

  it("should undo a fill in one step", async () => {
    // Arrange
    const { user, stores } = setup();
    await rightClick(user, "Kick bd");
    await user.click(screen.getByRole("menuitem", { name: "Fill" }));
    await user.click(await screen.findByRole("menuitem", { name: "Every step" }));

    // Act
    stores.project.getState().undo();

    // Assert
    expect(drumsOf(stores)?.pattern).toBe(KICK_PATTERN);
  });

  it("should clear the row", async () => {
    // Arrange
    const { user } = setup();
    await rightClick(user, "Kick bd");

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Clear row" }));

    // Assert
    expect(stepsOf("Kick")).toEqual(new Array<number>(16).fill(0));
    expect(stepsOf("Clap")).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]);
  });

  it("should disable Clear, Shift left and Shift right on an empty row", async () => {
    // Arrange
    const { user } = setup();

    // Act
    await rightClick(user, "Rimshot rim");

    // Assert
    expect(screen.getByRole("menuitem", { name: "Clear row" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Shift left" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Shift right" })).toBeDisabled();
  });

  it("should shift the row one step right", async () => {
    // Arrange
    const { user } = setup();
    await rightClick(user, "Kick bd");

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Shift right" }));

    // Assert
    expect(stepsOf("Kick")).toEqual([0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0]);
  });

  it("should carry each hit's velocity along when a row with a gain pattern is shifted", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<StepSequencer trackId="hats" />);
    await rightClick(user, "Closed hat hh");

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Shift right" }));

    // Assert
    expect(screen.getByRole("slider", { name: "Closed hat step 2 velocity" })).toHaveAttribute("aria-valuetext", "40%");
    expect(screen.getByRole("slider", { name: "Closed hat step 4 velocity" })).toHaveAttribute("aria-valuetext", "70%");
    expect(typeof findTrack(stores.project.getState().project, "hats")?.params.gain).toBe("string");
  });

  it("should wrap a shift to the left around the cycle", async () => {
    // Arrange
    const { user } = setup();
    await rightClick(user, "Kick bd");

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Shift left" }));

    // Assert
    expect(stepsOf("Kick")).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it("should copy a row and paste it onto another", async () => {
    // Arrange
    const { user } = setup();
    await rightClick(user, "Kick bd");
    await user.click(screen.getByRole("menuitem", { name: "Copy row" }));
    await rightClick(user, "Rimshot rim");

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Paste row" }));

    // Assert
    expect(stepsOf("Rimshot")).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
  });

  it("should disable Paste row until a row was copied", async () => {
    // Arrange
    const { user } = setup();

    // Act
    await rightClick(user, "Kick bd");

    // Assert
    expect(screen.getByRole("menuitem", { name: "Paste row" })).toBeDisabled();
  });

  it("should not offer Remove row on a kit row", async () => {
    // Arrange
    const { user } = setup();

    // Act
    await rightClick(user, "Kick bd");

    // Assert
    expect(screen.queryByRole("menuitem", { name: "Remove row" })).not.toBeInTheDocument();
  });

  it("should remove a row that isn't part of the kit", async () => {
    // Arrange
    const { user, stores } = setup(false, "bd*4, [~ sd]*2");
    await rightClick(user, "Snare sd");

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Remove row" }));

    // Assert
    expect(screen.queryByRole("button", { name: "Snare sd" })).not.toBeInTheDocument();
    expect(drumsOf(stores)?.pattern).toBe("bd*4");
  });

  it("should move focus to the Euclid hits control", async () => {
    // Arrange
    const { user } = setup(true);
    await rightClick(user, "Clap cp");

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Euclid…" }));

    // Assert
    expect(screen.getByRole("button", { name: "More hits" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Clap cp" })).toHaveAttribute("aria-pressed", "true");
  });

  it("should disable Euclid when the Pattern tools aren't shown", async () => {
    // Arrange
    const { user } = setup(false);

    // Act
    await rightClick(user, "Clap cp");

    // Assert
    expect(screen.getByRole("menuitem", { name: "Euclid…" })).toBeDisabled();
  });
});
