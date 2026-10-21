import { parseProjectFile, serializeProject } from "@phyllo/model";
import type { GrooveSummary, LibraryCollection, LibrarySort, LibraryView, Project, TagInfo } from "@phyllo/model";
import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand/vanilla";
import type { NativeApi } from "../native/api";
import type { LibraryEntry, LibraryScanError } from "../native/types";
import type { Unsubscribe } from "./feed";
import { collectTags, filterGrooves, inCollection, previewFor, soundWords, toGrooveSummary } from "./libraryQuery";
import type { SearchableGroove } from "./libraryQuery";
import type { OpResult, ProjectStoreState } from "./projectStore";
import type { SettingsStoreState } from "./settingsStore";

/** GrooveCard `size` 1–5 (settings store it 0–4). */
export type TileSize = 1 | 2 | 3 | 4 | 5;

export interface LibraryCounts {
  all: number;
  favorites: number;
  recent: number;
}

export interface LibraryStoreState {
  /** Every groove in `~/Music/Phyllo`, unsorted. */
  grooves: GrooveSummary[];
  tags: TagInfo[];
  counts: LibraryCounts;
  /** Filtered + sorted grooves (derived). */
  results: GrooveSummary[];
  /** Search text (per session). */
  query: string;
  collection: LibraryCollection;
  /** AND filter (per session). */
  selectedTags: string[];
  /** Persisted in `settings.library`. */
  sort: LibrarySort;
  view: LibraryView;
  tileSize: TileSize;
  loading: boolean;
  /** First scan finished. */
  loaded: boolean;
  error: string | null;
  /** Files that couldn't be indexed. */
  scanErrors: LibraryScanError[];

  setQuery(query: string): void;
  setCollection(collection: LibraryCollection): void;
  toggleTag(tag: string): void;
  setSelectedTags(tags: string[]): void;
  /** Clears search text and tag filters ("Clear all"). */
  clearFilters(): void;
  setSort(sort: LibrarySort): void;
  setView(view: LibraryView): void;
  setTileSize(size: TileSize): void;
  refresh(): Promise<void>;
  /** Opens in the project store (marks it opened). */
  open(path: string): Promise<OpResult>;
  toggleFavorite(path: string): Promise<OpResult>;
  /** Renames the groove inside its file (the file name stays; NativeApi has no rename). */
  rename(path: string, name: string): Promise<OpResult>;
  /** Copy next to the original as "<name> copy" with a fresh id; resolves with the new path. */
  duplicate(path: string): Promise<OpResult<{ path: string }>>;
  /** Moves to the OS Trash. */
  trash(path: string): Promise<OpResult>;
  editTags(path: string, tags: string[]): Promise<OpResult>;
  markOpened(path: string): Promise<void>;
}

export interface LibraryStoreDeps {
  native: NativeApi;
  settings: StoreApi<SettingsStoreState>;
  project: StoreApi<ProjectStoreState>;
  now: () => number;
  newId: (prefix: string) => string;
}

export interface LibraryStoreHandle {
  store: StoreApi<LibraryStoreState>;
  /** First scan + start watching. Idempotent. */
  start(): Promise<void>;
  dispose(): void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : String(error);
}

