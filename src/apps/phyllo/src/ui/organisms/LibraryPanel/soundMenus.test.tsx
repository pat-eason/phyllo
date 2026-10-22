import { createTrack, findTrack } from "@phyllo/model";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createMockNative, fixtureProject } from "../../../state/mocks";
import type { MockStoresOptions } from "../../../state/mocks";
import { renderWithStores } from "../../../state/testUtils";
import { LibraryPanel } from ".";

const FOLDER = "/Users/pat/Music/Samples";

/** A project with one drum track (`bd*4`) and one melodic track, `selected` selected. */
function projectWith(selected: string | null) {
  const base = fixtureProject();
  return {
    ...base,
    tracks: [
      createTrack("drum", { id: "kicks", name: "Kicks", pattern: "bd*4" }),
      createTrack("melodic", { id: "lead", name: "Lead", pattern: "c3 e3 g3" }),
      createTrack("code", { id: "raw", name: "Raw" }),
    ],
    ui: { ...base.ui, selectedTrack: selected },
  };
}

function options(selected: string | null, extra: MockStoresOptions = {}): MockStoresOptions {
  return { initialSettings: { uiMode: "pro" }, initialProject: projectWith(selected), ...extra };
}

function drumRow(code: string) {
  const rows = within(screen.getByRole("list", { name: "Drum sounds" })).getAllByRole("listitem");
  const row = rows.find((r) => r.textContent?.startsWith(code));
  if (!row) throw new Error(`No drum row ${code}`);
  return row;
}

async function openRowMenu(code: string, selected: string | null = "kicks", extra: MockStoresOptions = {}) {
  const user = userEvent.setup();
  const rendered = renderWithStores(<LibraryPanel />, options(selected, extra));
  await user.pointer({ keys: "[MouseRight]", target: drumRow(code) });
  await screen.findByRole("menu");
  return { user, ...rendered };
}

describe("sound context menus", () => {
  it("should open a drum row's menu on right-click", async () => {
    // Arrange / Act
    await openRowMenu("sd");

    // Assert
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^Preview/),
      "Replace sound on “Kicks”",
      "Layer onto “Kicks”",
      "Add as new track",
    ]);
  });

  it("should open a drum row's menu with Shift+F10", async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithStores(<LibraryPanel />, options("kicks"));
    drumRow("sd").focus();

    // Act
    await user.keyboard("{Shift>}{F10}{/Shift}");

    // Assert
    expect(await screen.findByRole("menu", { name: "Sound sd" })).toBeInTheDocument();
  });

  it("should preview the sound from the menu", async () => {
    // Arrange
    const { user, stores } = await openRowMenu("sd");

    // Act
    await user.click(screen.getByRole("menuitem", { name: /^Preview/ }));

    // Assert
    await waitFor(() => expect(stores.fakeEngine.previews).toHaveLength(1));
    expect(stores.fakeEngine.previews[0]).toMatchObject({ s: "sd" });
  });

  it("should replace the selected track's sound from the menu", async () => {
    // Arrange
    const { user, stores } = await openRowMenu("sd");

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Replace sound on “Kicks”" }));

    // Assert
    expect(findTrack(stores.project.getState().project, "kicks")?.pattern).toBe("sd*4");
  });

  it("should layer the sound onto the selected drum track from the menu", async () => {
    // Arrange
    const { user, stores } = await openRowMenu("sd");

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Layer onto “Kicks”" }));

    // Assert
    expect(findTrack(stores.project.getState().project, "kicks")?.pattern).toBe("bd*4, ~ sd");
  });

  it("should add the sound as a new track even when the selected track could take it", async () => {
    // Arrange
    const { user, stores } = await openRowMenu("sd");

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Add as new track" }));

    // Assert
    const { project } = stores.project.getState();
    expect(project.tracks).toHaveLength(4);
    expect(project.tracks.at(-1)?.kind).toBe("drum");
    expect(project.ui.selectedTrack).toBe(project.tracks.at(-1)?.id);
    expect(findTrack(project, "kicks")?.pattern).toBe("bd*4");
  });

  it("should undo a replace in one step", async () => {
    // Arrange
    const { user, stores } = await openRowMenu("sd");
    await user.click(screen.getByRole("menuitem", { name: "Replace sound on “Kicks”" }));

    // Act
    stores.project.getState().undo();

    // Assert
    expect(findTrack(stores.project.getState().project, "kicks")?.pattern).toBe("bd*4");
  });

  it("should disable Replace and Layer with a reason when no track is selected", async () => {
    // Arrange / Act
    await openRowMenu("sd", null);

    // Assert
    expect(screen.getByRole("menuitem", { name: "Replace sound on selected track" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Replace sound on selected track" })).toHaveAttribute("title", "Select a track first");
    expect(screen.getByRole("menuitem", { name: "Layer onto selected track" })).toBeDisabled();
  });

  it("should disable Replace when the selected track is of another kind", async () => {
    // Arrange / Act
    await openRowMenu("sd", "lead");

    // Assert
    const replace = screen.getByRole("menuitem", { name: "Replace sound on “Lead”" });
    expect(replace).toBeDisabled();
    expect(replace).toHaveAttribute("title", "Needs a drum track; “Lead” is a melodic track");
  });

  it("should disable Layer on a code track", async () => {
    // Arrange / Act
    await openRowMenu("sd", "raw");

    // Assert
    expect(screen.getByRole("menuitem", { name: "Layer onto “Raw”" })).toBeDisabled();
  });

  it("should not offer Show in Finder for a built-in sound", async () => {
    // Arrange / Act
    await openRowMenu("sd");

    // Assert
    expect(screen.queryByRole("menuitem", { name: "Show in Finder" })).not.toBeInTheDocument();
  });

  it("should open a synth chip's menu and replace the melodic track's sound", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<LibraryPanel />, options("lead"));
    const chips = screen.getByRole("list", { name: "Synths" });

    // Act
    await user.pointer({ keys: "[MouseRight]", target: within(chips).getAllByRole("button")[0] as HTMLElement });
    await user.click(await screen.findByRole("menuitem", { name: "Replace sound on “Lead”" }));

    // Assert
    const first = within(chips).getAllByRole("button")[0]?.textContent;
    expect(findTrack(stores.project.getState().project, "lead")?.source.sound).toBe(first);
  });

  it("should show a user sample in Finder from its menu", async () => {
    // Arrange
    const user = userEvent.setup();
    const native = {
      ...createMockNative(),
      sampleFolderScan: async (path: string) => ({ path, files: [{ name: "vox", path: `${path}/vox.wav`, ext: "wav" }] }),
      revealInFinder: vi.fn(async () => undefined),
    };
    renderWithStores(<LibraryPanel initialTab="samples" />, options("kicks", { native, initialSettings: { uiMode: "pro", sampleFolders: [FOLDER] } }));
    await user.click(await screen.findByRole("button", { name: /Music\/Samples/, expanded: false }));
    const list = await screen.findByRole("list", { name: `Samples in ${FOLDER}` });

    // Act
    await user.pointer({ keys: "[MouseRight]", target: within(list).getAllByRole("listitem")[0] as HTMLElement });
    await user.click(await screen.findByRole("menuitem", { name: "Show in Finder" }));

    // Assert
    expect(native.revealInFinder).toHaveBeenCalledWith(`${FOLDER}/vox.wav`);
  });
});
