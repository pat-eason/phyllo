import { findTrack } from "@phyllo/model";
import type { Modifier } from "@phyllo/model";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { MockStores } from "../../../state/mocks";
import { renderWithStores } from "../../../state/testUtils";
import { ToastProvider } from "../../toasts";
import { ChannelStrip } from "./ChannelStrip";
import type { ChannelStripProps } from "./ChannelStrip";
import { mixerProject } from "./fixtures";
import type { MixerFixtureOptions } from "./fixtures";

const CRUSH: Modifier = { id: "kick:crush", code: ".crush(4)", enabled: true, origin: "user" };

let stores: MockStores | undefined;
afterEach(() => {
  stores?.dispose();
  stores = undefined;
  window.location.hash = "";
});

function setup(strip: ChannelStripProps, fixture: MixerFixtureOptions = {}) {
  const view = renderWithStores(
    <ToastProvider>
      <ChannelStrip {...strip} />
    </ToastProvider>,
    { initialProject: mixerProject(fixture) },
  );
  stores = view.stores;
  const user = userEvent.setup();
  const project = () => view.stores.project.getState().project;
  const track = (id: string) => findTrack(project(), id);
  const rightClick = (target: Element) => user.pointer({ keys: "[MouseRight]", target });
  return { user, project, track, rightClick, undo: () => view.stores.project.getState().undo() };
}

