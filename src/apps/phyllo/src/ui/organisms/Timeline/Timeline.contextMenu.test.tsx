import type { Project } from "@phyllo/model";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { MockStores } from "../../../state/mocks";
import { renderWithStores } from "../../../state/testUtils";
import { Timeline } from "./Timeline";
import type { TimelineProps } from "./Timeline";
import { arrangeProject, withTracks } from "./timelineFixtures";
import { BASE_BAR_PX } from "./timelineModel";

let stores: MockStores | undefined;

afterEach(() => {
  stores?.dispose();
  stores = undefined;
});

function setup(props: TimelineProps = {}, project: Project = arrangeProject()) {
  const result = renderWithStores(<Timeline data-testid="timeline" {...props} />, {
    initialProject: project,
    initialSettings: { uiMode: "pro" },
  });
  stores = result.stores;
  return { user: userEvent.setup(), stores: result.stores };
}

/** Client x (px) in the middle of 1-based `bar` (jsdom lays everything out at x = 0). */
const xOf = (bar: number) => (bar - 1) * BASE_BAR_PX + BASE_BAR_PX / 2;

const clipButton = (name: string) => screen.getByRole("button", { name });
const project = (s: MockStores) => s.project.getState().project;
const clipsOf = (s: MockStores, trackId: string) =>
  (project(s).tracks.find((t) => t.id === trackId)?.clips ?? []).map((c) => [c.startBar, c.endBar]);

async function rightClick(user: ReturnType<typeof userEvent.setup>, target: HTMLElement, clientX?: number) {
  await user.pointer({ keys: "[MouseRight]", target, ...(clientX === undefined ? {} : { coords: { clientX } }) });
  return screen.findByRole("menu");
}

const item = (name: string | RegExp) => screen.getByRole("menuitem", { name });

