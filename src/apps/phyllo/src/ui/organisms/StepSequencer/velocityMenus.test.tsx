import { findTrack } from "@phyllo/model";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithStores } from "../../../state/testUtils";
import { drumsTrack, editorProject } from "./fixtures";
import { StepSequencer } from "./StepSequencer";

describe("velocity lane context menu", () => {
  it("should open the menu on right-click of a velocity bar", async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithStores(<StepSequencer trackId="hats" />);

    // Act
    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("slider", { name: "Closed hat step 1 velocity" }) });

    // Assert
    expect(await screen.findByRole("menuitem", { name: "Reset velocities" })).toBeEnabled();
  });

  it("should open the menu with Shift+F10 on a velocity bar", async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithStores(<StepSequencer trackId="hats" />);
    screen.getByRole("slider", { name: "Closed hat step 3 velocity" }).focus();

    // Act
    await user.keyboard("{Shift>}{F10}{/Shift}");

    // Assert
    expect(await screen.findByRole("menu", { name: "Closed hat velocity" })).toBeInTheDocument();
  });

  it("should put every hit back at the default level and drop the gain pattern", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<StepSequencer trackId="hats" />);
    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("slider", { name: "Closed hat step 1 velocity" }) });

    // Act
    await user.click(await screen.findByRole("menuitem", { name: "Reset velocities" }));

    // Assert
    expect(findTrack(stores.project.getState().project, "hats")?.params.gain).toBeUndefined();
    expect(screen.getByRole("slider", { name: "Closed hat step 1 velocity" })).toHaveAttribute("aria-valuetext", "80%");
    expect(screen.getByRole("slider", { name: "Closed hat step 3 velocity" })).toHaveAttribute("aria-valuetext", "80%");
  });

  it("should undo a reset in one step", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<StepSequencer trackId="hats" />);
    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("slider", { name: "Closed hat step 1 velocity" }) });
    await user.click(await screen.findByRole("menuitem", { name: "Reset velocities" }));

    // Act
    stores.project.getState().undo();

    // Assert
    expect(findTrack(stores.project.getState().project, "hats")?.params.gain).toBe("[.4 .7]*4");
  });

  it("should reset the row's per-hit gain tokens in a multi-row pattern", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<StepSequencer />, {
      initialProject: editorProject("drums", [drumsTrack({ pattern: "bd*4, [~ oh:0:.4]*4" })]),
    });
    await user.click(screen.getByRole("button", { name: "Open hat oh" }));
    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("slider", { name: "Open hat step 3 velocity" }) });

    // Act
    await user.click(await screen.findByRole("menuitem", { name: "Reset velocities" }));

    // Assert
    expect(findTrack(stores.project.getState().project, "drums")?.pattern).toBe("bd*4, [~ oh]*4");
  });

  it("should disable Reset velocities when every hit is already at the default level", async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithStores(<StepSequencer />, { initialProject: editorProject("drums", [drumsTrack({ pattern: "bd*4" })]) });

    // Act
    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("slider", { name: "Kick step 1 velocity" }) });

    // Assert
    expect(await screen.findByRole("menuitem", { name: "Reset velocities" })).toBeDisabled();
  });
});
