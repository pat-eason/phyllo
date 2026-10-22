import { findTrack } from "@phyllo/model";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithStores } from "../../../state/testUtils";
import { editorProject, leadTrack } from "./fixtures";
import { StepSequencer } from "./StepSequencer";

function setup(pattern = "a3*4") {
  const user = userEvent.setup();
  const rendered = renderWithStores(<StepSequencer />, { initialProject: editorProject("lead", [leadTrack({ pattern })]) });
  return { user, ...rendered };
}

const leadPattern = (stores: ReturnType<typeof setup>["stores"]) => findTrack(stores.project.getState().project, "lead")?.pattern;

describe("piano roll context menu", () => {
  it("should add a note from an empty cell's menu", async () => {
    // Arrange
    const { user, stores } = setup();
    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("button", { name: "C4 step 2" }) });

    // Act
    await user.click(await screen.findByRole("menuitem", { name: "Add note C4" }));

    // Assert
    expect(leadPattern(stores)).toBe("a3 c4 ~ ~ a3 ~ ~ ~ a3 ~ ~ ~ a3 ~ ~ ~");
  });

  it("should remove a note from a filled cell's menu", async () => {
    // Arrange
    const { user, stores } = setup();
    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("button", { name: "A3 step 1" }) });

    // Act
    await user.click(await screen.findByRole("menuitem", { name: "Remove note A3" }));

    // Assert
    expect(leadPattern(stores)).toBe("~ a3 a3 a3");
  });

  it("should open the menu with Shift+F10 on a focused cell", async () => {
    // Arrange
    const { user } = setup();
    screen.getByRole("button", { name: "C4 step 2" }).focus();

    // Act
    await user.keyboard("{Shift>}{F10}{/Shift}");

    // Assert
    expect(await screen.findByRole("menu", { name: "C4 step 2" })).toBeInTheDocument();
  });

  it("should clear every note in one undo step", async () => {
    // Arrange
    const { user, stores } = setup();
    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("button", { name: "C4 step 2" }) });
    await user.click(await screen.findByRole("menuitem", { name: "Clear all notes" }));
    const cleared = screen.queryAllByRole("button", { pressed: true });

    // Act
    stores.project.getState().undo();

    // Assert
    expect(cleared.filter((cell) => /step \d+$/.test(cell.getAttribute("aria-label") ?? ""))).toHaveLength(0);
    expect(leadPattern(stores)).toBe("a3*4");
  });

  it("should disable Clear all notes on an empty roll", async () => {
    // Arrange
    const { user } = setup("~");

    // Act
    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("button", { name: "C4 step 2" }) });

    // Assert
    expect(await screen.findByRole("menuitem", { name: "Clear all notes" })).toBeDisabled();
  });
});
