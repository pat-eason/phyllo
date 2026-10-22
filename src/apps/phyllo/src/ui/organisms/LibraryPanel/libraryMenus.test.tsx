import { createTrack, findTrack } from "@phyllo/model";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createMockNative, fixtureProject } from "../../../state/mocks";
import type { MockStoresOptions } from "../../../state/mocks";
import { renderWithStores } from "../../../state/testUtils";
import { LibraryPanel } from ".";
import type { LibraryTab } from ".";

const FOLDER = "/Users/pat/Music/Samples";

function projectWith(selected: string | null) {
  const base = fixtureProject();
  return {
    ...base,
    tracks: [
      createTrack("drum", { id: "kicks", name: "Kicks", pattern: "bd*4" }),
      createTrack("melodic", { id: "lead", name: "Lead", pattern: "c3 e3 g3" }),
    ],
    ui: { ...base.ui, selectedTrack: selected },
  };
}

function nativeWithFolder() {
  return {
    ...createMockNative(),
    sampleFolderScan: async (path: string) => ({ path, files: [{ name: "vox", path: `${path}/vox.wav`, ext: "wav" }] }),
    revealInFinder: vi.fn(async () => undefined),
  };
}

function setup(mode: "guided" | "pro", selected: string | null, tab: LibraryTab = "sounds", extra: MockStoresOptions = {}) {
  const user = userEvent.setup();
  const rendered = renderWithStores(<LibraryPanel initialTab={tab} />, {
    initialSettings: { uiMode: mode },
    initialProject: projectWith(selected),
    ...extra,
  });
  return { user, ...rendered };
}

async function rightClick(user: ReturnType<typeof userEvent.setup>, target: HTMLElement) {
  await user.pointer({ keys: "[MouseRight]", target });
  await screen.findByRole("menu");
}

describe("library context menus", () => {
  it("should filter the list by a drum machine from its chip's menu", async () => {
    // Arrange
    const { user } = setup("pro", "kicks");
    const chip = screen.getByRole("button", { name: "TR-808" });
    await rightClick(user, chip);

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Filter by this bank" }));

    // Assert
    expect(screen.getByRole("button", { name: "TR-808" })).toHaveAttribute("aria-pressed", "true");
  });

  it("should switch the selected drum track to the bank from the chip's menu", async () => {
    // Arrange
    const { user, stores } = setup("pro", "kicks");
    await rightClick(user, screen.getByRole("button", { name: "TR-808" }));

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Use on “Kicks”" }));

    // Assert
    expect(findTrack(stores.project.getState().project, "kicks")?.source.bank).toBe("RolandTR808");
  });

  it("should disable Use on track unless the selected track is a drum track", async () => {
    // Arrange
    const { user } = setup("pro", "lead");

    // Act
    await rightClick(user, screen.getByRole("button", { name: "TR-808" }));

    // Assert
    expect(screen.getByRole("menuitem", { name: "Use on “Lead”" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Use on “Lead”" })).toHaveAttribute("title", "“Lead” isn't a drum track");
  });

  it("should open a bank chip's menu with Shift+F10", async () => {
    // Arrange
    const { user } = setup("pro", "kicks");
    screen.getByRole("button", { name: "TR-808" }).focus();

    // Act
    await user.keyboard("{Shift>}{F10}{/Shift}");

    // Assert
    expect(await screen.findByRole("menu", { name: "Drum machine TR-808" })).toBeInTheDocument();
  });

  it("should add a snippet to the selected track from its menu", async () => {
    // Arrange
    const { user, stores } = setup("pro", "kicks", "extras");
    const snippet = screen.getAllByRole("listitem", { name: /:/ })[0] as HTMLElement;
    await rightClick(user, snippet);

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Add to “Kicks”" }));

    // Assert
    expect(findTrack(stores.project.getState().project, "kicks")?.modifiers).toHaveLength(1);
  });

  it("should disable adding a snippet when no track is selected", async () => {
    // Arrange
    const { user } = setup("pro", null, "extras");

    // Act
    await rightClick(user, screen.getAllByRole("listitem", { name: /:/ })[0] as HTMLElement);

    // Assert
    expect(screen.getByRole("menuitem", { name: "Add to selected track" })).toBeDisabled();
  });

  it("should copy a snippet's code to the system clipboard", async () => {
    // Arrange
    const { user } = setup("pro", "kicks", "extras");
    const snippet = screen.getAllByRole("listitem", { name: /:/ })[0] as HTMLElement;
    const code = within(snippet).getByRole("code").textContent;
    await rightClick(user, snippet);

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Copy code" }));

    // Assert
    expect(await screen.findByText("Copied code")).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(code);
  });

  it("should open a snippet's menu with Shift+F10", async () => {
    // Arrange
    const { user } = setup("pro", "kicks", "extras");
    (screen.getAllByRole("listitem", { name: /:/ })[0] as HTMLElement).focus();

    // Act
    await user.keyboard("{Shift>}{F10}{/Shift}");

    // Assert
    expect(await screen.findByRole("menuitem", { name: "Copy code" })).toBeInTheDocument();
  });

  it("should show a linked folder in Finder from its menu", async () => {
    // Arrange
    const native = nativeWithFolder();
    const { user } = setup("pro", "kicks", "samples", { native, initialSettings: { uiMode: "pro", sampleFolders: [FOLDER] } });
    await rightClick(user, await screen.findByRole("button", { name: /Music\/Samples/, expanded: false }));

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Show in Finder" }));

    // Assert
    expect(native.revealInFinder).toHaveBeenCalledWith(FOLDER);
  });

  it("should scan a linked folder again from its menu's Rescan", async () => {
    // Arrange
    const native = nativeWithFolder();
    const scan = vi.spyOn(native, "sampleFolderScan");
    const { user } = setup("pro", "kicks", "samples", { native, initialSettings: { uiMode: "pro", sampleFolders: [FOLDER] } });
    await rightClick(user, await screen.findByRole("button", { name: /Music\/Samples/, expanded: false }));
    const before = scan.mock.calls.length;

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Rescan" }));

    // Assert
    await waitFor(() => expect(scan.mock.calls.length).toBeGreaterThan(before));
  });

  it("should unlink a folder from its menu", async () => {
    // Arrange
    const { user, stores } = setup("pro", "kicks", "samples", { native: nativeWithFolder(), initialSettings: { uiMode: "pro", sampleFolders: [FOLDER] } });
    await rightClick(user, await screen.findByRole("button", { name: /Music\/Samples/, expanded: false }));

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Unlink folder" }));

    // Assert
    expect(stores.settings.getState().settings.sampleFolders).toEqual([]);
  });

  it("should open the folder menu from the Sounds tab's folder list too", async () => {
    // Arrange
    const { user } = setup("pro", "kicks", "sounds", { native: nativeWithFolder(), initialSettings: { uiMode: "pro", sampleFolders: [FOLDER] } });

    // Act
    await rightClick(user, await screen.findByRole("button", { name: /Open in Samples/ }));

    // Assert
    expect(screen.getByRole("menuitem", { name: "Unlink folder" })).toBeInTheDocument();
  });

  it("should start a new groove from a starter's menu", async () => {
    // Arrange
    const { user, stores } = setup("guided", "kicks", "extras");
    const before = stores.project.getState().project.id;
    const card = screen.getAllByRole("button", { pressed: false }).find((b) => b.textContent?.includes("BPM")) as HTMLElement;
    await rightClick(user, card);

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Start new groove from this" }));

    // Assert
    expect(stores.project.getState().project.id).not.toBe(before);
  });
});
