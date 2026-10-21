import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { fireEvent, userEvent, waitFor, within } from "storybook/test";
import type { LibraryCollection } from "@phyllo/model";
import { useAppStores } from "../../../hooks";
import type { MockStoresOptions } from "../../../state/mocks";
import { createFixtureNative, FIXTURE_CLOCK, seedFixtureLibrary } from "./fixtures";
import { GrooveBrowser } from "./GrooveBrowser";
import type { GrooveBrowserProps } from "./GrooveBrowser";

/** Filters applied to the library store before the browser first renders (they are per-session state). */
interface InitialFilters {
  collection?: LibraryCollection;
  tags?: string[];
  query?: string;
}

interface HarnessProps extends GrooveBrowserProps {
  filters?: InitialFilters;
  /** Leave the library empty ("No grooves yet"). */
  empty?: boolean;
}

/** Seeds the mock library with the fixture grooves, applies the filters, then shows the browser at screen size. */
function Harness({ filters, empty = false, ...props }: HarnessProps) {
  const { native, library } = useAppStores();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!empty) await seedFixtureLibrary(native);
      await library.getState().refresh();
      const state = library.getState();
      if (filters?.collection) state.setCollection(filters.collection);
      if (filters?.tags) state.setSelectedTags(filters.tags);
      if (filters?.query) state.setQuery(filters.query);
      if (active) setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [native, library, filters, empty]);

  return (
    <div style={{ display: "flex", height: "100vh", minHeight: 0, background: "var(--ph-bg)" }}>
      {ready ? <GrooveBrowser now={FIXTURE_CLOCK} {...props} /> : null}
    </div>
  );
}

/** Each story gets its own in-memory library and a pinned clock, so "Today, 12:41" is stable. */
function storesFor(library?: { view?: "grid" | "list"; tileSize?: 0 | 1 | 2 | 3 | 4; sort?: "edited" | "name" | "created" | "bpm" }): MockStoresOptions {
  return {
    native: createFixtureNative(),
    now: () => FIXTURE_CLOCK.getTime(),
    initialSettings: library ? { library: { view: "grid", tileSize: 2, sort: "edited", ...library } } : undefined,
  };
}

const meta = {
  title: "Organisms/GrooveBrowser",
  component: Harness,
  parameters: { layout: "fullscreen", stores: storesFor() },
} satisfies Meta<typeof Harness>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Medium tiles (default), all twelve grooves, last edited first. */
export const Grid: Story = {};

/** Light theme. */
export const GridLight: Story = {
  globals: { theme: "light", accent: "blue" },
};

/** Tile size 1: narrow tiles without meta line or tags. */
export const SmallestTiles: Story = {
  parameters: { stores: storesFor({ tileSize: 0 }) },
};

/** Tile size 5: wide tiles with tall previews. */
export const LargestTiles: Story = {
  parameters: { stores: storesFor({ tileSize: 4 }) },
};

/** Table view, sorted by tempo. */
export const List: Story = {
  parameters: { stores: storesFor({ view: "list", sort: "bpm" }) },
};

/** Table view in the light theme. */
export const ListLight: Story = {
  globals: { theme: "light", accent: "blue" },
  parameters: { stores: storesFor({ view: "list" }) },
};

/** Table view with two rows selected: the bulk bar offers Add tags, Export and Move to Trash. */
export const ListWithSelection: Story = {
  parameters: { stores: storesFor({ view: "list" }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const first = await canvas.findByRole("button", { name: "Night bus" });
    fireEvent.click(first, { metaKey: true });
    const second = await canvas.findByRole("button", { name: "Rain on tin" });
    fireEvent.click(second, { metaKey: true });
  },
};

/** One tag filter: removable chip, count and Clear all. */
export const TagFilter: Story = {
  args: { filters: { tags: ["lo-fi"] } },
};

/** Several tags AND together. */
export const TwoTagFilters: Story = {
  args: { filters: { tags: ["live set", "ambient"] } },
};

/** Nothing matches the search: EmptyState with Clear filters. */
export const EmptyResults: Story = {
  args: { filters: { query: "zzzz" } },
};

/** Favorites collection. */
export const Favorites: Story = {
  args: { filters: { collection: "favorites" } },
};

/** Recent collection (opened in the last 14 days). */
export const Recent: Story = {
  args: { filters: { collection: "recent" } },
};

/** A brand new install. */
export const EmptyLibrary: Story = {
  args: { empty: true, onNewGroove: () => {}, onImport: () => {} },
};

/** Right-click menu on a tile. */
export const ContextMenuOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const cover = await canvas.findByRole("button", { name: "Open Night bus" });
    fireEvent.contextMenu(cover, { clientX: 520, clientY: 330 });
    await waitFor(() => canvas.getByRole("menu"));
  },
};

/** Context menu on a list row. */
export const ContextMenuInList: Story = {
  parameters: { stores: storesFor({ view: "list" }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = await canvas.findByRole("button", { name: "Night bus" });
    fireEvent.contextMenu(name, { clientX: 420, clientY: 260 });
    await waitFor(() => canvas.getByRole("menu"));
  },
};

/** Manage tags: rename, merge and delete across files (recolor is disabled). */
export const ManageTags: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Manage" }));
    await waitFor(() => canvas.getByRole("dialog"));
  },
};

/** Edit tags for one groove, from the context menu. */
export const EditTags: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const cover = await canvas.findByRole("button", { name: "Open Night bus" });
    fireEvent.contextMenu(cover, { clientX: 520, clientY: 330 });
    await userEvent.click(await canvas.findByRole("menuitem", { name: "Edit tags" }));
    await waitFor(() => canvas.getByRole("dialog"));
  },
};
