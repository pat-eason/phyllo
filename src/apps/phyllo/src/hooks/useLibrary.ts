import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { useAppStores } from "../state/context";
import type { LibraryStoreState } from "../state/libraryStore";

export type UseLibrary = LibraryStoreState;

/**
 * design-system §5 `useLibrary()`: grooves, tags (with counts and colours), the query state
 * (`query`, `collection`, `selectedTags`, `sort`, `view`, `tileSize`) and derived `results`
 * (collection AND every tag AND text, SPEC §6.7), plus file actions. `sort`/`view`/`tileSize` persist in
 * settings; text and tags reset per session. Debounce typing in the component (100 ms), not here.
 */
export function useLibrary(): UseLibrary {
  const { library } = useAppStores();
  return useStore(
    library,
    useShallow((s) => ({ ...s })),
  );
}
