import { buildStarterProject } from "@phyllo/model";
import type { Project } from "@phyllo/model";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLibrary } from "../hooks";
import { createMockStores, seedLibrary } from "./mocks";
import type { MockStores } from "./mocks";
import { PINNED_NOW, renderWithStores } from "./testUtils";

const ISO = PINNED_NOW.toISOString();

function groove(starter: string, overrides: Partial<Project>): Project {
  return { ...buildStarterProject(starter, { now: ISO }), ...overrides };
}

/** House (124, house), Lo-fi (82, lo-fi + sketch, favorite), Breakbeat (breaks), Ambient (ambient + sketch). */
const LIBRARY: Project[] = [
  groove("house", { id: "g-house", name: "Warehouse", tags: ["house"], modified: "2026-10-20T10:00:00.000Z" }),
  groove("lofi", { id: "g-lofi", name: "Rainy keys", tags: ["lo-fi", "sketch"], favorite: true, modified: "2026-10-18T10:00:00.000Z" }),
  groove("breaks", { id: "g-breaks", name: "Amen-ish", tags: ["breaks"], modified: "2026-10-19T10:00:00.000Z" }),
  groove("ambient", { id: "g-ambient", name: "Fog bank", tags: ["ambient", "sketch"], modified: "2026-10-01T10:00:00.000Z" }),
];

async function libraryStores(): Promise<{ stores: MockStores; paths: string[] }> {
  const stores = createMockStores();
  const paths = await seedLibrary(stores.native, LIBRARY);
  await stores.start();
  return { stores, paths };
}

function Browser() {
  const { results, setQuery, toggleTag, setCollection, tags } = useLibrary();
  return (
    <div>
      <label>
        Search
        <input onChange={(e) => setQuery(e.target.value)} />
      </label>
      <button type="button" onClick={() => toggleTag("sketch")}>
        Tag sketch ({tags.find((t) => t.name === "sketch")?.count ?? 0})
      </button>
      <button type="button" onClick={() => setCollection("favorites")}>
        Favorites
      </button>
      <ul aria-label="Grooves">
        {results.map((g) => (
          <li key={g.path}>{g.name}</li>
        ))}
      </ul>
      {results.length === 0 && <p>No grooves match.</p>}
    </div>
  );
}

let stores: MockStores | undefined;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED_NOW);
});
afterEach(() => {
  stores?.dispose();
  stores = undefined;
  vi.useRealTimers();
});

