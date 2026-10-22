import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithStores } from "../../../state/testUtils";
import type { SettingsPatch } from "../../../state/settingsModel";
import { createFixtureNative, FIXTURE_CLOCK, seedFixtureLibrary } from "./fixtures";
import { ToastProvider } from "../../toasts";
import { GrooveBrowser } from "./GrooveBrowser";
import type { GrooveBrowserProps } from "./GrooveBrowser";

interface SetupOptions {
  library?: SettingsPatch["library"];
  props?: GrooveBrowserProps;
  empty?: boolean;
}

async function setup({ library, props, empty = false }: SetupOptions = {}) {
  const user = userEvent.setup();
  const native = createFixtureNative();
  if (!empty) await seedFixtureLibrary(native);
  const utils = renderWithStores(
    <ToastProvider>
      <GrooveBrowser now={FIXTURE_CLOCK} {...props} />
    </ToastProvider>,
    {
      native,
      now: () => FIXTURE_CLOCK.getTime(),
      initialSettings: library ? { library } : undefined,
      autoStart: true,
    },
  );
  await waitFor(() => expect(utils.stores.library.getState().loaded).toBe(true));
  return { user, native, ...utils };
}

const names = () => screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);

async function rightClick(user: UserEvent, element: HTMLElement) {
  await user.pointer({ keys: "[MouseRight]", target: element });
}

