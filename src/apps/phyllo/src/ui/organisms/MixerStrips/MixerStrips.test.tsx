import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { fixtureProject } from "../../../state/mocks";
import { renderWithStores } from "../../../state/testUtils";
import { mixerProject } from "../ChannelStrip/fixtures";
import { MixerStrips } from "./MixerStrips";

const stripNames = () =>
  within(screen.getByRole("toolbar", { name: "Mixer strips" }))
    .getAllByRole("region")
    .map((r) => r.getAttribute("aria-label"));

describe("MixerStrips", () => {
  it("should render the hint, one strip per House track, one bus and the master", () => {
    // Arrange
    renderWithStores(<MixerStrips />, { initialProject: fixtureProject() });

    // Assert
    expect(screen.getByText(/on the track’s bus/)).toHaveTextContent("Faders write .gain() · sends write .room() and .delay() on the track’s bus.");
    expect(stripNames()).toEqual(["Kick channel", "Clap channel", "Hats channel", "Bass channel", "Bus 1 channel", "Master channel"]);
  });

  it("should add a bus strip when a track moves to a new orbit", async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithStores(<MixerStrips />, { initialProject: fixtureProject() });

    // Act
    await user.selectOptions(screen.getByRole("combobox", { name: "Bass bus" }), "New bus (orbit 2)");

    // Assert
    expect(stripNames()).toContain("Bus 2 channel");
    expect(within(screen.getByRole("region", { name: "Bus 1 channel" })).getByText("Shared by 3 tracks")).toBeInTheDocument();
  });

  it("should move focus between strips with the arrow keys", async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithStores(<MixerStrips />, { initialProject: mixerProject({ selected: null }) });
    screen.getByRole("button", { name: "Mute Kick" }).focus();

    // Act + Assert
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: /^Clap/ })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("combobox", { name: "Output device" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("combobox", { name: "Output device" })).toHaveFocus();
  });
});
