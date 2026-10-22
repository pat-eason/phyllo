import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useContextMenuTrigger } from "../../hooks/useContextMenu";
import type { MockStores } from "../../state/mocks";
import { renderWithStores } from "../../state/testUtils";
import { useTrackMenu } from "./trackMenu";

function TrackButton({ trackId }: { trackId: string }) {
  const build = useTrackMenu();
  const trigger = useContextMenuTrigger(() => build(trackId));
  return (
    <button type="button" {...trigger}>
      {trackId}
    </button>
  );
}

let stores: MockStores | undefined;
afterEach(() => {
  stores?.dispose();
  stores = undefined;
});

async function openMenu(trackId: string) {
  const user = userEvent.setup();
  const result = renderWithStores(<TrackButton trackId={trackId} />);
  stores = result.stores;
  await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("button", { name: trackId }) });
  await screen.findByRole("menu");
  return { user, stores: result.stores };
}

const project = (s: MockStores) => s.project.getState().project;
const names = (s: MockStores) => project(s).tracks.map((t) => t.name);

describe("track menu", () => {
  it("should select the track it was opened on", async () => {
    // Arrange / Act
    const { stores: s } = await openMenu("hats");

    // Assert
    expect(project(s).ui.selectedTrack).toBe("hats");
  });

  it("should duplicate the track right below it as one undo step", async () => {
    // Arrange
    const { user, stores: s } = await openMenu("kick");
    const before = names(s);

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));

    // Assert
    expect(names(s).slice(0, 2)).toEqual([before[0], `${before[0]} copy`]);
    s.project.getState().undo();
    expect(names(s)).toEqual(before);
  });

  it("should recolour the track from the Colour submenu", async () => {
    // Arrange
    const { user, stores: s } = await openMenu("kick");

    // Act
    await user.click(screen.getByRole("menuitem", { name: /Colour/ }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: /Violet/ }));

    // Assert
    expect(project(s).tracks.find((t) => t.id === "kick")?.color).toBe("#B9A2FF");
  });

  it("should solo only this track", async () => {
    // Arrange
    const { user, stores: s } = await openMenu("hats");

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Solo only this" }));

    // Assert
    expect(project(s).tracks.filter((t) => t.solo).map((t) => t.id)).toEqual(["hats"]);
  });

  it("should disable Move up on the first track", async () => {
    // Arrange / Act
    await openMenu("kick");

    // Assert
    expect(screen.getByRole("menuitem", { name: "Move up" })).toBeDisabled();
  });

  it("should paste a copied track below the one the menu was opened on", async () => {
    // Arrange
    const first = await openMenu("kick");
    await first.user.click(screen.getByRole("menuitem", { name: "Copy track" }));
    const kickName = project(first.stores).tracks.find((t) => t.id === "kick")?.name;
    const hatsIndex = project(first.stores).tracks.findIndex((t) => t.id === "hats");
    await first.user.pointer({ keys: "[MouseRight]", target: screen.getByRole("button", { name: "kick" }) });
    await screen.findByRole("menu");

    // Act
    await first.user.click(screen.getByRole("menuitem", { name: `Paste "${kickName}" below` }));

    // Assert
    expect(names(first.stores)[1]).toBe(`${kickName} copy`);
    expect(project(first.stores).tracks.findIndex((t) => t.id === "hats")).toBe(hatsIndex + 1);
  });

  it("should delete the track", async () => {
    // Arrange
    const { user, stores: s } = await openMenu("hats");

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Delete track" }));

    // Assert
    expect(project(s).tracks.some((t) => t.id === "hats")).toBe(false);
  });
});