describe("Mixer context menus", () => {
  it("should open the track menu on a strip and reset the fader to 0 dB", async () => {
    // Arrange
    const { user, rightClick, track } = setup({ kind: "track", trackId: "kick" });

    // Act
    await rightClick(screen.getByRole("region", { name: "Kick channel" }));
    await user.click(await screen.findByRole("menuitem", { name: "Reset volume" }));

    // Assert
    expect(track("kick")?.params.gain).toBe(1);
  });

  it("should select the track the menu was opened on", async () => {
    // Arrange
    const { rightClick, project } = setup({ kind: "track", trackId: "clap" });

    // Act
    await rightClick(screen.getByRole("region", { name: "Clap channel" }));

    // Assert
    await screen.findByRole("menu");
    expect(project().ui.selectedTrack).toBe("clap");
  });

  it("should not offer Rename, which the strip has no inline field for", async () => {
    // Arrange
    const { rightClick } = setup({ kind: "track", trackId: "kick" });

    // Act
    await rightClick(screen.getByRole("region", { name: "Kick channel" }));

    // Assert
    await screen.findByRole("menu");
    expect(screen.queryByRole("menuitem", { name: /^Rename/ })).not.toBeInTheDocument();
  });

  it("should disable Reset volume while a pattern drives the gain", async () => {
    // Arrange
    const { rightClick } = setup({ kind: "track", trackId: "hats" });

    // Act
    await rightClick(screen.getByRole("region", { name: "Hats channel" }));

    // Assert
    expect(await screen.findByRole("menuitem", { name: "Reset volume" })).toBeDisabled();
  });

  it("should open the track menu from the keyboard with Shift+F10", async () => {
    // Arrange
    const { user } = setup({ kind: "track", trackId: "kick" });
    screen.getByRole("slider", { name: "Kick volume" }).focus();

    // Act
    await user.keyboard("{Shift>}{F10}{/Shift}");

    // Assert
    expect(await screen.findByRole("menuitem", { name: "Duplicate" })).toBeInTheDocument();
  });

  it("should select the track and open Arrange from Show in Inspector", async () => {
    // Arrange
    const { user, rightClick, project } = setup({ kind: "track", trackId: "clap" });

    // Act
    await rightClick(screen.getByRole("region", { name: "Clap channel" }));
    await user.click(await screen.findByRole("menuitem", { name: "Show in Inspector" }));

    // Assert
    expect(project().ui.selectedTrack).toBe("clap");
    await waitFor(() => expect(window.location.hash).toBe("#/arrange"));
  });

  it("should edit a param insert's value from its menu", async () => {
    // Arrange
    const { user, rightClick } = setup({ kind: "track", trackId: "kick" });

    // Act
    await rightClick(screen.getByRole("button", { name: /^shape .*edit$/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit value" }));

    // Assert
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Kick shape value" })).toHaveFocus());
  });

  it("should unset a param insert from Remove", async () => {
    // Arrange
    const { user, rightClick, track } = setup({ kind: "track", trackId: "kick" });

    // Act
    await rightClick(screen.getByRole("button", { name: /^shape .*edit$/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Remove" }));

    // Assert
    expect(track("kick")?.params.shape).toBeUndefined();
  });

  it("should disable Edit value and Remove on an insert a modifier drives", async () => {
    // Arrange
    const { rightClick } = setup({ kind: "track", trackId: "bass" });

    // Act
    await rightClick(screen.getByText("~sine"));

    // Assert
    expect(await screen.findByRole("menuitem", { name: "Edit value" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Remove" })).toBeDisabled();
  });

  it("should switch a modifier insert off from its Enabled check item", async () => {
    // Arrange
    const { user, rightClick, track } = setup({ kind: "track", trackId: "kick" }, { tracks: { kick: { modifiers: [CRUSH] } } });

    // Act
    await rightClick(screen.getByText("crush"));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Enabled" }));

    // Assert
    expect(track("kick")?.modifiers[0]?.enabled).toBe(false);
  });

  it("should remove a modifier insert", async () => {
    // Arrange
    const { user, rightClick, track } = setup({ kind: "track", trackId: "kick" }, { tracks: { kick: { modifiers: [CRUSH] } } });

    // Act
    await rightClick(screen.getByText("crush"));
    await user.click(await screen.findByRole("menuitem", { name: "Remove modifier" }));

    // Assert
    expect(track("kick")?.modifiers).toEqual([]);
  });

  it("should mute every track on a bus from Mute bus", async () => {
    // Arrange
    const { user, rightClick, project } = setup({ kind: "bus", orbit: 1 });

    // Act
    await rightClick(screen.getByRole("region", { name: "Bus 1 channel" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Mute bus" }));

    // Assert
    expect(project().tracks.filter((t) => t.orbit === 1).every((t) => t.mute)).toBe(true);
  });

  it("should solo exactly the tracks on a bus as one undo step", async () => {
    // Arrange
    const { user, rightClick, project, undo } = setup({ kind: "bus", orbit: 1 }, { tracks: { bass: { solo: true } } });

    // Act
    await rightClick(screen.getByRole("region", { name: "Bus 1 channel" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Solo bus" }));

    // Assert
    expect(project().tracks.filter((t) => t.solo).map((t) => t.id)).toEqual(["kick", "clap", "hats"]);
    undo();
    expect(project().tracks.filter((t) => t.solo).map((t) => t.id)).toEqual(["bass"]);
  });

  it("should check Solo bus when exactly its tracks are soloed and clear the solos when chosen", async () => {
    // Arrange
    const { user, rightClick, project } = setup(
      { kind: "bus", orbit: 1 },
      { tracks: { kick: { solo: true }, clap: { solo: true }, hats: { solo: true } } },
    );

    // Act
    await rightClick(screen.getByRole("region", { name: "Bus 1 channel" }));
    const solo = await screen.findByRole("menuitemcheckbox", { name: "Solo bus" });
    expect(solo).toBeChecked();
    await user.click(solo);

    // Assert
    expect(project().tracks.some((t) => t.solo)).toBe(false);
  });

  it("should select one of the bus's tracks from the Select track submenu", async () => {
    // Arrange
    const { user, rightClick, project } = setup({ kind: "bus", orbit: 1 });

    // Act
    await rightClick(screen.getByRole("region", { name: "Bus 1 channel" }));
    await user.click(await screen.findByRole("menuitem", { name: "Select track" }));
    await user.click(await screen.findByRole("menuitem", { name: "Hats" }));

    // Assert
    expect(project().ui.selectedTrack).toBe("hats");
  });

  it("should clear the bus effects as one undo step", async () => {
    // Arrange
    const { user, rightClick, project, undo } = setup({ kind: "bus", orbit: 1 });

    // Act
    await rightClick(screen.getByRole("region", { name: "Bus 1 channel" }));
    await user.click(await screen.findByRole("menuitem", { name: "Reset bus effects" }));

    // Assert
    expect(project().buses.find((b) => b.orbit === 1)).toEqual({ orbit: 1 });
    undo();
    expect(project().buses.find((b) => b.orbit === 1)).toEqual({ orbit: 1, roomsize: 2, delaytime: 0.125, delayfeedback: 0.4 });
  });

  it("should switch the master limiter from its check item", async () => {
    // Arrange
    const { user, rightClick, project } = setup({ kind: "master" });
    expect(project().master.limiter).toBe(true);

    // Act
    await rightClick(screen.getByRole("region", { name: "Master channel" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Limiter" }));

    // Assert
    expect(project().master.limiter).toBe(false);
  });

  it("should reset the output level to 0 dB", async () => {
    // Arrange
    const { user, rightClick, project } = setup({ kind: "master" });
    expect(project().master.postgain).toBe(0.9);

    // Act
    await rightClick(screen.getByRole("region", { name: "Master channel" }));
    await user.click(await screen.findByRole("menuitem", { name: "Reset output level" }));

    // Assert
    expect(project().master.postgain).toBe(1);
  });

  it("should disable Reset output level when the level is already 0 dB", async () => {
    // Arrange
    const { rightClick } = setup({ kind: "master" }, { master: { postgain: 1 } });

    // Act
    await rightClick(screen.getByRole("region", { name: "Master channel" }));

    // Assert
    expect(await screen.findByRole("menuitem", { name: "Reset output level" })).toBeDisabled();
  });
});