describe("GrooveBrowser", () => {
  it("should show every groove with the collection counts and a result count", async () => {
    // Arrange / Act
    await setup();

    // Assert
    expect(await screen.findByText("12 grooves")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /All grooves/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Favorites/ })).toHaveTextContent("3");
    expect(screen.getByRole("radio", { name: /Recent/ })).toHaveTextContent("3");
    expect(names()[0]).toBe("Untitled Groove");
    expect(screen.getByText("Today, 12:41")).toBeInTheDocument();
  });

  it("should filter as you type and restore with Clear all", async () => {
    // Arrange
    const { user } = await setup();
    await screen.findByText("12 grooves");

    // Act
    await user.type(screen.getByRole("searchbox", { name: "Search grooves" }), "night");

    // Assert
    expect(await screen.findByText("1 groove")).toBeInTheDocument();
    expect(names()).toEqual(["Night bus"]);

    // Act
    await user.click(screen.getByRole("button", { name: "Clear all" }));

    // Assert
    expect(await screen.findByText("12 grooves")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search grooves" })).toHaveValue("");
  });

  it("should explain an empty result and offer to clear the filters", async () => {
    // Arrange
    const { user } = await setup();
    await screen.findByText("12 grooves");

    // Act
    await user.type(screen.getByRole("searchbox", { name: "Search grooves" }), "zzzz");

    // Assert
    expect(await screen.findByText("No grooves match")).toBeInTheDocument();
    expect(screen.getByText("Try a different word, or remove a tag filter.")).toBeInTheDocument();

    // Act
    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    // Assert
    expect(await screen.findByText("12 grooves")).toBeInTheDocument();
  });

  it("should combine tag filters, show removable chips and remove them", async () => {
    // Arrange
    const { user } = await setup();
    await screen.findByText("12 grooves");

    // Act
    await user.click(screen.getByRole("button", { name: "lo-fi 2 grooves" }));

    // Assert
    expect(screen.getByRole("button", { name: "lo-fi 2 grooves" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("2 grooves")).toBeInTheDocument();
    expect(names()).toEqual(["Night bus", "Rain on tin"]);

    // Act
    await user.click(screen.getByRole("button", { name: "sketch 3 grooves" }));

    // Assert
    expect(names()).toEqual(["Rain on tin"]);

    // Act
    await user.click(screen.getByRole("button", { name: "Remove filter lo-fi" }));

    // Assert
    expect(names()).toEqual(["Untitled Groove", "Rain on tin", "Fern loop"]);
  });

  it("should switch collections", async () => {
    // Arrange
    const { user } = await setup();
    await screen.findByText("12 grooves");

    // Act
    await user.click(screen.getByRole("radio", { name: /Favorites/ }));

    // Assert
    expect(names()).toEqual(["Untitled Groove", "Tidal study 2", "Rain on tin"]);

    // Act
    await user.click(screen.getByRole("radio", { name: /Recent/ }));

    // Assert
    expect(names()).toEqual(["Untitled Groove", "Night bus", "Tidal study 2"]);
  });

  it("should sort from the toolbar", async () => {
    // Arrange
    const { user } = await setup();
    await screen.findByText("12 grooves");

    // Act
    await user.selectOptions(screen.getByRole("combobox", { name: "Sort" }), "Name");

    // Assert
    await waitFor(() => expect(names()[0]).toBe("Copper pipes"));
  });

  it("should change the tile size and hide it in list view", async () => {
    // Arrange
    const { user, stores } = await setup();
    await screen.findByText("12 grooves");
    const slider = screen.getByRole("slider", { name: "Tile size" });
    expect(slider).toHaveAttribute("aria-valuetext", "Medium");

    // Act
    slider.focus();
    await user.keyboard("{ArrowRight}");

    // Assert
    expect(screen.getByRole("slider", { name: "Tile size" })).toHaveAttribute("aria-valuetext", "Large");
    expect(stores.settings.getState().settings.library.tileSize).toBe(3);

    // Act
    await user.click(screen.getByRole("button", { name: "List view" }));

    // Assert
    expect(screen.queryByRole("slider", { name: "Tile size" })).not.toBeInTheDocument();
  });

  it("should hide the meta line and tags on the two smallest tiles", async () => {
    // Arrange / Act
    await setup({ library: { tileSize: 0 } });
    await screen.findByText("12 grooves");

    // Assert
    expect(screen.queryByText("82 BPM · F major · 48 bars")).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(12);
  });

  it("should show a table with sortable headers in list view", async () => {
    // Arrange
    const { user } = await setup({ library: { view: "list" } });
    await screen.findByText("12 grooves");

    // Assert
    const table = screen.getByRole("grid", { name: "Grooves" });
    expect(within(table).getByRole("columnheader", { name: "Edited" })).toHaveAttribute("aria-sort", "descending");
    expect(within(table).getByRole("columnheader", { name: "BPM" })).toHaveAttribute("aria-sort", "none");
    expect(within(table).getByRole("columnheader", { name: "Key" })).not.toHaveAttribute("aria-sort");

    // Act
    await user.click(within(table).getByRole("button", { name: "BPM" }));

    // Assert
    await waitFor(() => expect(within(table).getByRole("columnheader", { name: "BPM" })).toHaveAttribute("aria-sort", "ascending"));
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("Slow harbor");
  });

  it("should favorite a groove and write it into the file", async () => {
    // Arrange
    const { user } = await setup();
    await screen.findByText("12 grooves");
    const star = screen.getByRole("button", { name: "Favorite Night bus" });
    expect(star).toHaveAttribute("aria-pressed", "false");

    // Act
    await user.click(star);

    // Assert
    await waitFor(() => expect(screen.getByRole("button", { name: "Favorite Night bus" })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("radio", { name: /Favorites/ })).toHaveTextContent("4");
  });

  it("should open a groove in the project store and call onOpenGroove", async () => {
    // Arrange
    const onOpenGroove = vi.fn();
    const { user, stores } = await setup({ props: { onOpenGroove } });
    await screen.findByText("12 grooves");

    // Act
    await user.click(screen.getByRole("button", { name: "Open Night bus" }));

    // Assert
    await waitFor(() => expect(onOpenGroove).toHaveBeenCalledTimes(1));
    expect(stores.project.getState().project.name).toBe("Night bus");
    expect(onOpenGroove).toHaveBeenCalledWith(stores.project.getState().filePath);
  });

  it("should audition a groove as a clean preview and put the open project back on stop", async () => {
    // Arrange
    const { user, stores } = await setup();
    await screen.findByText("12 grooves");
    const before = stores.project.getState().project;

    // Act
    await user.click(screen.getByRole("button", { name: "Play Night bus" }));

    // Assert
    await waitFor(() => expect(stores.fakeEngine.playing).toBe(true));
    expect(stores.project.getState().project.name).toBe("Night bus");
    expect(stores.project.getState().dirty).toBe(false);
    expect(stores.project.getState().filePath).toBeNull();
    expect(screen.getByRole("button", { name: "Play Night bus" })).toHaveAttribute("aria-pressed", "true");

    // Act
    await user.click(screen.getByRole("button", { name: "Play Night bus" }));

    // Assert
    expect(stores.fakeEngine.playing).toBe(false);
    expect(stores.project.getState().project).toBe(before);
    expect(screen.getByRole("button", { name: "Play Night bus" })).toHaveAttribute("aria-pressed", "false");
  });

  it("should audition one groove at a time in list view", async () => {
    // Arrange
    const { user, stores } = await setup({ library: { view: "list" } });
    await screen.findByText("12 grooves");
    const before = stores.project.getState().project;
    await user.click(screen.getByRole("button", { name: "Play Night bus" }));
    await waitFor(() => expect(stores.project.getState().project.name).toBe("Night bus"));

    // Act
    await user.click(screen.getByRole("button", { name: "Play Slow harbor" }));

    // Assert
    await waitFor(() => expect(stores.project.getState().project.name).toBe("Slow harbor"));
    expect(screen.getByRole("button", { name: "Play Night bus" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Play Slow harbor" })).toHaveAttribute("aria-pressed", "true");

    // Act
    await user.click(screen.getByRole("button", { name: "Play Slow harbor" }));

    // Assert: the project from before the first audition is back
    expect(stores.project.getState().project).toBe(before);
  });

  it("should say why a groove can't be played and leave the open project alone", async () => {
    // Arrange
    const { user, stores, native } = await setup();
    await screen.findByText("12 grooves");
    const before = stores.project.getState().project;
    vi.spyOn(native, "projectRead").mockRejectedValue(new Error("file is gone"));

    // Act
    await user.click(screen.getByRole("button", { name: "Play Night bus" }));

    // Assert
    expect(await screen.findByText("Couldn't play Night bus: file is gone")).toBeInTheDocument();
    expect(stores.project.getState().project).toBe(before);
    expect(screen.getByRole("button", { name: "Play Night bus" })).toHaveAttribute("aria-pressed", "false");
  });

  it("should end the audition before opening a groove", async () => {
    // Arrange
    const { user, stores } = await setup();
    await screen.findByText("12 grooves");
    await user.click(screen.getByRole("button", { name: "Play Night bus" }));
    await waitFor(() => expect(stores.fakeEngine.playing).toBe(true));

    // Act
    await user.click(screen.getByRole("button", { name: "Open Tidal study 2" }));

    // Assert
    await waitFor(() => expect(stores.project.getState().project.name).toBe("Tidal study 2"));
    expect(stores.project.getState().filePath).not.toBeNull();
    expect(stores.fakeEngine.playing).toBe(false);
  });

  it("should open the context menu with a right click and close it with Escape", async () => {
    // Arrange
    const { user } = await setup();
    await screen.findByText("12 grooves");

    // Act
    await rightClick(user, screen.getByRole("button", { name: "Open Night bus" }));

    // Assert
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Open",
      "Rename",
      "Duplicate",
      "Edit tags",
      "Show in Finder",
      "Move to Trash",
    ]);
    expect(within(menu).getByRole("menuitem", { name: "Open" })).toHaveFocus();

    // Act
    await user.keyboard("{ArrowDown}");

    // Assert
    expect(within(menu).getByRole("menuitem", { name: "Rename" })).toHaveFocus();

    // Act
    await user.keyboard("{Escape}");

    // Assert
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("should open the context menu from the keyboard with Shift+F10", async () => {
    // Arrange
    const { user } = await setup();
    await screen.findByText("12 grooves");
    screen.getByRole("button", { name: "Favorite Night bus" }).focus();

    // Act
    await user.keyboard("{Shift>}{F10}{/Shift}");

    // Assert
    expect(screen.getByRole("menu")).toBeInTheDocument();

    // Act
    await user.keyboard("{Escape}");

    // Assert
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Favorite Night bus" })).toHaveFocus();
  });

  it("should rename a groove from the context menu", async () => {
    // Arrange
    const { user } = await setup();
    await screen.findByText("12 grooves");
    await rightClick(user, screen.getByRole("button", { name: "Open Night bus" }));

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    const field = screen.getByRole("textbox", { name: "Name" });
    await user.clear(field);
    await user.type(field, "Last bus{Enter}");

    // Assert
    expect(await screen.findByRole("heading", { level: 3, name: "Last bus" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("should duplicate a groove from the context menu", async () => {
    // Arrange
    const { user } = await setup();
    await screen.findByText("12 grooves");
    await rightClick(user, screen.getByRole("button", { name: "Open Night bus" }));

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));

    // Assert
    expect(await screen.findByRole("heading", { level: 3, name: "Night bus copy" })).toBeInTheDocument();
    expect(screen.getByText("13 grooves")).toBeInTheDocument();
  });

  it("should reveal a groove in Finder from the context menu", async () => {
    // Arrange
    const { user, native } = await setup();
    const reveal = vi.spyOn(native, "revealInFinder").mockResolvedValue();
    await screen.findByText("12 grooves");
    await rightClick(user, screen.getByRole("button", { name: "Open Night bus" }));

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Show in Finder" }));

    // Assert
    expect(reveal).toHaveBeenCalledWith(expect.stringContaining("Night bus"));
  });

  it("should ask before moving a groove to the Trash, then remove it", async () => {
    // Arrange
    const { user } = await setup();
    await screen.findByText("12 grooves");
    await rightClick(user, screen.getByRole("button", { name: "Open Night bus" }));

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Move to Trash" }));

    // Assert
    const dialog = screen.getByRole("dialog", { name: "Move Night bus to the Trash?" });
    expect(screen.getByRole("heading", { level: 3, name: "Night bus" })).toBeInTheDocument();

    // Act
    await user.click(within(dialog).getByRole("button", { name: "Move to Trash" }));

    // Assert
    await waitFor(() => expect(screen.queryByRole("heading", { level: 3, name: "Night bus" })).not.toBeInTheDocument());
    expect(screen.getByText("11 grooves")).toBeInTheDocument();
  });

  it("should keep the groove when the Trash dialog is cancelled", async () => {
    // Arrange
    const { user } = await setup();
    await screen.findByText("12 grooves");
    await rightClick(user, screen.getByRole("button", { name: "Open Night bus" }));
    await user.click(screen.getByRole("menuitem", { name: "Move to Trash" }));

    // Act
    await user.keyboard("{Escape}");

    // Assert
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("12 grooves")).toBeInTheDocument();
  });

  it("should edit the tags of one groove", async () => {
    // Arrange
    const { user } = await setup();
    await screen.findByText("12 grooves");
    await rightClick(user, screen.getByRole("button", { name: "Open Night bus" }));

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Edit tags" }));
    await user.type(screen.getByRole("textbox", { name: "Add a tag" }), "rainy, late{Enter}");
    await user.click(screen.getByRole("button", { name: "Remove lo-fi" }));
    await user.click(screen.getByRole("button", { name: "Save tags" }));

    // Assert
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("button", { name: "rainy 1 groove" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "late 1 groove" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "lo-fi 1 groove" })).toBeInTheDocument();
  });

  it("should select rows with the modifier keys and add a tag to all of them", async () => {
    // Arrange
    const { user } = await setup({ library: { view: "list" } });
    await screen.findByText("12 grooves");

    // Act
    await user.keyboard("{Meta>}");
    await user.click(screen.getByRole("button", { name: "Night bus" }));
    await user.click(screen.getByRole("button", { name: "Kite season" }));
    await user.keyboard("{/Meta}");

    // Assert
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Night bus/ })).toHaveAttribute("aria-selected", "true");

    // Act
    await user.click(screen.getByRole("button", { name: "Add tags" }));
    await user.type(screen.getByRole("textbox", { name: "Add a tag" }), "road trip{Enter}");
    await user.click(screen.getByRole("button", { name: "Save tags" }));

    // Assert
    expect(await screen.findByRole("button", { name: "road trip 2 grooves" })).toBeInTheDocument();
  });

  it("should select a range with Shift and not offer Export for several grooves", async () => {
    // Arrange
    const { user } = await setup({ library: { view: "list" }, props: { onExportGroove: vi.fn() } });
    await screen.findByText("12 grooves");

    // Act
    await user.keyboard("{Shift>}");
    await user.click(screen.getByRole("button", { name: "Tidal study 2" }));
    await user.keyboard("{/Shift}");

    // Assert
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export…" })).not.toBeInTheDocument();
  });

  it("should open the one selected groove, then export it", async () => {
    // Arrange
    const onExportGroove = vi.fn();
    const { user, stores } = await setup({ library: { view: "list" }, props: { onExportGroove } });
    await screen.findByText("12 grooves");
    const nightBus = stores.library.getState().grooves.find((g) => g.name === "Night bus");
    await user.keyboard("{Meta>}");
    await user.click(screen.getByRole("button", { name: "Night bus" }));
    await user.keyboard("{/Meta}");

    // Act
    await user.click(screen.getByRole("button", { name: "Export…" }));

    // Assert
    await waitFor(() => expect(onExportGroove).toHaveBeenCalledWith(nightBus?.path));
    expect(stores.project.getState().filePath).toBe(nightBus?.path);
  });

  it("should export a groove from its context menu", async () => {
    // Arrange
    const onExportGroove = vi.fn();
    const { user, stores } = await setup({ props: { onExportGroove } });
    await screen.findByText("12 grooves");
    const kite = stores.library.getState().grooves.find((g) => g.name === "Kite season");
    await rightClick(user, screen.getByRole("heading", { level: 3, name: "Kite season" }));

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Export…" }));

    // Assert
    await waitFor(() => expect(onExportGroove).toHaveBeenCalledWith(kite?.path));
    expect(stores.project.getState().filePath).toBe(kite?.path);
  });

  it("should move row focus with the arrow keys and toggle selection with Space", async () => {
    // Arrange
    const { user } = await setup({ library: { view: "list" } });
    await screen.findByText("12 grooves");
    const rows = within(screen.getByRole("grid", { name: "Grooves" })).getAllByRole("row");
    rows[1]?.focus();

    // Act
    await user.keyboard("{ArrowDown}");

    // Assert
    expect(rows[2]).toHaveFocus();

    // Act
    await user.keyboard(" ");

    // Assert
    expect(rows[2]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("should rename a tag across files from Manage", async () => {
    // Arrange
    const { user } = await setup();
    await screen.findByText("12 grooves");

    // Act
    await user.click(screen.getByRole("button", { name: "Manage" }));
    const dialog = screen.getByRole("dialog", { name: "Manage tags" });
    await user.click(within(dialog).getByRole("button", { name: "Rename lo-fi" }));
    const field = within(dialog).getByRole("textbox", { name: "New name for lo-fi" });
    await user.clear(field);
    await user.type(field, "mellow{Enter}");

    // Assert
    await waitFor(() => expect(within(dialog).getByText("mellow")).toBeInTheDocument());
    expect(within(dialog).queryByText("lo-fi")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Color mellow" })).toBeDisabled();
  });

  it("should merge and delete tags from Manage", async () => {
    // Arrange
    const { user } = await setup();
    await screen.findByText("12 grooves");
    await user.click(screen.getByRole("button", { name: "Manage" }));
    const dialog = screen.getByRole("dialog", { name: "Manage tags" });

    // Act
    await user.click(within(dialog).getByRole("button", { name: "Merge study into another tag" }));
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Merge study into" }), "sketch");
    await user.click(within(dialog).getByRole("button", { name: "Merge tags" }));

    // Assert
    await waitFor(() => expect(within(dialog).queryByRole("button", { name: "Rename study" })).not.toBeInTheDocument());
    expect(within(dialog).getByText("4 grooves")).toBeInTheDocument();

    // Act
    await user.click(within(dialog).getByRole("button", { name: "Delete techno" }));
    await user.click(within(dialog).getByRole("button", { name: "Delete tag" }));

    // Assert
    await waitFor(() => expect(within(dialog).queryByRole("button", { name: "Rename techno" })).not.toBeInTheDocument());
  });

  it("should keep a new tag as pending when no grooves are selected", async () => {
    // Arrange
    const { user } = await setup();
    await screen.findByText("12 grooves");

    // Act
    await user.click(screen.getByRole("button", { name: "New tag" }));
    await user.type(screen.getByRole("textbox", { name: "New tag name" }), "drafts{Enter}");

    // Assert
    expect(screen.getByText("drafts")).toBeInTheDocument();
    expect(screen.getByText("unused")).toBeInTheDocument();
    expect(screen.getByText(/will be saved once a groove uses it/)).toBeInTheDocument();
  });

  it("should apply a new tag to the selected rows", async () => {
    // Arrange
    const { user } = await setup({ library: { view: "list" } });
    await screen.findByText("12 grooves");
    await user.keyboard("{Meta>}");
    await user.click(screen.getByRole("button", { name: "Fern loop" }));
    await user.keyboard("{/Meta}");

    // Act
    await user.click(screen.getByRole("button", { name: "New tag" }));
    await user.type(screen.getByRole("textbox", { name: "New tag name" }), "tiny{Enter}");

    // Assert
    expect(await screen.findByRole("button", { name: "tiny 1 groove" })).toBeInTheDocument();
  });

  it("should show the empty library state with its actions", async () => {
    // Arrange
    const onNewGroove = vi.fn();
    const onImport = vi.fn();
    const { user } = await setup({ empty: true, props: { onNewGroove, onImport } });

    // Assert
    expect(await screen.findByText("No grooves yet")).toBeInTheDocument();

    // Act
    await user.click(screen.getByRole("button", { name: "New groove" }));
    await user.click(screen.getByRole("button", { name: "Import..." }));

    // Assert
    expect(onNewGroove).toHaveBeenCalledTimes(1);
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it("should expose the sidebar as a labelled landmark with the footnote", async () => {
    // Arrange / Act
    await setup();
    await screen.findByText("12 grooves");

    // Assert
    expect(screen.getByRole("complementary", { name: "Collections and tags" })).toBeInTheDocument();
    expect(screen.getByText(/Tags are saved inside each file, so they travel with it\./)).toBeInTheDocument();
  });
});