describe("Timeline context menus", () => {
  it("should open the track menu on a header and start the inline rename from Rename", async () => {
    // Arrange
    const { user } = setup();
    await rightClick(user, screen.getByRole("button", { name: "Kick" }));

    // Act
    await user.click(item(/^Rename/));

    // Assert
    expect(screen.getByRole("textbox", { name: "Rename track Kick" })).toHaveFocus();
  });

  it("should open the track menu from a header with Shift+F10", async () => {
    // Arrange
    const { user } = setup();
    screen.getByRole("button", { name: "Kick" }).focus();

    // Act
    await user.keyboard("{Shift>}{F10}{/Shift}");

    // Assert
    expect(await screen.findByRole("menu", { name: "Track Kick" })).toBeInTheDocument();
  });

  it("should select a clip's track when its menu opens", async () => {
    // Arrange
    const { user, stores: s } = setup();

    // Act
    await rightClick(user, clipButton("Kick, bars 9 to 16, bd*4"));

    // Assert
    expect(project(s).ui.selectedTrack).toBe("kick");
  });

  it("should open the clip menu with Shift+F10 on a focused clip", async () => {
    // Arrange
    const { user } = setup();
    clipButton("Kick, bars 9 to 16, bd*4").focus();

    // Act
    await user.keyboard("{Shift>}{F10}{/Shift}");

    // Assert
    expect(await screen.findByRole("menu", { name: "Clip on Kick" })).toBeInTheDocument();
  });

  it("should open the pattern editor from Edit pattern on a clip", async () => {
    // Arrange
    const opened: string[] = [];
    const { user } = setup({ onEditPattern: (id) => opened.push(id) });
    await rightClick(user, clipButton("Kick, bars 9 to 16, bd*4"));

    // Act
    await user.click(item("Edit pattern"));

    // Assert
    expect(opened).toEqual(["kick"]);
  });

  it("should disable Split at playhead when the playhead is outside the clip", async () => {
    // Arrange
    const { user } = setup();

    // Act
    await rightClick(user, clipButton("Kick, bars 9 to 16, bd*4"));

    // Assert
    expect(item("Split at playhead")).toBeDisabled();
  });

  it("should split the clip at the playhead bar as one undo step", async () => {
    // Arrange
    const { user, stores: s } = setup();
    s.transport.getState().seek(12);
    await rightClick(user, clipButton("Kick, bars 9 to 16, bd*4"));

    // Act
    await user.click(item("Split at playhead"));

    // Assert
    expect(clipsOf(s, "kick")).toEqual([[9, 11], [12, 16], [21, 32]]);
    s.project.getState().undo();
    expect(clipsOf(s, "kick")).toEqual([[9, 16], [21, 32]]);
  });

  it("should place a duplicate immediately after the clip", async () => {
    // Arrange
    const { user, stores: s } = setup();
    await rightClick(user, clipButton("Vox chop, bars 17 to 20, vox"));

    // Act
    await user.click(item("Duplicate"));

    // Assert
    expect(clipsOf(s, "vox")).toEqual([[17, 20], [21, 24], [29, 32]]);
  });

  it("should disable Duplicate when no bar is left after the clip", async () => {
    // Arrange
    const { user } = setup();

    // Act
    await rightClick(user, clipButton("Lead, bars 21 to 32, c4 [eb4 g4] ~ bb4"));

    // Assert
    expect(item("Duplicate")).toBeDisabled();
  });

  it("should shorten a duplicate that would run past the song end", async () => {
    // Arrange
    const clips = [{ id: "v1", startBar: 25, endBar: 30 }];
    const { user, stores: s } = setup({}, withTracks(arrangeProject(), { vox: { clips } }));
    await rightClick(user, clipButton("Vox chop, bars 25 to 30, vox"));

    // Act
    await user.click(item("Duplicate"));

    // Assert
    expect(clipsOf(s, "vox")).toEqual([[25, 30], [31, 32]]);
  });

  it("should disable Paste clip after while no clip is copied", async () => {
    // Arrange
    const { user } = setup();

    // Act
    await rightClick(user, clipButton("Vox chop, bars 17 to 20, vox"));

    // Assert
    expect(item("Paste clip after")).toBeDisabled();
  });

  it("should paste a copied clip right after another clip", async () => {
    // Arrange
    const { user, stores: s } = setup();
    await rightClick(user, clipButton("Clap, bars 9 to 16, ~ cp"));
    await user.click(item("Copy clip"));
    await rightClick(user, clipButton("Vox chop, bars 17 to 20, vox"));

    // Act
    await user.click(item("Paste clip after"));

    // Assert
    expect(clipsOf(s, "vox")).toEqual([[17, 20], [21, 28], [29, 32]]);
  });

  it("should loop a clip's bars and switch the loop on", async () => {
    // Arrange
    const { user, stores: s } = setup({}, arrangeProject({ loop: { enabled: false, startBar: 1, endBar: 4 } }));
    await rightClick(user, clipButton("Vox chop, bars 17 to 20, vox"));

    // Act
    await user.click(item("Loop this clip"));

    // Assert
    expect(project(s).loop).toEqual({ enabled: true, startBar: 17, endBar: 20 });
  });

  it("should delete a clip from its menu", async () => {
    // Arrange
    const { user, stores: s } = setup();
    await rightClick(user, clipButton("Vox chop, bars 17 to 20, vox"));

    // Act
    await user.click(item("Delete clip"));

    // Assert
    expect(clipsOf(s, "vox")).toEqual([[29, 32]]);
  });

  it("should draw a clip at the bar under the pointer in an empty lane", async () => {
    // Arrange
    const { user, stores: s } = setup();
    await rightClick(user, screen.getByTestId("lane-kick"), xOf(5));

    // Act
    await user.click(item("Draw clip here"));

    // Assert
    expect(clipsOf(s, "kick")).toEqual([[5, 5], [9, 16], [21, 32]]);
    expect(project(s).ui.selectedTrack).toBe("kick");
  });

  it("should draw a snap-sized clip that stops before the next clip", async () => {
    // Arrange
    const { user, stores: s } = setup({ snap: "4" });
    await rightClick(user, screen.getByTestId("lane-kick"), xOf(18));

    // Act
    await user.click(item("Draw clip here"));

    // Assert
    expect(clipsOf(s, "kick")).toEqual([[9, 16], [17, 20], [21, 32]]);
  });

  it("should disable Draw clip here where a clip already covers the bar", async () => {
    // Arrange
    const { user } = setup();

    // Act
    await rightClick(user, screen.getByTestId("lane-kick"), xOf(10));

    // Assert
    expect(item("Draw clip here")).toBeDisabled();
  });

  it("should paste a copied clip at the bar under the pointer", async () => {
    // Arrange
    const { user, stores: s } = setup();
    await rightClick(user, clipButton("Vox chop, bars 17 to 20, vox"));
    await user.click(item("Copy clip"));
    await rightClick(user, screen.getByTestId("lane-kick"), xOf(2));

    // Act
    await user.click(item("Paste clip here"));

    // Assert
    expect(clipsOf(s, "kick")).toEqual([[2, 5], [9, 16], [21, 32]]);
  });

  it("should add a track of the chosen kind from the lane menu", async () => {
    // Arrange
    const { user, stores: s } = setup();
    await rightClick(user, screen.getByTestId("lane-kick"), xOf(5));

    // Act
    await user.click(item("Add track"));
    await user.click(item("Chords"));

    // Assert
    expect(project(s).tracks).toHaveLength(8);
    expect(project(s).tracks[7]?.kind).toBe("chord");
  });

  it("should add a track from the background menu", async () => {
    // Arrange
    const { user, stores: s } = setup();
    await rightClick(user, screen.getByTestId("timeline"));

    // Act
    await user.click(item("Add track"));
    await user.click(item("Drums"));

    // Assert
    expect(project(s).tracks).toHaveLength(8);
  });

  it("should disable Paste track in the background menu while no track is copied", async () => {
    // Arrange
    const { user } = setup();

    // Act
    await rightClick(user, screen.getByTestId("timeline"));

    // Assert
    expect(item("Paste track")).toBeDisabled();
  });

  it("should append a copied track from the background menu as one undo step", async () => {
    // Arrange
    const { user, stores: s } = setup();
    await rightClick(user, screen.getByRole("button", { name: "Kick" }));
    await user.click(item("Copy track"));
    await rightClick(user, screen.getByTestId("timeline"));

    // Act
    await user.click(item("Paste track"));

    // Assert
    expect(project(s).tracks.at(-1)?.name).toBe("Kick copy");
    expect(project(s).ui.selectedTrack).toBe(project(s).tracks.at(-1)?.id);
    s.project.getState().undo();
    expect(project(s).tracks).toHaveLength(7);
  });

  it("should open the background menu with Shift+F10 on the Add track button", async () => {
    // Arrange
    const { user } = setup();
    screen.getByRole("button", { name: /Add track/ }).focus();

    // Act
    await user.keyboard("{Shift>}{F10}{/Shift}");

    // Assert
    expect(await screen.findByRole("menu", { name: "Timeline" })).toBeInTheDocument();
  });

  it("should move the playhead to the bar under the pointer from Play from here", async () => {
    // Arrange
    const { user, stores: s } = setup();
    await rightClick(user, screen.getByTestId("ruler"), xOf(12) - BASE_BAR_PX / 2);

    // Act
    await user.click(item("Play from here"));

    // Assert
    expect(s.transport.getState().getPosition().bar).toBe(12);
  });

  it("should set the loop start at the bar under the pointer and keep the end", async () => {
    // Arrange
    const { user, stores: s } = setup();
    await rightClick(user, screen.getByTestId("ruler"), xOf(12));

    // Act
    await user.click(item("Set loop start here"));

    // Assert
    expect(project(s).loop).toEqual({ enabled: true, startBar: 12, endBar: 16 });
  });

  it("should pull the loop start back when the loop end is set before it", async () => {
    // Arrange
    const { user, stores: s } = setup();
    await rightClick(user, screen.getByTestId("ruler"), xOf(5));

    // Act
    await user.click(item("Set loop end here"));

    // Assert
    expect(project(s).loop).toEqual({ enabled: true, startBar: 5, endBar: 5 });
  });

  it("should switch the loop on from the ruler menu's Loop check item", async () => {
    // Arrange
    const { user, stores: s } = setup({}, arrangeProject({ loop: { enabled: false, startBar: 1, endBar: 4 } }));
    await rightClick(user, screen.getByTestId("ruler"), xOf(12));
    expect(screen.getByRole("menuitemcheckbox", { name: "Loop" })).not.toBeChecked();

    // Act
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Loop" }));

    // Assert
    expect(project(s).loop.enabled).toBe(true);
  });

  it("should add a uniquely named section that splits the one under the pointer, then rename it", async () => {
    // Arrange
    const { user, stores: s } = setup();
    await rightClick(user, screen.getByTestId("ruler"), xOf(5));

    // Act
    await user.click(item("Add section here"));

    // Assert
    expect(project(s).sections.map((x) => [x.name, x.startBar, x.endBar])).toEqual([
      ["Intro", 1, 4],
      ["Section 5", 5, 8],
      ["Groove", 9, 16],
      ["Break", 17, 20],
      ["Drop", 21, 32],
    ]);
    expect(await screen.findByRole("textbox", { name: "Rename section Section 5" })).toHaveFocus();
    s.project.getState().undo();
    expect(project(s).sections).toHaveLength(4);
  });

  it("should disable Add section here on a bar where a section starts", async () => {
    // Arrange
    const { user } = setup();

    // Act
    await rightClick(user, screen.getByTestId("ruler"), xOf(9));

    // Assert
    expect(item("Add section here")).toBeDisabled();
  });

  it("should end the song at the bar under the pointer", async () => {
    // Arrange
    const { user, stores: s } = setup();
    await rightClick(user, screen.getByTestId("ruler"), xOf(24));

    // Act
    await user.click(item("Set song end here"));

    // Assert
    expect(project(s).lengthBars).toBe(24);
  });

  it("should turn the loop off from the loop band's menu", async () => {
    // Arrange
    const { user, stores: s } = setup();
    await rightClick(user, screen.getByRole("button", { name: "Loop region, bars 9 to 16" }));

    // Act
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Loop" }));

    // Assert
    expect(project(s).loop.enabled).toBe(false);
  });

  it("should open the loop band's menu with Shift+F10", async () => {
    // Arrange
    const { user } = setup();
    screen.getByRole("button", { name: "Loop region, bars 9 to 16" }).focus();

    // Act
    await user.keyboard("{Shift>}{F10}{/Shift}");

    // Assert
    expect(await screen.findByRole("menu", { name: "Loop region" })).toBeInTheDocument();
  });

  it("should disable Add section from loop when the loop is exactly a section", async () => {
    // Arrange
    const { user } = setup();

    // Act
    await rightClick(user, screen.getByRole("button", { name: "Loop region, bars 9 to 16" }));

    // Assert
    expect(item("Add section from loop")).toBeDisabled();
  });

  it("should add a section with the loop's range", async () => {
    // Arrange
    const { user, stores: s } = setup({}, arrangeProject({ loop: { enabled: true, startBar: 10, endBar: 12 } }));
    await rightClick(user, screen.getByRole("button", { name: "Loop region, bars 10 to 12" }));

    // Act
    await user.click(item("Add section from loop"));

    // Assert
    expect(project(s).sections.find((x) => x.name === "Section 5")).toMatchObject({ startBar: 10, endBar: 12 });
  });

  it("should rename a section from its menu", async () => {
    // Arrange
    const { user } = setup();
    await rightClick(user, screen.getByRole("button", { name: "Groove 9–16, section" }));

    // Act
    await user.click(item(/^Rename/));

    // Assert
    expect(screen.getByRole("textbox", { name: "Rename section Groove" })).toHaveFocus();
  });

  it("should jump to a section from its menu", async () => {
    // Arrange
    const { user, stores: s } = setup();
    await rightClick(user, screen.getByRole("button", { name: "Break 17–20, section" }));

    // Act
    await user.click(item("Jump to section"));

    // Assert
    expect(s.transport.getState().getPosition().bar).toBe(17);
  });

  it("should loop a section from its menu", async () => {
    // Arrange
    const { user, stores: s } = setup({}, arrangeProject({ loop: { enabled: false, startBar: 1, endBar: 4 } }));
    await rightClick(user, screen.getByRole("button", { name: "Break 17–20, section" }));

    // Act
    await user.click(item("Loop section"));

    // Assert
    expect(project(s).loop).toEqual({ enabled: true, startBar: 17, endBar: 20 });
  });

  it("should delete a section from its menu", async () => {
    // Arrange
    const { user, stores: s } = setup();
    await rightClick(user, screen.getByRole("button", { name: "Break 17–20, section" }));

    // Act
    await user.click(item("Delete section"));

    // Assert
    expect(project(s).sections.map((x) => x.name)).toEqual(["Intro", "Groove", "Drop"]);
  });

  it("should open a section's menu with Shift+F10", async () => {
    // Arrange
    const { user } = setup();
    screen.getByRole("button", { name: "Groove 9–16, section" }).focus();

    // Act
    await user.keyboard("{Shift>}{F10}{/Shift}");

    // Assert
    const menu = await screen.findByRole("menu", { name: "Section Groove" });
    expect(within(menu).getByRole("menuitem", { name: "Loop section" })).toBeInTheDocument();
  });

  it("should open the lane menu at the playhead with Shift+F10 on the focused lane", async () => {
    // Arrange
    const { user, stores: s } = setup();
    s.transport.getState().seek(3);
    screen.getByTestId("lane-kick").focus();

    // Act
    await user.keyboard("{Shift>}{F10}{/Shift}");
    await screen.findByRole("menu", { name: "Lane Kick" });
    await user.click(item("Draw clip here"));

    // Assert
    expect(clipsOf(s, "kick")[0]).toEqual([3, 3]);
  });
});