export function createLibraryStore(deps: LibraryStoreDeps): LibraryStoreHandle {
  const { native } = deps;
  let items: SearchableGroove[] = [];
  /** Previews query Strudel; cache them by the summarised tracks they're computed from. */
  const previewCache = new Map<string, { key: string; preview: GrooveSummary["preview"] }>();
  let started: Promise<void> | undefined;
  let unwatch: Unsubscribe | undefined;
  let disposed = false;
  let refreshing: Promise<void> | null = null;
  let refreshAgain = false;

  const fromSettings = () => {
    const lib = deps.settings.getState().settings.library;
    return { sort: lib.sort, view: lib.view, tileSize: (lib.tileSize + 1) as TileSize };
  };

  const store = createStore<LibraryStoreState>()((set, get) => {
    const derive = (patch: Partial<LibraryStoreState> = {}): Partial<LibraryStoreState> => {
      const s = { ...get(), ...patch };
      const nowMs = deps.now();
      return {
        ...patch,
        results: filterGrooves(items, { collection: s.collection, tags: s.selectedTags, text: s.query, sort: s.sort }, nowMs),
      };
    };
    const setFiltered = (patch: Partial<LibraryStoreState>) => set(derive(patch));
    const settingsLibrary = (patch: Partial<{ sort: LibrarySort; view: LibraryView; tileSize: 0 | 1 | 2 | 3 | 4 }>) =>
      deps.settings.getState().set("library", patch);

    /** Rewrites one file; the open project goes through the project store instead (no stale overwrite). */
    const modify = async (path: string, change: (p: Project) => Project): Promise<OpResult> => {
      try {
        const projectState = deps.project.getState();
        if (projectState.filePath === path) {
          const before = projectState.project;
          const after = change(before);
          if (after.name !== before.name) projectState.dispatch({ type: "project/rename", name: after.name });
          if (after.favorite !== before.favorite) projectState.dispatch({ type: "project/setFavorite", favorite: after.favorite });
          if (after.tags !== before.tags) projectState.dispatch({ type: "project/setTags", tags: after.tags });
          const saved = await deps.project.getState().save();
          if (!saved.ok) return saved;
        } else {
          const parsed = parseProjectFile(await native.projectRead(path));
          if (!parsed.ok) return { ok: false, error: parsed.error };
          const next = { ...change(parsed.project), modified: new Date(deps.now()).toISOString() };
          await native.projectWrite(path, serializeProject(next));
        }
        await get().refresh();
        return { ok: true };
      } catch (error) {
        return { ok: false, error: errorMessage(error) };
      }
    };

    return {
      grooves: [],
      tags: [],
      counts: { all: 0, favorites: 0, recent: 0 },
      results: [],
      query: "",
      collection: "all",
      selectedTags: [],
      ...fromSettings(),
      loading: false,
      loaded: false,
      error: null,
      scanErrors: [],

      setQuery: (query) => setFiltered({ query }),
      setCollection: (collection) => setFiltered({ collection }),
      toggleTag(tag) {
        const selected = get().selectedTags;
        setFiltered({ selectedTags: selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag] });
      },
      setSelectedTags: (tags) => setFiltered({ selectedTags: [...new Set(tags)] }),
      clearFilters: () => setFiltered({ query: "", selectedTags: [] }),
      setSort: (sort) => settingsLibrary({ sort }),
      setView: (view) => settingsLibrary({ view }),
      setTileSize: (size) => settingsLibrary({ tileSize: (Math.min(5, Math.max(1, Math.round(size))) - 1) as 0 | 1 | 2 | 3 | 4 }),

      refresh() {
        if (refreshing) {
          refreshAgain = true;
          return refreshing;
        }
        refreshing = (async () => {
          do {
            refreshAgain = false;
            set({ loading: true });
            try {
              const scan = await native.libraryScan();
              if (disposed) return;
              items = scan.entries.map((entry: LibraryEntry): SearchableGroove => {
                const key = JSON.stringify(entry.summary.tracks);
                let cached = previewCache.get(entry.path);
                if (!cached || cached.key !== key) {
                  cached = { key, preview: previewFor(entry) };
                  previewCache.set(entry.path, cached);
                }
                return { groove: toGrooveSummary(entry, cached.preview), sounds: soundWords(entry) };
              });
              const grooves = items.map((i) => i.groove);
              const nowMs = deps.now();
              setFiltered({
                grooves,
                tags: collectTags(grooves),
                counts: {
                  all: grooves.length,
                  favorites: grooves.filter((g) => g.favorite).length,
                  recent: grooves.filter((g) => inCollection(g, "recent", nowMs)).length,
                },
                scanErrors: scan.errors,
                loading: false,
                loaded: true,
                error: null,
              });
            } catch (error) {
              set({ loading: false, loaded: true, error: errorMessage(error) });
            }
          } while (refreshAgain && !disposed);
        })().finally(() => {
          refreshing = null;
        });
        return refreshing;
      },
      async open(path) {
        return deps.project.getState().openProject(path);
      },
      async toggleFavorite(path) {
        const current = items.find((i) => i.groove.path === path)?.groove.favorite ?? false;
        return modify(path, (p) => ({ ...p, favorite: !current }));
      },
      async rename(path, name) {
        const trimmed = name.trim();
        if (trimmed === "") return { ok: false, error: "A groove needs a name." };
        return modify(path, (p) => ({ ...p, name: trimmed }));
      },
      async editTags(path, tags) {
        const clean = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
        return modify(path, (p) => ({ ...p, tags: clean }));
      },
      async duplicate(path) {
        try {
          const parsed = parseProjectFile(await native.projectRead(path));
          if (!parsed.ok) return { ok: false, error: parsed.error };
          const at = new Date(deps.now()).toISOString();
          const name = `${parsed.project.name} copy`;
          const copy: Project = { ...parsed.project, id: deps.newId("prj_"), name, created: at, modified: at };
          const target = await native.projectNewPath(name);
          await native.projectWrite(target, serializeProject(copy));
          await get().refresh();
          return { ok: true, path: target };
        } catch (error) {
          return { ok: false, error: errorMessage(error) };
        }
      },
      async trash(path) {
        try {
          await native.moveToTrash(path);
          const projectState = deps.project.getState();
          // The open project keeps working as an unsaved groove.
          if (projectState.filePath === path) deps.project.setState({ filePath: null, dirty: true });
          await get().refresh();
          return { ok: true };
        } catch (error) {
          return { ok: false, error: errorMessage(error) };
        }
      },
      async markOpened(path) {
        try {
          await native.libraryMarkOpened(path);
        } catch {
          return;
        }
        await get().refresh();
      },
    };
  });

  const offSettings = deps.settings.subscribe((state, prev) => {
    if (state.settings.library === prev.settings.library) return;
    const next = fromSettings();
    const current = store.getState();
    if (next.sort === current.sort && next.view === current.view && next.tileSize === current.tileSize) return;
    store.setState({
      ...next,
      results: filterGrooves(
        items,
        { collection: current.collection, tags: current.selectedTags, text: current.query, sort: next.sort },
        deps.now(),
      ),
    });
  });

  return {
    store,
    start() {
      started ??= (async () => {
        await store.getState().refresh();
        try {
          const off = await native.onLibraryChanged(() => void store.getState().refresh());
          if (disposed) off();
          else unwatch = off;
          await native.libraryWatch();
        } catch {
          /* watching is best effort; explicit refresh still works */
        }
      })();
      return started;
    },
    dispose() {
      disposed = true;
      offSettings();
      unwatch?.();
    },
  };
}