describe("libraryStore", () => {
  it("should list every groove, most recently edited first", async () => {
    // Arrange
    ({ stores } = await libraryStores());

    // Act
    renderWithStores(<Browser />, { stores });

    // Assert
    const names = within(screen.getByRole("list", { name: "Grooves" }))
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(names).toEqual(["Warehouse", "Amen-ish", "Rainy keys", "Fog bank"]);
  });

  it("should combine collection, tag and search text", async () => {
    // Arrange
    ({ stores } = await libraryStores());
    const user = userEvent.setup();
    renderWithStores(<Browser />, { stores });

    // Act
    await user.click(screen.getByRole("button", { name: "Tag sketch (2)" }));
    await user.type(screen.getByRole("textbox", { name: "Search" }), "keys");
    await user.click(screen.getByRole("button", { name: "Favorites" }));

    // Assert
    const items = within(screen.getByRole("list", { name: "Grooves" })).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["Rainy keys"]);
  });

  it("should show the empty state when nothing matches", async () => {
    // Arrange
    ({ stores } = await libraryStores());
    const user = userEvent.setup();
    renderWithStores(<Browser />, { stores });

    // Act
    await user.click(screen.getByRole("button", { name: "Tag sketch (2)" }));
    await user.type(screen.getByRole("textbox", { name: "Search" }), "warehouse");

    // Assert
    expect(screen.getByText("No grooves match.")).toBeInTheDocument();
  });

  it("should search key, BPM and sound names case-insensitively", async () => {
    // Arrange
    ({ stores } = await libraryStores());
    const { setQuery } = stores.library.getState();
    const names = () => stores?.library.getState().results.map((g) => g.name);

    // Act + Assert
    act(() => setQuery("A MINOR"));
    expect(names()).toContain("Warehouse");
    act(() => setQuery("124"));
    expect(names()).toEqual(["Warehouse"]);
    act(() => setQuery("hh"));
    expect(names()).toContain("Warehouse");
  });

  it("should count only grooves opened in the last 14 days as recent", async () => {
    // Arrange
    ({ stores } = await (async () => {
      const s = createMockStores();
      const paths = await seedLibrary(s.native, LIBRARY);
      vi.setSystemTime(new Date(PINNED_NOW.getTime() - 20 * 86_400_000));
      await s.native.libraryMarkOpened(paths[3] ?? "");
      vi.setSystemTime(new Date(PINNED_NOW.getTime() - 2 * 86_400_000));
      await s.native.libraryMarkOpened(paths[1] ?? "");
      vi.setSystemTime(PINNED_NOW);
      await s.start();
      return { stores: s };
    })());

    // Act
    act(() => stores?.library.getState().setCollection("recent"));

    // Assert
    expect(stores.library.getState().results.map((g) => g.name)).toEqual(["Rainy keys"]);
    expect(stores.library.getState().counts).toEqual({ all: 4, favorites: 1, recent: 1 });
  });

  it("should build tag counts with stable colours", async () => {
    // Arrange + Act
    ({ stores } = await libraryStores());

    // Assert
    expect(stores.library.getState().tags).toEqual([
      { name: "ambient", color: "#5ECFC8", count: 1 },
      { name: "breaks", color: "#F59AC7", count: 1 },
      { name: "house", color: "#7FD98A", count: 1 },
      { name: "lo-fi", color: "#B9A2FF", count: 1 },
      { name: "sketch", color: "#FF9C7A", count: 2 },
    ]);
  });

  it("should give each groove a 3×16 punchcard in track colours", async () => {
    // Arrange + Act
    ({ stores } = await libraryStores());

    // Assert
    const house = stores.library.getState().grooves.find((g) => g.name === "Warehouse");
    expect(house?.preview.map((r) => r.color)).toEqual(["#7FD98A", "#5ECFC8", "#8AB4FF"]);
    expect(house?.preview[0]?.steps.map((on) => (on ? "x" : ".")).join("")).toBe("x...x...x...x...");
  });

  it("should persist sort, view and tile size in settings", async () => {
    // Arrange
    ({ stores } = await libraryStores());
    const library = stores.library.getState();

    // Act
    act(() => {
      library.setSort("bpm");
      library.setView("list");
      library.setTileSize(5);
    });

    // Assert
    expect(stores.settings.getState().settings.library).toEqual({ view: "list", tileSize: 4, sort: "bpm" });
    expect(stores.library.getState().results.map((g) => g.name)).toEqual(["Fog bank", "Rainy keys", "Warehouse", "Amen-ish"]);
    expect(stores.library.getState().tileSize).toBe(5);
  });

  it("should toggle a favorite by rewriting the file", async () => {
    // Arrange
    let paths: string[];
    ({ stores, paths } = await libraryStores());
    const path = paths[0] ?? "";

    // Act
    const result = await stores.library.getState().toggleFavorite(path);

    // Assert
    expect(result.ok).toBe(true);
    const saved = JSON.parse(await stores.native.projectRead(path)) as { favorite: boolean };
    expect(saved.favorite).toBe(true);
    expect(stores.library.getState().counts.favorites).toBe(2);
  });

  it("should duplicate a groove under a new name and id", async () => {
    // Arrange
    let paths: string[];
    ({ stores, paths } = await libraryStores());

    // Act
    const result = await stores.library.getState().duplicate(paths[0] ?? "");

    // Assert
    expect(result).toEqual({ ok: true, path: "/Phyllo/Warehouse copy.phyllo" });
    const copy = stores.library.getState().grooves.find((g) => g.name === "Warehouse copy");
    expect(copy?.id).not.toBe("g-house");
  });

  it("should move a groove to the trash and drop it from the list", async () => {
    // Arrange
    let paths: string[];
    ({ stores, paths } = await libraryStores());

    // Act
    await stores.library.getState().trash(paths[2] ?? "");

    // Assert
    expect(stores.library.getState().grooves.map((g) => g.name)).not.toContain("Amen-ish");
  });

  it("should report a missing file instead of throwing", async () => {
    // Arrange
    ({ stores } = await libraryStores());

    // Act
    const result = await stores.library.getState().rename("/Phyllo/Nope.phyllo", "New name");

    // Assert
    expect(result).toEqual(expect.objectContaining({ ok: false, error: expect.stringContaining("not found") }));
  });
});
